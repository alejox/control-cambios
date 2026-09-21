"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  cuentasGuardadas,
  limpiarSecretos,
  sincronizarCuentas,
  type CuentaEntrante,
} from "@/lib/paneles-secretos";
import type { PanelState } from "./estado";

const RUTA = "/dashboard/paneles";

const SIN_PERMISO = "No se pudo guardar: tu cuenta no tiene permiso.";

const RESPALDO_FALLIDO =
  "Guardado. Pero no pudimos respaldar alguna clave en el gestor: quedó en la base. Probá de nuevo más tarde.";

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
  return { error: permiso ? SIN_PERMISO : mensaje, ok: false, aviso: null };
}

/**
 * Crea o actualiza un panel. Uno solo para los dos casos porque el
 * formulario es el mismo: lo único que cambia es si viaja el id.
 *
 * La clave NO se recorta como los demás campos: un espacio al final puede
 * ser parte de la contraseña, y "te la guardé pero sin el último
 * carácter" es el peor error posible acá.
 *
 * Desde la migración a Bitwarden, guardar toca DOS sistemas: el secreto va
 * al gestor y la fila a Supabase. El orden es gestor primero, base después,
 * porque la fila necesita el secret_id que devuelve el gestor. Lo que ese
 * orden deja expuesto —- secretos creados para una fila que después la base
 * rechaza -— se limpia explícitamente más abajo.
 */
export async function guardarPanel(
  _prev: PanelState,
  formData: FormData,
): Promise<PanelState> {
  const nombre = texto(formData, "nombre");
  if (!nombre) {
    return { error: "Ponele un nombre para reconocerlo.", ok: false, aviso: null };
  }

  const { supabase, user, error } = await conAcceso();
  if (!supabase) return { error, ok: false, aviso: null };

  const id = texto(formData, "id");

  // getAll porque el formulario manda un campo "url" por cada link. Los
  // vacíos se descartan acá y no en la pantalla: el usuario puede dejar
  // una fila abierta sin escribir nada y eso no es un link, es una fila
  // abierta.
  const urls = formData
    .getAll("url")
    .map((u) => String(u).trim())
    .filter(Boolean);

  // Usuario, clave y secret_id se leen EN TERNA, por posición: el
  // formulario manda los tres campos por cada fila y el navegador los
  // entrega en el orden del documento.
  //
  // Y se descartan de a ternas, no cada uno por su lado. Filtrar los
  // usuarios vacíos antes de emparejar correría las claves un lugar y le
  // pegaría a cada cuenta la contraseña de la siguiente. Eso no rompe
  // nada visible: simplemente un día no entrás, y parece que te cambiaron
  // la contraseña.
  const usuarios = formData.getAll("usuario").map(String);
  const claves = formData.getAll("clave").map(String);
  const secretIds = formData.getAll("secret_id").map(String);
  const legibles = formData.getAll("clave_legible").map(String);
  const cuentas: CuentaEntrante[] = usuarios
    .map((usuario, i) => ({
      usuario: usuario.trim(),
      // La clave NO se recorta: un espacio al final puede ser parte de
      // la contraseña.
      clave: claves[i] ?? "",
      secret_id: secretIds[i] || undefined,
      // Si la pantalla pudo mostrar la clave. Una clave vacía significa
      // cosas opuestas según esto: "la borré" si se veía, "no me la
      // mostraste" si el gestor estaba caído.
      claveLegible: legibles[i] === "1",
    }))
    // Una fila sin usuario y sin clave se descarta... salvo que su clave
    // sea la que no se pudo mostrar. Sin esta salvedad, un panel con una
    // sola cuenta sin usuario perdería su secreto por guardarlo durante un
    // corte del gestor.
    .filter(
      (c) =>
        c.usuario !== "" ||
        c.clave !== "" ||
        (c.secret_id !== undefined && !c.claveLegible),
    );

  // Las referencias que HOY tiene la fila, leídas de la base y no del
  // formulario. Son la lista blanca: el secret_id que vuelve del navegador
  // solo se reutiliza si está acá. Sin esta lectura, el cliente podría
  // mandar el secret_id de otro usuario y hacer que el servidor —- que
  // tiene una sola cuenta de máquina para toda la organización -— le pise
  // la clave.
  //
  // La consulta va con la sesión del usuario, así que RLS ya filtra: si el
  // panel no es suyo, no vuelve nada y no hay nada que reutilizar.
  let previos: string[] = [];
  if (id) {
    const { data: filaActual } = await supabase
      .from("paneles")
      .select("cuentas")
      .eq("id", id)
      .maybeSingle();
    previos = cuentasGuardadas(filaActual?.cuentas)
      .map((c) => c.secret_id)
      .filter((v): v is string => Boolean(v));
  }

  // El id se genera acá y no en la base para un panel nuevo: el secreto se
  // crea ANTES del insert y su nota lleva a qué panel pertenece. Dejar que
  // lo ponga el default obligaría a insertar primero y actualizar después,
  // o a guardar secretos que no saben de quién son.
  const panelId = id || crypto.randomUUID();

  const respaldo = await sincronizarCuentas({
    panelId,
    nombrePanel: nombre,
    cuentas,
    permitidos: previos,
    previos,
  });

  const fila = {
    id: panelId,
    user_id: user.id,
    nombre,
    urls,
    cuentas: respaldo.cuentas,
    notas: texto(formData, "notas"),
    updated_at: new Date().toISOString(),
  };

  const consulta = id
    ? supabase.from("paneles").update(fila).eq("id", id).select("id")
    : supabase.from("paneles").insert(fila).select("id");

  const { data, error: errorGuardado } = await consulta;

  // La fila no entró: los secretos que se crearon para ella no tienen a
  // quién pertenecer. Se borran ahora, mientras todavía sabemos cuáles
  // son; después de esta función nadie más tiene la lista.
  //
  // Los que se ACTUALIZARON no se revierten: el valor nuevo es el que el
  // usuario quiso guardar, y volver al viejo sería restaurar una clave que
  // él mismo acaba de cambiar.
  if (errorGuardado || !data || data.length === 0) {
    await limpiarSecretos(respaldo.creados, "la fila no se pudo guardar");
    if (errorGuardado) return fallo(errorGuardado.message);
    return { error: SIN_PERMISO, ok: false, aviso: null };
  }

  await limpiarSecretos(respaldo.huerfanos, "la cuenta ya no está en el panel");

  revalidatePath(RUTA);
  return {
    error: null,
    ok: true,
    aviso: respaldo.falloElRespaldo ? RESPALDO_FALLIDO : null,
  };
}

export async function eliminarPanel(
  _prev: PanelState,
  formData: FormData,
): Promise<PanelState> {
  const id = texto(formData, "id");
  if (!id) return { error: "Falta el panel.", ok: false, aviso: null };

  const { supabase, error } = await conAcceso();
  if (!supabase) return { error, ok: false, aviso: null };

  // Las referencias se leen ANTES de borrar la fila: después del delete no
  // queda de dónde sacarlas y los secretos quedarían en Bitwarden para
  // siempre, sin nada que diga a qué panel pertenecían.
  //
  // Se leen con la sesión del usuario, así que si el panel no es suyo esta
  // consulta vuelve vacía y no hay nada que borrar —- y el delete de abajo
  // tampoco va a afectar ninguna fila.
  const { data: filaActual } = await supabase
    .from("paneles")
    .select("cuentas")
    .eq("id", id)
    .maybeSingle();

  const { data, error: errorBorrado } = await supabase
    .from("paneles")
    .delete()
    .eq("id", id)
    .select("id");

  if (errorBorrado) return fallo(errorBorrado.message);
  if (!data || data.length === 0) {
    return { error: SIN_PERMISO, ok: false, aviso: null };
  }

  await limpiarSecretos(
    cuentasGuardadas(filaActual?.cuentas)
      .map((c) => c.secret_id)
      .filter((v): v is string => Boolean(v)),
    "se borró el panel",
  );

  revalidatePath(RUTA);
  return { error: null, ok: true, aviso: null };
}
