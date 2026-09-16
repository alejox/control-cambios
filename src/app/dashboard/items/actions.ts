"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  MOTIVO_DESAPROBACION_MAX,
  monedaDeFlujo,
  type TipoFlujo,
} from "@/lib/items";

export type ActionState = { error: string | null };

type DepositoForm = {
  referencia: string | null;
  fecha: string;
  valor_origen: number;
  comprobante_path: string | null;
  comprobante_texto: string | null;
};

function parseDepositosFromForm(formData: FormData): DepositoForm[] {
  const referencias = formData.getAll("deposito_referencia") as string[];
  const fechas = formData.getAll("deposito_fecha") as string[];
  const valores = formData.getAll("deposito_valor") as string[];
  const comprobantes = formData.getAll("deposito_comprobante") as string[];
  const textos = formData.getAll("deposito_comprobante_texto") as string[];

  const depositos: DepositoForm[] = [];

  for (let i = 0; i < fechas.length; i++) {
    const fecha = (fechas[i] ?? "").trim();
    const valorRaw = (valores[i] ?? "").trim();
    const comprobante = (comprobantes[i] ?? "").trim();
    const comprobanteTexto = (textos[i] ?? "").trim();

    // Fila totalmente vacía: se ignora en silencio.
    if (!fecha && !valorRaw && !comprobante && !comprobanteTexto) continue;

    // Number("") es 0, no NaN: sin este chequeo un depósito sin monto se
    // guardaba como 0 sin avisar.
    const valor = Number(valorRaw);
    if (!fecha || !valorRaw || !Number.isFinite(valor) || valor <= 0) {
      throw new Error(
        `El depósito #${i + 1} necesita fecha y un valor mayor que cero.`,
      );
    }

    depositos.push({
      referencia: referencias[i]?.trim() || null,
      fecha,
      valor_origen: valor,
      comprobante_path: comprobante || null,
      comprobante_texto: comprobanteTexto || null,
    });
  }

  return depositos;
}

function readItemFields(formData: FormData) {
  const numeroRaw = ((formData.get("numero") as string) ?? "").trim();
  const tipo_flujo = formData.get("tipo_flujo") as TipoFlujo;
  const tasaRaw = ((formData.get("tasa") as string) ?? "").trim();
  const usdtRaw = ((formData.get("usdt_total") as string) ?? "").trim();
  const detalle = (formData.get("detalle") as string)?.trim() || null;
  const fecha = (formData.get("fecha") as string) || null;

  // Todos estos parseos usan el string crudo primero porque Number("") es 0:
  // sin el chequeo, un campo vacío pasaba la validación como un cero válido.
  const numero = Number(numeroRaw);
  if (!numeroRaw || !Number.isInteger(numero) || numero <= 0) {
    throw new Error("El número de item debe ser un entero positivo.");
  }
  if (tipo_flujo !== "bs_a_usdt" && tipo_flujo !== "cop_a_usdt") {
    throw new Error("Selecciona un tipo de flujo válido.");
  }

  const usdt_total = Number(usdtRaw);
  if (!usdtRaw || !Number.isFinite(usdt_total) || usdt_total <= 0) {
    throw new Error("El total en USDT debe ser mayor que cero.");
  }

  const tasa = tasaRaw ? Number(tasaRaw) : null;
  if (tasaRaw && (!Number.isFinite(tasa) || (tasa ?? 0) <= 0)) {
    throw new Error("La tasa debe ser un número mayor que cero.");
  }

  return {
    numero,
    tipo_flujo,
    moneda_origen: monedaDeFlujo(tipo_flujo),
    tasa,
    usdt_total,
    detalle,
    fecha,
  };
}

export async function crearItem(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let payload;
  let depositos;
  try {
    payload = readItemFields(formData);
    depositos = parseDepositosFromForm(formData);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("crear_item_con_depositos", {
    p_numero: payload.numero,
    p_tipo_flujo: payload.tipo_flujo,
    p_moneda_origen: payload.moneda_origen,
    p_tasa: payload.tasa,
    p_usdt_total: payload.usdt_total,
    p_detalle: payload.detalle,
    p_fecha: payload.fecha,
    p_depositos: depositos,
  });

  if (error) {
    return { error: traducirErrorDb(error.message) };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function actualizarItem(
  itemId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let payload;
  let depositos;
  try {
    payload = readItemFields(formData);
    depositos = parseDepositosFromForm(formData);
  } catch (e) {
    return { error: (e as Error).message };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("actualizar_item_con_depositos", {
    p_item_id: itemId,
    p_numero: payload.numero,
    p_tipo_flujo: payload.tipo_flujo,
    p_moneda_origen: payload.moneda_origen,
    p_tasa: payload.tasa,
    p_usdt_total: payload.usdt_total,
    p_detalle: payload.detalle,
    p_fecha: payload.fecha,
    p_depositos: depositos,
  });

  if (error) {
    return { error: traducirErrorDb(error.message) };
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

export async function eliminarItem(itemId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("items").delete().eq("id", itemId);
  if (error) {
    throw new Error(traducirErrorDb(error.message));
  }
  revalidatePath("/dashboard");
}

export type DesaprobarState = { error: string | null; ok: boolean };

/**
 * Devuelve un movimiento aprobado a revisión.
 *
 * Todo lo que importa —- que sea admin, que no esté liquidado, que esté
 * aprobado, que los depósitos vuelvan junto con el item —- vive en la RPC
 * desaprobar_item (supabase/phase22_desaprobar_movimiento.sql), no acá. Es
 * a propósito: esto deshace un acuerdo entre dos personas, y las reglas de
 * un acuerdo no pueden depender de qué cliente lo llama.
 *
 * El chequeo de admin de este archivo es para el mensaje; el que manda es
 * el de la base (RLS "solo admin escribe items" + el raise de la función).
 */
export async function desaprobarItem(
  _prevState: DesaprobarState,
  formData: FormData,
): Promise<DesaprobarState> {
  const itemId = ((formData.get("item_id") as string) ?? "").trim();
  const motivo = ((formData.get("motivo") as string) ?? "").trim();

  if (!itemId) return { error: "Falta el movimiento.", ok: false };
  if (motivo === "") {
    return { error: "Escribí por qué lo devolvés a revisión.", ok: false };
  }
  if (motivo.length > MOTIVO_DESAPROBACION_MAX) {
    return {
      error: `El motivo no puede pasar de ${MOTIVO_DESAPROBACION_MAX} caracteres.`,
      ok: false,
    };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión venció. Volvé a iniciar sesión.", ok: false };

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (perfil?.role !== "admin") {
    return {
      error: "Solo un administrador puede devolver un movimiento a revisión.",
      ok: false,
    };
  }

  const { error } = await supabase.rpc("desaprobar_item", {
    p_item_id: itemId,
    p_motivo: motivo,
  });

  if (error) return { error: traducirErrorDb(error.message), ok: false };

  // El layout entero y no solo la página: la campanita vive en el layout y
  // su número tiene que subir en el mismo momento en que el movimiento
  // vuelve a la lista de la contraparte. Esta forma arrastra también a
  // /dashboard/revision, que cuelga del mismo layout.
  revalidatePath("/dashboard", "layout");
  return { error: null, ok: true };
}

function traducirErrorDb(msg: string) {
  // El constraint global items_numero_key ya no existe: ahora la unicidad
  // es por corte (ver phase9). Se dejan los nombres nuevos y el viejo por
  // si alguna base todavia no corrio la migracion.
  if (
    msg.includes("items_numero_pendiente_idx") ||
    msg.includes("items_numero_por_liquidacion_idx") ||
    msg.includes("items_numero_key") ||
    msg.includes("duplicate key")
  ) {
    return "Ya hay un movimiento pendiente con ese número.";
  }
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    // Ya no es solo cosa de admin: el colaborador puede registrar COP pero
    // no Bs, asi que el mensaje tiene que cubrir los dos casos.
    return "Tu cuenta no tiene permiso para registrar este tipo de movimiento.";
  }
  return msg;
}
