import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatFecha, formatMonto, type Item } from "@/lib/items";
import { cobraCadaLado, favorDe, type Liquidacion } from "@/lib/liquidaciones";
import ItemsTable, { type DepositoFila } from "../../items-table";

export default async function LiquidacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const { data: liq } = await supabase
    .from("liquidaciones")
    .select("*")
    .eq("id", id)
    .single();

  if (!liq) notFound();
  const liquidacion = liq as Liquidacion;

  const { data: datosItems } = await supabase
    .from("items")
    .select("*")
    .eq("liquidacion_id", id)
    .order("numero", { ascending: true });

  const items = (datosItems ?? []) as Item[];

  // Cada flujo aporta sus ventas menos su comision; el neto es la resta.
  // Cada lado cobra sus ventas MAS la comision que le genera el otro.
  const cobra = cobraCadaLado(liquidacion);
  const favor = favorDe(liquidacion.total_neto);
  const sinAprobar = items.filter((i) => i.revisado_at === null).length;

  // Una sola consulta para todos los depositos del corte; ItemsTable los
  // agrupa y de ahi saca el total recibido y los comprobantes.
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
      <Link
        href="/dashboard/liquidaciones"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition hover:text-ink"
      >
        <span className="text-[15px] leading-none">←</span> Volver a liquidaciones
      </Link>

      <div className="mb-8">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Liquidación · {formatFecha(liquidacion.fecha)}
        </p>
        <h1
          className="text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Corte #{liquidacion.numero}
        </h1>
        {liquidacion.notas && (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            {liquidacion.notas}
          </p>
        )}
      </div>

      {/* Se muestran las CUATRO deudas, no dos numeros netos: la comision
          es plata que gana el otro, y ocultarla dentro de una resta hace
          imposible verificar a quien le toca. */}
      <div className="mb-8 grid gap-5 lg:grid-cols-[1fr_1fr_1.2fr]">
        <div className="rounded-2xl border border-accent-soft bg-accent-soft/30 p-6">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-[#8f5e1f]">
            Cobra quien recibió en Bs
          </p>
          <div className="flex flex-col gap-1.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-soft">Ventas en Bs</span>
              <span className="text-ink">{formatMonto(liquidacion.usdt_bs, "USDT")}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-soft">Comisiones en COP</span>
              <span className="text-teal">
                + {formatMonto(liquidacion.comision_cop, "USDT")}
              </span>
            </div>
          </div>
          <p
            className="mt-3 border-t border-accent-soft pt-3 text-2xl font-medium text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {formatMonto(cobra.bs, "USDT")}
          </p>
        </div>

        <div className="rounded-2xl border border-teal-soft bg-teal-soft/30 p-6">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-[#215d4d]">
            Cobra quien recibió en COP
          </p>
          <div className="flex flex-col gap-1.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-soft">Ventas en COP</span>
              <span className="text-ink">{formatMonto(liquidacion.usdt_cop, "USDT")}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-soft">Comisiones en Bs</span>
              <span className="text-teal">
                + {formatMonto(liquidacion.comision_bs, "USDT")}
              </span>
            </div>
          </div>
          <p
            className="mt-3 border-t border-teal-soft pt-3 text-2xl font-medium text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {formatMonto(cobra.cop, "USDT")}
          </p>
        </div>

        <div className="flex flex-col justify-between rounded-2xl bg-ink p-6 text-[#F3F1EA]">
          <p className="font-mono text-[11px] uppercase tracking-widest text-[#D99A46]">
            Neto del corte
          </p>

          <div className="mt-3">
            <p className="font-mono text-[12.5px] text-[#A9AE9F]">
              {favor.lado === "cop"
                ? `${formatMonto(cobra.cop, "USDT")} − ${formatMonto(cobra.bs, "USDT")}`
                : `${formatMonto(cobra.bs, "USDT")} − ${formatMonto(cobra.cop, "USDT")}`}
            </p>
            <p
              className="text-[32px] leading-tight font-medium"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {formatMonto(favor.monto, "USDT")}
            </p>
          </div>

          <p className="mt-3 flex items-center gap-2 text-[12.5px] text-[#A9AE9F]">
            {favor.lado !== "ninguno" && (
              <span
                className={`h-2 w-2 flex-none rounded-full ${
                  favor.lado === "bs" ? "bg-[#D99A46]" : "bg-[#7FCBAE]"
                }`}
                aria-hidden
              />
            )}
            {favor.frase}
          </p>
        </div>
      </div>

      {/* Un corte puede contener movimientos que nadie llego a aprobar: al
          liquidar se toman TODOS los pendientes, revisados o no. Si pasa,
          tiene que verse —- son numeros que la contraparte nunca confirmo. */}
      {sinAprobar > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-accent bg-accent-soft/40 px-5 py-4">
          <span className="mt-0.5 font-mono text-[11px] uppercase tracking-widest text-[#8f5e1f]">
            Atención
          </span>
          <p className="text-[13.5px] leading-relaxed text-ink">
            {sinAprobar} de {items.length} movimiento
            {sinAprobar === 1 ? "" : "s"} de este corte se liquidó sin que la
            contraparte lo revisara. Los montos entraron igual en el total.
          </p>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-medium text-ink">
          {liquidacion.cantidad_items} movimiento
          {liquidacion.cantidad_items === 1 ? "" : "s"} en este corte
        </h2>
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
          Congelado el {formatFecha(liquidacion.fecha)}
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <ItemsTable
          items={items}
          depositos={depositos}
          esAdmin={false}
          vacio="Este corte no tiene movimientos."
        />
      </div>

      <p className="mt-4 text-[12.5px] leading-relaxed text-ink-soft">
        Si después se corrige algún movimiento, esta liquidación no cambia.
      </p>
    </div>
  );
}
