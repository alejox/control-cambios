"use client";

import { useActionState, useRef, useState } from "react";
import {
  desvincularTelegram,
  generarCodigoTelegram,
  type CodigoTelegramState,
  type DesvincularTelegramState,
} from "./actions";
import PanelLink from "./usuarios/panel-link";

const IconoTelegram = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M1.9 7.4 13.4 2.6c.6-.25 1.2.23 1.05.87l-2 9.3c-.12.55-.76.76-1.18.4L8.1 10.6l-1.7 1.63c-.3.29-.8.1-.85-.32l-.3-2.5"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
    <path d="m5.25 9.4 6.4-4.6-6.9 4.2" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
  </svg>
);

/**
 * Conectar el chat de Telegram con esta cuenta.
 *
 * Vive en el header del dashboard y no en /dashboard/usuarios a propósito:
 * esa pantalla redirige a cualquiera que no sea admin, y el colaborador es
 * justamente el que más comprobantes manda. Además no es administrar a
 * otros: cada uno conecta su propio chat, así que el header —- donde ya
 * están las cosas de uno mismo —- es el lugar.
 */
export default function ConectarTelegram({ vinculado }: { vinculado: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [state, generar, generando] = useActionState<CodigoTelegramState, FormData>(
    generarCodigoTelegram,
    { error: null, codigo: null },
  );
  const [baja, desvincular, desvinculando] = useActionState<
    DesvincularTelegramState,
    FormData
  >(desvincularTelegram, { error: null, ok: false });

  // useActionState no se puede vaciar a mano y el código sobrevive al cierre
  // del dialog. Se recuerda cuál ya se descartó para que la próxima vez
  // arranque en la explicación y no en el código de la vez pasada —- que
  // además ya venció.
  const [descartado, setDescartado] = useState<string | null>(null);
  const codigo = state.codigo && state.codigo !== descartado ? state.codigo : null;

  // Si se desvinculó en esta misma pantalla, el layout ya se revalidó; el
  // booleano de la prop puede venir viejo hasta que React termine.
  const estaVinculado = vinculado && !baja.ok;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        title={estaVinculado ? "Telegram conectado" : "Conectar Telegram"}
        className="flex items-center gap-1.5 text-[13px] text-ink-soft transition hover:text-ink"
      >
        <span className={estaVinculado ? "text-accent" : "text-ink-soft"}>{IconoTelegram}</span>
        <span className="hidden sm:inline">
          {estaVinculado ? "Telegram" : "Conectar Telegram"}
        </span>
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setDescartado(state.codigo)}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,460px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <div className="border-b border-border px-6 py-4">
          <p className="mb-1 font-mono text-[11.5px] uppercase tracking-widest text-accent">
            {codigo ? "Falta un paso" : "Comprobantes desde el chat"}
          </p>
          <h2
            className="text-[20px] font-medium text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {codigo ? "Mandale esto al bot" : estaVinculado ? "Telegram conectado" : "Conectar Telegram"}
          </h2>
        </div>

        {codigo ? (
          <PanelLink
            link={`/vincular ${codigo}`}
            etiquetaCopiar="Copiar comando"
            instruccion={
              <>
                Abrí el chat con el bot y mandale este mensaje tal cual. Es de un
                solo uso y vence en 15 minutos.
              </>
            }
            aviso={
              <>
                Cuando te conteste que quedaron vinculados, mandale la foto de un
                comprobante y la carga como{" "}
                <span className="font-medium text-ink">pendiente de revisión</span>,
                con la tasa del momento como valor provisorio.
              </>
            }
            onCerrar={() => dialogRef.current?.close()}
          />
        ) : estaVinculado ? (
          <form action={desvincular} className="flex flex-col">
            <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
              <p>
                Tu chat ya está conectado: mandale la foto de un comprobante al bot
                y queda cargado como{" "}
                <span className="font-medium text-ink">pendiente de revisión</span>.
              </p>
              <p className="rounded-[10px] bg-surface-alt px-3.5 py-3 text-[12.5px]">
                Si desconectás el chat, el bot deja de reconocerlo y va a ignorar
                todo lo que le mandes desde ahí. Podés volver a conectarlo cuando
                quieras con un código nuevo.
              </p>
              {baja.error && <p className="text-[13px] text-critical">{baja.error}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                className="text-[13.5px] text-ink-soft transition hover:text-ink"
              >
                Cerrar
              </button>
              <button
                type="submit"
                disabled={desvinculando}
                className="h-10 rounded-[10px] border border-border px-4 text-sm font-medium text-critical transition hover:bg-surface-alt disabled:opacity-50"
              >
                {desvinculando ? "Desconectando…" : "Desconectar"}
              </button>
            </div>
          </form>
        ) : (
          <form action={generar} className="flex flex-col">
            <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
              <p>
                Conectá tu chat de Telegram y mandale las fotos de los comprobantes
                al bot: los carga como{" "}
                <span className="font-medium text-ink">pendientes de revisión</span>,
                con la tasa de referencia del momento como valor provisorio.
              </p>
              <p className="rounded-[10px] bg-surface-alt px-3.5 py-3 text-[12.5px]">
                Generás un código, se lo mandás al bot como{" "}
                <span className="font-mono text-ink">/vincular CÓDIGO</span> y listo.
                Vence en 15 minutos y sirve una sola vez.
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
                disabled={generando}
                className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-50"
              >
                {generando ? "Generando…" : "Generar código"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
