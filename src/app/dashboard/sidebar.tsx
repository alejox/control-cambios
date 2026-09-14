"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type Entrada = {
  href: string;
  etiqueta: string;
  icono: ReactNode;
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

const IconoUsuarios = (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
    <circle cx="6.2" cy="5.4" r="2.4" stroke="currentColor" strokeWidth="1.3" />
    <path d="M1.8 13.4c0-2.2 2-3.6 4.4-3.6s4.4 1.4 4.4 3.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    <path d="M11.2 3.4a2.1 2.1 0 0 1 0 4M12.4 9.9c1.2.4 2 1.4 2 2.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
);

const ENTRADAS: Entrada[] = [
  { href: "/dashboard", etiqueta: "Panel", icono: IconoPanel, exacta: true },
  { href: "/dashboard/revision", etiqueta: "Por revisar", icono: IconoRevision },
  { href: "/dashboard/liquidaciones", etiqueta: "Liquidaciones", icono: IconoLiquidaciones },
  { href: "/dashboard/usuarios", etiqueta: "Usuarios", icono: IconoUsuarios, soloAdmin: true },
];

export default function Sidebar({ esAdmin }: { esAdmin: boolean }) {
  const pathname = usePathname();
  const visibles = ENTRADAS.filter((e) => !e.soloAdmin || esAdmin);

  function activa(e: Entrada) {
    // "Panel" solo con coincidencia exacta: si no, cualquier ruta que
    // empiece con /dashboard la dejaria marcada para siempre.
    return e.exacta ? pathname === e.href : pathname.startsWith(e.href);
  }

  return (
    <nav aria-label="Navegación principal" className="flex flex-col gap-1">
      {visibles.map((e) => {
        const esta = activa(e);
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
