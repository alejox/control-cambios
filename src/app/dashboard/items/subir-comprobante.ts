"use client";

import { createClient } from "@/lib/supabase/client";
import type { DatosComprobante } from "@/lib/comprobante";

export const BUCKET = "comprobantes";
export const MAX_BYTES = 5 * 1024 * 1024;
export const TIPOS_OK = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
];

function extensionDe(nombre: string) {
  const punto = nombre.lastIndexOf(".");
  return punto > -1 ? nombre.slice(punto + 1).toLowerCase() : "bin";
}

/**
 * Sube un comprobante al bucket privado. Vive aparte porque lo usan dos
 * caminos —- la carga de a uno y la masiva —- y si cada uno tuviera su
 * propia copia, el limite de tamaño o los tipos permitidos se irian
 * separando con el tiempo.
 */
export async function subirComprobante(
  archivo: File,
): Promise<{ path: string } | { error: string }> {
  if (archivo.size > MAX_BYTES) return { error: "Máximo 5 MB." };
  if (archivo.type && !TIPOS_OK.includes(archivo.type)) {
    return { error: "Solo imagen o PDF." };
  }

  const supabase = createClient();
  const destino = `${crypto.randomUUID()}.${extensionDe(archivo.name)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(destino, archivo, { upsert: false });

  return error ? { error: error.message } : { path: destino };
}

/**
 * Pide la lectura automatica del comprobante ya subido. Nunca lanza: si
 * falla, el archivo igual quedo guardado y los datos se cargan a mano.
 */
export async function leerComprobante(
  path: string,
): Promise<{ datos: DatosComprobante } | { error: string }> {
  try {
    const respuesta = await fetch("/api/comprobante/extraer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const cuerpo = await respuesta.json();
    if (!respuesta.ok) {
      return { error: cuerpo.error ?? "No pudimos leer el comprobante." };
    }
    return { datos: cuerpo as DatosComprobante };
  } catch (e) {
    return { error: `No pudimos leer el comprobante: ${(e as Error).message}` };
  }
}
