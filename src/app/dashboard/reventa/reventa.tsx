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
  type MediosPorMoneda,
  type MonedaLista,
} from "@/lib/venta-publico";
import { Bandera } from "./iconos";
import ListadoWhatsApp from "./listado-whatsapp";
import { useTasaReferencia } from "./tasas";
import { fmt2 } from "./ui";

/**
 * Orden propio de Reventa: los revendedores cotizan primero en dólares,
 * después en pesos y por último en bolívares. Venta público sigue con el
 * suyo (ORDEN_MONEDAS).
 */
const ORDEN_REVENTA: MonedaLista[] = ["USD", "COP", "VES"];

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
  const [moneda, setMoneda] = useState<MonedaLista>(ORDEN_REVENTA[0]);

  const cop = useTasaReferencia("USD_COP");
  const ves = useTasaReferencia("VES_USDT");

  const proveedor = buscarProveedor(proveedorId) ?? PROVEEDORES[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div
          className="grid w-full grid-cols-3 gap-1 rounded-[12px] border border-border bg-surface-alt/60 p-1 sm:w-fit"
          role="group"
          aria-label="Moneda de la lista"
        >
          {ORDEN_REVENTA.map((m) => {
            const activa = m === moneda;
            return (
              <button
                key={m}
                type="button"
                aria-pressed={activa}
                onClick={() => setMoneda(m)}
                className={`flex items-center justify-center gap-2 rounded-[9px] px-4 py-2 text-[13px] transition ${
                  activa
                    ? "bg-ink font-medium text-[#F3F1EA] shadow-sm"
                    : "text-ink-soft hover:bg-surface hover:text-ink"
                }`}
              >
                <Bandera moneda={m} />
                {ETIQUETA_SECCION[m]}
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label="Proveedor"
          className="grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2 lg:grid-cols-4"
        >
          {PROVEEDORES.map((p) => {
            const activo = p.id === proveedor.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={activo}
                onClick={() => setProveedorId(p.id)}
                className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition ${
                  activo
                    ? "border-accent/50 bg-surface shadow-sm ring-1 ring-accent/30"
                    : "border-border bg-surface-alt/50 hover:bg-surface"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-9 w-9 flex-none items-center justify-center rounded-[10px] text-[16px] font-medium ${
                    activo ? "bg-accent text-[#F3F1EA]" : "bg-surface text-ink-soft ring-1 ring-border"
                  }`}
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {p.nombre.charAt(0)}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span
                    className={`truncate text-[14px] ${activo ? "font-medium text-ink" : "text-ink-soft"}`}
                  >
                    {p.nombre}
                  </span>
                  <span className="font-mono text-[10.5px] tabular-nums text-ink-soft">
                    costo desde {fmt2(desde(p))} c/u
                  </span>
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
