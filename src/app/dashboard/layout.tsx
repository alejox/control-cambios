import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerMonedaPreferida, leerSidebarColapsado } from "@/lib/preferencias";
import BarraLateral from "./barra-lateral";
import { MenuInferior } from "./sidebar";
import SelectorMoneda from "./selector-moneda";
import SignOutButton from "./sign-out-button";
import Campana from "./campana";
import EscuchaMovimientos from "./escucha-movimientos";
import ConectarTelegram from "./conectar-telegram";

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
  const sidebarColapsado = await leerSidebarColapsado();

  // Cada uno solo ve su propio vínculo (política "cada uno ve su vinculo de
  // telegram"). maybeSingle y no single: no tener chat conectado es el
  // estado normal, no un error.
  const { data: vinculoTelegram } = await supabase
    .from("telegram_vinculos")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-screen bg-background">
      <BarraLateral
        colapsadoInicial={sidebarColapsado}
        esAdmin={esAdmin}
        puedeVer={puedeVer}
        email={user.email}
        role={role}
      />

      {/* No pinta nada: escucha los movimientos y refresca lo que ya
          esta en pantalla, campanita incluida. */}
      {puedeVer && <EscuchaMovimientos />}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* z-30 y no 40: por debajo del menu de abajo, que en un telefono es
            lo unico que no puede quedar tapado. */}
        <header className="sticky top-0 z-30 flex items-center justify-end gap-4 border-b border-border bg-surface px-6 py-3.5">
          {esAdmin && <SelectorMoneda valor={monedaPreferida} />}
          {puedeVer && <ConectarTelegram vinculado={Boolean(vinculoTelegram)} />}
          {puedeVer && <Campana />}
          <SignOutButton />
        </header>

        <main className="min-w-0 flex-1 pb-24 md:pb-0">{children}</main>
      </div>

      {puedeVer && <MenuInferior esAdmin={esAdmin} />}
    </div>
  );
}
