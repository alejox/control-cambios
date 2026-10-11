"use client";

import {
  ahorroPct,
  mejorTramo,
  iniciosDePanel,
  precioPorCredito,
  precioReferencia,
  type Proveedor,
  type Variante,
} from "@/lib/reventa";
import { SUELTO_INICIAL, type Cantidad } from "./seleccion";
import { Chip, fmt2, fmtPct } from "./ui";

/**
 * La lista de un proveedor para una variante: un tramo por fila.
 *
 * Las columnas se acomodan por el ancho de la TARJETA (container query) y
 * no por el de la pantalla: en escritorio la tarjeta comparte fila con la
 * calculadora y a veces con la otra variante, y ahí mide lo mismo que en
 * un teléfono.
 */
export default function TarjetaVariante({
  proveedor,
  variante,
  elegida,
  onElegir,
}: {
  proveedor: Proveedor;
  variante: Variante;
  /** La cantidad elegida si esta variante es la de la calculadora. */
  elegida: Cantidad | null;
  onElegir: (cantidad: Cantidad) => void;
}) {
  const referencia = precioReferencia(variante);
  const mejor = mejorTramo(variante);
  const etiqueta = variante.nombre;

  // El panel se marca en la fila donde EMPIEZA, no en todas: siete filas
  // con la misma etiqueta repetida no dicen nada; el salto sí.
  // Es la misma regla que usa el listado para WhatsApp.
  const inicioPanel = iniciosDePanel(proveedor, variante);

  const sueltoElegido = elegida?.tipo === "suelto";

  return (
    <article className="@container flex min-w-0 flex-col rounded-2xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 px-5 pb-4 pt-5">
        <div className="min-w-0">
          <h2
            className="text-[21px] font-medium leading-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {proveedor.nombre}
          </h2>
          {etiqueta && (
            <p className="mt-1 text-[13.5px] font-medium text-ink">
              {etiqueta}
              {variante.alcance && (
                <span className="font-normal text-ink-soft"> · {variante.alcance}</span>
              )}
            </p>
          )}
          {variante.equipos && (
            <p className="mt-0.5 text-[12.5px] text-ink-soft">{variante.equipos}</p>
          )}
        </div>

        <div className="text-right">
          <p className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
            Desde
          </p>
          <p
            className="text-[19px] font-medium tabular-nums leading-tight text-teal"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {fmt2(precioPorCredito(mejor))}
          </p>
          <p className="text-[11.5px] text-ink-soft">USDT por crédito</p>
        </div>
      </header>

      {variante.suelto && (
        <div className="px-5 pb-4">
          <button
            type="button"
            aria-pressed={sueltoElegido}
            onClick={() => onElegir({ tipo: "suelto", texto: SUELTO_INICIAL })}
            className={`flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-[10px] border px-3.5 py-2.5 text-left transition ${
              sueltoElegido
                ? "border-accent bg-accent-soft/70"
                : "border-accent-soft bg-accent-soft/35 hover:bg-accent-soft/60"
            }`}
          >
            <span className="flex flex-col">
              <span className="font-mono text-[10.5px] uppercase tracking-widest text-[#8f5e1f]">
                Recarga suelta
              </span>
              <span className="text-[12.5px] text-ink-soft">
                De {variante.suelto.min} a {variante.suelto.max} créditos, al precio por unidad
              </span>
            </span>
            <span className="text-[15px] font-medium tabular-nums text-ink">
              {fmt2(variante.suelto.precioUsdt)}{" "}
              <span className="text-[12px] font-normal text-ink-soft">USDT c/u</span>
            </span>
          </button>
        </div>
      )}

      <div>
        <div
          aria-hidden
          className="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_3.25rem] items-end gap-x-3 border-y border-border bg-surface-alt/50 px-5 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-soft @md:grid-cols-[minmax(0,1fr)_5.5rem_4rem_minmax(3rem,6rem)_3.5rem]"
        >
          <span>Créditos</span>
          <span className="text-right">
            Total
          </span>
          <span className="text-right">
            C/u
          </span>
          <span className="hidden @md:block" />
          <span className="text-right">
            Ahorro
          </span>
        </div>

        <div className="flex flex-col p-1.5">
          {variante.tramos.map((t) => {
            const pc = precioPorCredito(t);
            const ahorro = ahorroPct(variante, t);
            const ancho = `${Math.max(6, (pc / referencia) * 100)}%`;
            const esMejor = t.creditos === mejor.creditos;
            const panel = inicioPanel.get(t.creditos) ?? null;
            const activo = elegida?.tipo === "tramo" && elegida.creditos === t.creditos;

            return (
              <button
                key={t.creditos}
                type="button"
                aria-pressed={activo}
                aria-label={`${t.creditos} créditos, ${fmt2(t.totalUsdt)} USDT, ${fmt2(pc)} por crédito${
                  ahorro > 0 ? `, ${fmtPct(ahorro)} de ahorro` : ""
                }${panel ? `, ${panel}` : ""}${esMejor ? ", mejor precio" : ""}`}
                onClick={() => onElegir({ tipo: "tramo", creditos: t.creditos })}
                title="Llevar a la calculadora"
                className={`grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem_3.25rem] items-center gap-x-3 gap-y-2 rounded-[10px] px-3.5 py-2.5 text-left transition @md:grid-cols-[minmax(0,1fr)_5.5rem_4rem_minmax(3rem,6rem)_3.5rem] ${
                  activo
                    ? "bg-teal-soft/60 ring-1 ring-teal/40"
                    : "hover:bg-surface-alt/70"
                }`}
              >
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className="text-[17px] font-medium tabular-nums leading-none text-ink"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {t.creditos.toLocaleString("es-VE")}
                  </span>
                  {panel && <Chip tono="accent">{panel}</Chip>}
                  {esMejor && <Chip tono="teal">Mejor precio</Chip>}
                </span>
                <span className="text-right text-[14px] font-medium tabular-nums text-ink">
                  {fmt2(t.totalUsdt)}
                </span>
                <span className="text-right text-[13px] tabular-nums text-ink-soft">
                  {fmt2(pc)}
                </span>
                {/* La barra mide el precio por crédito contra el más caro
                    de la variante: más corta, más barato. El descuento por
                    volumen se lee de un vistazo, sin comparar decimales. */}
                <span aria-hidden className="hidden h-1.5 rounded-full bg-surface-alt @md:block">
                  <span
                    className={`block h-full rounded-full ${esMejor ? "bg-teal" : "bg-teal/45"}`}
                    style={{ width: ancho }}
                  />
                </span>
                <span
                 
                  className={`text-right text-[12.5px] tabular-nums ${
                    ahorro > 0 ? "font-medium text-teal" : "text-ink-soft/70"
                  }`}
                >
                  {ahorro > 0 ? `−${fmtPct(ahorro)}` : "—"}
                </span>
                {/* En la tarjeta angosta la barra baja a su propia línea. */}
                <span
                  aria-hidden
                  className="col-span-4 h-1 rounded-full bg-surface-alt @md:hidden"
                >
                  <span
                    className={`block h-full rounded-full ${esMejor ? "bg-teal" : "bg-teal/45"}`}
                    style={{ width: ancho }}
                  />
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="mt-auto border-t border-border px-5 py-3 text-[11.5px] leading-relaxed text-ink-soft">
        Totales en USDT. El precio por crédito sale del total, y el ahorro se
        mide contra {variante.suelto ? "la recarga suelta" : "el crédito más caro de la lista"}.
      </p>
    </article>
  );
}
