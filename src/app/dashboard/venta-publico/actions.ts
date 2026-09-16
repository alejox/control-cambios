"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { obtenerFuenteTasa, type FuenteTasa } from "@/lib/tasa-referencia";
import type { VentaState } from "./estado";
import {
  parsearMonto,
  parDeMoneda,
  tasaDesdeMonto,
  type MonedaLista,
} from "@/lib/venta-publico";

const RUTA = "/dashboard/venta-publico";
const RUTA_MEDIOS = "/dashboard/venta-publico/medios-pago";

const MONEDAS: MonedaLista[] = ["VES", "COP", "USD"];

/**
 * Venta público es una herramienta de trabajo compartida: la usan y la
 * editan los dos roles. La autorización real la aplican las políticas
 * "venta publico escribe ..." (ver supabase/phase27_...sql); este chequeo
 * existe para devolver un mensaje entendible en vez de un update que no
 * afecta ninguna fila, que es como se ve un permiso denegado bajo RLS
 * desde PostgREST.
 */
async function conAcceso() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { supabase: null, user: null, error: "Tu sesión venció." } as const;
  }

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (perfil?.role !== "admin" && perfil?.role !== "colaborador") {
    return {
      supabase: null,
      user: null,
      error: "Tu cuenta todavía no tiene acceso.",
    } as const;
  }

  return { supabase, user, error: null } as const;
}

/**
 * Guarda lo que es de este usuario en una lista: su tasa o sus medios de
 * cobro.
 *
 * Es upsert y no update porque la fila puede no existir todavía: un
 * usuario nuevo no tiene ninguna, y se crea la primera vez que toca algo.
 * Las columnas que no se pasan quedan como estaban —- calcular la tasa no
 * puede borrarle los medios de pago a nadie.
 */
async function guardarMio(
  supabase: SupabaseClient,
  listaId: string,
  userId: string,
  campos: Record<string, unknown>,
): Promise<VentaState> {
  const { data, error } = await supabase
    .from("venta_publico_lista_usuario")
    .upsert(
      {
        lista_id: listaId,
        user_id: userId,
        ...campos,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "lista_id,user_id" },
    )
    .select("lista_id");

  if (error) return fallo(error.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

const SIN_PERMISO = "No se pudo guardar: tu cuenta no tiene permiso.";

function fallo(mensaje: string): VentaState {
  const permiso =
    mensaje.includes("row-level security") || mensaje.includes("permission denied");
  return { error: permiso ? SIN_PERMISO : mensaje, ok: false };
}

function texto(formData: FormData, campo: string) {
  return ((formData.get(campo) as string) ?? "").trim();
}

function moneda(formData: FormData): MonedaLista | null {
  const valor = texto(formData, "moneda") as MonedaLista;
  return MONEDAS.includes(valor) ? valor : null;
}

/**
 * Precio en dólares tipeado a mano. Vacío es "todavía sin definir", que
 * es un estado legítimo: Stella y FlujoTV tienen los planes cargados y
 * los precios pendientes.
 */
function precioUsd(formData: FormData): { valor: number | null; error: string | null } {
  const crudo = texto(formData, "precio_usd");
  if (!crudo) return { valor: null, error: null };

  const valor = parsearMonto(crudo);
  if (valor === null || valor <= 0) {
    return { valor: null, error: "El precio en dólares tiene que ser mayor que cero." };
  }
  // Dos decimales, que es lo que acepta la columna.
  return { valor: Math.round(valor * 100) / 100, error: null };
}

/** Los textos del mensaje y el formato de la línea, que son de esta lista. */
export async function guardarTextos(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const listaId = texto(formData, "lista_id");
  if (!listaId) return { error: "Falta la lista.", ok: false };

  const plantilla = (formData.get("plantilla_linea") as string) ?? "";
  if (!plantilla.trim()) {
    return { error: "El formato de la línea no puede quedar vacío.", ok: false };
  }

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  // Sin trim: los saltos de línea del final pueden ser parte del mensaje.
  const { data, error: errorGuardado } = await supabase
    .from("venta_publico_listas")
    .update({
      encabezado: (formData.get("encabezado") as string) ?? "",
      pie: (formData.get("pie") as string) ?? "",
      plantilla_linea: plantilla,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listaId)
    .select("id");

  if (errorGuardado) return fallo(errorGuardado.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/** "Ya lo revisé": saca el cartel de pendiente de esta lista. */
export async function marcarRevisado(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const listaId = texto(formData, "lista_id");
  if (!listaId) return { error: "Falta la lista.", ok: false };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data, error: errorGuardado } = await supabase
    .from("venta_publico_listas")
    .update({ revisar: "", updated_at: new Date().toISOString() })
    .eq("id", listaId)
    .select("id");

  if (errorGuardado) return fallo(errorGuardado.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/**
 * Trae la tasa del mercado y la deja como tasa de venta de esta lista.
 *
 * La tasa se pide acá adentro, en el servidor, con la misma función que
 * usan el formulario de cierres y el bot de Telegram
 * (lib/tasa-referencia). Que no la mande el navegador no es paranoia: es
 * que haya una sola forma de preguntar cuánto vale el dólar.
 *
 * Pisa el ajuste manual si lo había: el aviso de que lo va a pisar lo da
 * la pantalla antes de llamar.
 */
export async function calcularConReferencia(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const listaId = texto(formData, "lista_id");
  if (!listaId) return { error: "Falta la lista.", ok: false };

  const { supabase, user, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data: lista } = await supabase
    .from("venta_publico_listas")
    .select("id, moneda")
    .eq("id", listaId)
    .maybeSingle();

  if (!lista) return { error: "Esa lista ya no existe.", ok: false };

  const par = parDeMoneda(lista.moneda as MonedaLista);
  if (!par) {
    return {
      error: "Esta lista ya está en dólares: no hay nada que convertir.",
      ok: false,
    };
  }

  let fuente: FuenteTasa;
  try {
    ({ fuente } = await obtenerFuenteTasa(par, null));
  } catch (e) {
    return {
      error: `No pudimos leer la tasa: ${(e as Error).message}`,
      ok: false,
    };
  }

  // El nombre y el detalle se guardan con las palabras que dio la propia
  // fuente ("Binance P2P · mediana … · N anuncios", "TRM oficial · última
  // publicada (16/09/26)") en vez de deducirse después de la moneda: así
  // la pantalla cuenta lo que realmente pasó, no lo que debería pasar.
  //
  // Y se guarda contra ESTE usuario: calcular la tasa es fijar el propio
  // margen, no el de la casa. El de al lado sigue con el suyo.
  const ahora = new Date().toISOString();
  return guardarMio(supabase, listaId, user.id, {
    tasa: fuente.valor,
    tasa_origen: "fuente",
    tasa_fuente: fuente.etiqueta,
    tasa_detalle: fuente.detalle,
    tasa_referencia: fuente.valor,
    tasa_referencia_at: ahora,
  });
}

/**
 * Ajustar un precio a mano ES editar la tasa de venta de la lista.
 *
 * El monto tipeado se divide por el ancla en dólares de ESE plan y la
 * tasa resultante re-deriva todos los demás desde su propia ancla. No se
 * escala el valor ya redondeado de cada uno: eso arrastraría el error de
 * redondeo de uno al siguiente y la lista se iría desviando.
 *
 * El ancla se lee de la base y no viene del formulario: si viajara desde
 * el navegador, un valor cambiado a mano daría una tasa inventada.
 */
export async function ajustarPrecio(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const listaId = texto(formData, "lista_id");
  const planId = texto(formData, "plan_id");
  if (!listaId || !planId) return { error: "Falta el plan.", ok: false };

  const monto = parsearMonto(texto(formData, "monto"));
  if (monto === null || monto <= 0) {
    return { error: "Escribí un monto mayor que cero.", ok: false };
  }

  const { supabase, user, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data: plan } = await supabase
    .from("venta_publico_planes")
    .select("id, etiqueta, precio_usd")
    .eq("id", planId)
    .maybeSingle();

  if (!plan) return { error: "Ese plan ya no existe.", ok: false };
  if (plan.precio_usd === null) {
    return {
      error: `"${plan.etiqueta}" todavía no tiene precio en dólares: cargalo primero y después ajustá.`,
      ok: false,
    };
  }

  const tasa = tasaDesdeMonto(monto, Number(plan.precio_usd));
  if (tasa === null) {
    return { error: "Ese monto da una tasa imposible. Revisalo.", ok: false };
  }

  return guardarMio(supabase, listaId, user.id, {
    tasa,
    tasa_origen: "ajuste",
  });
}

/**
 * Los medios de cobro de ESTE usuario en UNA moneda.
 *
 * Por moneda y no por lista: se cobra con la misma cuenta se venda Stella
 * u Oleada, y lo que de verdad cambia es la divisa —- en bolívares Pago
 * Móvil, en pesos Nequi, en dólares Wise. Guardarlos por lista obligaba a
 * editar el mismo Nequi en cuatro lugares y a que se desincronizaran.
 *
 * Por usuario porque son SUS cuentas. RLS no deja tocar las del otro.
 */
export async function guardarMediosPago(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const moneda = texto(formData, "moneda") as MonedaLista;
  if (!MONEDAS.includes(moneda)) {
    return { error: "Esa moneda no existe.", ok: false };
  }

  const { supabase, user, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data, error: errorGuardado } = await supabase
    .from("venta_publico_medios_pago")
    .upsert(
      {
        moneda,
        user_id: user.id,
        texto: (formData.get("texto") as string) ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "moneda,user_id" },
    )
    .select("moneda");

  if (errorGuardado) return fallo(errorGuardado.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  // Las dos: la sección donde se editan y las listas que los usan.
  revalidatePath(RUTA_MEDIOS);
  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/**
 * Un grupo nuevo nace con el título de la moneda desde la que se creó.
 * En las otras queda sin título hasta que alguien lo escriba, y eso se
 * avisa en pantalla: los planes salen igual, sin encabezar el bloque.
 */
export async function crearGrupo(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const proveedorId = texto(formData, "proveedor_id");
  const titulo = texto(formData, "titulo");
  const monedaLista = moneda(formData);
  if (!proveedorId || !monedaLista) return { error: "Falta la lista.", ok: false };
  if (!titulo) return { error: "El grupo necesita un título.", ok: false };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data: ultimo } = await supabase
    .from("venta_publico_grupos")
    .select("orden")
    .eq("proveedor_id", proveedorId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: grupo, error: errorGrupo } = await supabase
    .from("venta_publico_grupos")
    .insert({
      proveedor_id: proveedorId,
      // El nombre interno arranca igual al título con el que se creó.
      titulo,
      orden: (ultimo?.orden ?? 0) + 1,
    })
    .select("id")
    .single();

  if (errorGrupo) return fallo(errorGrupo.message);

  const { error: errorTexto } = await supabase
    .from("venta_publico_grupos_texto")
    .insert({ grupo_id: grupo.id, moneda: monedaLista, titulo });

  if (errorTexto) return fallo(errorTexto.message);

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/** El título que sale en el mensaje de ESTA moneda. */
export async function guardarGrupo(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const grupoId = texto(formData, "grupo_id");
  const titulo = texto(formData, "titulo");
  const monedaLista = moneda(formData);
  if (!grupoId || !monedaLista) return { error: "Falta el grupo.", ok: false };
  if (!titulo) return { error: "El grupo necesita un título.", ok: false };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data, error: errorGuardado } = await supabase
    .from("venta_publico_grupos_texto")
    .upsert(
      { grupo_id: grupoId, moneda: monedaLista, titulo },
      { onConflict: "grupo_id,moneda" },
    )
    .select("grupo_id");

  if (errorGuardado) return fallo(errorGuardado.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/**
 * Borra el grupo para TODAS las monedas: el grupo es del proveedor, no
 * de una presentación. Se lleva sus planes y sus textos por delante
 * (cascade en la base), y con ellos el precio en dólares.
 */
export async function eliminarGrupo(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const grupoId = texto(formData, "grupo_id");
  if (!grupoId) return { error: "Falta el grupo.", ok: false };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data, error: errorBorrado } = await supabase
    .from("venta_publico_grupos")
    .delete()
    .eq("id", grupoId)
    .select("id");

  if (errorBorrado) return fallo(errorBorrado.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

export async function crearPlan(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const grupoId = texto(formData, "grupo_id");
  const etiqueta = texto(formData, "etiqueta");
  const sufijo = texto(formData, "sufijo");
  const monedaLista = moneda(formData);
  const precio = precioUsd(formData);

  if (!grupoId || !monedaLista) return { error: "Falta el grupo.", ok: false };
  if (!etiqueta) return { error: "El plan necesita una etiqueta.", ok: false };
  if (precio.error) return { error: precio.error, ok: false };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data: ultimo } = await supabase
    .from("venta_publico_planes")
    .select("orden")
    .eq("grupo_id", grupoId)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: plan, error: errorPlan } = await supabase
    .from("venta_publico_planes")
    .insert({
      grupo_id: grupoId,
      etiqueta,
      precio_usd: precio.valor,
      orden: (ultimo?.orden ?? 0) + 1,
    })
    .select("id")
    .single();

  if (errorPlan) return fallo(errorPlan.message);

  const { error: errorTexto } = await supabase
    .from("venta_publico_planes_texto")
    .insert({ plan_id: plan.id, moneda: monedaLista, etiqueta, sufijo });

  if (errorTexto) return fallo(errorTexto.message);

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/**
 * Guarda el plan: la etiqueta y el sufijo son de esta moneda, el precio
 * en dólares es de todas. Cambiarlo acá lo cambia en todas las listas, y
 * eso es exactamente lo que queremos: es un solo precio.
 */
export async function guardarPlan(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const planId = texto(formData, "plan_id");
  const etiqueta = texto(formData, "etiqueta");
  const sufijo = texto(formData, "sufijo");
  const monedaLista = moneda(formData);
  const precio = precioUsd(formData);

  if (!planId || !monedaLista) return { error: "Falta el plan.", ok: false };
  if (!etiqueta) return { error: "El plan necesita una etiqueta.", ok: false };
  if (precio.error) return { error: precio.error, ok: false };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data, error: errorPrecio } = await supabase
    .from("venta_publico_planes")
    .update({ precio_usd: precio.valor })
    .eq("id", planId)
    .select("id");

  if (errorPrecio) return fallo(errorPrecio.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  const { error: errorTexto } = await supabase
    .from("venta_publico_planes_texto")
    .upsert(
      { plan_id: planId, moneda: monedaLista, etiqueta, sufijo },
      { onConflict: "plan_id,moneda" },
    );

  if (errorTexto) return fallo(errorTexto.message);

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/** Borra el plan de todas las listas: el plan es del proveedor. */
export async function eliminarPlan(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const planId = texto(formData, "plan_id");
  if (!planId) return { error: "Falta el plan.", ok: false };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data, error: errorBorrado } = await supabase
    .from("venta_publico_planes")
    .delete()
    .eq("id", planId)
    .select("id");

  if (errorBorrado) return fallo(errorBorrado.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

/** Las dos únicas tablas ordenables, y de dónde cuelga cada una. */
const ORDENABLES = {
  grupo: { tabla: "venta_publico_grupos", padre: "proveedor_id" },
  plan: { tabla: "venta_publico_planes", padre: "grupo_id" },
} as const;

type Ordenable = keyof typeof ORDENABLES;

/**
 * Sube o baja un grupo o un plan dentro de sus hermanos.
 *
 * Renumera la lista entera en vez de intercambiar los dos "orden"
 * involucrados: si dos filas quedaron con el mismo número —- pasa apenas
 * alguien toca datos a mano —- intercambiarlos no movería nada y el
 * botón parecería roto.
 *
 * La tabla no viaja desde el navegador: llega un nombre de entidad que se
 * traduce contra ORDENABLES acá adentro.
 */
export async function moverEnLista(
  _prev: VentaState,
  formData: FormData,
): Promise<VentaState> {
  const entidad = texto(formData, "entidad") as Ordenable;
  const id = texto(formData, "id");
  const direccion = texto(formData, "direccion");

  if (!(entidad in ORDENABLES)) return { error: "Eso no se puede ordenar.", ok: false };
  if (!id) return { error: "Falta qué mover.", ok: false };
  if (direccion !== "arriba" && direccion !== "abajo") {
    return { error: "Dirección no válida.", ok: false };
  }

  const { tabla, padre } = ORDENABLES[entidad];
  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data: fila } = await supabase
    .from(tabla)
    .select(`id, ${padre}`)
    .eq("id", id)
    .maybeSingle();

  if (!fila) return { error: "Eso ya no existe.", ok: false };

  const { data: hermanos } = await supabase
    .from(tabla)
    .select("id, orden")
    .eq(padre, (fila as Record<string, string>)[padre])
    .order("orden", { ascending: true });

  const lista = (hermanos ?? []) as { id: string; orden: number }[];
  const desde = lista.findIndex((h) => h.id === id);
  const hasta = direccion === "arriba" ? desde - 1 : desde + 1;

  // Ya está en la punta: no es un error, simplemente no hay adónde ir.
  if (desde < 0 || hasta < 0 || hasta >= lista.length) {
    return { error: null, ok: true };
  }

  [lista[desde], lista[hasta]] = [lista[hasta], lista[desde]];

  for (const [indice, elemento] of lista.entries()) {
    const { error: errorOrden } = await supabase
      .from(tabla)
      .update({ orden: indice + 1 })
      .eq("id", elemento.id);

    if (errorOrden) return fallo(errorOrden.message);
  }

  revalidatePath(RUTA);
  return { error: null, ok: true };
}
