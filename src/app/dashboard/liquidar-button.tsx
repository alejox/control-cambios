"use client";

import { useActionState, useRef } from "react";
import { liquidar, type LiquidarState } from "./liquidaciones/actions";
import { formatMonto } from "@/lib/items";
import { cobraCadaLado, favorDe } from "@/lib/liquidaciones";

/**
 * Cierra las cuentas entre las dos partes. Muestra el corte antes de
 * liquidar no se deshace desde acá, asi que los numeros tienen que estar
 * a la vista antes y no despues.
 */
export default function LiquidarButton({
  cantidad,
  sinAprobar,
  usdtBs,
  usdtCop,
  comisionBs,
  comisionCop,
}: {
  cantidad: number;
  /** Movimientos pendientes que la contraparte todavia no aprobo. */
  sinAprobar: number;
  usdtBs: number;
  usdtCop: number;
  comisionBs: number;
  comisionCop: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<LiquidarState, FormData>(
    liquidar,
    { error: null },
  );

  // Cada lado cobra sus ventas MAS la comision que le genera el otro. El
  // neto es la diferencia entre lo que cobra cada uno.
  const cobra = cobraCadaLado({
    usdt_bs: usdtBs,
    usdt_cop: usdtCop,
    comision_bs: comisionBs,
    comision_cop: comisionCop,
  });
  const neto = Math.round((cobra.bs - cobra.cop) * 100) / 100;
  const favor = favorDe(neto);
  // No se liquida con algo sin aprobar: seria cerrar cuentas sobre montos
  // que la contraparte nunca confirmo. La base tambien lo rechaza; esto es
  // para que no haya que llegar al error para enterarse.
  const puede = cantidad > 0 && sinAprobar === 0;
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <button
        type="button"
        disabled={!puede}
        onClick={() => dialogRef.current?.showModal()}
        title={
          cantidad === 0
            ? "No hay movimientos pendientes"
            : sinAprobar > 0
              ? `Faltan ${sinAprobar} por aprobar`
              : `Liquidar ${cantidad} movimientos`
        }
        className="h-10 rounded-[10px] border border-teal bg-teal-soft/50 px-4 text-sm font-medium text-[#215d4d] transition hover:bg-teal-soft disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sinAprobar > 0 ? `Faltan ${sinAprobar} por aprobar` : `Liquidar (${cantidad})`}
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,460px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <form action={formAction} className="flex flex-col">
          <div className="border-b border-border px-6 py-4">
            <p className="font-mono text-[11.5px] uppercase tracking-widest text-accent">
              Cerrar cuentas
            </p>
            <h2
              className="mt-1 text-[20px] font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Liquidar {cantidad} movimiento{cantidad === 1 ? "" : "s"}
            </h2>
          </div>

          <div className="flex flex-col gap-3 px-6 py-5">
            <div className="flex flex-col gap-1.5 rounded-[10px] border border-accent-soft bg-accent-soft/30 px-3.5 py-3">
              <p className="font-mono text-[10.5px] uppercase tracking-widest text-[#8f5e1f]">
                Cobra quien recibió en Bs
              </p>
              <div className="flex flex-col gap-1 text-[12.5px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-soft">Ventas en Bs</span>
                  <span className="text-ink">{formatMonto(usdtBs, "USDT")}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-soft">Comisiones en COP</span>
                  <span className="text-teal">+ {formatMonto(comisionCop, "USDT")}</span>
                </div>
              </div>
              <p className="mt-1 border-t border-accent-soft pt-2 text-[15px] font-medium text-ink">
                {formatMonto(cobra.bs, "USDT")}
              </p>
            </div>

            <div className="flex flex-col gap-1.5 rounded-[10px] border border-teal-soft bg-teal-soft/30 px-3.5 py-3">
              <p className="font-mono text-[10.5px] uppercase tracking-widest text-[#215d4d]">
                Cobra quien recibió en COP
              </p>
              <div className="flex flex-col gap-1 text-[12.5px]">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-soft">Ventas en COP</span>
                  <span className="text-ink">{formatMonto(usdtCop, "USDT")}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-soft">Comisiones en Bs</span>
                  <span className="text-teal">+ {formatMonto(comisionBs, "USDT")}</span>
                </div>
              </div>
              <p className="mt-1 border-t border-teal-soft pt-2 text-[15px] font-medium text-ink">
                {formatMonto(cobra.cop, "USDT")}
              </p>
            </div>

            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
              <span className="text-[13.5px] font-medium text-ink">Neto del corte</span>
              <span
                className="text-[19px] font-medium text-ink"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {formatMonto(favor.monto, "USDT")}
              </span>
            </div>

            <p className="text-[12px] leading-relaxed text-ink-soft">
              {favor.frase}
              {favor.lado !== "ninguno" && ": esa parte recibe la diferencia."}
            </p>

            <div className="mt-2 flex flex-col gap-1.5">
              <label htmlFor="fecha" className="text-[13px] font-medium text-ink-soft">
                Fecha de la liquidación
              </label>
              <input
                id="fecha"
                name="fecha"
                type="date"
                defaultValue={hoy}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="notas" className="text-[13px] font-medium text-ink-soft">
                Notas (opcional)
              </label>
              <textarea
                id="notas"
                name="notas"
                rows={2}
                placeholder="Alguna nota sobre este corte…"
                className="rounded-[9px] border border-border bg-surface px-3 py-2 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            <p className="text-[12px] leading-relaxed text-ink-soft">
              Estos montos quedan congelados en la liquidación y los movimientos
              salen de la tabla de pendientes.
            </p>

            {state.error && <p className="text-[13px] text-critical">{state.error}</p>}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-[13.5px] text-ink-soft transition hover:text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-50"
            >
              {pending ? "Liquidando…" : "Confirmar liquidación"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
