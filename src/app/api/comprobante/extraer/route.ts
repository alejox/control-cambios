import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/lib/supabase/server";
import {
  parseFechaLatina,
  parseMontoLatino,
  type DatosComprobante,
} from "@/lib/comprobante";

const BUCKET = "comprobantes";

// Modelo de la familia Flash: es la que entra en el tier gratuito de
// Google AI Studio (1.500 peticiones por dia, sin tarjeta).
const MODELO = "gemini-3.8-flash";

// Gemini lee estos formatos como imagen. El HEIC de iPhone no entra: se
// avisa en vez de mandarlo igual y recibir un error opaco.
const IMAGENES_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Ningun campo es obligatorio a proposito: si el comprobante no trae el
// dato, preferimos que lo omita antes que se invente algo para cumplir
// con el esquema.
const ESQUEMA = {
  type: "object",
  properties: {
    referencia: {
      type: "string",
      description: "Numero de referencia u operacion, solo digitos, sin espacios.",
    },
    fecha: {
      type: "string",
      description: "Fecha de la operacion en formato yyyy-mm-dd.",
    },
    monto_texto: {
      type: "string",
      description: "El monto EXACTAMENTE como aparece impreso, por ejemplo '3.200,00'.",
    },
    monto: {
      type: "number",
      description: "El mismo monto como numero con punto decimal. '3.200,00' es 3200.00",
    },
    beneficiario: {
      type: "string",
      description: "Telefono, cuenta o cedula de quien RECIBE el dinero.",
    },
    banco: { type: "string", description: "Banco emisor o app del comprobante." },
  },
};

const INSTRUCCIONES = `Extraes datos de comprobantes de pago movil y transferencias de Venezuela y Colombia.

Reglas:
- Las fechas vienen en formato dd/mm/aaaa. "10/09/2026" es 10 de septiembre, NO 9 de octubre.
- Los montos usan punto para miles y coma para decimales: "3.200,00" son tres mil doscientos.
- Copia "monto_texto" caracter por caracter como esta impreso, sin reformatear.
- Si un dato no esta en el comprobante, omiti ese campo. No lo inventes ni lo deduzcas.
- "beneficiario" es quien RECIBE, no quien envia.

Extrae los datos de este comprobante.`;

type Extraido = {
  referencia?: string;
  fecha?: string;
  monto_texto?: string;
  monto?: number;
  beneficiario?: string;
  banco?: string;
};

export async function POST(request: Request) {
  const supabase = await createClient();

  // El route corre con la sesión del usuario, así que las políticas de RLS
  // del bucket aplican igual. Este chequeo es para dar un mensaje claro.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Sesión vencida." }, { status: 401 });
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  // Colaborador tambien: registra movimientos COP y necesita leer sus
  // comprobantes igual que el admin.
  const rol = perfil?.role ?? "sin_acceso";
  if (rol !== "admin" && rol !== "colaborador") {
    return NextResponse.json(
      { error: "Tu cuenta no tiene permiso para leer comprobantes." },
      { status: 403 },
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Falta configurar GEMINI_API_KEY en el servidor." },
      { status: 503 },
    );
  }

  let path: unknown;
  try {
    ({ path } = await request.json());
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  // El path viene del cliente, así que no se confía: solo un nombre de
  // archivo plano, sin "/" ni ".." que permitan salir de la carpeta.
  if (typeof path !== "string" || path === "" || !/^[\w.-]+$/.test(path)) {
    return NextResponse.json({ error: "Ruta de comprobante inválida." }, { status: 400 });
  }

  const { data: archivo, error: errorDescarga } = await supabase.storage
    .from(BUCKET)
    .download(path);

  if (errorDescarga || !archivo) {
    return NextResponse.json(
      { error: errorDescarga?.message ?? "No pudimos leer el comprobante." },
      { status: 404 },
    );
  }

  const tipo = archivo.type || "application/octet-stream";
  const esPdf = tipo === "application/pdf";
  const esImagen = IMAGENES_OK.includes(tipo);

  if (!esPdf && !esImagen) {
    return NextResponse.json(
      {
        error:
          tipo === "image/heic"
            ? "Los HEIC de iPhone no se pueden leer automáticamente. Subilo como JPG o cargá los datos a mano."
            : "Formato no soportado para lectura automática.",
      },
      { status: 415 },
    );
  }

  const base64 = Buffer.from(await archivo.arrayBuffer()).toString("base64");
  const ai = new GoogleGenAI({ apiKey });

  let extraido: Extraido;
  try {
    const interaction = await ai.interactions.create({
      model: MODELO,
      input: [
        { type: "text", text: INSTRUCCIONES },
        esPdf
          ? { type: "document", data: base64, mime_type: "application/pdf" }
          : { type: "image", data: base64, mime_type: tipo },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: ESQUEMA,
      },
    });

    const texto = interaction.output_text;
    if (!texto) {
      return NextResponse.json(
        { error: "El modelo no devolvió datos. Cargá el depósito a mano." },
        { status: 422 },
      );
    }
    extraido = JSON.parse(texto) as Extraido;
  } catch (e) {
    const mensaje = (e as Error).message ?? "";

    // El tier gratuito de Google tiene cupo por minuto y por dia, y el
    // error crudo no le dice nada al usuario. Se traduce, pero sin
    // prometer que esperar alcanza: si lo agotado es el cupo diario, la
    // espera que informa Google no lo resuelve. Por eso el mensaje
    // menciona las dos salidas.
    if (/\b429\b|quota|rate limit/i.test(mensaje)) {
      const espera = mensaje.match(/retry in ([\d.]+)s/i)?.[1];
      const segundos = espera ? Math.ceil(Number(espera)) : null;
      const cuando = segundos
        ? `Probá de nuevo en ${segundos} segundos.`
        : "Probá de nuevo en un minuto.";
      return NextResponse.json(
        {
          error: `Se agotó el cupo de lectura automática de Google. ${cuando} Si sigue pasando, el proyecto está en el tier gratuito: activá la facturación en AI Studio para levantar el límite. Mientras tanto, cargá los datos a mano — el comprobante ya quedó guardado.`,
        },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: `No pudimos leer el comprobante: ${mensaje}` },
      { status: 502 },
    );
  }

  const avisos: string[] = [];

  // El monto se parsea del texto impreso, que es la fuente de verdad, y se
  // contrasta contra el número que devolvió el modelo. Si no coinciden no se
  // elige uno en silencio: se avisa, porque acá un error no se ve.
  const montoDelTexto = parseMontoLatino(extraido.monto_texto);
  const montoDelModelo =
    typeof extraido.monto === "number" && Number.isFinite(extraido.monto)
      ? extraido.monto
      : null;

  let monto = montoDelTexto ?? montoDelModelo;
  if (
    montoDelTexto !== null &&
    montoDelModelo !== null &&
    Math.abs(montoDelTexto - montoDelModelo) > 0.01
  ) {
    avisos.push(
      `El monto no quedó claro: leímos "${extraido.monto_texto}". Verificalo antes de guardar.`,
    );
    monto = montoDelTexto;
  }
  if (monto === null) {
    avisos.push("No pudimos leer el monto. Cargalo a mano.");
  }

  const fecha = parseFechaLatina(extraido.fecha);
  if (extraido.fecha && !fecha) {
    avisos.push(`No entendimos la fecha "${extraido.fecha}". Cargala a mano.`);
  }

  const datos: DatosComprobante = {
    referencia: extraido.referencia?.replace(/\s+/g, "") || null,
    fecha,
    monto,
    monto_texto: extraido.monto_texto ?? null,
    beneficiario: extraido.beneficiario ?? null,
    banco: extraido.banco ?? null,
    avisos,
  };

  return NextResponse.json(datos);
}
