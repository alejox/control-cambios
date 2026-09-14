"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { monedaDeFlujo, type TipoFlujo } from "@/lib/items";

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
