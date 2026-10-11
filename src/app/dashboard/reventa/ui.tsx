import type { ReactNode } from "react";

// Piezas chicas que comparten la lista y la calculadora.

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
