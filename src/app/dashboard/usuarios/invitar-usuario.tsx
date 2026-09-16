"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { invitarUsuario, type InvitacionState } from "./actions";

/**
 * Alta de una cuenta nueva. El paso final no es "listo": es un link que hay
 * que copiar y mandar por fuera, porque no sale ningun correo automatico.
 */
export default function InvitarUsuario() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copiado, setCopiado] = useState(false);
  const [state, formAction, pending] = useActionState<InvitacionState, FormData>(
    invitarUsuario,
    { error: null, link: null },
  );

  // useActionState no se puede vaciar a mano y el link sobrevive al cierre del
  // dialog. Se recuerda cual ya se descarto para que la proxima invitacion
  // arranque en el formulario y no en el resultado de la anterior.
  const [descartado, setDescartado] = useState<string | null>(null);
  const link = state.link && state.link !== descartado ? state.link : null;

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  async function copiar(valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
    } catch {
      // Sin https o sin permiso el portapapeles no esta disponible. El link
      // queda igual a la vista, asi que se puede seleccionar y copiar a mano.
      setCopiado(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127]"
      >
        Invitar
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => {
          setDescartado(state.link);
          setCopiado(false);
        }}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-[min(92vw,440px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <div className="border-b border-border px-6 py-4">
          <p className="font-mono text-[11.5px] uppercase tracking-widest text-accent">
            {link ? "Falta mandarlo" : "Una cuenta nueva"}
          </p>
          <h2
            className="mt-1 text-[20px] font-medium text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {link ? "Link listo" : "Invitar usuario"}
          </h2>
        </div>

        {link ? (
          <>
            <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
              <p>
                Copiá este link y mandáselo vos. Es de un solo uso y con él
                elige su contraseña.
              </p>
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="h-11 rounded-[10px] border border-border bg-surface-alt px-3.5 font-mono text-[12px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <p className="rounded-[10px] bg-surface-alt px-3.5 py-3 text-[12.5px]">
                Cuando entre va a quedar en{" "}
                <span className="font-medium text-ink">Sin acceso</span>: para
                que pueda hacer algo, asignale un rol en la lista.
              </p>
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
                type="button"
                onClick={() => copiar(link)}
                className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127]"
              >
                {copiado ? "Copiado" : "Copiar link"}
              </button>
            </div>
          </>
        ) : (
          <form action={formAction} className="flex flex-col">
            <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="invitar-email"
                  className="text-[13px] font-medium text-ink-soft"
                >
                  Correo
                </label>
                <input
                  id="invitar-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="off"
                  placeholder="alguien@correo.com"
                  className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>
              <p className="rounded-[10px] bg-surface-alt px-3.5 py-3 text-[12.5px]">
                No se manda ningún correo: se genera un link que copiás y le
                hacés llegar vos.
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
