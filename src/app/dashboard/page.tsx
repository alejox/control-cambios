import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ComisionGlobal from "./comision-global";
import ItemsTable, { type DepositoFila } from "./items-table";
import LiquidarButton from "./liquidar-button";
import { leerComisionGlobal } from "@/lib/configuracion";
import { formatMonto, type Item } from "@/lib/items";

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
    // Solo lo pendiente: al liquidar, los movimientos pasan a su corte y
    // la tabla vuelve a cero. Lo ya liquidado vive en /dashboard/liquidaciones.
    const { data } = await supabase
      .from("items")
      .select("*")
      .is("liquidacion_id", null)
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
  const suma = (flujo: string, campo: "usdt_total" | "comision") =>
    items
      .filter((i) => i.tipo_flujo === flujo)
      .reduce((acc, i) => acc + Number(i[campo]), 0);
  const comisionBs = suma("bs_a_usdt", "comision");
  const comisionCop = suma("cop_a_usdt", "comision");
  const sinAprobar = items.filter((i) => i.revisado_at === null).length;

  const comisionGlobalPct = puedeVer ? await leerComisionGlobal() : 0;

  // Los depositos de los movimientos en pantalla, en UNA consulta -- no
  // una por fila. ItemsTable los agrupa y saca de ahi el total recibido y
  // los comprobantes.
  let depositos: DepositoFila[] = [];
  if (items.length > 0) {
    const { data } = await supabase
      .from("depositos")
      .select("id, item_id, referencia, fecha, valor_origen, comprobante_path, comprobante_texto, usdt, aprobado_at")
      .in("item_id", items.map((i) => i.id))
      .order("fecha", { ascending: true });
    depositos = (data ?? []) as DepositoFila[];
  }

  return (
    <div className="mx-auto w-[90%] px-6 py-10">
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
                Movimientos pendientes
              </p>
              <p className="text-2xl font-medium text-ink" style={{ fontFamily: "var(--font-display)" }}>
                {totalItems}
              </p>
              <p className="mt-1 text-[12.5px] text-ink-soft">
                Comisiones: {formatMonto(totalComision, "USDT")}
              </p>
            </div>
            <div className="rounded-2xl border border-accent-soft bg-accent-soft/30 p-6">
              <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-[#8f5e1f]">
                Total ventas (Bs → USDT)
              </p>
              <p className="text-2xl font-medium text-ink" style={{ fontFamily: "var(--font-display)" }}>
                {formatMonto(totalUsdtBs, "USDT")}
              </p>
            </div>
            <div className="rounded-2xl border border-teal-soft bg-teal-soft/30 p-6">
              <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-[#215d4d]">
                Total ventas (COP → USDT)
              </p>
              <p className="text-2xl font-medium text-ink" style={{ fontFamily: "var(--font-display)" }}>
                {formatMonto(totalUsdtCop, "USDT")}
              </p>
            </div>
          </div>

          <ComisionGlobal valor={comisionGlobalPct} esAdmin={esAdmin} />

          <div className="flex items-center justify-between">
            <h1
              className="text-xl font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Pendiente de liquidar
            </h1>
            <div className="flex items-center gap-3">
              {/* Liquidar es solo del admin. Registrar no: el colaborador
                  puede cargar movimientos COP -> USDT. */}
              {esAdmin && (
                <LiquidarButton
                  cantidad={totalItems}
                  sinAprobar={sinAprobar}
                  usdtBs={totalUsdtBs}
                  usdtCop={totalUsdtCop}
                  comisionBs={comisionBs}
                  comisionCop={comisionCop}
                />
              )}
              {puedeVer && (
                <Link
                  href="/dashboard/items/new"
                  className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium leading-10 text-[#F3F1EA] transition hover:bg-[#2a3127]"
                >
                  + Nuevo movimiento
                </Link>
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <ItemsTable
              items={items}
              depositos={depositos}
              esAdmin={esAdmin}
              vacio={
                <>
                  No hay movimientos pendientes. Todo está liquidado.
                  {puedeVer && " Usá “+ Nuevo movimiento” para registrar el próximo."}
                </>
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
