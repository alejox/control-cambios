"use client";

import { useActionState, useState } from "react";
import { actualizarComisionGlobal, type ComisionState } from "./actions";

export default function ComisionGlobal({
  valor,
  esAdmin,
}: {
  valor: number;
  esAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState<ComisionState, FormData>(
    actualizarComisionGlobal,
    { error: null, ok: false },
  );

  // Valor inicial y nada mas: no hay que sincronizarlo con la prop. El
  // unico momento en que "valor" cambia es despues de guardar, y ahi el
  // borrador ya tiene exactamente ese numero porque lo acaba de tipear
  // el admin. Un useEffect aca solo agregaria un render de mas.
  const [borrador, setBorrador] = useState(String(valor));

  if (!esAdmin) {
    return (
      <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-surface px-5 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
          Comisión vigente
        </span>
        <span className="text-[15px] font-medium text-ink">{valor}%</span>
        <span className="text-[12.5px] text-ink-soft">
          — solo un administrador puede cambiarla
        </span>
      </div>
    );
  }

  const sinCambios = borrador.trim() === String(valor);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface px-5 py-3.5"
    >
      <label
        htmlFor="comision_pct"
        className="font-mono text-[11px] uppercase tracking-widest text-ink-soft"
      >
        Comisión global
      </label>

      <div className="flex items-center gap-1.5">
        <input
          id="comision_pct"
          name="comision_pct"
          type="number"
          step="0.01"
          min={0}
          max={100}
          required
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          className="h-9 w-24 rounded-[9px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <span className="text-sm text-ink-soft">%</span>
      </div>

      <button
        type="submit"
        disabled={pending || sinCambios}
        className="h-9 rounded-[9px] bg-ink px-3.5 text-[13.5px] font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>

      {state.error ? (
        <span className="text-[12.5px] text-critical">{state.error}</span>
      ) : state.ok && sinCambios ? (
        <span className="text-[12.5px] text-teal">Guardado.</span>
      ) : (
        <span className="text-[12.5px] text-ink-soft">
          Aplica a los cierres nuevos. Los ya registrados conservan el suyo.
        </span>
      )}
    </form>
  );
}
