import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { extraerConIA } from "@/lib/comprobante-ia";
import { obtenerFuenteTasa } from "@/lib/tasa-referencia";
import { PAR_POR_MONEDA } from "@/lib/binance";
import {
  flujoDeMoneda,
  formatFecha,
  formatMonto,
  monedaDeFlujo,
  type Moneda,
} from "@/lib/items";
import {
  descargarArchivo,
  enviarMensaje,
  obtenerArchivo,
  type MensajeTelegram,
  type UpdateTelegram,
} from "@/lib/telegram";
import type { DatosComprobante } from "@/lib/comprobante";
import type { SupabaseClient } from "@supabase/supabase-js";

// Bajar la foto, leerla con Gemini y consultar la tasa se hacen en linea,
// uno atras del otro. Con margen: el presupuesto de Gemini solo ya es de
// 20s. Telegram corta antes y reintenta, y por eso el update se reclama
// contra la base antes de empezar (ver mas abajo).
export const maxDuration = 60;

const BUCKET = "comprobantes";
const APP = "https://control-cambios-vyu4.vercel.app/dashboard";

/**
 * Este endpoint es PUBLICO: no hay sesion, ni cookie, ni middleware que lo
 * cubra. La unica barrera es el secreto que Telegram manda en cada llamada,
 * asi que todo lo demas de este archivo asume que ya pasó por acá.
 *
 * La comparacion va sobre el SHA-256 de cada valor y no sobre los bytes
 * crudos por dos razones: timingSafeEqual explota si los largos difieren
 * (lo que ya seria un canal lateral), y comparar digests de 32 bytes no
 * filtra el largo del secreto.
 */
function secretoValido(recibido: string | null): boolean {
  const esperado = process.env.TELEGRAM_WEBHOOK_SECRET;
  // Sin secreto configurado NO se abre la puerta: se cierra. Un webhook sin
  // barrera es un formulario publico para cargar movimientos.
  if (!esperado || !recibido) return false;

  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Telegram reintenta cualquier update que no termine en 200, y acá un
 * reintento no es repetir una consulta: es cargar el mismo comprobante dos
 * veces. Por eso, salvo el secreto invalido, todo termina en 200 y lo que
 * salio mal se cuenta por el chat.
 */
function ok() {
  return new NextResponse(null, { status: 200 });
}

export async function POST(request: Request) {
  if (!secretoValido(request.headers.get("x-telegram-bot-api-secret-token"))) {
    // Sin cuerpo y sin explicacion: quien llegue sin el secreto no se entera
    // de nada. Tampoco se loguea el valor recibido.
    return new NextResponse(null, { status: 401 });
  }

  let update: UpdateTelegram;
  try {
    update = (await request.json()) as UpdateTelegram;
  } catch {
    return ok();
  }

  // Los editados se ignoran a proposito: editar el texto de un mensaje ya
  // procesado no puede re-disparar la carga de un comprobante.
  const mensaje = update.message;
  const chatId = mensaje?.chat?.id;
  if (!mensaje || typeof chatId !== "number" || typeof update.update_id !== "number") {
    return ok();
  }

  const admin = createAdminClient();

  // ---------- Idempotencia ----------
  // Se RECLAMA el update antes de tocar nada: si el insert no agrega fila,
  // este update_id ya esta tomado (un reintento de Telegram, o dos entregas
  // en paralelo) y se ignora. El insert es atomico contra la primary key,
  // asi que dos llamadas simultaneas no pueden ganar las dos.
  //
  // Se reclama ANTES y no despues a proposito: si el proceso muere en el
  // medio, el update queda marcado y la foto se pierde. Eso se arregla
  // reenviando la foto. Un movimiento duplicado, en cambio, descuadra la
  // contabilidad sin que nadie lo note.
  const { error: errorReclamo } = await admin
    .from("telegram_updates")
    .insert({ update_id: update.update_id, chat_id: chatId });

  if (errorReclamo) {
    // 23505: unique_violation. Es el caso esperado de un reintento.
    if (errorReclamo.code !== "23505") {
      console.error(`[telegram] no se pudo reclamar el update: ${errorReclamo.message}`);
    }
    return ok();
  }

  try {
    await manejar(admin, chatId, mensaje);
  } catch (e) {
    // Nada de lo que pase acá adentro puede volverse un 500: seria un
    // reintento de Telegram sobre un update que quizas ya creo el
    // movimiento. Se registra el motivo (nunca el contenido del mensaje).
    //
    // Y no se contesta nada: acá afuera todavia no se sabe si el chat esta
    // vinculado, y a un desconocido no se le confirma ni que el bot existe.
    // Al vinculado ya le aviso "manejar", que si sabe quien es.
    console.error(`[telegram] error manejando el mensaje: ${(e as Error).message}`);
  }

  return ok();
}

// ------------------------------------------------------------
// Ruteo de mensajes
// ------------------------------------------------------------

type Admin = SupabaseClient;

/** Lee "/comando argumento", tolerando el "/comando@NombreDelBot" de los grupos. */
function leerComando(texto: string, comando: string): string | null {
  const m = texto.match(/^\/([a-z_]+)(?:@\S+)?(?:\s+([\s\S]*))?$/i);
  if (!m || m[1].toLowerCase() !== comando) return null;
  return (m[2] ?? "").trim();
}

const AYUDA = `Mandame la foto de un comprobante y la cargo como movimiento pendiente de revisión.

Qué hago con ella:
· la guardo junto al movimiento,
· le leo monto, fecha y referencia,
· uso la tasa de referencia del momento como valor provisorio.

Después la contraparte lo revisa desde la web y ajusta el USDT si hace falta.

Si no puedo distinguir la moneda, escribime "COP" o "Bs" como texto de la foto.

Panel: ${APP}`;

async function manejar(admin: Admin, chatId: number, mensaje: MensajeTelegram) {
  const { data: vinculo } = await admin
    .from("telegram_vinculos")
    .select("user_id")
    .eq("chat_id", chatId)
    .maybeSingle();

  const texto = (mensaje.text ?? "").trim();

  // ---------- Chat desconocido ----------
  // Lo unico que se le contesta a un chat sin vincular es /vincular. Para
  // cualquier otra cosa el bot no existe: ni un "no tenés permiso", que ya
  // seria confirmarle que hay algo del otro lado.
  if (!vinculo) {
    const codigo = leerComando(texto, "vincular");
    if (codigo === null) return;
    await vincular(admin, chatId, codigo);
    return;
  }

  const userId = vinculo.user_id as string;

  // Recién con el chat identificado se puede contar que algo salió mal: a
  // partir de acá, cualquier error termina en el chat y no en un 500 que
  // Telegram reintentaría.
  try {
    if (mensaje.photo && mensaje.photo.length > 0) {
      await procesarFoto(admin, chatId, userId, mensaje);
      return;
    }

    if (mensaje.document) {
      await enviarMensaje(
        chatId,
        'Ese comprobante llegó como archivo adjunto. Mandámelo como foto (en Telegram de escritorio, destildá "enviar como archivo") o cargalo desde la web: ' +
          APP,
      );
      return;
    }

    if (leerComando(texto, "vincular") !== null) {
      await enviarMensaje(
        chatId,
        "Este chat ya está vinculado a tu cuenta. Mandame un comprobante.",
      );
      return;
    }

    if (leerComando(texto, "start") !== null || leerComando(texto, "ayuda") !== null) {
      await enviarMensaje(chatId, AYUDA);
      return;
    }

    await enviarMensaje(chatId, "No entendí. Mandame la foto de un comprobante, o /ayuda.");
  } catch (e) {
    console.error(`[telegram] error con un chat vinculado: ${(e as Error).message}`);
    await enviarMensaje(
      chatId,
      "Algo se rompió de este lado y no pude terminar. Fijate en el panel si quedó cargado antes de reintentar: " +
        APP,
    );
  }
}

// ------------------------------------------------------------
// /vincular
// ------------------------------------------------------------

async function vincular(admin: Admin, chatId: number, codigo: string) {
  if (!codigo) {
    await enviarMensaje(chatId, "Mandame el código así: /vincular ABCD1234");
    return;
  }

  // El codigo se guarda y se compara en mayusculas: se tipea a mano desde
  // otra pantalla y nadie respeta la caja.
  const normalizado = codigo.toUpperCase().replace(/\s+/g, "");
  const ahora = new Date().toISOString();

  // Un solo mensaje para "no existe", "ya se usó" y "venció": distinguirlos
  // le diría a quien esté probando códigos cuáles existen.
  const invalido = "Ese código no sirve: o ya se usó, o venció. Generá uno nuevo desde el panel.";

  // El código se QUEMA primero, y recién si la quemada agarró se sigue.
  // Leerlo, validarlo y después marcarlo dejaría una ventana en la que el
  // mismo código sirve dos veces: el update condicional es una sola
  // operación atómica, y quien no la gana no existió.
  //
  // El costo es que un error posterior deja el código gastado. Preferible:
  // generar otro son dos clics, y un token de un solo uso que a veces vale
  // dos no es de un solo uso.
  const { data: quemados, error } = await admin
    .from("telegram_codigos")
    .update({ usado_at: ahora })
    .eq("codigo", normalizado)
    .is("usado_at", null)
    .gt("expira_at", ahora)
    .select("user_id");

  if (error) {
    console.error(`[telegram] no se pudo validar el código: ${error.message}`);
    await enviarMensaje(chatId, "No pude validar el código en este momento. Probá de nuevo.");
    return;
  }

  if (!quemados || quemados.length === 0) {
    await enviarMensaje(chatId, invalido);
    return;
  }

  const userId = quemados[0].user_id as string;

  // upsert por user_id: si la persona ya tenía un chat vinculado y vincula
  // otro, el nuevo reemplaza al viejo en vez de fallar contra la primary key.
  const { error: errorVinculo } = await admin
    .from("telegram_vinculos")
    .upsert({ user_id: userId, chat_id: chatId, vinculado_at: ahora });

  if (errorVinculo) {
    // El unique de chat_id: este chat ya es de OTRA cuenta.
    if (errorVinculo.code === "23505") {
      await enviarMensaje(
        chatId,
        "Este chat ya está vinculado a otra cuenta. Desvinculalo desde el panel antes de volver a intentarlo.",
      );
      return;
    }
    console.error(`[telegram] no se pudo vincular: ${errorVinculo.message}`);
    await enviarMensaje(
      chatId,
      "No pude completar la vinculación y el código ya se gastó. Generá uno nuevo desde el panel.",
    );
    return;
  }

  await enviarMensaje(chatId, `Listo, quedamos vinculados.\n\n${AYUDA}`);
}

// ------------------------------------------------------------
// El camino de la foto
// ------------------------------------------------------------

// Cuando ni el modelo ni el texto del comprobante lo dicen, el banco
// desempata: ninguno de estos opera en los dos paises.
const BANCOS_VES = [
  "bnc", "banesco", "mercantil", "provincial", "bicentenario",
  "banco de venezuela", "bdv", "bod", "bancamiga", "banplus", "pago movil",
];
const BANCOS_COP = [
  "nequi", "bancolombia", "daviplata", "davivienda", "bre-b", "breb", "bbva colombia",
];

/**
 * Qué moneda es este comprobante.
 *
 * Es LA decisión del bot: de la moneda salen el tipo de flujo, la tasa y,
 * con ella, el USDT. Equivocarse acá no rompe nada, solo carga un
 * movimiento en el flujo equivocado, que es exactamente la clase de error
 * que nadie ve.
 *
 * Por eso se ordena de más explícito a menos, y si al final no hay certeza
 * NO se adivina: se pregunta.
 */
function determinarMoneda(
  datos: DatosComprobante,
  caption: string,
  esColaborador: boolean,
): Moneda | null {
  // 1. Lo que escribió la persona junto a la foto gana siempre: es la única
  //    fuente que sabe lo que quiso hacer.
  const nota = caption.toLowerCase();
  if (/\b(bs|bss|ves|bol[ií]var(es)?)\b/.test(nota)) return "VES";
  if (/\b(cop|peso|pesos)\b/.test(nota)) return "COP";

  // 2. Lo que leyó el modelo mirando el comprobante.
  if (datos.moneda === "VES" || datos.moneda === "COP") return datos.moneda;

  // 3. El monto impreso: un comprobante venezolano dice "Bs" al lado del
  //    número. El "$" no sirve de contraseña porque también se usa en COP.
  if (datos.monto_texto && /bs/i.test(datos.monto_texto)) return "VES";

  // 4. El banco.
  const banco = (datos.banco ?? "").toLowerCase();
  if (banco) {
    if (BANCOS_VES.some((b) => banco.includes(b))) return "VES";
    if (BANCOS_COP.some((b) => banco.includes(b))) return "COP";
  }

  // 5. El colaborador no tiene más que una opción posible: la RLS de la app
  //    (y la función del bot) solo le permiten COP. No es adivinar, es la
  //    única moneda que su cuenta puede registrar.
  if (esColaborador) return "COP";

  return null;
}

function hoyISO() {
  // La app trabaja con fechas sueltas (date, sin hora) en zona local de
  // Caracas/Bogotá, que comparten UTC-4. Tomar la fecha de UTC adelantaría
  // el día durante las últimas 4 horas de cada jornada.
  const ahora = new Date(Date.now() - 4 * 60 * 60 * 1000);
  return ahora.toISOString().slice(0, 10);
}

async function procesarFoto(
  admin: Admin,
  chatId: number,
  userId: string,
  mensaje: MensajeTelegram,
) {
  const caption = (mensaje.caption ?? "").trim();

  // Telegram manda la misma foto en varias resoluciones, de menor a mayor.
  // La última es la más grande: en un comprobante, resolución es poder leer
  // la referencia.
  const foto = mensaje.photo![mensaje.photo!.length - 1];

  // ---------- 1. Bajarla ----------
  let archivo: { bytes: ArrayBuffer; tipo: string };
  try {
    const { file_path } = await obtenerArchivo(foto.file_id);
    archivo = await descargarArchivo(file_path);
  } catch (e) {
    console.error(`[telegram] no se pudo bajar la foto: ${(e as Error).message}`);
    await enviarMensaje(
      chatId,
      "No pude bajar esa foto de Telegram. Probá mandarla de nuevo o cargala desde la web: " + APP,
    );
    return;
  }

  // ---------- 2. Guardarla ----------
  // Se guarda ANTES de leerla, igual que en la web: si la lectura falla, el
  // comprobante ya está a salvo y se puede usar desde el formulario.
  const extension = archivo.tipo === "image/png" ? "png" : "jpg";
  const destino = `${crypto.randomUUID()}.${extension}`;

  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(destino, archivo.bytes, { contentType: archivo.tipo, upsert: false });

  if (errorSubida) {
    console.error(`[telegram] no se pudo guardar el comprobante: ${errorSubida.message}`);
    await enviarMensaje(
      chatId,
      "No pude guardar el comprobante. No cargué nada: probá de nuevo o usá la web: " + APP,
    );
    return;
  }

  // ---------- 3. Leerla ----------
  const lectura = await extraerConIA(archivo);

  if (!lectura.ok) {
    await enviarMensaje(
      chatId,
      `No pude leer ese comprobante.\n\n${lectura.error}\n\nNo cargué ningún movimiento. El archivo quedó guardado: cargalo desde la web y elegilo del bucket, o mandámelo de nuevo. ${APP}`,
    );
    return;
  }

  const datos = lectura.datos;

  // Un movimiento sin monto es un movimiento inventado. Se corta acá.
  if (datos.monto === null || !(datos.monto > 0)) {
    await enviarMensaje(
      chatId,
      "Leí el comprobante pero no pude sacarle el monto, así que no cargué nada: un movimiento con datos a medias es peor que ninguno.\n\nCargalo desde la web: " +
        APP,
    );
    return;
  }

  // ---------- 4. Moneda y flujo ----------
  const { data: perfil } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const esColaborador = perfil?.role === "colaborador";
  const moneda = determinarMoneda(datos, caption, esColaborador);

  if (!moneda) {
    await enviarMensaje(
      chatId,
      'No pude distinguir si ese comprobante está en bolívares o en pesos, y de eso depende la tasa. No cargué nada.\n\nReenviámelo escribiendo "Bs" o "COP" como texto de la foto, o cargalo desde la web: ' +
        APP,
    );
    return;
  }

  const tipoFlujo = flujoDeMoneda(moneda);

  // ---------- 5. Tasa de referencia ----------
  // Se pide para la FECHA del comprobante, no para hoy: la TRM de COP es
  // una serie por día y la del día del depósito es la que corresponde.
  const fecha = datos.fecha ?? hoyISO();

  let tasa: number;
  let etiquetaTasa: string;
  try {
    const { fuente, fresca } = await obtenerFuenteTasa(PAR_POR_MONEDA[moneda], fecha);
    tasa = fuente.valor;
    etiquetaTasa = `${fuente.etiqueta} · ${fuente.detalle}`;

    // Misma regla que el endpoint de la web: la muestra del P2P se guarda
    // porque es efímera, la TRM no porque ya es una serie oficial.
    if (fresca && fuente.id === "p2p") {
      await admin.from("tasas_referencia").insert({
        par: PAR_POR_MONEDA[moneda],
        valor: fuente.valor,
        consultado_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error(`[telegram] sin tasa de referencia: ${(e as Error).message}`);
    await enviarMensaje(
      chatId,
      "Leí el comprobante pero no pude conseguir la tasa de referencia, así que no cargué nada (sin tasa, el USDT sería inventado).\n\nProbá de nuevo en un rato o cargalo desde la web: " +
        APP,
    );
    return;
  }

  if (!(tasa > 0)) {
    await enviarMensaje(chatId, "La tasa de referencia volvió en cero. No cargué nada: " + APP);
    return;
  }

  const usdt = Math.round((datos.monto / tasa) * 100) / 100;
  if (!(usdt > 0)) {
    await enviarMensaje(
      chatId,
      `Ese monto (${formatMonto(datos.monto, moneda)}) contra la tasa de referencia da menos de un centavo de USDT. No cargué nada.`,
    );
    return;
  }

  // ---------- 6. Crear el movimiento ----------
  const detalle = ["Cargado por Telegram", datos.banco, caption]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" · ")
    .slice(0, 300);

  const { data: creado, error: errorRpc } = await admin.rpc("crear_item_desde_bot", {
    p_user_id: userId,
    p_tipo_flujo: tipoFlujo,
    p_moneda_origen: monedaDeFlujo(tipoFlujo),
    p_tasa: tasa,
    p_usdt_total: usdt,
    p_detalle: detalle,
    p_fecha: fecha,
    p_depositos: [
      {
        referencia: datos.referencia,
        fecha,
        valor_origen: datos.monto,
        comprobante_path: destino,
        comprobante_texto: null,
      },
    ],
  });

  if (errorRpc) {
    console.error(`[telegram] la base rechazó el movimiento: ${errorRpc.message}`);
    // El mensaje de la función ya está escrito para una persona (el rol sin
    // permiso, el flujo que no le corresponde), así que se reenvía tal cual.
    await enviarMensaje(
      chatId,
      `No pude cargar el movimiento: ${errorRpc.message}\n\nEl comprobante quedó guardado. ${APP}`,
    );
    return;
  }

  const numero = (creado as { numero?: number } | null)?.numero;

  // ---------- 7. Contar qué se entendió ----------
  const lineas = [
    numero ? `Movimiento #${numero} cargado — pendiente de revisión.` : "Movimiento cargado — pendiente de revisión.",
    "",
    `Monto: ${formatMonto(datos.monto, moneda)}`,
    `Fecha: ${formatFecha(fecha)}${datos.fecha ? "" : " (no la leí en el comprobante, usé la de hoy)"}`,
    `Referencia: ${datos.referencia ?? "no la pude leer"}`,
  ];
  if (datos.banco) lineas.push(`Banco: ${datos.banco}`);
  lineas.push(
    `Tasa: ${formatMonto(tasa, moneda)} (${etiquetaTasa})`,
    `USDT: ${formatMonto(usdt, "USDT")}`,
    "",
    "La tasa es PROVISORIA: la contraparte la ajusta cuando lo revise.",
  );

  // Los avisos de la lectura (un monto dudoso, una fecha rara) van sí o sí:
  // es lo que hay que mirar antes de aprobar.
  if (datos.avisos.length > 0) {
    lineas.push("", "Ojo:", ...datos.avisos.map((a) => `· ${a}`));
  }

  lineas.push("", APP);

  await enviarMensaje(chatId, lineas.join("\n"));
}
