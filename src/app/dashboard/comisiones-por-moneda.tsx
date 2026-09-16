"use client";

import { useActionState, useState } from "react";
import { actualizarComisiones, type ComisionState } from "./actions";
import type { Comisiones } from "@/lib/items";

/**
 * Las dos comisiones vigentes: una para los cierres en Bs y otra para los
 * de COP. Antes era una sola y el componente se llamaba ComisionGlobal;
 * el nombre pasó a mentir el día que dejaron de ser la misma.
 *
 * Los dos campos se guardan juntos, con un solo botón: son una sola
 * decisión de cuánto se cobra, y dos botones invitan a dejar la mitad sin
 * guardar.
 */
export default function ComisionesPorMoneda({
  valores,
  esAdmin,
}: {
  valores: Comisiones;
  esAdmin: boolean;
}) {
  const [state, formAction, pending] = useActionState<ComisionState, FormData>(
    actualizarComisiones,
    { error: null, ok: false },
  );

  // Valores iniciales y nada mas: no hay que sincronizarlos con la prop. El
  // unico momento en que "valores" cambia es despues de guardar, y ahi el
  // borrador ya tiene exactamente esos numeros porque los acaba de tipear
  // el admin. Un useEffect aca solo agregaria un render de mas.
  const [bs, setBs] = useState(String(valores.bs));
  const [cop, setCop] = useState(String(valores.cop));

  if (!esAdmin) {
    return (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-border bg-surface px-5 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
          Comisiones vigentes
        </span>
        <span className="text-[15px] font-medium text-ink">
          Bs {valores.bs}%
        </span>
        <span className="text-[15px] font-medium text-ink">
          COP {valores.cop}%
        </span>
        <span className="text-[12.5px] text-ink-soft">
          — solo un administrador puede cambiarlas
        </span>
      </div>
    );
  }

  const sinCambios =
    bs.trim() === String(valores.bs) && cop.trim() === String(valores.cop);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-x-4 gap-y-3 rounded-2xl border border-border bg-surface px-5 py-3.5"
    >
      <span className="self-center font-mono text-[11px] uppercase tracking-widest text-ink-soft">
        Comisiones
      </span>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="comision_bs_pct"
          className="font-mono text-[10px] uppercase tracking-widest text-ink-soft"
        >
          Bs → USDT
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="comision_bs_pct"
            name="comision_bs_pct"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            value={bs}
            onChange={(e) => setBs(e.target.value)}
            className="h-9 w-24 rounded-[9px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <span className="text-sm text-ink-soft">%</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="comision_cop_pct"
          className="font-mono text-[10px] uppercase tracking-widest text-ink-soft"
        >
          COP → USDT
        </label>
        <div className="flex items-center gap-1.5">
          <input
            id="comision_cop_pct"
            name="comision_cop_pct"
            type="number"
            step="0.01"
            min={0}
            max={100}
            required
            value={cop}
            onChange={(e) => setCop(e.target.value)}
            className="h-9 w-24 rounded-[9px] border border-border bg-surface px-3 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <span className="text-sm text-ink-soft">%</span>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending || sinCambios}
        className="h-9 rounded-[9px] bg-ink px-3.5 text-[13.5px] font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40"
      >
        {pending ? "Guardando…" : "Guardar"}
      </button>

      {state.error ? (
        <span className="self-center text-[12.5px] text-critical">{state.error}</span>
      ) : state.ok && sinCambios ? (
        <span className="self-center text-[12.5px] text-teal">Guardado.</span>
      ) : (
        <span className="self-center text-[12.5px] text-ink-soft">
          Aplican a los cierres nuevos. Los ya registrados conservan el suyo.
        </span>
      )}
    </form>
  );
}
