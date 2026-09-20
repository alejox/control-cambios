import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatFecha, formatMonto } from "@/lib/items";
import { cobraCadaLado, favorDe, type Liquidacion } from "@/lib/liquidaciones";

export default async function LiquidacionesPage() {
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
  if (role !== "admin" && role !== "colaborador") redirect("/dashboard");

  const { data } = await supabase
    .from("liquidaciones")
    .select("*")
    .order("numero", { ascending: false });

  const liquidaciones = (data ?? []) as Liquidacion[];

  return (
    <div className="mx-auto w-full px-4 py-8 sm:w-[90%] sm:px-6 sm:py-10">
      <div className="mb-8">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Cuentas cerradas
        </p>
        <h1
          className="text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Liquidaciones
        </h1>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {liquidaciones.length === 0 ? (
          <div className="p-10 text-center text-[14.5px] text-ink-soft">
            Todavía no liquidaste ningún corte. Cuando cierres cuentas con
            desde el panel, la liquidación aparece acá.
          </div>
        ) : (
          <>
          {/* La tabla necesita cerca de 1000 px reales. En `md` ya existe
              un sidebar de 240 px, por eso el corte se hace en `xl` y no
              siguiendo solamente el ancho del viewport. */}
          <div className="hidden xl:block">
          <table className="w-full text-left text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-alt/60 text-[11px] uppercase tracking-wide text-ink-soft">
                <th className="px-5 py-3 font-medium">#</th>
                <th className="px-5 py-3 font-medium">Fecha</th>
                <th className="px-5 py-3 font-medium">Movimientos</th>
                <th className="px-5 py-3 font-medium">Cobra lado Bs</th>
                <th className="px-5 py-3 font-medium">Cobra lado COP</th>
                <th className="px-5 py-3 font-medium">Neto</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {liquidaciones.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 font-mono text-ink-soft">{l.numero}</td>
                  <td className="px-5 py-3 text-ink-soft">{formatFecha(l.fecha)}</td>
                  <td className="px-5 py-3 text-ink-soft">{l.cantidad_items}</td>
                  <td className="px-5 py-3 text-teal">
                    {formatMonto(cobraCadaLado(l).bs, "USDT")}
                  </td>
                  <td className="px-5 py-3 text-teal">
                    {formatMonto(cobraCadaLado(l).cop, "USDT")}
                  </td>
                  <td className="px-5 py-3">
                    <span className="font-medium text-ink">
                      {formatMonto(favorDe(l.total_neto).monto, "USDT")}
                    </span>
                    <span className="ml-2 font-mono text-[10.5px] uppercase tracking-wide text-ink-soft">
                      {favorDe(l.total_neto).lado === "bs"
                        ? "a favor Bs"
                        : favorDe(l.total_neto).lado === "cop"
                          ? "a favor COP"
                          : "parejo"}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <Link
                      href={`/dashboard/liquidaciones/${l.id}`}
                      className="text-[13px] text-accent hover:underline"
                    >
                      Ver detalle
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          <div className="divide-y divide-border xl:hidden">
            {liquidaciones.map((l) => {
              const cobra = cobraCadaLado(l);
              const favor = favorDe(l.total_neto);

              return (
                <article key={l.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                        Liquidación #{l.numero}
                      </p>
                      <p className="mt-1 text-[14px] text-ink">
                        {formatFecha(l.fecha)} · {l.cantidad_items} movimiento
                        {l.cantidad_items === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-ink">
                        {formatMonto(favor.monto, "USDT")}
                      </p>
                      <p className="font-mono text-[10.5px] uppercase tracking-wide text-ink-soft">
                        {favor.lado === "bs"
                          ? "a favor Bs"
                          : favor.lado === "cop"
                            ? "a favor COP"
                            : "parejo"}
                      </p>
                    </div>
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-surface-alt/60 p-3 text-[13px]">
                    <div>
                      <dt className="text-[11px] text-ink-soft">Cobra lado Bs</dt>
                      <dd className="mt-0.5 font-medium text-teal">
                        {formatMonto(cobra.bs, "USDT")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] text-ink-soft">Cobra lado COP</dt>
                      <dd className="mt-0.5 font-medium text-teal">
                        {formatMonto(cobra.cop, "USDT")}
                      </dd>
                    </div>
                  </dl>

                  <Link
                    href={`/dashboard/liquidaciones/${l.id}`}
                    className="mt-4 inline-flex min-h-9 items-center rounded-lg border border-border px-3 text-[13px] font-medium text-accent transition hover:bg-surface-alt"
                  >
                    Ver detalle
                  </Link>
                </article>
              );
            })}
          </div>
          </>
        )}
      </div>
    </div>
  );
}
