"use client";

import { useActionState, useRef, useState } from "react";
import { regenerarAcceso, type AccesoState } from "./actions";
import PanelLink from "./panel-link";

/**
 * Link de acceso para una cuenta que ya existe: para el que perdio la
 * contraseña o nunca llego a definirla. Sin SMTP no hay "olvidé mi contraseña"
 * que funcione, asi que el link lo genera el admin y lo hace llegar por fuera.
 */
export default function RegenerarAcceso({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState<AccesoState, FormData>(
    regenerarAcceso,
    { error: null, link: null },
  );

  // useActionState no se puede vaciar a mano y el link sobrevive al cierre del
  // dialog. Se recuerda cual ya se descarto para que la proxima vez arranque en
  // la confirmacion y no en el resultado de la anterior.
  const [descartado, setDescartado] = useState<string | null>(null);
  const link = state.link && state.link !== descartado ? state.link : null;

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-[13px] text-ink-soft transition hover:text-ink"
      >
        Generar link
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setDescartado(state.link)}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,440px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <div className="border-b border-border px-6 py-4">
          <p className="font-mono text-[11.5px] uppercase tracking-widest text-accent">
            {link ? "Falta mandarlo" : "Una cuenta que ya existe"}
          </p>
          <h2
            className="mt-1 text-[20px] font-medium text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {link ? "Link listo" : "Generar link de acceso"}
          </h2>
        </div>

        {link ? (
          <PanelLink
            link={link}
            instruccion="Copiá este link y mandáselo vos. Es de un solo uso y con él elige una contraseña nueva."
            aviso={
              <>
                Mientras no lo use, sigue entrando con la contraseña de antes.
                En cuanto elija una nueva,{" "}
                <span className="font-medium text-ink">la anterior deja de servir</span>.
              </>
            }
            onCerrar={() => dialogRef.current?.close()}
          />
        ) : (
          <form action={formAction} className="flex flex-col">
            <input type="hidden" name="user_id" value={userId} />

            <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
              <p>
                Se genera un link para{" "}
                <span className="font-medium text-ink">{email ?? "esta cuenta"}</span>{" "}
                con el que elige una contraseña nueva. Sirve si la perdió o si
                nunca llegó a definirla.
              </p>
              <p className="rounded-[10px] bg-surface-alt px-3.5 py-3 text-[12.5px]">
                Es de un solo uso y no se manda ningún correo: lo copiás y se lo
                hacés llegar vos. Cuando elija la contraseña nueva,{" "}
                <span className="font-medium text-ink">la anterior deja de servir</span>.
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
                {pending ? "Generando…" : "Generar link"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
