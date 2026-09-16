"use client";

import { useActionState, useRef } from "react";
import { recalcularComisiones, type RecalculoState } from "./actions";
import type { ResumenFlujo, ResumenRecalculo } from "@/lib/items";

/** "de 14% a 7%", o "de 14% y 12% a 7%" si no todos venían del mismo. */
function comoQueda(resumen: ResumenFlujo) {
  const desde =
    resumen.desde.length === 0
      ? null
      : resumen.desde.length === 1
        ? `${resumen.desde[0]}%`
        : `${resumen.desde.slice(0, -1).join("%, ")}% y ${resumen.desde.at(-1)}%`;

  return desde === null ? `a ${resumen.hacia}%` : `de ${desde} a ${resumen.hacia}%`;
}

function Linea({ etiqueta, resumen }: { etiqueta: string; resumen: ResumenFlujo }) {
  if (resumen.cantidad === 0) return null;

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
        {etiqueta}
      </span>
      <span className="text-[13px] text-ink">
        {resumen.cantidad}{" "}
        {resumen.cantidad === 1 ? "movimiento" : "movimientos"}, {comoQueda(resumen)}
        {resumen.aprobados > 0 && (
          <span className="text-critical">
            {" "}
            ({resumen.aprobados}{" "}
            {resumen.aprobados === 1 ? "aprobado" : "aprobados"})
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * Aplica las comisiones vigentes a todo lo que todavía no se liquidó. Es la
 * salida para el que configuró mal el porcentaje después de haber cargado
 * movimientos con él.
 *
 * Confirma en un <dialog> y no directo: hay que poder decir ANTES cuántos
 * se tocan, de qué porcentaje a cuál por moneda, y —- lo más importante —-
 * cuántos de esos están APROBADOS y van a volver a revisión. Eso último es
 * trabajo que se le genera a la contraparte: tiene que saberse antes de
 * apretar, no después.
 *
 * El resumen que muestra es una vista previa calculada con lo que ya está
 * en pantalla. El número que se informa DESPUÉS lo devuelve la base, que
 * es la única que sabe qué cambió de verdad.
 */
export default function RecalcularComisiones({ resumen }: { resumen: ResumenRecalculo }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<RecalculoState, FormData>(
    recalcularComisiones,
    { error: null, mensaje: null },
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="h-9 rounded-[9px] border border-border px-3 text-[13px] text-ink-soft transition hover:bg-surface hover:text-ink"
      >
        Recalcular pendientes
      </button>

      {/* El resultado se muestra afuera del dialogo: cuando vuelve la
          respuesta el dialogo ya se cerró, y un mensaje adentro de algo
          cerrado no lo lee nadie. */}
      {state.error ? (
        <span className="self-center text-[12.5px] text-critical">{state.error}</span>
      ) : state.mensaje ? (
        <span className="self-center text-[12.5px] text-teal">{state.mensaje}</span>
      ) : null}

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,460px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <form
          action={(formData) => {
            dialogRef.current?.close();
            formAction(formData);
          }}
          className="flex flex-col"
        >
          <div className="border-b border-border px-6 py-4">
            <p className="font-mono text-[11.5px] uppercase tracking-widest text-accent">
              Antes de seguir
            </p>
            <h2
              className="mt-1 text-[20px] font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Recalcular comisiones
            </h2>
          </div>

          <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
            {resumen.total === 0 ? (
              <p>
                No hay nada para recalcular: todos los movimientos sin
                liquidar ya tienen la comisión vigente.
              </p>
            ) : (
              <>
                <p>
                  Se les va a aplicar la comisión vigente a{" "}
                  <span className="font-medium text-ink">
                    {resumen.total}{" "}
                    {resumen.total === 1 ? "movimiento" : "movimientos"}
                  </span>
                  :
                </p>
                <ul className="flex flex-col gap-2 rounded-[10px] bg-surface-alt px-3.5 py-3">
                  <Linea etiqueta="Bs → USDT" resumen={resumen.bs} />
                  <Linea etiqueta="COP → USDT" resumen={resumen.cop} />
                </ul>
              </>
            )}

            {/* Lo que vuelve a revisión va en su propio bloque y en rojo: no
                es una nota al pie del recálculo, es la consecuencia que le
                cae a la otra persona. */}
            {resumen.vuelvenARevision > 0 && (
              <p className="rounded-[10px] border border-critical-soft bg-critical-soft/40 px-3.5 py-3 text-[12.5px]">
                <span className="font-medium text-ink">
                  {resumen.vuelvenARevision === 1
                    ? "1 de esos movimientos ya estaba aprobado y vuelve a revisión."
                    : `${resumen.vuelvenARevision} de esos movimientos ya estaban aprobados y vuelven a revisión.`}
                </span>{" "}
                Un número acordado no se cambia a espaldas de la contraparte:
                en vez de reescribirlo, {resumen.vuelvenARevision === 1 ? "le vuelve" : "le vuelven"}{" "}
                a aparecer en “Por revisar” para que{" "}
                {resumen.vuelvenARevision === 1 ? "lo apruebe" : "los apruebe"}{" "}
                otra vez con el número nuevo. Queda registrado que fue por el
                recálculo.
              </p>
            )}

            <p className="rounded-[10px] bg-surface-alt px-3.5 py-3 text-[12.5px]">
              Los movimientos{" "}
              <span className="font-medium text-ink">ya liquidados</span> no se
              tocan: esas cuentas ya las saldaron las dos partes.
            </p>
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
              disabled={pending || resumen.total === 0}
              className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40"
            >
              {pending ? "Recalculando…" : "Recalcular"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
