import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import UpdatePasswordForm from "./update-password-form";

export default async function UpdatePasswordPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Se llega acá con la sesión que creó el enlace de recuperación al
  // pasar por /auth/callback. Sin sesión no hay nada que actualizar.
  if (!user) {
    redirect("/login");
  }

  return <UpdatePasswordForm />;
}
