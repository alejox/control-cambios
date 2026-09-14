import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerMonedaPreferida } from "@/lib/preferencias";
import Sidebar from "./sidebar";
import SelectorMoneda from "./selector-moneda";
import SignOutButton from "./sign-out-button";
import Campana from "./campana";

/**
 * Shell de todo /dashboard: barra lateral de navegacion y topbar.
 *
 * Este layout NO reemplaza los chequeos de cada pagina. Un layout en el
 * App Router no protege a sus hijos —- se renderizan igual —- asi que cada
 * pagina sigue validando sesion y rol por su cuenta.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = perfil?.role ?? "sin_acceso";
  const esAdmin = role === "admin";
  const puedeVer = esAdmin || role === "colaborador";
  const monedaPreferida = await leerMonedaPreferida();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="flex w-16 flex-none flex-col gap-6 bg-ink px-2.5 py-5 md:w-60 md:px-4">
        <Link href="/dashboard" className="flex items-center justify-center gap-2.5 md:justify-start">
          <span className="h-2.5 w-2.5 flex-none rounded-full bg-[#D99A46]" />
          <span className="hidden font-mono text-[12px] uppercase tracking-widest text-[#D99A46] md:inline">
            Control de Cambios
          </span>
        </Link>

        {puedeVer && <Sidebar esAdmin={esAdmin} />}

        <div className="mt-auto flex flex-col gap-2 border-t border-[#3A4237] pt-4">
          <span className="hidden truncate text-[12.5px] text-[#A9AE9F] md:block" title={user.email}>
            {user.email}
          </span>
          <span className="hidden font-mono text-[10.5px] uppercase tracking-widest text-[#7C8375] md:block">
            {role.replace("_", " ")}
          </span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-end gap-4 border-b border-border bg-surface px-6 py-3.5">
          {esAdmin && <SelectorMoneda valor={monedaPreferida} />}
          {puedeVer && <Campana />}
          <SignOutButton />
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
