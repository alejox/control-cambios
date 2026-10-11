"use client";

import { useActionState, useRef, useTransition } from "react";
import { formatFecha, formatMonto } from "@/lib/items";
import { VENTA_DESCRIPCION_MAX, type Venta } from "@/lib/ventas";
import { crearVenta, eliminarVenta, type VentaState } from "./actions";

/**
 * Las ventas de créditos pendientes: lo que el lado Bs le vendió al lado
 * COP y se va a descontar en el próximo corte. El admin las registra y las
 * borra; el colaborador las ve, porque es plata que se le va a descontar.
 */
export default function VentasCredito({
  ventas,
  total,
  esAdmin,
}: {
  ventas: Venta[];
  total: number;
  esAdmin: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[15px] font-medium text-ink">Ventas de créditos</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-mono text-[12px] text-ink">
            {ventas.length === 0 ? "Sin ventas pendientes" : `Total ${formatMonto(total, "USDT")}`}
          </p>
          {esAdmin && <GenerarVenta />}
        </div>
      </div>

      {ventas.length > 0 && (
        <ul className="divide-y divide-border">
          {ventas.map((v) => (
            <li
              key={v.id}
              className="flex flex-col gap-1 px-5 py-3 text-[13.5px] sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="w-24 flex-none font-mono text-[12.5px] text-ink-soft">
                {formatFecha(v.fecha)}
              </span>
              <span className="w-32 flex-none font-medium text-ink">
                {formatMonto(Number(v.usdt), "USDT")}
              </span>
              <span className="min-w-0 flex-1 break-words text-ink-soft">
                {v.descripcion ?? "—"}
              </span>
              {esAdmin && <EliminarVenta venta={v} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EliminarVenta({ venta }: { venta: Venta }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (!confirm(`¿Eliminar la venta de ${formatMonto(Number(venta.usdt), "USDT")}?`)) {
          return;
        }
        startTransition(async () => {
          try {
            await eliminarVenta(venta.id);
          } catch (e) {
            alert((e as Error).message);
          }
        });
      }}
      className="self-start text-[13px] text-ink-soft transition hover:text-critical disabled:opacity-50 sm:self-auto"
    >
      {pending ? "Eliminando…" : "Eliminar"}
    </button>
  );
}

/**
 * El botón "Generar venta" abre el formulario en un diálogo, con el mismo
 * patrón que el de liquidar: el formulario no ocupa lugar en el panel
 * mientras no se lo necesita.
 */
function GenerarVenta() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<VentaState, FormData>(
    async (prev, formData) => {
      const resultado = await crearVenta(prev, formData);
      if (resultado.ok) dialogRef.current?.close();
      return resultado;
    },
    { error: null, ok: false },
  );
  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127]"
      >
        Generar venta
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
              Venta de créditos
            </p>
            <h2
              className="mt-1 text-[20px] font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Generar venta
            </h2>
          </div>

          <div className="flex flex-col gap-3 px-6 py-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="venta-usdt" className="text-[13px] font-medium text-ink-soft">
                Monto (USDT)
              </label>
              <input
                id="venta-usdt"
                name="usdt"
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                required
                placeholder="69.00"
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="venta-fecha" className="text-[13px] font-medium text-ink-soft">
                Fecha
              </label>
              <input
                id="venta-fecha"
                name="fecha"
                type="date"
                required
                defaultValue={hoy}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="venta-descripcion" className="text-[13px] font-medium text-ink-soft">
                Descripción (opcional)
              </label>
              <input
                id="venta-descripcion"
                name="descripcion"
                type="text"
                maxLength={VENTA_DESCRIPCION_MAX}
                placeholder="Ej.: 500 créditos del panel"
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>

            <p className="text-[12px] leading-relaxed text-ink-soft">
              La venta suma a lo que cobra el lado Bs y se descuenta del lado
              COP en el próximo corte. No lleva comisión ni aprobación.
            </p>

            {state.error && (
              <p className="text-[13px] text-critical" role="alert">
                {state.error}
              </p>
            )}
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
              {pending ? "Registrando…" : "Registrar venta"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
