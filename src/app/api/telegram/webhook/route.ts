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
  usdtDesdeOrigen,
  type Moneda,
} from "@/lib/items";
import {
  descargarArchivo,
  enviarMensaje,
  obtenerArchivo,
  type MensajeTelegram,
  type UpdateTelegram,
} from "@/lib/telegram";
import { parseComprobantesTexto, type DatosComprobante } from "@/lib/comprobante";
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
    await manejar(admin, chatId, mensaje, update.update_id);
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

const AYUDA = `Mandame un comprobante y lo cargo como movimiento pendiente de revisión.

Cómo mandármelo:
· como foto,
· o pegado como texto, tal cual lo copia la app del banco.

Si mandás varios de una (varias fotos juntas, o varios comprobantes pegados en el mismo mensaje) los cargo como UN movimiento con varios depósitos.

Qué hago con cada uno:
· lo guardo junto al movimiento,
· le leo monto, fecha y referencia,
· uso la tasa de referencia del momento como valor provisorio.

Después la contraparte lo revisa desde la web y ajusta el USDT si hace falta.

Si no puedo distinguir la moneda, escribime "COP" o "Bs" junto al comprobante.

Panel: ${APP}`;

async function manejar(
  admin: Admin,
  chatId: number,
  mensaje: MensajeTelegram,
  updateId: number,
) {
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
      // Una foto con media_group_id es una pieza de un album: se procesa
      // igual, pero el movimiento lo arma una sola de las invocaciones con
      // TODAS las piezas. Sin media_group_id nada cambia: una foto, un
      // movimiento, exactamente como antes.
      if (mensaje.media_group_id) {
        await procesarPiezaDeAlbum(admin, chatId, userId, mensaje, mensaje.media_group_id, updateId);
        return;
      }
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

    // Cualquier otra cosa que arranque con "/" es un comando que no existe,
    // no un comprobante. Se corta acá para que un /loquesea no termine
    // contestando "no le encontré el monto", y para que agregar un comando
    // nuevo no dependa de que el parser de texto lo ignore.
    if (texto.startsWith("/")) {
      await enviarMensaje(chatId, "No conozco ese comando. Probá con /ayuda.");
      return;
    }

    // Un texto que no es comando puede ser un comprobante pegado: las apps
    // de los bancos comparten así. Va DESPUÉS de los comandos a propósito,
    // porque /vincular, /start y /ayuda también son mensajes de texto.
    if (texto !== "") {
      await procesarTexto(admin, chatId, userId, texto);
      return;
    }

    await enviarMensaje(
      chatId,
      "No entendí. Mandame la foto de un comprobante o pegámelo como texto, o /ayuda.",
    );
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
 * La moneda que declara un texto escrito por la persona.
 *
 * Vive aparte porque se aplica en dos momentos: al caption de una foto, y
 * — cuando la foto viene en un álbum — al caption del álbum entero.
 * Telegram le pone el caption a UNA sola de las N fotos, así que leerlo
 * solo por foto dejaría a las otras sin la moneda que la persona escribió
 * para todas.
 */
function monedaDeTexto(texto: string): Moneda | null {
  const nota = texto.toLowerCase();
  if (/\b(bs|bss|ves|bol[ií]var(es)?)\b/.test(nota)) return "VES";
  if (/\b(cop|peso|pesos)\b/.test(nota)) return "COP";
  return null;
}

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
  const delCaption = monedaDeTexto(caption);
  if (delCaption) return delCaption;

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

/** Cuando ni la foto ni el álbum dicen la moneda. Un solo texto para las dos puertas. */
const SIN_MONEDA =
  'No pude distinguir si ese comprobante está en bolívares o en pesos, y de eso depende la tasa. No cargué nada.\n\nReenviámelo escribiendo "Bs" o "COP" como texto de la foto, o cargalo desde la web: ' +
  APP;

/**
 * El resultado de mirar UNA foto.
 *
 * La moneda puede volver en null a propósito: cuando la foto es parte de un
 * álbum, todavía puede resolverla el caption del álbum, que Telegram le
 * pone a una sola de las N fotos.
 */
type LecturaFoto =
  | {
      ok: true;
      datos: DatosComprobante;
      /** Ya validado mayor que cero: el resto del camino no vuelve a dudarlo. */
      monto: number;
      moneda: Moneda | null;
      path: string;
    }
  | {
      ok: false;
      /** Corto, para listar varias fotos juntas en un mismo mensaje. */
      motivo: string;
      /** Completo, para cuando la foto vino sola y el mensaje es solo suyo. */
      mensaje: string;
      /** No siempre es null: el comprobante puede haberse guardado antes de fallar. */
      path: string | null;
    };

/**
 * Lo caro de una foto: bajarla, guardarla en el bucket y leerla con el
 * modelo.
 *
 * Está separado del resto porque ahora hay dos caminos que hacen
 * exactamente esto (la foto suelta y cada pieza de un álbum) y porque en un
 * álbum cada invocación hace LA SUYA en paralelo: es la parte que tarda, y
 * hacerlas en serie multiplicaría el tiempo por la cantidad de fotos.
 *
 * No contesta nada por el chat: cada camino decide qué contar y cuándo. El
 * álbum, por ejemplo, junta todo en un solo mensaje al final.
 */
async function leerFoto(
  admin: Admin,
  userId: string,
  mensaje: MensajeTelegram,
): Promise<LecturaFoto> {
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
    return {
      ok: false,
      motivo: "no la pude bajar de Telegram",
      mensaje:
        "No pude bajar esa foto de Telegram. Probá mandarla de nuevo o cargala desde la web: " +
        APP,
      path: null,
    };
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
    return {
      ok: false,
      motivo: "no pude guardar el archivo",
      mensaje: "No pude guardar el comprobante. No cargué nada: probá de nuevo o usá la web: " + APP,
      path: null,
    };
  }

  // ---------- 3. Leerla ----------
  const lectura = await extraerConIA(archivo);

  if (!lectura.ok) {
    return {
      ok: false,
      motivo: lectura.error,
      mensaje: `No pude leer ese comprobante.\n\n${lectura.error}\n\nNo cargué ningún movimiento. El archivo quedó guardado: cargalo desde la web y elegilo del bucket, o mandámelo de nuevo. ${APP}`,
      path: destino,
    };
  }

  const datos = lectura.datos;

  // Un movimiento sin monto es un movimiento inventado. Se corta acá.
  if (datos.monto === null || !(datos.monto > 0)) {
    return {
      ok: false,
      motivo: "no pude leerle el monto",
      mensaje:
        "Leí el comprobante pero no pude sacarle el monto, así que no cargué nada: un movimiento con datos a medias es peor que ninguno.\n\nCargalo desde la web: " +
        APP,
      path: destino,
    };
  }

  // ---------- 4. Moneda ----------
  const { data: perfil } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const esColaborador = perfil?.role === "colaborador";

  return {
    ok: true,
    datos,
    monto: datos.monto,
    moneda: determinarMoneda(datos, caption, esColaborador),
    path: destino,
  };
}

/**
 * Le avisa por Telegram a la otra parte que tiene algo para revisar.
 *
 * Un movimiento lo carga uno y lo aprueba el OTRO, así que el que tiene que
 * enterarse es justamente el que no estaba mirando. El panel ya se refresca
 * solo con Realtime, pero eso vale únicamente mientras la pestaña está
 * abierta: si el comprobante entra de noche, esto es lo único que avisa.
 *
 * Va a todos los vinculados menos el autor. No hay lista de destinatarios
 * que mantener al día: el que esté vinculado al bot, se entera.
 *
 * No lanza ni corta nada. Cuando esto corre el movimiento YA está guardado:
 * que no salga el aviso es una molestia, que se pierda el comprobante porque
 * Telegram no contestó, no.
 */
async function avisarALaContraparte(admin: Admin, autorId: string, texto: string) {
  const { data: vinculos, error } = await admin
    .from("telegram_vinculos")
    .select("chat_id")
    .neq("user_id", autorId);

  if (error) {
    console.error(`[telegram] no pude ver a quién avisar: ${error.message}`);
    return;
  }

  for (const vinculo of vinculos ?? []) {
    await enviarMensaje(Number(vinculo.chat_id), texto);
  }
}

/**
 * El aviso, con lo justo para decidir si vale la pena abrir el panel ahora
 * o esperar. Sin referencias ni bancos: eso ya está del otro lado, y acá
 * solo agregaría ruido a una notificación del teléfono.
 */
function avisoDeRevision(
  numero: number | null | undefined,
  usdt: number,
  totalOrigen: number,
  moneda: Moneda,
  fecha: string,
) {
  return [
    numero ? `Movimiento #${numero} para revisar` : "Movimiento nuevo para revisar",
    "",
    `${formatMonto(usdt, "USDT")} · ${formatMonto(totalOrigen, moneda)}`,
    `Fecha: ${formatFecha(fecha)}`,
    "",
    `Lo cargó la otra parte por el bot. Revisalo acá: ${APP}/revision`,
  ].join("\n");
}

async function procesarFoto(
  admin: Admin,
  chatId: number,
  userId: string,
  mensaje: MensajeTelegram,
) {
  const caption = (mensaje.caption ?? "").trim();

  const lectura = await leerFoto(admin, userId, mensaje);
  if (!lectura.ok) {
    await enviarMensaje(chatId, lectura.mensaje);
    return;
  }

  const { datos, moneda } = lectura;
  const destino = lectura.path;

  if (!moneda) {
    await enviarMensaje(chatId, SIN_MONEDA);
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

  // La MISMA cuenta que hace el formulario de la web (usdtDesdeOrigen):
  // total en moneda de origen ÷ tasa, redondeado a centavos.
  const usdt = usdtDesdeOrigen(lectura.monto, tasa);
  if (!(usdt > 0)) {
    await enviarMensaje(
      chatId,
      `Ese monto (${formatMonto(lectura.monto, moneda)}) contra la tasa de referencia da menos de un centavo de USDT. No cargué nada.`,
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
        valor_origen: lectura.monto,
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

  await avisarALaContraparte(
    admin,
    userId,
    avisoDeRevision(numero, usdt, lectura.monto, moneda, fecha),
  );

  // ---------- 7. Contar qué se entendió ----------
  const lineas = [
    numero ? `Movimiento #${numero} cargado — pendiente de revisión.` : "Movimiento cargado — pendiente de revisión.",
    "",
    `Monto: ${formatMonto(lectura.monto, moneda)}`,
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

// ============================================================
// Varios comprobantes, UN movimiento
// ============================================================
//
// Dos caminos llegan acá: un álbum de Telegram (N fotos) y un mensaje de
// texto con N comprobantes pegados. Los dos terminan en lo mismo — un
// item con varios depósitos colgando — que es exactamente lo que ya hace
// el formulario de la web, así que comparten todo desde este punto.

/** Un depósito ya listo para entrar a un movimiento. */
type PiezaLista = {
  /** Posición dentro de lo que mandó la persona, para poder nombrarla en el chat. */
  orden: number;
  monto: number;
  moneda: Moneda;
  /** yyyy-mm-dd. Nunca null: si el comprobante no la traía, es la de hoy. */
  fecha: string;
  /** false = la fecha no estaba en el comprobante y se puso la de hoy. */
  fechaLeida: boolean;
  referencia: string | null;
  banco: string | null;
  comprobante_path: string | null;
  comprobante_texto: string | null;
  avisos: string[];
  /** Solo en el camino del álbum: con qué fila de telegram_piezas se corresponde. */
  updateId?: number;
};

/** Lo que la persona mandó pero no entró a ningún movimiento. */
type PiezaAfuera = {
  orden: number;
  motivo: string;
  /** El archivo alcanzó a guardarse en el bucket y se puede rescatar desde la web. */
  guardado: boolean;
};

type MovimientoArmado = {
  numero: number | null;
  itemId: string | null;
  moneda: Moneda;
  fecha: string;
  fechasDistintas: boolean;
  total: number;
  tasa: number;
  etiquetaTasa: string;
  usdt: number;
  piezas: PiezaLista[];
};

const NOMBRE_MONEDA: Record<Moneda, string> = { VES: "bolívares", COP: "pesos" };

/** "ese comprobante" / "esos 3 comprobantes", para que los mensajes concuerden. */
function esosComprobantes(n: number) {
  return n === 1 ? "ese comprobante" : `esos ${n} comprobantes`;
}

// Orden fijo para que, cuando haya que partir por moneda, el resultado no
// dependa del orden en que llegaron las fotos.
const ORDEN_MONEDAS: Moneda[] = ["VES", "COP"];

/**
 * Arma UN movimiento con todos los depósitos de una misma moneda.
 *
 * No contesta nada por el chat: devuelve qué pasó y quien llama junta todo
 * en un solo mensaje.
 */
async function crearMovimiento(
  admin: Admin,
  userId: string,
  moneda: Moneda,
  piezas: PiezaLista[],
  caption: string,
): Promise<{ ok: true; movimiento: MovimientoArmado } | { ok: false; mensaje: string }> {
  const total = piezas.reduce((acc, p) => acc + p.monto, 0);

  // LA FECHA DEL MOVIMIENTO es la más vieja de sus depósitos. Ordenar
  // strings yyyy-mm-dd alcanza: el orden alfabético es el cronológico.
  //
  // Se elige la más vieja y no "la de la primera pieza" porque el orden en
  // que Telegram entrega las fotos de un álbum no está garantizado, y la
  // fecha del movimiento no puede depender de eso. Cada depósito conserva
  // SU fecha real, así que si el bloque cruza días se ve en el panel.
  const fechas = piezas.map((p) => p.fecha).sort();
  const fecha = fechas[0];
  const fechasDistintas = fechas[0] !== fechas[fechas.length - 1];

  // LA TASA se consulta UNA sola vez, acá, en el momento de armar el
  // movimiento, y no se guarda la que hubiera visto la primera pieza.
  //
  // Por dos razones. La primera es de corrección: la tasa se pide para una
  // FECHA (la TRM de COP es una serie por día), y la fecha del movimiento
  // recién se conoce cuando están todas las piezas. Una tasa consultada por
  // una pieza suelta sería la de la fecha de ESA pieza, que puede no ser la
  // del movimiento. La segunda es de costo: una consulta por movimiento en
  // lugar de una por foto, contra dos fuentes externas y gratuitas.
  let tasa: number;
  let etiquetaTasa: string;
  try {
    const { fuente, fresca } = await obtenerFuenteTasa(PAR_POR_MONEDA[moneda], fecha);
    tasa = fuente.valor;
    etiquetaTasa = `${fuente.etiqueta} · ${fuente.detalle}`;

    // Misma regla que la web y que el camino de la foto suelta: la muestra
    // del P2P se guarda porque es efímera, la TRM no porque ya es serie.
    if (fresca && fuente.id === "p2p") {
      await admin.from("tasas_referencia").insert({
        par: PAR_POR_MONEDA[moneda],
        valor: fuente.valor,
        consultado_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.error(`[telegram] sin tasa de referencia: ${(e as Error).message}`);
    return {
      ok: false,
      mensaje: `No pude conseguir la tasa de referencia para ${NOMBRE_MONEDA[moneda]}, así que ${esosComprobantes(piezas.length)} NO quedaron cargados (sin tasa, el USDT sería inventado). Probá de nuevo en un rato o cargalos desde la web.`,
    };
  }

  if (!(tasa > 0)) {
    return {
      ok: false,
      mensaje: `La tasa de referencia de ${NOMBRE_MONEDA[moneda]} volvió en cero, así que ${esosComprobantes(piezas.length)} NO quedaron cargados.`,
    };
  }

  // La MISMA cuenta que hace el formulario de la web (usdtDesdeOrigen):
  // la SUMA de los depósitos dividida entre la tasa, redondeada a centavos.
  // Una sola tasa para todo el movimiento, un solo redondeo sobre el total.
  const usdt = usdtDesdeOrigen(total, tasa);
  if (!(usdt > 0)) {
    return {
      ok: false,
      mensaje: `${esosComprobantes(piezas.length)} (${formatMonto(total, moneda)}) contra la tasa de referencia ${piezas.length === 1 ? "da" : "dan"} menos de un centavo de USDT. No cargué nada.`,
    };
  }

  const tipoFlujo = flujoDeMoneda(moneda);
  const bancos = [...new Set(piezas.map((p) => p.banco).filter((b): b is string => Boolean(b)))];
  const detalle = [
    "Cargado por Telegram",
    piezas.length > 1 ? `${piezas.length} comprobantes` : null,
    bancos.join(" / ") || null,
    caption || null,
  ]
    .filter((p): p is string => Boolean(p && p.trim()))
    .join(" · ")
    .slice(0, 300);

  // Una sola llamada con el array COMPLETO de depósitos: crear_item_desde_bot
  // ya lo acepta, es la misma forma en la que la web guarda un movimiento con
  // varios depósitos. No hace falta ninguna función nueva.
  const { data: creado, error: errorRpc } = await admin.rpc("crear_item_desde_bot", {
    p_user_id: userId,
    p_tipo_flujo: tipoFlujo,
    p_moneda_origen: monedaDeFlujo(tipoFlujo),
    p_tasa: tasa,
    p_usdt_total: usdt,
    p_detalle: detalle,
    p_fecha: fecha,
    p_depositos: piezas.map((p) => ({
      referencia: p.referencia,
      fecha: p.fecha,
      valor_origen: p.monto,
      comprobante_path: p.comprobante_path,
      comprobante_texto: p.comprobante_texto,
    })),
  });

  if (errorRpc) {
    console.error(`[telegram] la base rechazó el movimiento: ${errorRpc.message}`);
    // El mensaje de la función ya está escrito para una persona.
    return {
      ok: false,
      mensaje: `No pude cargar ${esosComprobantes(piezas.length)}: ${errorRpc.message}`,
    };
  }

  const devuelto = creado as { numero?: number; item_id?: string } | null;

  await avisarALaContraparte(
    admin,
    userId,
    avisoDeRevision(devuelto?.numero, usdt, total, moneda, fecha),
  );

  return {
    ok: true,
    movimiento: {
      numero: devuelto?.numero ?? null,
      itemId: devuelto?.item_id ?? null,
      moneda,
      fecha,
      fechasDistintas,
      total,
      tasa,
      etiquetaTasa,
      usdt,
      piezas,
    },
  };
}

/** Cómo se lee un depósito en la lista del chat. */
function lineaDeposito(p: PiezaLista): string {
  const partes = [
    `${p.orden}. ${formatMonto(p.monto, p.moneda)}`,
    formatFecha(p.fecha) + (p.fechaLeida ? "" : " (la de hoy)"),
    p.referencia ? `ref ${p.referencia}` : "sin referencia",
  ];
  if (p.banco) partes.push(p.banco);
  return partes.join(" · ");
}

/**
 * Agrupa por moneda, crea un movimiento por grupo y manda UN SOLO mensaje
 * con todo lo que pasó.
 *
 * Un mensaje y no uno por movimiento: la persona mandó un bloque y espera
 * una respuesta, y el bot tiene que dejarle claro qué quedó cargado sin que
 * tenga que abrir la app.
 */
async function armarYContar(
  admin: Admin,
  chatId: number,
  userId: string,
  listas: PiezaLista[],
  afuera: PiezaAfuera[],
  encabezado: string[],
  caption: string,
): Promise<MovimientoArmado[]> {
  const lineas: string[] = [...encabezado];

  // Monedas distintas en el mismo bloque: NO se adivina cuál valía. Un
  // movimiento tiene UNA moneda de origen (de ahí salen el tipo de flujo y
  // la tasa), así que mezclarlas en uno solo es imposible, y elegir una
  // cargaría la mitad de la plata en el flujo equivocado. Se arma uno por
  // moneda y se avisa, que es lo único honesto: nada se pierde y la
  // persona ve que el bloque venía mezclado.
  const porMoneda = ORDEN_MONEDAS.map((m) => ({
    moneda: m,
    piezas: listas.filter((p) => p.moneda === m),
  })).filter((g) => g.piezas.length > 0);

  if (porMoneda.length > 1) {
    lineas.push(
      "Ojo: en ese bloque hay comprobantes en bolívares Y en pesos, y un movimiento tiene una sola moneda. No adiviné cuál querías: armé uno por moneda.",
      "",
    );
  }

  const armados: MovimientoArmado[] = [];

  for (const grupo of porMoneda) {
    const resultado = await crearMovimiento(admin, userId, grupo.moneda, grupo.piezas, caption);

    if (!resultado.ok) {
      lineas.push(resultado.mensaje, "");
      continue;
    }

    const m = resultado.movimiento;
    armados.push(m);

    lineas.push(
      m.numero
        ? `Movimiento #${m.numero} cargado — pendiente de revisión.`
        : "Movimiento cargado — pendiente de revisión.",
    );

    if (m.piezas.length > 1) {
      lineas.push(
        `${m.piezas.length} comprobantes en un solo movimiento.`,
        "",
        `Total: ${formatMonto(m.total, m.moneda)}`,
        `Fecha: ${formatFecha(m.fecha)}`,
      );
    } else {
      const unica = m.piezas[0];
      lineas.push(
        "",
        `Monto: ${formatMonto(m.total, m.moneda)}`,
        `Fecha: ${formatFecha(m.fecha)}${unica.fechaLeida ? "" : " (no la leí en el comprobante, usé la de hoy)"}`,
        `Referencia: ${unica.referencia ?? "no la pude leer"}`,
      );
      if (unica.banco) lineas.push(`Banco: ${unica.banco}`);
    }

    lineas.push(
      `Tasa: ${formatMonto(m.tasa, m.moneda)} (${m.etiquetaTasa})`,
      `USDT: ${formatMonto(m.usdt, "USDT")}`,
    );

    if (m.piezas.length > 1) {
      lineas.push("", "Depósitos:", ...m.piezas.map(lineaDeposito));
      if (m.fechasDistintas) {
        lineas.push(
          "",
          `Los comprobantes no son todos del mismo día: apliqué la tasa del ${formatFecha(m.fecha)} a todo el movimiento.`,
        );
      }
    }

    lineas.push("");
  }

  // Lo que quedó afuera va SIEMPRE y con nombre: un movimiento armado a
  // medias en silencio es plata que nadie va a buscar.
  if (afuera.length > 0) {
    lineas.push(
      afuera.length === 1
        ? "Uno de los comprobantes quedó afuera:"
        : `${afuera.length} comprobantes quedaron afuera:`,
      ...afuera.map(
        (p) =>
          `· Comprobante ${p.orden}: ${p.motivo}.` +
          (p.guardado ? " El archivo quedó guardado: cargalo desde la web eligiéndolo del bucket." : ""),
      ),
      "",
    );
  }

  if (armados.length > 0) {
    lineas.push("La tasa es PROVISORIA: la contraparte la ajusta cuando lo revise.");
  }

  // Los avisos de la lectura (un monto dudoso, una fecha rara) van sí o sí:
  // es lo que hay que mirar antes de aprobar. Se deduplican porque el mismo
  // aviso se repite en varios comprobantes del mismo banco.
  const avisos = [...new Set(listas.flatMap((p) => p.avisos))];
  if (avisos.length > 0) {
    lineas.push("", "Ojo:", ...avisos.map((a) => `· ${a}`));
  }

  lineas.push("", APP);

  // Telegram rechaza los mensajes de más de 4096 caracteres, y ahí no se
  // pierde solo el texto: el movimiento YA está cargado y la persona se
  // quedaría sin enterarse. Con un álbum de 10 fotos y sus avisos el
  // mensaje puede acercarse, así que se recorta antes de mandarlo.
  const texto = lineas.join("\n");
  const cuerpo =
    texto.length > 4000 ? `${texto.slice(0, 3900)}\n\n(…corté el resto)\n\n${APP}` : texto;

  await enviarMensaje(chatId, cuerpo);
  return armados;
}

// ------------------------------------------------------------
// El camino del álbum
// ------------------------------------------------------------

/**
 * Cuánto se espera a las fotos hermanas antes de intentar armar el grupo.
 *
 * Telegram entrega las N fotos de un álbum como N updates independientes y
 * NO dice cuántas son. No existe forma de saber que "ya llegaron todas":
 * lo único que se puede hacer es esperar un rato y armar con lo que haya.
 *
 * 3 segundos: las invocaciones arrancan casi juntas y hacen el mismo
 * trabajo (bajar, guardar, leer), así que terminan con pocos cientos de
 * milisegundos de diferencia entre ellas; 3s cubre esa dispersión con
 * margen. Estirarlo no compra casi nada y acerca la invocación al techo de
 * 60s. Si aun así una llega tarde, no se pierde: se carga aparte y se avisa.
 */
const VENTANA_ALBUM_MS = 3_000;

function esperar(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

const COLUMNAS_PIEZA =
  "update_id, estado, motivo, comprobante_path, monto, fecha, referencia, moneda, banco, caption, avisos, item_numero";

type FilaPieza = {
  update_id: number;
  estado: string;
  motivo: string | null;
  comprobante_path: string | null;
  monto: number | null;
  fecha: string | null;
  referencia: string | null;
  moneda: Moneda | null;
  banco: string | null;
  caption: string | null;
  avisos: string[] | null;
  item_numero: number | null;
};

/**
 * Una foto de un álbum.
 *
 * Un álbum NO es un mensaje: son N updates sueltos que solo comparten el
 * media_group_id, y cada uno puede caer en una invocación distinta, en
 * paralelo y en otra máquina. No hay ningún lugar en memoria donde
 * juntarlos, así que la coordinación va por la base.
 */
async function procesarPiezaDeAlbum(
  admin: Admin,
  chatId: number,
  userId: string,
  mensaje: MensajeTelegram,
  mediaGroupId: string,
  updateId: number,
) {
  // ---------- 1. Mi propia foto ----------
  // Cada invocación hace LA SUYA, y todas al mismo tiempo: bajar el archivo
  // y leerlo con el modelo es lo único caro de todo esto (hasta 20s), y
  // hacerlo en serie multiplicaría el tiempo por la cantidad de fotos.
  const lectura = await leerFoto(admin, userId, mensaje);

  const comun = {
    media_group_id: mediaGroupId,
    update_id: updateId,
    chat_id: chatId,
    user_id: userId,
    caption: (mensaje.caption ?? "").trim() || null,
  };

  // ---------- 2. Guardarla como pieza del grupo ----------
  // Las que fallaron se guardan igual, con el motivo: una foto que no entra
  // al movimiento hay que contarla en el chat, no dejarla desaparecer.
  const { error: errorPieza } = await admin.from("telegram_piezas").insert(
    lectura.ok
      ? {
          ...comun,
          estado: "lista",
          comprobante_path: lectura.path,
          monto: lectura.monto,
          // Se guarda tal cual vino: null significa "el comprobante no la
          // traía". La de hoy se pone recién al armar, y así el chat puede
          // decir cuál se leyó y cuál se supuso.
          fecha: lectura.datos.fecha,
          referencia: lectura.datos.referencia,
          moneda: lectura.moneda,
          banco: lectura.datos.banco,
          avisos: lectura.datos.avisos,
        }
      : {
          ...comun,
          estado: "fallida",
          motivo: lectura.motivo,
          comprobante_path: lectura.path,
        },
  );

  if (errorPieza) {
    console.error(`[telegram] no se pudo guardar la pieza del álbum: ${errorPieza.message}`);
    // Si la pieza no quedó en la base, ninguna hermana la va a ver y nadie
    // más la va a contar: acá es el último lugar donde todavía se sabe de
    // ella.
    await enviarMensaje(
      chatId,
      "No pude registrar una de las fotos de ese bloque, así que esa quedó sin cargar. Mandámela sola o cargala desde la web: " +
        APP,
    );
    return;
  }

  // ---------- 3. La ventana ----------
  // Se espera a que las hermanas terminen de guardar lo suyo. Sin esta
  // espera, la primera en llegar armaría el movimiento con una sola foto y
  // el resto quedaría como piezas tardías: el álbum se partiría siempre.
  await esperar(VENTANA_ALBUM_MS);

  // ---------- 4. El candado ----------
  // Un ÚNICO update condicional, que es atómico por definición: Postgres
  // bloquea cada fila y la invocación que llega segunda vuelve a evaluar el
  // where contra la fila YA actualizada, ve armado_at no nulo y la saltea.
  // Se lleva cero filas y se va sin hacer nada.
  //
  // Leer primero y marcar después no serviría: entre la lectura y la marca
  // las dos se creerían ganadoras y cargarían la misma plata dos veces. Es
  // el mismo truco con el que /vincular quema un código de un solo uso.
  //
  // Se marca ANTES de crear el movimiento, con el mismo criterio que la
  // idempotencia por update_id: si el proceso muere en el medio, el bloque
  // queda sin cargar y se resuelve reenviándolo. Al revés —- crear primero
  // y marcar después —- un corte en el medio deja el movimiento cargado Y
  // el grupo libre, y la siguiente invocación lo carga de nuevo.
  const { data: mias, error: errorCandado } = await admin
    .from("telegram_piezas")
    .update({ armado_at: new Date().toISOString() })
    .eq("media_group_id", mediaGroupId)
    .is("armado_at", null)
    .select(COLUMNAS_PIEZA);

  if (errorCandado) {
    console.error(`[telegram] no se pudo tomar el grupo: ${errorCandado.message}`);
    await enviarMensaje(
      chatId,
      "No pude terminar de armar ese bloque. Fijate en el panel si quedó cargado antes de reintentar: " +
        APP,
    );
    return;
  }

  // Cero filas = otra invocación se quedó con el grupo (con mi pieza
  // incluida) y va a contestar ella. Esta se va en silencio: dos mensajes
  // por el mismo bloque confundirían más de lo que aclaran.
  if (!mias || mias.length === 0) return;

  await armarAlbum(admin, chatId, userId, mediaGroupId, mias as FilaPieza[]);
}

async function armarAlbum(
  admin: Admin,
  chatId: number,
  userId: string,
  mediaGroupId: string,
  mias: FilaPieza[],
) {
  // El orden del álbum es el de los update_id: es el orden en que la
  // persona mandó las fotos, y es con el que se las nombra en el chat.
  const ordenadas = [...mias].sort((a, b) => a.update_id - b.update_id);

  // ¿Este grupo ya se había armado antes? Son las piezas del grupo que
  // están tomadas y que NO tomé yo.
  const { data: todas } = await admin
    .from("telegram_piezas")
    .select("update_id, item_numero")
    .eq("media_group_id", mediaGroupId)
    .not("armado_at", "is", null);

  const mios = new Set(ordenadas.map((p) => p.update_id));
  const previas = ((todas ?? []) as { update_id: number; item_numero: number | null }[]).filter(
    (p) => !mios.has(p.update_id),
  );
  const numerosPrevios = [
    ...new Set(previas.map((p) => p.item_numero).filter((n): n is number => typeof n === "number")),
  ];

  // Telegram le pone el caption a UNA sola foto del álbum, no a todas. Si
  // la persona escribió "COP" al mandar el bloque, eso vale para las N.
  const captionGrupo = ordenadas.map((p) => p.caption ?? "").find((c) => c.trim() !== "") ?? "";
  const monedaDelCaption = monedaDeTexto(captionGrupo);

  const listas: PiezaLista[] = [];
  const afuera: PiezaAfuera[] = [];

  ordenadas.forEach((p, i) => {
    const orden = i + 1;
    const guardado = Boolean(p.comprobante_path);

    if (p.estado !== "lista" || p.monto === null || !(p.monto > 0)) {
      afuera.push({ orden, motivo: p.motivo ?? "no la pude leer", guardado });
      return;
    }

    // La moneda de la foto, y si no la tiene, la que declaró el caption del
    // álbum. Lo que NO se hace es copiarle la moneda a las hermanas: que
    // dos comprobantes vengan en el mismo álbum no prueba que sean de la
    // misma moneda, y ahí adivinar mal carga la plata en el flujo
    // equivocado sin que nadie lo vea.
    const moneda = p.moneda ?? monedaDelCaption;
    if (!moneda) {
      afuera.push({
        orden,
        motivo:
          'no pude distinguir si estaba en bolívares o en pesos (reenviala escribiendo "Bs" o "COP")',
        guardado,
      });
      return;
    }

    listas.push({
      orden,
      monto: p.monto,
      moneda,
      fecha: p.fecha ?? hoyISO(),
      fechaLeida: p.fecha !== null,
      referencia: p.referencia,
      banco: p.banco,
      comprobante_path: p.comprobante_path,
      comprobante_texto: null,
      // Viene de una columna jsonb: se comprueba que sea un array antes de
      // tratarlo como tal, porque acá ya no hay tipos que lo garanticen.
      avisos: Array.isArray(p.avisos) ? p.avisos : [],
      updateId: p.update_id,
    });
  });

  // PIEZA TARDÍA: llegó después de que el grupo ya se armó.
  //
  // Se carga APARTE y no se suma al movimiento que ya existe. Sumarla
  // querría decir editarle el total a un movimiento que la contraparte
  // puede estar revisando (o haber aprobado) en ese mismo momento: cambiar
  // por atrás un número que alguien ya miró es peor que tener dos
  // movimientos. Aparte no se pierde nada y unir dos movimientos desde el
  // panel es trabajo de la persona, no una sorpresa.
  const encabezado: string[] = [];
  if (previas.length > 0) {
    encabezado.push(
      ordenadas.length === 1
        ? "Esta foto llegó tarde: el resto del bloque ya se había cargado."
        : "Estas fotos llegaron tarde: el resto del bloque ya se había cargado.",
      numerosPrevios.length > 0
        ? `Lo que ya estaba quedó en ${numerosPrevios.map((n) => `#${n}`).join(", ")} y no lo toco: puede estar en revisión, y cambiarle el total por atrás sería reescribir algo que la contraparte ya miró.`
        : "Lo que ya estaba no lo toco: puede estar en revisión.",
      "Así que esto va aparte. Si tenían que ir juntas, unificalas desde el panel.",
      "",
    );
  }

  const armados = await armarYContar(admin, chatId, userId, listas, afuera, encabezado, captionGrupo);

  // Queda anotado en qué movimiento terminó cada pieza. Es bitácora: sirve
  // para que una pieza tardía pueda decir en el chat con qué número quedó
  // el resto del bloque.
  for (const m of armados) {
    const ids = m.piezas
      .map((p) => p.updateId)
      .filter((id): id is number => typeof id === "number");
    if (ids.length === 0) continue;

    const { error } = await admin
      .from("telegram_piezas")
      .update({ item_id: m.itemId, item_numero: m.numero })
      .eq("media_group_id", mediaGroupId)
      .in("update_id", ids);

    if (error) {
      // No se le cuenta a nadie: el movimiento YA está cargado y avisado.
      // Esto es solo la bitácora del bot.
      console.error(`[telegram] no se pudo anotar el movimiento en las piezas: ${error.message}`);
    }
  }
}

// ------------------------------------------------------------
// El camino del texto
// ------------------------------------------------------------

const NO_ES_COMPROBANTE = `No le encontré ningún monto a ese texto, así que no cargué nada.

Si era un comprobante, pegámelo completo, tal como lo copia la app del banco (con el "Monto:", la "Referencia:" y la fecha). También podés mandarme la foto.

/ayuda para ver todo lo que hago.`;

/**
 * Un comprobante (o varios) pegados como TEXTO.
 *
 * Las apps de los bancos comparten el comprobante como texto plano, y ese
 * texto ya viene etiquetado ("Monto:", "Referencia:", "Fecha de
 * operación:"). No hay nada que interpretar: es reconocer patrones, sale
 * gratis y contesta al instante. Mandárselo al modelo sería pagar — y
 * esperar hasta 20 segundos — por leer algo que ya viene escrito.
 *
 * El parseo es el MISMO que usa la web (parseComprobantesTexto): un solo
 * lugar donde se decide qué dice un comprobante, para que el mismo texto no
 * valga distinto según por dónde entró.
 */
async function procesarTexto(admin: Admin, chatId: number, userId: string, texto: string) {
  // Plural a propósito: un mensaje puede traer varios comprobantes pegados
  // de corrido, y en ese caso son varios depósitos de UN movimiento, igual
  // que un álbum de fotos.
  const comprobantes = parseComprobantesTexto(texto);

  const { data: perfil } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  const esColaborador = perfil?.role === "colaborador";
  // Lo que la persona haya escrito alrededor de los comprobantes vale para
  // todo el mensaje, igual que el caption de un álbum.
  const monedaDelMensaje = monedaDeTexto(texto);

  const listas: PiezaLista[] = [];
  const afuera: PiezaAfuera[] = [];

  comprobantes.forEach((c, i) => {
    const orden = i + 1;
    const datos = c.datos;

    if (datos.monto === null || !(datos.monto > 0)) {
      afuera.push({ orden, motivo: "no le encontré el monto", guardado: false });
      return;
    }

    // La MISMA cascada que las fotos, con el texto del propio comprobante
    // en lugar del caption. Si ni así hay certeza, no se adivina.
    const moneda = determinarMoneda(datos, c.texto, esColaborador) ?? monedaDelMensaje;
    if (!moneda) {
      afuera.push({
        orden,
        motivo:
          'no pude distinguir si estaba en bolívares o en pesos (reenvialo escribiendo "Bs" o "COP")',
        guardado: false,
      });
      return;
    }

    listas.push({
      orden,
      monto: datos.monto,
      moneda,
      fecha: datos.fecha ?? hoyISO(),
      fechaLeida: datos.fecha !== null,
      referencia: datos.referencia,
      banco: datos.banco,
      // El comprobante ES el texto: no hay archivo que subir al bucket. La
      // columna comprobante_texto ya existe y el visor de la web la sabe
      // mostrar, igual que cuando se pega desde el formulario.
      comprobante_path: null,
      comprobante_texto: c.texto,
      avisos: datos.avisos,
    });
  });

  // Ningún monto en ningún bloque: esto no era un comprobante, era un
  // mensaje cualquiera. Se contesta como tal y no con un error.
  if (listas.length === 0) {
    await enviarMensaje(chatId, NO_ES_COMPROBANTE);
    return;
  }

  // El detalle del movimiento va SIN el texto: acá el mensaje entero ES el
  // comprobante, y cada depósito ya se lo lleva en comprobante_texto.
  // Repetirlo en el detalle del item sería la misma parrafada dos veces.
  await armarYContar(admin, chatId, userId, listas, afuera, [], "");
}
