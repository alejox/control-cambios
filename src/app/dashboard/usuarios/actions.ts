"use server";

import { revalidatePath } from "next/cache";
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
