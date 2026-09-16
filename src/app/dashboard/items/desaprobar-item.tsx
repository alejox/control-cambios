"use client";

import { useActionState, useRef } from "react";
import { desaprobarItem, type DesaprobarState } from "./actions";
import { ETIQUETA_FLUJO, MOTIVO_DESAPROBACION_MAX, formatMonto, type TipoFlujo } from "@/lib/items";

/**
 * Devuelve a revisión un movimiento que la contraparte ya aprobó.
 *
 * Se confirma en un <dialog> y no con confirm(): hay que poder decir de QUÉ
 * movimiento se trata, que la contraparte va a tener que aprobarlo de
 * nuevo, y sobre todo pedir el motivo. confirm() solo admite una línea de
 * texto plano y no acepta nada escrito.
 *
 * El motivo es obligatorio y no un campo opcional que se puede saltear:
 * esto deshace un acuerdo entre dos personas, y un movimiento que vuelve a
 * pendiente sin explicación es una discusión asegurada dentro de tres
 * meses. La base lo exige igual (un check de tabla), así que el `required`
 * de acá es cortesía, no la regla.
 *
 * No se cierra el diálogo al enviar, al revés que en recalcular-comisiones:
 * si la base rechaza, el error tiene que aparecer al lado del textarea que
 * hay que corregir. Cuando sale bien no hace falta cerrarlo a mano —- el
 * movimiento deja de estar aprobado, la fila se vuelve a renderizar sin
 * este botón y el diálogo se va con él.
 */
export default function DesaprobarItem({
  itemId,
  numero,
  tipoFlujo,
  usdtTotal,
}: {
  itemId: string;
  numero: number;
  tipoFlujo: TipoFlujo;
  usdtTotal: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<DesaprobarState, FormData>(
    desaprobarItem,
    { error: null, ok: false },
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        title="Devolver a revisión"
        className="text-[13px] text-ink-soft transition hover:text-accent"
      >
        Desaprobar
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,460px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <form action={formAction} className="flex flex-col">
          <input type="hidden" name="item_id" value={itemId} />

          <div className="border-b border-border px-6 py-4">
            <p className="font-mono text-[11.5px] uppercase tracking-widest text-accent">
              Antes de seguir
            </p>
            <h2
              className="mt-1 text-[20px] font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Devolver a revisión
            </h2>
          </div>

          <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
            <p>
              El movimiento{" "}
              <span className="font-medium text-ink">
                #{numero} · {ETIQUETA_FLUJO[tipoFlujo]} ·{" "}
                {formatMonto(usdtTotal, "USDT")}
              </span>{" "}
              vuelve a quedar pendiente, junto con todos sus comprobantes.
            </p>
            <p>
              <span className="font-medium text-ink">
                La contraparte va a tener que aprobarlo de nuevo
              </span>
              : le va a aparecer otra vez en “Por revisar” y en la campanita.
            </p>

            <label htmlFor={`motivo-${itemId}`} className="mt-1 flex flex-col gap-1.5">
              <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
                Por qué lo devolvés
              </span>
              <textarea
                id={`motivo-${itemId}`}
                name="motivo"
                required
                rows={2}
                maxLength={MOTIVO_DESAPROBACION_MAX}
                placeholder="Ej: la comisión estaba configurada en 14% y debía ser 7%."
                className="w-full resize-none rounded-[10px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <span className="text-[12px]">
                Queda guardado con tu nombre. Dentro de tres meses va a ser lo
                único que explique por qué este movimiento volvió atrás.
              </span>
            </label>

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
              className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40"
            >
              {pending ? "Devolviendo…" : "Devolver a revisión"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
