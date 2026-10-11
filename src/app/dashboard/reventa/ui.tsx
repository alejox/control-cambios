import type { ReactNode } from "react";

// Piezas chicas que comparten la lista, el listado y la calculadora.

export const CLASE_CONTROL =
  "h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[13.5px] text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal-soft aria-[invalid=true]:border-critical";

export const CLASE_ETIQUETA = "font-mono text-[10.5px] uppercase tracking-widest text-ink-soft";

const DOS = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PCT = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 1 });

/** 2 decimales, formato es-VE como el resto de la app. */
export function fmt2(valor: number) {
  return DOS.format(valor);
}

export function fmtPct(valor: number) {
  return `${PCT.format(valor)} %`;
}

export function Chip({
  tono,
  children,
}: {
  tono: "accent" | "teal";
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[9.5px] uppercase leading-tight tracking-wider ${
        tono === "accent"
          ? "bg-accent-soft text-[#8f5e1f]"
          : "bg-teal-soft text-[#215d4d]"
      }`}
    >
      {children}
    </span>
  );
}
