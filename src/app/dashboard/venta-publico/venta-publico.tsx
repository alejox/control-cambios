"use client";

import { useState } from "react";
import {
  ETIQUETA_SECCION,
  ORDEN_MONEDAS,
  avisosDeLista,
  type Lista,
  type MonedaLista,
} from "@/lib/venta-publico";
import ListaProveedor from "./lista-proveedor";

/**
 * Las secciones por moneda y, adentro, una solapa por proveedor.
 *
 * Qué secciones existen sale de los datos: hoy hay listas en Bs y en USD.
 * El día que haya en pesos aparece sola, sin tocar nada de acá.
 */
export default function VentaPublico({ listas }: { listas: Lista[] }) {
  const secciones = ORDEN_MONEDAS.map((moneda) => ({
    moneda,
    listas: listas.filter((l) => l.moneda === moneda),
  })).filter((s) => s.listas.length > 0);

  const [moneda, setMoneda] = useState<MonedaLista>(secciones[0].moneda);
  const [slug, setSlug] = useState(secciones[0].listas[0].slug);

  const seccion = secciones.find((s) => s.moneda === moneda) ?? secciones[0];
  const lista = seccion.listas.find((l) => l.slug === slug) ?? seccion.listas[0];

  function cambiarMoneda(nueva: MonedaLista) {
    const destino = secciones.find((s) => s.moneda === nueva);
    if (!destino) return;
    setMoneda(nueva);
    // El mismo proveedor si también tiene lista en esa moneda; si no, el
    // primero. Cambiar de moneda no debería hacerte perder de vista el
    // proveedor que estabas mirando.
    const mismo = destino.listas.find((l) => l.slug === slug);
    setSlug((mismo ?? destino.listas[0]).slug);
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className="flex w-fit items-center gap-0.5 rounded-[10px] border border-border bg-surface-alt/60 p-0.5"
        role="group"
        aria-label="Moneda de la lista"
      >
        {secciones.map((s) => {
          const activa = s.moneda === moneda;
          return (
            <button
              key={s.moneda}
              type="button"
              aria-pressed={activa}
              onClick={() => cambiarMoneda(s.moneda)}
              className={`rounded-[8px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${
                activa ? "bg-ink text-[#F3F1EA]" : "text-ink-soft hover:bg-surface"
              }`}
            >
              {ETIQUETA_SECCION[s.moneda]}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-wrap items-center gap-1 rounded-[10px] border border-border bg-surface-alt/60 p-1"
        role="group"
        aria-label="Proveedor"
      >
        {seccion.listas.map((l) => {
          const activa = l.slug === lista.slug;
          const avisos = avisosDeLista(l).length;
          return (
            <button
              key={l.id}
              type="button"
              aria-pressed={activa}
              onClick={() => setSlug(l.slug)}
              className={`flex items-center gap-1.5 rounded-[8px] px-3.5 py-1.5 text-[13.5px] transition ${
                activa
                  ? "bg-surface font-medium text-ink shadow-sm"
                  : "text-ink-soft hover:text-ink"
              }`}
            >
              {l.proveedor}
              {avisos > 0 && (
                <>
                  {/* Un punto en la solapa: los avisos importan antes de
                      entrar, no cuando ya estás mirando la lista. */}
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 flex-none rounded-full bg-critical"
                  />
                  <span className="sr-only">
                    ({avisos === 1 ? "1 aviso" : `${avisos} avisos`})
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <ListaProveedor key={lista.id} lista={lista} />
    </div>
  );
}
