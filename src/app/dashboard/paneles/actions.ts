"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PanelState } from "./estado";

const RUTA = "/dashboard/paneles";

const SIN_PERMISO = "No se pudo guardar: tu cuenta no tiene permiso.";

/**
 * Un panel es de quien lo cargó y de nadie más. La autorización real la
 * aplica la política "paneles: cada uno los suyos"; esto existe para
 * devolver un mensaje entendible en vez de un update que no afecta
 * ninguna fila, que es como se ve un permiso denegado bajo RLS.
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

function texto(formData: FormData, campo: string) {
  return ((formData.get(campo) as string) ?? "").trim();
}

function fallo(mensaje: string): PanelState {
  const permiso =
    mensaje.includes("row-level security") || mensaje.includes("permission denied");
  return { error: permiso ? SIN_PERMISO : mensaje, ok: false };
}

/**
 * Crea o actualiza un panel. Uno solo para los dos casos porque el
 * formulario es el mismo: lo único que cambia es si viaja el id.
 *
 * La clave NO se recorta como los demás campos: un espacio al final puede
 * ser parte de la contraseña, y "te la guardé pero sin el último
 * carácter" es el peor error posible acá.
 */
export async function guardarPanel(
  _prev: PanelState,
  formData: FormData,
): Promise<PanelState> {
  const nombre = texto(formData, "nombre");
  if (!nombre) return { error: "Ponele un nombre para reconocerlo.", ok: false };

  const { supabase, user, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const id = texto(formData, "id");

  // getAll porque el formulario manda un campo "url" por cada link. Los
  // vacíos se descartan acá y no en la pantalla: el usuario puede dejar
  // una fila abierta sin escribir nada y eso no es un link, es una fila
  // abierta.
  const urls = formData
    .getAll("url")
    .map((u) => String(u).trim())
    .filter(Boolean);

  // Usuario y clave se leen EN PAREJA, por posición: el formulario manda
  // los dos campos por cada fila y el navegador los entrega en el orden
  // del documento.
  //
  // Y se descartan de a pares, no cada uno por su lado. Filtrar los
  // usuarios vacíos antes de emparejar correría las claves un lugar y le
  // pegaría a cada cuenta la contraseña de la siguiente. Eso no rompe
  // nada visible: simplemente un día no entrás, y parece que te cambiaron
  // la contraseña.
  const usuarios = formData.getAll("usuario").map(String);
  const claves = formData.getAll("clave").map(String);
  const cuentas = usuarios
    .map((usuario, i) => ({
      usuario: usuario.trim(),
      // La clave NO se recorta: un espacio al final puede ser parte de
      // la contraseña.
      clave: claves[i] ?? "",
    }))
    .filter((c) => c.usuario !== "" || c.clave !== "");

  const fila = {
    user_id: user.id,
    nombre,
    urls,
    cuentas,
    notas: texto(formData, "notas"),
    updated_at: new Date().toISOString(),
  };

  const consulta = id
    ? supabase.from("paneles").update(fila).eq("id", id).select("id")
    : supabase.from("paneles").insert(fila).select("id");

  const { data, error: errorGuardado } = await consulta;

  if (errorGuardado) return fallo(errorGuardado.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  revalidatePath(RUTA);
  return { error: null, ok: true };
}

export async function eliminarPanel(
  _prev: PanelState,
  formData: FormData,
): Promise<PanelState> {
  const id = texto(formData, "id");
  if (!id) return { error: "Falta el panel.", ok: false };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false };

  const { data, error: errorBorrado } = await supabase
    .from("paneles")
    .delete()
    .eq("id", id)
    .select("id");

  if (errorBorrado) return fallo(errorBorrado.message);
  if (!data || data.length === 0) return { error: SIN_PERMISO, ok: false };

  revalidatePath(RUTA);
  return { error: null, ok: true };
}
