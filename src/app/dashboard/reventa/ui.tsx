// Piezas chicas que comparten el listado, el margen y las tasas.

export const CLASE_CONTROL =
  "h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[13.5px] text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal-soft aria-[invalid=true]:border-critical";

export const CLASE_ETIQUETA = "font-mono text-[10.5px] uppercase tracking-widest text-ink-soft";

const DOS = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 2 decimales, formato es-VE como el resto de la app. */
export function fmt2(valor: number) {
  return DOS.format(valor);
}
