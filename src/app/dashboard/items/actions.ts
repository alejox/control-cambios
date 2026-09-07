"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { monedaDeFlujo, type TipoFlujo } from "@/lib/items";

export type ActionState = { error: string | null };

function parseDepositosFromForm(formData: FormData) {
  const referencias = formData.getAll("deposito_referencia") as string[];
  const fechas = formData.getAll("deposito_fecha") as string[];
  const valores = formData.getAll("deposito_valor") as string[];

  const depositos: { referencia: string | null; fecha: string; valor_origen: number }[] = [];

  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i];
    const valorRaw = valores[i];
    if (!fecha && !valorRaw) continue; // fila vacía, se ignora
    const valor = Number(valorRaw);
    if (!fecha || Number.isNaN(valor)) {
      throw new Error(
        `El depósito #${i + 1} necesita al menos fecha y valor válidos.`,
      );
    }
    depositos.push({
      referencia: referencias[i]?.trim() || null,
      fecha,
      valor_origen: valor,
    });
  }

  return depositos;
}

function readItemFields(formData: FormData) {
  const numero = Number(formData.get("numero"));
  const tipo_flujo = formData.get("tipo_flujo") as TipoFlujo;
  const tasaRaw = formData.get("tasa") as string;
  const usdt_total = Number(formData.get("usdt_total"));
  const detalle = (formData.get("detalle") as string)?.trim() || null;
  const fecha = (formData.get("fecha") as string) || null;

  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error("El número de item debe ser un entero positivo.");
  }
  if (tipo_flujo !== "bs_a_usdt" && tipo_flujo !== "cop_a_usdt") {
    throw new Error("Selecciona un tipo de flujo válido.");
  }
  if (!Number.isFinite(usdt_total) || usdt_total < 0) {
    throw new Error("El total en USDT debe ser un número válido.");
  }
  const tasa = tasaRaw ? Number(tasaRaw) : null;
  if (tasaRaw && !Number.isFinite(tasa)) {
    throw new Error("La tasa debe ser un número válido.");
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

function traducirErrorDb(msg: string) {
  if (msg.includes("items_numero_key") || msg.includes("duplicate key")) {
    return "Ya existe un item con ese número.";
  }
  if (msg.includes("row-level security") || msg.includes("permission denied")) {
    return "Tu cuenta no tiene permiso de admin para hacer esto.";
  }
  return msg;
}
