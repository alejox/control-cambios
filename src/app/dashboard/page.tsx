import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";
import DeleteButton from "./items/delete-button";
import { formatFecha, formatMonto, type Item } from "@/lib/items";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Si la consulta falla (por ejemplo, por una política de RLS mal
  // configurada) no lo confundimos con "sin_acceso": lo mostramos
  // aparte para que el error real sea visible en vez de quedar oculto.
  const role = profileError ? null : (profile?.role ?? "sin_acceso");
  const puedeVer = role === "admin" || role === "colaborador";
  const esAdmin = role === "admin";

  let items: Item[] = [];
  if (puedeVer) {
    const { data } = await supabase
      .from("items")
      .select("*")
      .order("numero", { ascending: false });
    items = data ?? [];
  }

  const totalItems = items.length;
  const totalUsdtBs = items
    .filter((i) => i.tipo_flujo === "bs_a_usdt")
    .reduce((acc, i) => acc + Number(i.usdt_total), 0);
  const totalUsdtCop = items
    .filter((i) => i.tipo_flujo === "cop_a_usdt")
    .reduce((acc, i) => acc + Number(i.usdt_total), 0);
  const totalComision = items.reduce((acc, i) => acc + Number(i.comision), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-10 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-mono text-xs uppercase tracking-widest text-accent">
            Control de Cambios
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[13.5px] text-ink-soft">{user.email}</span>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-[#8f5e1f]">
            {role ? role.replace("_", " ") : "error"}
          </span>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-14">
        {profileError ? (
          <div className="rounded-2xl border border-critical-soft bg-critical-soft/40 p-7">
            <h1
              className="mb-2.5 text-xl font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              No pudimos leer tu perfil
            </h1>
            <p className="mb-3 text-[14.5px] leading-relaxed text-ink-soft">
              La consulta a <code>profiles</code> falló — esto normalmente es
              una política de Row Level Security mal configurada, no un
              problema de tu rol.
            </p>
            <p className="font-mono text-[12.5px] text-critical">
              {profileError.message}
            </p>
          </div>
        ) : role === "sin_acceso" ? (
          <div className="rounded-2xl border border-accent-soft bg-accent-soft/40 p-7">
            <h1
              className="mb-2.5 text-xl font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Tu cuenta está pendiente de aprobación
            </h1>
            <p className="text-[14.5px] leading-relaxed text-ink-soft">
              Ya te registraste correctamente, pero todavía no tienes acceso a
              los datos. Un administrador debe asignarte un rol
              (colaborador o admin) para que puedas ver los items y montos.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-3 gap-5">
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                  Items registrados
                </p>
                <p className="text-2xl font-medium text-ink" style={{ fontFamily: "var(--font-display)" }}>
                  {totalItems}
                </p>
              </div>
              <div className="rounded-2xl border border-accent-soft bg-accent-soft/30 p-6">
                <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-[#8f5e1f]">
                  USDT vendido (Bs → USDT)
                </p>
                <p className="text-2xl font-medium text-ink" style={{ fontFamily: "var(--font-display)" }}>
                  {formatMonto(totalUsdtBs, "USDT")}
                </p>
                <p className="mt-1 text-[12.5px] text-ink-soft">
                  Comisión acumulada: {formatMonto(totalComision, "USDT")}
                </p>
              </div>
              <div className="rounded-2xl border border-teal-soft bg-teal-soft/30 p-6">
                <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-[#215d4d]">
                  Saldo a favor de Carlos (COP → USDT)
                </p>
                <p className="text-2xl font-medium text-ink" style={{ fontFamily: "var(--font-display)" }}>
                  {formatMonto(totalUsdtCop, "USDT")}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h1
                className="text-xl font-medium text-ink"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Items
              </h1>
              {esAdmin && (
                <Link
                  href="/dashboard/items/new"
                  className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium leading-10 text-[#F3F1EA] transition hover:bg-[#2a3127]"
                >
                  + Nuevo item
                </Link>
              )}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
              {items.length === 0 ? (
                <div className="p-10 text-center text-[14.5px] text-ink-soft">
                  Todavía no hay items registrados.
                  {esAdmin && " Usa “+ Nuevo item” para crear el primero."}
                </div>
              ) : (
                <table className="w-full text-left text-[13.5px]">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt/60 text-[11px] uppercase tracking-wide text-ink-soft">
                      <th className="px-5 py-3 font-medium">#</th>
                      <th className="px-5 py-3 font-medium">Fecha</th>
                      <th className="px-5 py-3 font-medium">Flujo</th>
                      <th className="px-5 py-3 font-medium">Tasa</th>
                      <th className="px-5 py-3 font-medium">USDT</th>
                      <th className="px-5 py-3 font-medium">Comisión</th>
                      <th className="px-5 py-3 font-medium">Detalle</th>
                      {esAdmin && <th className="px-5 py-3 font-medium"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3 font-mono text-ink-soft">{item.numero}</td>
                        <td className="px-5 py-3 text-ink-soft">{formatFecha(item.fecha)}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                              item.tipo_flujo === "bs_a_usdt"
                                ? "bg-accent-soft text-[#8f5e1f]"
                                : "bg-teal-soft text-[#215d4d]"
                            }`}
                          >
                            {item.tipo_flujo === "bs_a_usdt" ? "Bs → USDT" : "COP → USDT"}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-ink-soft">
                          {item.tasa ? formatMonto(item.tasa, item.moneda_origen) : "—"}
                        </td>
                        <td className="px-5 py-3 font-medium text-ink">
                          {formatMonto(item.usdt_total, "USDT")}
                        </td>
                        <td className="px-5 py-3 text-ink-soft">
                          {formatMonto(item.comision, "USDT")}
                        </td>
                        <td className="max-w-[220px] truncate px-5 py-3 text-ink-soft">
                          {item.detalle ?? "—"}
                        </td>
                        {esAdmin && (
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <Link
                                href={`/dashboard/items/${item.id}/edit`}
                                className="text-[13px] text-accent hover:underline"
                              >
                                Editar
                              </Link>
                              <DeleteButton itemId={item.id} numero={item.numero} />
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
