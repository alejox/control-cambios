"use client";

import { IconoPorcentaje } from "./iconos";
import { leerNumero } from "./tasas";
import { CLASE_CONTROL, CLASE_ETIQUETA } from "./ui";

const PRESETS = [0, 10, 20, 30];
export const MARGEN_MAX = 300;

/**
 * El margen escrito, leído: `leido` es lo que dice el campo (null si no
 * es un número) y `margen` el que se usa, acotado de 0 a {MARGEN_MAX}.
 */
export function leerMargen(texto: string) {
  const leido = leerNumero(texto);
  const margen = leido === null ? null : Math.min(MARGEN_MAX, Math.max(0, leido));
  return { leido, margen };
}

/** Márgenes frecuentes a un toque y un campo libre (acepta decimales). */
export default function ControlMargen({
  id,
  etiqueta = "Margen",
  texto,
  onTexto,
}: {
  id: string;
  etiqueta?: string;
  texto: string;
  onTexto: (texto: string) => void;
}) {
  const { leido: margenLeido, margen } = leerMargen(texto);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={`${CLASE_ETIQUETA} flex items-center gap-1.5`}>
        <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-accent-soft text-[#8f5e1f]">
          <IconoPorcentaje className="h-3 w-3" />
        </span>
        {etiqueta}
      </label>
      <div className="flex items-center gap-2">
        <div
          role="group"
          aria-label="Márgenes frecuentes"
          className="flex flex-none items-center gap-0.5 rounded-[10px] border border-border bg-surface-alt/60 p-0.5"
        >
          {PRESETS.map((p) => {
            const activo = margen === p && margenLeido === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={activo}
                onClick={() => onTexto(String(p))}
                className={`rounded-[8px] px-2.5 py-1.5 font-mono text-[11.5px] tabular-nums transition ${
                  activo ? "bg-ink text-[#F3F1EA]" : "text-ink-soft hover:bg-surface"
                }`}
              >
                {p}%
              </button>
            );
          })}
        </div>
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            aria-invalid={margenLeido === null}
            className={`${CLASE_CONTROL} pr-8 text-right tabular-nums`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">
            %
          </span>
        </div>
      </div>
      {margenLeido === null ? (
        <p className="text-[12px] text-critical">Escribí el margen como número, por ejemplo 20 o 12,5.</p>
      ) : margenLeido !== margen ? (
        <p className="text-[12px] text-ink-soft">
          Se usa {margen} %: el margen va de 0 a {MARGEN_MAX} %.
        </p>
      ) : null}
    </div>

  );
}
