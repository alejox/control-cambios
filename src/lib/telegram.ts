// Cliente minimo de la API de Telegram: los tres pedidos que hace el bot y
// nada mas. Sin SDK, con fetch, igual que binance.ts y trm.ts.
//
// REGLA DE ORO DE ESTE ARCHIVO: el token va en la URL de cada llamada, asi
// que ninguna URL puede terminar en un log ni en un mensaje de error. Por
// eso los errores se arman a mano con el metodo y el estado, y nunca
// reenvian lo que devolvio fetch tal cual.

const API = "https://api.telegram.org";

/** Mas que esto no lo acepta el bucket ni tiene sentido para una foto. */
export const MAX_BYTES = 5 * 1024 * 1024;

const TIMEOUT_MS = 15_000;

// ---------- Lo que manda Telegram ----------
// Solo los campos que se usan. El update trae muchisimo mas, pero cuanto
// menos se declare, menos hay que mantener cuando Telegram agregue cosas.

export type FotoTelegram = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  width: number;
  height: number;
};

export type MensajeTelegram = {
  message_id: number;
  chat: { id: number; type: string };
  from?: { id: number; is_bot: boolean; first_name?: string; username?: string };
  date: number;
  text?: string;
  caption?: string;
  /** Varias resoluciones de la MISMA foto, de menor a mayor. */
  photo?: FotoTelegram[];
  document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
};

export type UpdateTelegram = {
  update_id: number;
  message?: MensajeTelegram;
  edited_message?: MensajeTelegram;
};

function leerToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Falta configurar TELEGRAM_BOT_TOKEN en el servidor.");
  }
  return token;
}

type RespuestaApi<T> = { ok: boolean; result?: T; description?: string };

async function llamar<T>(metodo: string, cuerpo: Record<string, unknown>): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API}/bot${leerToken()}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    // El error de fetch puede traer la URL —- y con ella el token —- en el
    // mensaje. Se descarta entero y se arma uno propio.
    throw new Error(`Telegram no respondió a ${metodo}.`);
  }

  const json = (await respuesta.json().catch(() => null)) as RespuestaApi<T> | null;

  if (!respuesta.ok || !json?.ok) {
    // "description" lo escribe Telegram y no incluye el token.
    throw new Error(
      `Telegram rechazó ${metodo} (${respuesta.status}): ${json?.description ?? "sin detalle"}`,
    );
  }

  return json.result as T;
}

/**
 * sendMessage. No lanza nunca: si el chat no se puede contestar, el trabajo
 * que ya se hizo (el comprobante guardado, el movimiento creado) sigue
 * siendo valido, y hacer fallar el webhook por esto provocaria un reintento
 * de Telegram, que es justo lo que no queremos.
 *
 * Sin parse_mode a proposito: los mensajes llevan datos leidos de un
 * comprobante (referencias, nombres de banco) y un guion bajo suelto en
 * Markdown, o un "<" en HTML, hacen que Telegram rechace el mensaje entero.
 * En texto plano los links igual quedan clickeables.
 */
export async function enviarMensaje(chatId: number, texto: string): Promise<boolean> {
  try {
    await llamar("sendMessage", {
      chat_id: chatId,
      text: texto,
      link_preview_options: { is_disabled: true },
    });
    return true;
  } catch (e) {
    // Se loguea el motivo, nunca el texto del mensaje: puede tener datos
    // del comprobante.
    console.error(`[telegram] no se pudo contestar al chat: ${(e as Error).message}`);
    return false;
  }
}

/** getFile: convierte un file_id en la ruta con la que se baja el archivo. */
export async function obtenerArchivo(
  fileId: string,
): Promise<{ file_path: string; file_size?: number }> {
  const archivo = await llamar<{ file_path?: string; file_size?: number }>("getFile", {
    file_id: fileId,
  });

  if (!archivo.file_path) {
    throw new Error("Telegram no devolvió la ruta del archivo.");
  }
  return { file_path: archivo.file_path, file_size: archivo.file_size };
}

const TIPO_POR_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
};

/**
 * Baja el archivo del CDN de Telegram.
 *
 * El tipo sale de la extension y no del Content-Type: Telegram contesta
 * "application/octet-stream" para todo, y con eso Gemini rechaza la imagen
 * antes de mirarla.
 */
export async function descargarArchivo(
  filePath: string,
): Promise<{ bytes: ArrayBuffer; tipo: string }> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API}/file/bot${leerToken()}/${filePath}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("No se pudo bajar el archivo de Telegram.");
  }

  if (!respuesta.ok) {
    throw new Error(`Telegram devolvió ${respuesta.status} al bajar el archivo.`);
  }

  const bytes = await respuesta.arrayBuffer();
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error("El archivo pesa más de 5 MB.");
  }

  const extension = filePath.split(".").pop()?.toLowerCase() ?? "";
  return {
    bytes,
    tipo: TIPO_POR_EXTENSION[extension] ?? "application/octet-stream",
  };
}
