"use client";

import { useRef, useState } from "react";
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
import Calculadora from "./calculadora";
import ListadoWhatsApp from "./listado-whatsapp";
import {
  conProveedor,
  conVariante,
  seleccionInicial,
  type Cantidad,
  type Seleccion,
} from "./seleccion";
import TarjetaVariante from "./tarjeta-variante";
import { useTasaReferencia } from "./tasas";
import { fmt2 } from "./ui";

/** El crédito más barato del proveedor, en cualquiera de sus variantes. */
function desde(proveedor: Proveedor) {
  return Math.min(...proveedor.variantes.map((v) => precioPorCredito(mejorTramo(v))));
}

/**
 * La sección entera, armada como Venta público: arriba la moneda y el
 * proveedor, y el listado para WhatsApp como lo principal. Debajo, de
 * consulta, la lista mayorista en USDT y la calculadora.
 *
 * El proveedor es UN solo estado para todo: si el listado, la lista y la
 * calculadora pudieran mirar proveedores distintos, el número copiado no
 * sería el de la pantalla.
 *
 * Las tasas de referencia se piden acá, una vez: el listado y la
 * calculadora las usan como punto de partida y cada uno escribe la suya
 * encima si quiere.
 */
export default function Reventa({ medios }: { medios: MediosPorMoneda }) {
  const [sel, setSel] = useState<Seleccion>(seleccionInicial);
  const [moneda, setMoneda] = useState<MonedaLista>(ORDEN_MONEDAS[0]);
  const calculadoraRef = useRef<HTMLElement>(null);

  const cop = useTasaReferencia("USD_COP");
  const ves = useTasaReferencia("VES_USDT");

  const proveedor = buscarProveedor(sel.proveedorId) ?? PROVEEDORES[0];
  const varias = proveedor.variantes.length > 1;

  function elegirTramo(varianteId: string, cantidad: Cantidad) {
    setSel((s) => ({ ...conVariante(s, varianteId), cantidad }));
    // En el teléfono la calculadora queda debajo de las listas: sin esto,
    // tocar un paquete no tendría ningún efecto visible.
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      calculadoraRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

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
                onClick={() => setSel((s) => conProveedor(s, p.id))}
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

      <div className="mt-4 flex flex-col gap-1 border-t border-border pt-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
          De consulta
        </p>
        <h2
          className="text-[19px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Lo que cobra el proveedor
        </h2>
        <p className="max-w-2xl text-[13px] leading-relaxed text-ink-soft">
          La lista mayorista en USDT, sin margen. Tocá un paquete para cotizarlo
          suelto en la calculadora.
        </p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <section className="flex min-w-0 flex-col gap-5" aria-label="Lista mayorista">
          <div className={`grid gap-5 ${varias ? "2xl:grid-cols-2" : ""}`}>
            {proveedor.variantes.map((v) => (
              <TarjetaVariante
                key={`${proveedor.id}-${v.id}`}
                proveedor={proveedor}
                variante={v}
                elegida={v.id === sel.varianteId ? sel.cantidad : null}
                onElegir={(cantidad) => elegirTramo(v.id, cantidad)}
              />
            ))}
          </div>

          {proveedor.notas.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface-alt/40 px-5 py-4">
              <p className="mb-2 font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
                Condiciones de {proveedor.nombre}
              </p>
              <ul className="flex flex-col gap-1.5">
                {proveedor.notas.map((nota) => (
                  <li key={nota} className="flex items-baseline gap-2.5 text-[13px] text-ink">
                    <span
                      aria-hidden
                      className="h-1 w-1 flex-none translate-y-[-2px] rounded-full bg-accent"
                    />
                    {nota}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <aside
          ref={calculadoraRef}
          aria-label="Calculadora de reventa"
          className="scroll-mt-4 lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto lg:rounded-2xl"
        >
          <Calculadora sel={sel} onCambiar={setSel} cop={cop} ves={ves} />
        </aside>
      </div>
    </div>
  );
}
