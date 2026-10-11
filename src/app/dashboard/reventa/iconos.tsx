import type { ReactNode } from "react";
import type { MonedaLista } from "@/lib/venta-publico";

// Íconos de la sección, dibujados como los del menú lateral: 16×16, trazo
// de 1.3 y currentColor, para que tomen el color del texto que acompañan.
// Las banderas son la excepción: sus colores son el dato.

type Props = { className?: string };

function Svg({ className, children }: Props & { children: ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className={className}
    >
      {children}
    </svg>
  );
}

export function IconoPorcentaje({ className }: Props) {
  return (
    <Svg className={className}>
      <path d="M12.6 3.4 3.4 12.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="4.6" cy="4.6" r="1.8" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.4" cy="11.4" r="1.8" stroke="currentColor" strokeWidth="1.3" />
    </Svg>
  );
}

export function IconoCambio({ className }: Props) {
  return (
    <Svg className={className}>
      <path
        d="M2.4 5.4h10.4l-2.6-2.6M13.6 10.6H3.2l2.6 2.6"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconoCobro({ className }: Props) {
  return (
    <Svg className={className}>
      <rect x="1.8" y="3.6" width="12.4" height="8.8" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.8 6.6h12.4M4.4 9.8h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </Svg>
  );
}

export function IconoCopiar({ className }: Props) {
  return (
    <Svg className={className}>
      <rect x="5.2" y="5.2" width="8.6" height="8.6" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10.8 5.2V3.6a1.4 1.4 0 0 0-1.4-1.4H3.6a1.4 1.4 0 0 0-1.4 1.4v5.8a1.4 1.4 0 0 0 1.4 1.4h1.6"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </Svg>
  );
}

export function IconoListo({ className }: Props) {
  return (
    <Svg className={className}>
      <path d="m3 8.4 3.1 3.1L13 4.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** El doble check de "entregado" en la burbuja. */
export function IconoDobleCheck({ className }: Props) {
  return (
    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" aria-hidden className={className}>
      <path d="m1 6 3 3 6-7.5M7.2 8.4 8 9l6-7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Globo de chat con el auricular: se lee como WhatsApp sin usar la marca. */
export function IconoWhatsApp({ className }: Props) {
  return (
    <Svg className={className}>
      <path
        d="M8 1.9a6.1 6.1 0 0 0-5.3 9.1l-.9 3.1 3.2-.8A6.1 6.1 0 1 0 8 1.9Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M6 5.3c.2-.3.6-.3.8 0l.5 1c.1.2 0 .5-.1.7l-.3.3c.4.8 1 1.4 1.8 1.8l.3-.3c.2-.2.5-.2.7-.1l1 .5c.3.2.3.6 0 .8-.5.5-1.2.7-1.9.4A5.4 5.4 0 0 1 5.6 7.2c-.3-.7-.1-1.4.4-1.9Z"
        fill="currentColor"
      />
    </Svg>
  );
}

export function IconoRefrescar({ className }: Props) {
  return (
    <Svg className={className}>
      <path
        d="M13.2 6.4A5.4 5.4 0 0 0 3.3 5M2.8 9.6a5.4 5.4 0 0 0 9.9 1.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path d="M3 2.4V5h2.6M13 13.6V11h-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Bandera chica de la moneda. Sin estrellas ni escudo: a 18px no se ven. */
export function Bandera({ moneda, className = "" }: { moneda: MonedaLista; className?: string }) {
  return (
    <svg
      width="18"
      height="12"
      viewBox="0 0 18 12"
      aria-hidden
      className={`flex-none overflow-hidden rounded-[2.5px] ring-1 ring-black/10 ${className}`}
    >
      {moneda === "USD" ? (
        <>
          <rect width="18" height="12" fill="#fff" />
          {[0, 2, 4, 6, 8, 10].map((y) => (
            <rect key={y} y={y} width="18" height="1" fill="#B22234" />
          ))}
          <rect width="8" height="6" fill="#3C3B6E" />
        </>
      ) : moneda === "COP" ? (
        <>
          <rect width="18" height="6" fill="#FCD116" />
          <rect y="6" width="18" height="3" fill="#003893" />
          <rect y="9" width="18" height="3" fill="#CE1126" />
        </>
      ) : (
        <>
          <rect width="18" height="4" fill="#FCE300" />
          <rect y="4" width="18" height="4" fill="#003DA5" />
          <rect y="8" width="18" height="4" fill="#EF3340" />
        </>
      )}
    </svg>
  );
}
