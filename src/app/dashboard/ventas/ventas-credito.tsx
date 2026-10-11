"use client";

import { useActionState, useRef, useTransition } from "react";
import { formatMonto } from "@/lib/items";
import { VENTA_DESCRIPCION_MAX, type Venta } from "@/lib/ventas";
import { crearVenta, eliminarVenta, type VentaState } from "./actions";

/*
 * Las ventas de créditos ya no tienen una sección propia en el panel: desde
 * la fase 51 llevan número de movimiento y se listan en la tabla de
 * movimientos (items-table.tsx). Acá quedan las dos piezas que la tabla y
 * el encabezado reutilizan: el diálogo para generar una y el botón para
 * borrar una pendiente.
 */

/** Borra una venta pendiente. Solo lo muestra quien es admin. */
export function EliminarVenta({
  venta,
  className = "",
}: {
  venta: Pick<Venta, "id" | "numero" | "usdt">;
  className?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `¿Eliminar la venta #${venta.numero} de ${formatMonto(Number(venta.usdt), "USDT")}?`,
          )
        ) {
          return;
        }
        startTransition(async () => {
          const resultado = await eliminarVenta(venta.id);
          if (!resultado.ok && resultado.error) alert(resultado.error);
        });
      }}
      className={`text-[13px] text-ink-soft transition hover:text-critical disabled:opacity-50 ${className}`}
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
export function GenerarVenta({ siguienteNumero }: { siguienteNumero: number }) {
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
        {/* La key remonta el formulario cuando cambia el próximo número
            (otra carga, o esta misma al guardarse): el número propuesto
            sigue al de la base y los campos quedan limpios. */}
        <form key={siguienteNumero} action={formAction} className="flex flex-col">
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
              <label htmlFor="venta-numero" className="text-[13px] font-medium text-ink-soft">
                Número de movimiento
              </label>
              <input
                id="venta-numero"
                name="numero"
                type="number"
                min={1}
                step={1}
                required
                defaultValue={siguienteNumero}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
            </div>
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
