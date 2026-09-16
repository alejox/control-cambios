"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Entrada = {
  href: string;
  etiqueta: string;
  icono: ReactNode;
  /** Para la barra de abajo, donde cada casilla mide unos 65px. */
  corta: string;
  soloAdmin?: boolean;
  /** Solo se marca activa con coincidencia exacta. */
  exacta?: boolean;
};

const IconoPanel = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
    <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
    <rect x="1.5" y="9" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
    <rect x="9" y="9" width="5.5" height="5.5" rx="1.4" stroke="currentColor" strokeWidth="1.3" />
  </svg>
);

const IconoLiquidaciones = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <rect x="2.5" y="1.8" width="11" height="12.4" rx="1.6" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5.4 5.6h5.2M5.4 8h5.2M5.4 10.4h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const IconoRevision = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M8 1.8a3.7 3.7 0 0 0-3.7 3.7c0 3.2-1.2 4.2-1.2 4.2h9.8s-1.2-1-1.2-4.2A3.7 3.7 0 0 0 8 1.8Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <path d="M6.6 12.2a1.6 1.6 0 0 0 2.8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const IconoVenta = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <path
      d="M7.6 1.9h5.4a1.1 1.1 0 0 1 1.1 1.1v5.4a1.3 1.3 0 0 1-.38.92l-4.8 4.8a1.1 1.1 0 0 1-1.56 0L2.28 8.64a1.1 1.1 0 0 1 0-1.56l4.8-4.8a1.3 1.3 0 0 1 .52-.38Z"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    />
    <circle cx="11" cy="5" r="1.05" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

const IconoPaneles = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="5.4" cy="8" r="2.7" stroke="currentColor" strokeWidth="1.3" />
    <path
      d="M8.1 8h5.4M11.4 8v2M13.1 8v1.6"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </svg>
);

const IconoUsuarios = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="6.2" cy="5.4" r="2.4" stroke="currentColor" strokeWidth="1.3" />
    <path d="M1.8 13.4c0-2.2 2-3.6 4.4-3.6s4.4 1.4 4.4 3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M11.2 3.4a2.1 2.1 0 0 1 0 4M12.4 9.9c1.2.4 2 1.4 2 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const ENTRADAS: Entrada[] = [
  { href: "/dashboard", etiqueta: "Panel", corta: "Panel", icono: IconoPanel, exacta: true },
  { href: "/dashboard/revision", etiqueta: "Por revisar", corta: "Revisar", icono: IconoRevision },
  { href: "/dashboard/liquidaciones", etiqueta: "Liquidaciones", corta: "Cortes", icono: IconoLiquidaciones },
  // Sin soloAdmin: la lista de precios la ven los dos roles. Editarla es
  // otra cosa, y eso lo corta RLS en la base.
  { href: "/dashboard/venta-publico", etiqueta: "Venta público", corta: "Venta", icono: IconoVenta },
  // Sin soloAdmin: cada uno guarda los suyos y no ve los del otro. Eso no
  // lo decide el menú, lo corta RLS en la tabla.
  { href: "/dashboard/paneles", etiqueta: "Mis paneles", corta: "Paneles", icono: IconoPaneles },
  { href: "/dashboard/usuarios", etiqueta: "Usuarios", corta: "Usuarios", icono: IconoUsuarios, soloAdmin: true },
];

/**
 * "Panel" solo con coincidencia exacta: si no, cualquier ruta que empiece
 * con /dashboard la dejaria marcada para siempre.
 *
 * Vive afuera del componente porque la usan los dos menus, y dos copias de
 * esta regla se desincronizan el dia que alguien toca una sola.
 */
function activa(e: Entrada, pathname: string) {
  return e.exacta ? pathname === e.href : pathname.startsWith(e.href);
}

export default function Sidebar({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();
  const visibles = ENTRADAS.filter((e) => !e.soloAdmin || esAdmin);

  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1">
      {visibles.map((e) => {
        const esta = activa(e, pathname);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={esta ? "page" : undefined}
            title={e.etiqueta}
            className={`flex items-center justify-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] transition md:justify-start ${
              esta
                ? "bg-[#2a3127] font-medium text-[#F3F1EA]"
                : "text-[#A9AE9F] hover:bg-[#252c22] hover:text-[#F3F1EA]"
            }`}
          >
            <span className={esta ? "text-[#D99A46]" : "text-[#7C8375]"}>{e.icono}</span>
            {/* En pantallas chicas la barra queda como riel de iconos: el
                title y el aria-label siguen nombrando cada opcion. */}
            <span className="hidden md:inline">{e.etiqueta}</span>
            <span className="sr-only md:hidden">{e.etiqueta}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * El mismo menú, en el borde de abajo, solo en pantallas chicas.
 *
 * Abajo y no arriba porque es donde llega el pulgar sin reacomodar la
 * mano: en un teléfono la esquina superior izquierda es el punto más
 * lejano que existe.
 *
 * Panel va al MEDIO y no primero: es la pantalla a la que más se vuelve,
 * y el centro es el único lugar que se alcanza con cualquiera de los dos
 * pulgares. Los extremos quedan para lo que se visita de vez en cuando.
 */
export function MenuInferior({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();
  const visibles = ENTRADAS.filter((e) => !e.soloAdmin || esAdmin);

  // Se saca Panel de la lista y se lo vuelve a meter en el medio de las
  // demás. Con un número par de entradas no existe un centro exacto, así
  // que queda medio lugar corrido; es lo más cerca que se puede estar sin
  // inventar una casilla vacía para emparejar.
  const panel = visibles.find((e) => e.exacta);
  const resto = visibles.filter((e) => e !== panel);
  const mitad = Math.floor(resto.length / 2);
  const ordenadas = panel
    ? [...resto.slice(0, mitad), panel, ...resto.slice(mitad)]
    : visibles;

  return (
    <nav
      aria-label="Navegación principal"
      // pb con safe-area: en un iPhone la franja del gesto de inicio se
      // come el borde de abajo, y sin esto la fila de iconos queda
      // debajo de la barra del sistema.
      className="fixed inset-x-0 bottom-0 z-40 flex border-t border-[#3A4237] bg-ink pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {ordenadas.map((e) => {
        const esta = activa(e, pathname);
        return (
          <Link
            key={e.href}
            href={e.href}
            aria-current={esta ? "page" : undefined}
            className={`flex min-w-0 flex-1 flex-col items-center gap-1 px-1 pb-2 pt-2.5 transition ${
              esta ? "text-[#D99A46]" : "text-[#7C8375]"
            }`}
          >
            {/* La marca de activo va ARRIBA del icono y no de fondo: con
                casillas de 65px un fondo redondeado se ve como un botón
                apretado, y encima tapa el icono. */}
            <span
              aria-hidden
              className={`h-0.5 w-6 rounded-full transition ${
                esta ? "bg-[#D99A46]" : "bg-transparent"
              }`}
            />
            {e.icono}
            <span className="w-full truncate text-center text-[9.5px] leading-tight">
              {e.corta}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
