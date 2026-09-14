"use client";

import { useActionState } from "react";
import { cambiarRol, type RolState } from "./actions";

const OPCIONES = [
  { valor: "sin_acceso", etiqueta: "Sin acceso" },
  { valor: "colaborador", etiqueta: "Colaborador" },
  { valor: "admin", etiqueta: "Admin" },
];

export default function RolSelect({
  userId,
  rol,
  esYo,
}: {
  userId: string;
  rol: string;
  esYo: boolean;
}) {
  const [state, formAction, pending] = useActionState<RolState, FormData>(
    cambiarRol,
    { error: null, ok: false },
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="user_id" value={userId} />
      <div className="flex items-center gap-2">
        <select
          name="rol"
          defaultValue={rol}
          disabled={pending}
          aria-label="Rol"
          className="h-9 rounded-[9px] border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-50"
        >
          {OPCIONES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[9px] border border-border px-3 text-[13px] text-ink-soft transition hover:bg-surface-alt disabled:opacity-50"
        >
          {pending ? "…" : "Guardar"}
        </button>
      </div>
      {state.error && <span className="text-[11.5px] text-critical">{state.error}</span>}
      {state.ok && !state.error && (
        <span className="text-[11.5px] text-teal">Guardado.</span>
      )}
      {esYo && !state.error && (
        <span className="text-[11.5px] text-ink-soft">Sos vos</span>
      )}
    </form>
  );
}
