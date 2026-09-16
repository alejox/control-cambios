import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ComisionesPorMoneda from "./comisiones-por-moneda";
import ItemsTable, { type DepositoFila } from "./items-table";
import LiquidarButton from "./liquidar-button";
import RecalcularComisiones from "./recalcular-comisiones";
import { COMISION_PCT_FALLBACK, leerComisiones } from "@/lib/configuracion";
import { formatMonto, resumirRecalculo, type Item } from "@/lib/items";
import { previaDeCorte } from "@/lib/liquidaciones";

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
  const suma = (flujo: string, campo: "usdt_total" | "comision") =>
    items
      .filter((i) => i.tipo_flujo === flujo)
      .reduce((acc, i) => acc + Number(i[campo]), 0);
  const comisionBs = suma("bs_a_usdt", "comision");
  const comisionCop = suma("cop_a_usdt", "comision");
  const sinAprobar = items.filter((i) => i.revisado_at === null).length;

  // Lo pendiente leido como se lee un corte cerrado. La cuenta no se rehace
  // aca: sale de previaDeCorte, el mismo lugar del que la saca el dialogo de
  // liquidar. Si el panel y el corte contaran distinto, la plata que se debe
  // dependeria de en que pantalla se la mire.
  const previa = previaDeCorte({
    usdt_bs: totalUsdtBs,
    usdt_cop: totalUsdtCop,
    comision_bs: comisionBs,
    comision_cop: comisionCop,
  });

  // Sin permiso para ver no se consulta la configuracion: RLS la taparia
  // igual. El fallback es solo para no arrastrar un null hasta el render
  // de una rama que, de todas formas, no muestra el panel.
  const comisiones = puedeVer
    ? await leerComisiones()
    : { bs: COMISION_PCT_FALLBACK, cop: COMISION_PCT_FALLBACK };

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
          {/* Las mismas CUATRO deudas que muestra un corte cerrado, pero
              sobre lo que todavia esta pendiente. Una comision global
              sumada no dice de quien es: la comision no se evapora,
              cambia de manos, y escondida adentro de un neto no hay forma
              de verificar a quien le toca. */}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-[0.8fr_1fr_1fr_1.2fr]">
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
              <p className="mb-1.5 font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                Movimientos pendientes
              </p>
              <p className="text-2xl font-medium text-ink" style={{ fontFamily: "var(--font-display)" }}>
                {totalItems}
              </p>
              <p className="mt-1 text-[12.5px] text-ink-soft">
                {totalItems === 0
                  ? "Nada que liquidar"
                  : sinAprobar > 0
                    ? `${sinAprobar} sin aprobar`
                    : "Todos aprobados"}
              </p>
            </div>
            <div className="rounded-2xl border border-accent-soft bg-accent-soft/30 p-6">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-[#8f5e1f]">
                Cobra quien recibió en Bs
              </p>
              <div className="flex flex-col gap-1.5 text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-soft">Ventas en Bs</span>
                  <span className="text-ink">{formatMonto(totalUsdtBs, "USDT")}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-soft">Comisiones en COP</span>
                  <span className="text-teal">+ {formatMonto(comisionCop, "USDT")}</span>
                </div>
              </div>
              <p
                className="mt-3 border-t border-accent-soft pt-3 text-2xl font-medium text-ink"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {formatMonto(previa.cobra.bs, "USDT")}
              </p>
            </div>
            <div className="rounded-2xl border border-teal-soft bg-teal-soft/30 p-6">
              <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-[#215d4d]">
                Cobra quien recibió en COP
              </p>
              <div className="flex flex-col gap-1.5 text-[13px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-soft">Ventas en COP</span>
                  <span className="text-ink">{formatMonto(totalUsdtCop, "USDT")}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-soft">Comisiones en Bs</span>
                  <span className="text-teal">+ {formatMonto(comisionBs, "USDT")}</span>
                </div>
              </div>
              <p
                className="mt-3 border-t border-teal-soft pt-3 text-2xl font-medium text-ink"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {formatMonto(previa.cobra.cop, "USDT")}
              </p>
            </div>

            {/* El neto va con la misma cara que en el corte, pero avisando
                que todavia no es nadie: estos movimientos se pueden
                aprobar, ajustar o desaprobar antes de liquidar. */}
            <div className="flex flex-col justify-between rounded-2xl bg-ink p-6 text-[#F3F1EA]">
              <p className="font-mono text-[11px] uppercase tracking-widest text-[#D99A46]">
                Neto provisorio
              </p>

              <div className="mt-3">
                <p className="font-mono text-[12.5px] text-[#A9AE9F]">
                  {previa.favor.lado === "cop"
                    ? `${formatMonto(previa.cobra.cop, "USDT")} − ${formatMonto(previa.cobra.bs, "USDT")}`
                    : `${formatMonto(previa.cobra.bs, "USDT")} − ${formatMonto(previa.cobra.cop, "USDT")}`}
                </p>
                <p
                  className="text-[32px] leading-tight font-medium"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {formatMonto(previa.favor.monto, "USDT")}
                </p>
              </div>

              <p className="mt-3 flex items-center gap-2 text-[12.5px] text-[#A9AE9F]">
                {totalItems > 0 && previa.favor.lado !== "ninguno" && (
                  <span
                    className={`h-2 w-2 flex-none rounded-full ${
                      previa.favor.lado === "bs" ? "bg-[#D99A46]" : "bg-[#7FCBAE]"
                    }`}
                    aria-hidden
                  />
                )}
                {totalItems === 0 ? "No hay nada pendiente" : previa.favor.frase}
              </p>

              <p className="mt-2 text-[11.5px] leading-relaxed text-[#A9AE9F]">
                Provisorio: se congela recién al liquidar.
              </p>
            </div>
          </div>

          {/* El boton de recalcular vive pegado a los dos campos y no en
              la barra de acciones de la tabla: se necesita justo despues
              de cambiar un porcentaje, no antes de liquidar. */}
          <div className="flex flex-col gap-2.5">
            <ComisionesPorMoneda valores={comisiones} esAdmin={esAdmin} />
            {esAdmin && (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <RecalcularComisiones resumen={resumirRecalculo(items, comisiones)} />
              </div>
            )}
          </div>

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
