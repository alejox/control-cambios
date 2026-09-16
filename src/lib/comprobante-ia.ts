// Lectura automatica de un comprobante con Gemini.
//
// Vive en lib y no adentro del route handler porque ahora hay DOS puertas
// de entrada: la web (que sube el archivo con la sesion del usuario) y el
// bot de Telegram (que no tiene sesion ninguna). El prompt, el esquema y
// los parametros del modelo son la parte delicada de todo esto: una sola
// copia, o las dos puertas terminan leyendo distinto el mismo comprobante.
//
// A proposito NO toca Supabase ni Next: recibe bytes y devuelve datos. Quien
// lo llama se encarga de conseguir el archivo y de traducir el resultado.

import { GoogleGenAI } from "@google/genai";
import {
  parseFechaLatina,
  parseMontoLatino,
  type DatosComprobante,
} from "@/lib/comprobante";
import type { Moneda } from "@/lib/items";

// Modelo de la familia Flash: es la que entra en el tier gratuito de
// Google AI Studio (1.500 peticiones por dia, sin tarjeta).
const MODELO = "gemini-3.8-flash";

// Presupuesto propio, mas corto que el de Vercel: preferimos devolver un
// error util a los 20s antes que dejar la peticion colgada.
const TIMEOUT_MS = 20_000;

// Gemini lee estos formatos como imagen. El HEIC de iPhone no entra: se
// avisa en vez de mandarlo igual y recibir un error opaco.
export const IMAGENES_OK = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Ningun campo es obligatorio a proposito: si el comprobante no trae el
// dato, preferimos que lo omita antes que se invente algo para cumplir
// con el esquema.
const ESQUEMA = {
  type: "object",
  properties: {
    referencia: {
      type: "string",
      // Decia "solo digitos" y peleaba con el prompt: los comprobantes
      // colombianos traen referencias con letras ("TRuf1aeTHtEC") y el
      // modelo las mutilaba para cumplir con esta descripcion.
      description:
        "Numero o codigo de referencia tal como aparece, con letras si las tiene.",
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
    // Campo nuevo, y no un capricho: el bot de Telegram no tiene un
    // selector de moneda al lado como el formulario de la web. Sin esto no
    // hay forma de saber si un comprobante es de Bs o de COP, y de esa
    // moneda dependen el tipo de flujo y la tasa que se aplica.
    moneda: {
      type: "string",
      description:
        "VES si el monto esta en bolivares venezolanos, COP si esta en pesos colombianos.",
    },
    beneficiario: {
      type: "string",
      description: "Telefono, cuenta o cedula de quien RECIBE el dinero.",
    },
    banco: { type: "string", description: "Banco emisor o app del comprobante." },
  },
};

const INSTRUCCIONES = `Transcribis datos de comprobantes de pago de Venezuela y Colombia. Sos un transcriptor, no un interprete: tu trabajo es COPIAR lo que esta impreso, no razonar sobre ello.

REGLA PRINCIPAL: si no podes LEER un dato con certeza en la imagen, omiti ese campo. Un campo vacio es correcto; un campo inventado corrompe la contabilidad de alguien.

Prohibido:
- Inventar, completar o deducir un valor que no este impreso.
- Redondear, reformatear o "corregir" un numero.
- Rellenar un campo con algo parecido que viste en otra parte del comprobante.
- Usar la fecha de hoy si el comprobante no trae fecha.

Como leer cada campo:
- referencia: el numero o codigo de la operacion, tal cual, respetando ceros a la izquierda, letras y mayusculas ("M09255933", "TRuf1aeTHtEC", "062531960972"). Si hay varios numeros, el que esta etiquetado como referencia, comprobante u operacion.
- fecha: la fecha DE LA OPERACION. Formato dd/mm/aaaa: "10/09/2026" es 10 de septiembre, NO 9 de octubre. Tambien puede venir en palabras ("24 de agosto de 2026"). Devolvela como aaaa-mm-dd.
- monto_texto: el monto EXACTAMENTE como aparece impreso, caracter por caracter, con sus puntos y comas ("3.200,00", "$ 92.500,00"). No lo normalices.
- monto: ese mismo monto como numero. Punto y coma latinos: "3.200,00" es 3200.00, no 3.2.
- moneda: "VES" si el monto esta en bolivares (dice "Bs", "Bs.", "BsS" o el banco es venezolano), "COP" si esta en pesos colombianos (dice "COP", "$" y el banco es colombiano: Nequi, Bancolombia, Daviplata, Davivienda, Bre-B). Si no podes distinguirla con certeza, omitila.
- beneficiario: quien RECIBE el dinero, no quien lo envia.
- banco: el banco o app del comprobante.

Si la imagen esta borrosa, cortada o no es un comprobante, devolve todos los campos vacios.`;

type Extraido = {
  referencia?: string;
  fecha?: string;
  monto_texto?: string;
  monto?: number;
  moneda?: string;
  beneficiario?: string;
  banco?: string;
};

export type Archivo = {
  /** El contenido crudo del comprobante. */
  bytes: ArrayBuffer;
  /** El mime type tal como lo reporto quien consiguio el archivo. */
  tipo: string;
};

/**
 * El resultado lleva un `status` HTTP a proposito: el route handler lo
 * devuelve tal cual (el cupo agotado de Google no es lo mismo que un
 * formato no soportado) y el bot lo usa para decidir que contar en el chat.
 */
export type ResultadoIA =
  | { ok: true; datos: DatosComprobante }
  | { ok: false; status: number; error: string };

function normalizarMoneda(valor: string | undefined): Moneda | null {
  if (typeof valor !== "string") return null;
  const limpio = valor.trim().toUpperCase();
  if (limpio === "VES" || limpio === "BS" || limpio === "BSS") return "VES";
  if (limpio === "COP") return "COP";
  return null;
}

/**
 * Manda el comprobante a Gemini y devuelve los datos ya parseados.
 *
 * Nunca lanza: todos los caminos de error vuelven como `{ ok: false }` con
 * un mensaje ya escrito para una persona.
 */
export async function extraerConIA(archivo: Archivo): Promise<ResultadoIA> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error: "Falta configurar GEMINI_API_KEY en el servidor.",
    };
  }

  const tipo = archivo.tipo || "application/octet-stream";
  const esPdf = tipo === "application/pdf";
  const esImagen = IMAGENES_OK.includes(tipo);

  if (!esPdf && !esImagen) {
    return {
      ok: false,
      status: 415,
      error:
        tipo === "image/heic"
          ? "Los HEIC de iPhone no se pueden leer automáticamente. Subilo como JPG o cargá los datos a mano."
          : "Formato no soportado para lectura automática.",
    };
  }

  const base64 = Buffer.from(archivo.bytes).toString("base64");
  const ai = new GoogleGenAI({ apiKey });

  let extraido: Extraido;
  const arranque = Date.now();
  try {
    const interaction = await ai.interactions.create(
      {
        model: MODELO,
        // Las instrucciones van como system_instruction y no mezcladas con
        // la imagen: asi el modelo las trata como reglas y no como una
        // parte mas del contenido a interpretar.
        system_instruction: INSTRUCCIONES,
        input: [
          { type: "text", text: "Transcribi los datos de este comprobante." },
          esPdf
            ? { type: "document", data: base64, mime_type: "application/pdf" }
            : { type: "image", data: base64, mime_type: tipo },
        ],
        generation_config: {
          // Sin esto el modelo decide solo cuanto razonar, y ahi nace la
          // diferencia entre 5s y 54s con la MISMA imagen. Transcribir un
          // comprobante no necesita razonamiento: necesita leer.
          //
          // "low" y no "minimal": el tipo del SDK acepta los cuatro niveles,
          // pero este modelo rechaza "minimal" con un 400 en tiempo de
          // ejecucion ("Allowed values are: high, low, medium"). El tipo es
          // el de la familia entera, no el de un modelo.
          thinking_level: "low",
          // Misma imagen, misma salida. Sin seed, dos lecturas del mismo
          // comprobante pueden diferir, y en una app de plata eso no se
          // puede.
          seed: 7,
          // Los campos ocupan menos de 100 tokens, pero los tokens de
          // razonamiento salen del mismo presupuesto: con el techo muy bajo
          // el modelo se queda pensando y devuelve un JSON cortado, que
          // revienta despues en el JSON.parse. Se deja holgado; igual solo
          // se paga lo que realmente genera.
          max_output_tokens: 2048,
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: ESQUEMA,
        },
      },
      {
        timeout_ms: TIMEOUT_MS,
        // El SDK trae por defecto 4 reintentos con backoff exponencial
        // (500ms, 1s, 2s, 4s...) sobre 408/409/429/5XX y hasta 30s de
        // espera acumulada. Son invisibles: si el ultimo intento sale
        // bien, no hay error, solo una peticion que tardo un minuto.
        // Queda UN reintento corto, para un corte de red y nada mas.
        retries: {
          strategy: "attempt-count-backoff",
          maxRetries: 1,
          backoff: {
            initialInterval: 400,
            maxInterval: 1200,
            exponent: 2,
            maxElapsedTime: 3000,
          },
          retryConnectionErrors: true,
        },
      },
    );

    // Queda en los logs de la funcion. Si vuelve a tardar, aca se ve si
    // fue el modelo pensando de mas (thought) o la imagen siendo grande.
    // Se loguean tamaños y tiempos, NUNCA el contenido del comprobante.
    console.log(
      `[comprobante] ${Date.now() - arranque}ms · ${Math.round(archivo.bytes.byteLength / 1024)}KB · ${tipo}` +
        ` · in ${interaction.usage?.total_input_tokens ?? "?"}` +
        ` · thought ${interaction.usage?.total_thought_tokens ?? "?"}` +
        ` · out ${interaction.usage?.total_output_tokens ?? "?"}`,
    );

    const texto = interaction.output_text;
    if (!texto) {
      return {
        ok: false,
        status: 422,
        error: "El modelo no devolvió datos. Cargá el depósito a mano.",
      };
    }
    extraido = JSON.parse(texto) as Extraido;
  } catch (e) {
    const mensaje = (e as Error).message ?? "";
    console.log(`[comprobante] fallo a los ${Date.now() - arranque}ms: ${mensaje}`);

    if (/timeout|aborted|abort/i.test(mensaje)) {
      return {
        ok: false,
        status: 504,
        error:
          "La lectura automática tardó demasiado. Cargá los datos a mano — el comprobante ya quedó guardado.",
      };
    }

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
      return {
        ok: false,
        status: 429,
        error: `Se agotó el cupo de lectura automática de Google. ${cuando} Si pasa siempre, revisá la facturación del proyecto en Google Cloud: con un saldo pendiente, la cuenta vuelve a los límites gratuitos. Mientras tanto, cargá los datos a mano — el comprobante ya quedó guardado.`,
      };
    }

    return {
      ok: false,
      status: 502,
      error: `No pudimos leer el comprobante: ${mensaje}`,
    };
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
    moneda: normalizarMoneda(extraido.moneda),
    beneficiario: extraido.beneficiario ?? null,
    banco: extraido.banco ?? null,
    avisos,
  };

  return { ok: true, datos };
}
