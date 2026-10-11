"use client";

import { useState } from "react";
import {
  buscarProveedor,
  mejorTramo,
  precioPorCredito,
  PROVEEDORES,
  type Proveedor,
} from "@/lib/reventa";
import {
  ETIQUETA_SECCION,
  ORDEN_MONEDAS,
  type MediosPorMoneda,
  type MonedaLista,
} from "@/lib/venta-publico";
import ListadoWhatsApp from "./listado-whatsapp";
import { useTasaReferencia } from "./tasas";
import { fmt2 } from "./ui";

/** El crédito más barato del proveedor, en cualquiera de sus variantes. */
function desde(proveedor: Proveedor) {
  return Math.min(...proveedor.variantes.map((v) => precioPorCredito(mejorTramo(v))));
}

/**
 * La sección entera, armada como Venta público: arriba la moneda y el
 * proveedor, y debajo el listado para WhatsApp de esa combinación.
 *
 * Las tasas de referencia se piden acá, una vez por par: el listado las usa
 * como punto de partida y cada moneda escribe la suya encima si quiere.
 */
export default function Reventa({ medios }: { medios: MediosPorMoneda }) {
  const [proveedorId, setProveedorId] = useState(PROVEEDORES[0].id);
  const [moneda, setMoneda] = useState<MonedaLista>(ORDEN_MONEDAS[0]);

  const cop = useTasaReferencia("USD_COP");
  const ves = useTasaReferencia("VES_USDT");

  const proveedor = buscarProveedor(proveedorId) ?? PROVEEDORES[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div
          className="flex w-fit items-center gap-0.5 rounded-[10px] border border-border bg-surface-alt/60 p-0.5"
          role="group"
          aria-label="Moneda de la lista"
        >
          {ORDEN_MONEDAS.map((m) => {
            const activa = m === moneda;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={activa}
                onClick={() => setMoneda(m)}
                className={`rounded-[8px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide transition ${
                  activa ? "bg-ink text-[#F3F1EA]" : "text-ink-soft hover:bg-surface"
                }`}
              >
                {ETIQUETA_SECCION[m]}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="Proveedor"
          className="grid grid-cols-2 gap-1 rounded-[12px] border border-border bg-surface-alt/60 p-1 sm:grid-cols-4"
        >
          {PROVEEDORES.map((p) => {
            const activo = p.id === proveedor.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={activo}
                onClick={() => setProveedorId(p.id)}
                className={`flex flex-col items-start gap-0.5 rounded-[9px] px-3.5 py-2 text-left transition ${
                  activo ? "bg-surface shadow-sm" : "hover:bg-surface/60"
                }`}
              >
                <span
                  className={`text-[14px] ${activo ? "font-medium text-ink" : "text-ink-soft"}`}
                >
                  {p.nombre}
                </span>
                <span className="font-mono text-[10.5px] tabular-nums text-ink-soft">
                  costo desde {fmt2(desde(p))} c/u
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ListadoWhatsApp
        proveedor={proveedor}
        moneda={moneda}
        medios={medios}
        tasas={{ VES: ves, COP: cop }}
      />
    </div>
  );
}
