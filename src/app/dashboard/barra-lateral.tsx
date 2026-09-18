"use client";

import Link from "next/link";
import { useState } from "react";
import {
  COOKIE_SIDEBAR,
  COOKIE_SIDEBAR_DURACION,
  COOKIE_SIDEBAR_NO,
  COOKIE_SIDEBAR_SI,
} from "@/lib/sidebar";
import Marca from "../marca";
import Sidebar from "./sidebar";

/**
 * Apunta a donde va a IR la barra, no a donde esta: colapsada senala a la
 * derecha (abrir), abierta a la izquierda (cerrar). Es la misma flecha
 * rotada, asi que el giro acompana al movimiento.
 */
const Flecha = ({ colapsado }: { colapsado: boolean }) => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
    className={`flex-none transition-transform duration-200 ${colapsado ? "" : "rotate-180"}`}
  >
    <path
      d="M6.2 4.2 10 8l-3.8 3.8"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M2.6 2.8v10.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
);

/**
 * La barra lateral de /dashboard, con su estado de colapsada.
 *
 * Es cliente y el layout no, a proposito: lo unico que necesita interactuar
 * es esto. El layout sigue siendo servidor, lee la cookie y manda el valor
 * inicial ya resuelto, asi que la barra se pinta del ancho correcto desde
 * el primer byte del HTML y no salta al hidratar.
 *
 * Solo existe de `md` para arriba. En un telefono no hay nada que colapsar:
 * ahi la barra no se muestra y el menu vive abajo (`MenuInferior`).
 */
export default function BarraLateral({
  colapsadoInicial,
  esAdmin,
  puedeVer,
  email,
  role,
}: {
  colapsadoInicial: boolean;
  esAdmin: boolean;
  puedeVer: boolean;
  email: string | undefined;
  role: string;
}) {
  const [colapsado, setColapsado] = useState(colapsadoInicial);

  function alternar() {
    const siguiente = !colapsado;
    setColapsado(siguiente);
    // Se escribe a mano y no con una server action: el estado ya lo tiene
    // React, el servidor no necesita enterarse AHORA. La cookie es solo
    // para la proxima carga, y un viaje al servidor por cada click seria
    // pagar una peticion para no cambiar nada en pantalla.
    document.cookie = `${COOKIE_SIDEBAR}=${
      siguiente ? COOKIE_SIDEBAR_SI : COOKIE_SIDEBAR_NO
    }; path=/; max-age=${COOKIE_SIDEBAR_DURACION}; samesite=lax`;
  }

  const etiquetaBoton = colapsado ? "Expandir el menú" : "Colapsar el menú";

  return (
    // sticky y no fixed: sticky sigue ocupando su lugar en el flex, asi que
    // el contenido se acomoda solo. Con fixed habria que compensar con un
    // margen izquierdo igual al ancho, y como el ancho ahora CAMBIA, ese
    // margen habria que animarlo en paralelo y mantenerlo sincronizado.
    //
    // h-screen en vez de estirarse con la pagina: asi el bloque del usuario,
    // que va con mt-auto, queda pegado al borde de LA PANTALLA y no al final
    // de un documento que puede medir tres pantallas. overflow-y-auto por si
    // algun dia hay mas entradas que alto.
    <aside
      className={`sticky top-0 hidden h-screen flex-none flex-col gap-6 overflow-y-auto overflow-x-hidden bg-ink py-5 transition-[width] duration-200 md:flex ${
        colapsado ? "w-16 px-2.5" : "w-60 px-4"
      }`}
    >
      <Link
        href="/dashboard"
        className={`flex items-center gap-2.5 ${colapsado ? "justify-center" : "justify-start"}`}
        title="Control de Cambios"
      >
        <Marca tamano={22} className="flex-none" />
        {!colapsado && (
          <span className="truncate font-mono text-[12px] uppercase tracking-widest text-[#D99A46]">
            Control de Cambios
          </span>
        )}
      </Link>

      {puedeVer && <Sidebar esAdmin={esAdmin} colapsado={colapsado} />}

      <div className="mt-auto flex flex-col gap-2 border-t border-[#3A4237] pt-4">
        {/* El boton va aca abajo y no arriba junto al logo: arriba compite
            por los 64px de la barra colapsada, y el logo es lo unico que
            tiene que seguir siendo reconocible en ese ancho. */}
        <button
          type="button"
          onClick={alternar}
          title={etiquetaBoton}
          aria-label={etiquetaBoton}
          aria-expanded={!colapsado}
          className={`flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13.5px] text-[#A9AE9F] transition hover:bg-[#252c22] hover:text-[#F3F1EA] ${
            colapsado ? "justify-center" : "justify-start"
          }`}
        >
          <Flecha colapsado={colapsado} />
          {!colapsado && <span className="truncate">Colapsar</span>}
        </button>

        {/* Colapsada no se muestran: un correo no entra en 64px, y truncado
            a dos letras no informa nada. El rol tampoco. */}
        {!colapsado && (
          <>
            <span className="truncate text-[12.5px] text-[#A9AE9F]" title={email}>
              {email}
            </span>
            <span className="font-mono text-[10.5px] uppercase tracking-widest text-[#7C8375]">
              {role.replace("_", " ")}
            </span>
          </>
        )}
      </div>
    </aside>
  );
}
