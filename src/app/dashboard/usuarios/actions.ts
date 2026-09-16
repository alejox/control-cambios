"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type RolState = { error: string | null; ok: boolean };

const ROLES = ["sin_acceso", "colaborador", "admin"] as const;
export type Rol = (typeof ROLES)[number];

/**
 * Cambia el rol de un usuario.
 *
 * La autorizacion real la aplica la politica "admin actualiza roles" de
 * profiles; el chequeo de acá es para dar un mensaje claro en vez de un
 * update que afecta cero filas.
 */
export async function cambiarRol(
  _prevState: RolState,
  formData: FormData,
): Promise<RolState> {
  const userId = (formData.get("user_id") as string) ?? "";
  const rol = (formData.get("rol") as string) ?? "";

  if (!userId) return { error: "Falta el usuario.", ok: false };
  if (!ROLES.includes(rol as Rol)) {
    return { error: "Ese rol no existe.", ok: false };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión venció.", ok: false };

  if (user.id === userId && rol !== "admin") {
    // Sin esto, el unico admin puede quitarse el rol y dejar el sistema
    // sin nadie que pueda devolverselo.
    return { error: "No podés quitarte a vos mismo el rol de admin.", ok: false };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update({ role: rol })
    .eq("id", userId)
    .select("id");

  if (error) return { error: error.message, ok: false };

  // Un update que no afecta filas es como se ve un permiso denegado bajo
  // RLS desde PostgREST: no vuelve error.
  if (!data || data.length === 0) {
    return { error: "No se pudo guardar: tu cuenta no tiene permiso.", ok: false };
  }

  revalidatePath("/dashboard/usuarios");
  return { error: null, ok: true };
}

export type BajaState = { error: string | null; ok: boolean };

/**
 * Elimina una cuenta por completo (auth + perfil).
 *
 * Solo se permite si el usuario NO dejo rastro: en cuanto cargo un
 * movimiento, aprobo un deposito o cerro una liquidacion, borrarlo seria
 * romper la trazabilidad de esos registros. Para esos casos esta "Sin
 * acceso", que le saca la entrada sin tocar el historial.
 */
export async function eliminarUsuario(
  _prevState: BajaState,
  formData: FormData,
): Promise<BajaState> {
  const userId = (formData.get("user_id") as string) ?? "";
  if (!userId) return { error: "Falta el usuario.", ok: false };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión venció.", ok: false };

  const { data: yo } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (yo?.role !== "admin") {
    return { error: "Solo un administrador puede eliminar cuentas.", ok: false };
  }
  if (user.id === userId) {
    return { error: "No podés eliminar tu propia cuenta.", ok: false };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.",
      ok: false,
    };
  }

  const admin = createAdminClient();

  // Las cinco tablas que apuntan a profiles lo hacen sin ON DELETE, asi que
  // la base rechazaria el borrado igual. Se chequea antes para dar un
  // mensaje que se entienda en vez de un error de clave foránea.
  const RASTROS = [
    { tabla: "items", columna: "created_by", etiqueta: "movimientos cargados" },
    { tabla: "items", columna: "revisado_por", etiqueta: "movimientos revisados" },
    { tabla: "depositos", columna: "aprobado_por", etiqueta: "comprobantes aprobados" },
    { tabla: "liquidaciones", columna: "created_by", etiqueta: "liquidaciones" },
    { tabla: "configuracion", columna: "updated_by", etiqueta: "cambios de comisión" },
  ] as const;

  const encontrados: string[] = [];
  for (const { tabla, columna, etiqueta } of RASTROS) {
    const { count } = await admin
      .from(tabla)
      .select("id", { count: "exact", head: true })
      .eq(columna, userId);

    if ((count ?? 0) > 0) encontrados.push(`${count} ${etiqueta}`);
  }

  if (encontrados.length > 0) {
    return {
      error: `No se puede eliminar: tiene ${encontrados.join(", ")}. Borrarlo dejaría esos registros sin autor. Ponelo en “Sin acceso”.`,
      ok: false,
    };
  }

  // El perfil y la preferencia se van solos: profiles cascadea desde
  // auth.users, y preferencias_usuario cascadea desde profiles.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message, ok: false };

  revalidatePath("/dashboard/usuarios");
  return { error: null, ok: true };
}

export type InvitacionState = { error: string | null; link: string | null };

/**
 * Da de alta a alguien nuevo devolviendo un link de acceso.
 *
 * No se manda ningun correo: el proyecto no tiene SMTP propio y el interno de
 * Supabase no responde, asi que el admin copia el link y se lo hace llegar al
 * invitado por fuera. El invitado entra con rol "sin_acceso" (el default de
 * profiles) hasta que alguien se lo cambie desde esta misma pantalla.
 */
export async function invitarUsuario(
  _prevState: InvitacionState,
  formData: FormData,
): Promise<InvitacionState> {
  const email = ((formData.get("email") as string) ?? "").trim();

  if (!email) return { error: "Falta el correo.", link: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Ese correo no tiene forma de correo.", link: null };
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión venció.", link: null };

  const { data: yo } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (yo?.role !== "admin") {
    return { error: "Solo un administrador puede invitar usuarios.", link: null };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.",
      link: null,
    };
  }

  const admin = createAdminClient();

  // Los correos se guardan como los escribio cada uno, asi que la comparacion
  // va sin distinguir mayusculas: si no, se invita dos veces a la misma persona.
  const { data: existentes } = await admin
    .from("profiles")
    .select("id")
    .ilike("email", email)
    .limit(1);

  if (existentes && existentes.length > 0) {
    return {
      error: "Ese correo ya tiene cuenta. Buscalo en la lista y asignale un rol.",
      link: null,
    };
  }

  // headers() es async desde Next 15; el origen sale de la request para que el
  // link sirva igual en local que en produccion, sin una variable de entorno mas.
  const h = await headers();
  const host = h.get("host");
  if (!host) {
    return { error: "No se pudo armar el link: falta el host de la request.", link: null };
  }
  const proto = h.get("x-forwarded-proto") ?? "http";
  const redirectTo = `${proto}://${host}/auth/callback?next=/update-password`;

  const invitacion = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo },
  });

  let link = invitacion.error ? null : invitacion.data.properties.action_link;

  if (!link) {
    // El alta publica esta apagada en Supabase y el tipo "invite" cuelga de esa
    // misma configuracion, asi que puede volver rechazado. Cuando pasa, la cuenta
    // se crea a mano con la service_role (que no pasa por esa restriccion) y el
    // link se pide como "recovery": termina en la misma pantalla de contraseña.
    const { error: altaError } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (altaError) return { error: altaError.message, link: null };

    const recuperacion = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (recuperacion.error) return { error: recuperacion.error.message, link: null };

    link = recuperacion.data.properties.action_link;
  }

  revalidatePath("/dashboard/usuarios");
  return { error: null, link };
}

export type AccesoState = { error: string | null; link: string | null };

/**
 * Genera un link de acceso para una cuenta que YA existe.
 *
 * Es el caso que "Invitar" rechaza a proposito: alguien que perdio la
 * contraseña o que nunca llego a definirla. Sin SMTP, /forgot-password no
 * puede mandar nada, asi que el admin genera el link y se lo hace llegar.
 */
export async function regenerarAcceso(
  _prevState: AccesoState,
  formData: FormData,
): Promise<AccesoState> {
  const userId = (formData.get("user_id") as string) ?? "";
  if (!userId) return { error: "Falta el usuario.", link: null };

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Tu sesión venció.", link: null };

  const { data: yo } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (yo?.role !== "admin") {
    return { error: "Solo un administrador puede generar links de acceso.", link: null };
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor.",
      link: null,
    };
  }

  const admin = createAdminClient();

  // El correo se busca por id y no se toma del formulario: un correo que viene
  // del cliente se puede cambiar, y eso seria generarle un link de acceso a una
  // cuenta cualquiera.
  const { data: perfil, error: perfilError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .single();

  if (perfilError || !perfil) {
    return { error: "No se encontró esa cuenta.", link: null };
  }

  const email = (perfil.email as string | null) ?? "";
  if (!email) {
    return {
      error: "Esa cuenta no tiene correo cargado, así que no hay a quién generarle el link.",
      link: null,
    };
  }

  // headers() es async desde Next 15; el origen sale de la request para que el
  // link sirva igual en local que en produccion, sin una variable de entorno mas.
  const h = await headers();
  const host = h.get("host");
  if (!host) {
    return { error: "No se pudo armar el link: falta el host de la request.", link: null };
  }
  const proto = h.get("x-forwarded-proto") ?? "http";
  const redirectTo = `${proto}://${host}/auth/callback?next=/update-password`;

  // Va como "recovery" y no como "invite" porque la cuenta ya existe: "invite"
  // es para dar de alta y falla contra un correo que ya esta registrado.
  // "recovery" termina en la misma pantalla de contraseña, que es lo unico que
  // se necesita acá.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error) return { error: error.message, link: null };

  revalidatePath("/dashboard/usuarios");
  return { error: null, link: data.properties.action_link };
}
