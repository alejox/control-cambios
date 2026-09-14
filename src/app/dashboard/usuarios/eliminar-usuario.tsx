"use client";

import { useActionState, useRef } from "react";
import { eliminarUsuario, type BajaState } from "./actions";

/**
 * Borra una cuenta por completo. Se confirma en un <dialog> y no con el
 * confirm() del navegador: hay que poder mostrar de QUE cuenta se trata y
 * que es irreversible, y confirm() solo admite una linea de texto plano.
 */
export default function EliminarUsuario({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<BajaState, FormData>(
    eliminarUsuario,
    { error: null, ok: false },
  );

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-[13px] text-ink-soft transition hover:text-critical"
      >
        Eliminar
      </button>

      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,440px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <form action={formAction} className="flex flex-col">
          <input type="hidden" name="user_id" value={userId} />

          <div className="border-b border-border px-6 py-4">
            <p className="font-mono text-[11.5px] uppercase tracking-widest text-critical">
              No tiene vuelta atrás
            </p>
            <h2
              className="mt-1 text-[20px] font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Eliminar cuenta
            </h2>
          </div>

          <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
            <p>
              Se borra la cuenta de{" "}
              <span className="font-medium text-ink">{email ?? "este usuario"}</span>{" "}
              y no va a poder volver a entrar.
            </p>
            <p className="rounded-[10px] bg-surface-alt px-3.5 py-3 text-[12.5px]">
              Si ya cargó movimientos o aprobó comprobantes, no se va a poder
              eliminar: borrarlo dejaría esos registros sin autor. En ese caso
              ponelo en <span className="font-medium text-ink">Sin acceso</span>.
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
              className="h-10 rounded-[10px] bg-critical px-4 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-50"
            >
              {pending ? "Eliminando…" : "Eliminar cuenta"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
