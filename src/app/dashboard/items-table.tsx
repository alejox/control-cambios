"use client";

import Link from "next/link";
import { Fragment, useRef, useState } from "react";
import DeleteButton from "./items/delete-button";
import VisorComprobante, { type VisorHandle } from "./visor-comprobante";
import {
  ETIQUETA_FLUJO,
  formatFecha,
  formatMonto,
  repartir,
  type Item,
} from "@/lib/items";

export type DepositoFila = {
  id: string;
  item_id: string;
  referencia: string | null;
  fecha: string;
  valor_origen: number;
  comprobante_path: string | null;
  comprobante_texto: string | null;
  /** USDT fijado al aprobar. null = todavia va su parte proporcional. */
  usdt: number | null;
  aprobado_at: string | null;
};

function normalizar(texto: string | null | undefined) {
  return (texto ?? "").replace(/\s+/g, "").toLowerCase();
}

/**
 * Parte una referencia en lo que va antes del match, el match y lo que va
 * despues, para poder pintar solo el pedazo que se busco.
 */
function partirPorBusqueda(texto: string, busca: string) {
  if (busca === "") return null;
  const i = texto.toLowerCase().indexOf(busca);
  if (i === -1) return null;
  return {
    antes: texto.slice(0, i),
    match: texto.slice(i, i + busca.length),
    despues: texto.slice(i + busca.length),
  };
}

/** Un deposito esta respaldado tanto por un archivo como por el texto pegado. */
function tieneComprobante(d: DepositoFila) {
  return Boolean(d.comprobante_path || d.comprobante_texto);
}

/**
 * Tabla de movimientos, compartida por el panel y el detalle de una
 * liquidacion.
 *
 * La columna "Comprobante" muestra SOLO la cantidad: con varios depositos,
 * una fila de chips numerados se vuelve ilegible. Al hacer clic se despliega
 * una fila con cada deposito y desde ahi se abre el comprobante.
 *
 * El visor del comprobante es UNO solo para toda la tabla, no uno por fila,
 * y vive en su propio componente porque lo comparte con el panel de
 * revision.
 */
export default function ItemsTable({
  items,
  depositos,
  esAdmin,
  vacio,
}: {
  items: Item[];
  depositos: DepositoFila[];
  esAdmin: boolean;
  vacio: React.ReactNode;
}) {
  const visorRef = useRef<VisorHandle>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [buscaRef, setBuscaRef] = useState("");

  const porItem = new Map<string, DepositoFila[]>();
  for (const d of depositos) {
    const lista = porItem.get(d.item_id) ?? [];
    lista.push(d);
    porItem.set(d.item_id, lista);
  }

  // Se filtra en el cliente y no en la base a proposito: los movimientos
  // pendientes son pocos y ya estan todos en memoria. Ir al servidor por
  // cada tecla agregaria latencia sin ganar nada.
  const refBuscada = normalizar(buscaRef);

  function coincideFecha(item: Item, filas: DepositoFila[]) {
    if (!desde && !hasta) return true;
    // Entra si la fecha del movimiento cae en el rango, o la de cualquiera
    // de sus depositos: un cierre del 14 puede tener depositos del 10.
    const fechas = [item.fecha, ...filas.map((d) => d.fecha)].filter(Boolean) as string[];
    return fechas.some((f) => (!desde || f >= desde) && (!hasta || f <= hasta));
  }

  function coincideRef(filas: DepositoFila[]) {
    if (refBuscada === "") return true;
    return filas.some((d) => normalizar(d.referencia).includes(refBuscada));
  }

  // Los filtros aparecen recien cuando hay algo que filtrar. Sobre cuatro
  // filas que se leen de un vistazo, la barra es ruido: ocupa lugar y
  // sugiere un trabajo que nadie necesita hacer.
  const MINIMO_PARA_FILTRAR = 6;
  const conFiltros = items.length >= MINIMO_PARA_FILTRAR;
  const hayFiltro = conFiltros && Boolean(desde || hasta || refBuscada);
  const visibles = conFiltros
    ? items.filter((item) => {
        const filas = porItem.get(item.id) ?? [];
        return coincideFecha(item, filas) && coincideRef(filas);
      })
    : items;

  // Solo para la fila de "sin resultados": el resto de la tabla no usa
  // colSpan, justamente para que las columnas alineen.
  const totalColumnas = esAdmin ? 12 : 11;

  // Un deposito se resalta si cumple TODOS los filtros activos, no solo
  // alguno: si se busca una referencia dentro de un rango de fechas, el que
  // se marca es el que satisface las dos cosas.
  function depositoCoincide(d: DepositoFila) {
    if (!conFiltros || !hayFiltro) return false;
    if (refBuscada !== "" && !normalizar(d.referencia).includes(refBuscada)) return false;
    if (desde && d.fecha < desde) return false;
    if (hasta && d.fecha > hasta) return false;
    return true;
  }

  function limpiar() {
    setDesde("");
    setHasta("");
    setBuscaRef("");
  }

  function abrirComprobante(d: DepositoFila) {
    visorRef.current?.abrir({
      path: d.comprobante_path,
      texto: d.comprobante_texto,
      titulo: d.referencia ? `Referencia ${d.referencia}` : `Depósito del ${d.fecha}`,
    });
  }


  if (items.length === 0) {
    return <div className="p-10 text-center text-[14.5px] text-ink-soft">{vacio}</div>;
  }

  return (
    <>
      {conFiltros && (
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-border bg-surface-alt/40 px-5 py-3.5">
        <div className="flex flex-col gap-1">
          <label htmlFor="f-desde" className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            Desde
          </label>
          <input
            id="f-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="h-9 rounded-[9px] border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="f-hasta" className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            Hasta
          </label>
          <input
            id="f-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="h-9 rounded-[9px] border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex min-w-[12rem] flex-1 flex-col gap-1">
          <label htmlFor="f-ref" className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            Referencia
          </label>
          <input
            id="f-ref"
            type="search"
            value={buscaRef}
            onChange={(e) => setBuscaRef(e.target.value)}
            placeholder="Buscar por referencia…"
            className="h-9 rounded-[9px] border border-border bg-surface px-3 text-[13px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        {hayFiltro && (
          <div className="flex items-center gap-3 pb-0.5">
            <span className="text-[12.5px] text-ink-soft">
              {visibles.length} de {items.length}
            </span>
            <button
              type="button"
              onClick={limpiar}
              className="h-9 rounded-[9px] border border-border px-3 text-[13px] text-ink-soft transition hover:bg-surface"
            >
              Limpiar
            </button>
          </div>
        )}
      </div>
      )}

      {/* El contenedor de afuera usa overflow-hidden por las esquinas
          redondeadas, asi que en pantallas angostas RECORTA en vez de
          desplazar. El min-w fuerza el scroll horizontal antes de que las
          columnas se aplasten. */}
      <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] text-left text-[13.5px]">
        <thead>
          <tr className="border-b border-border bg-surface-alt/60 text-[11px] uppercase tracking-wide text-ink-soft">
            <th className="px-5 py-3 font-medium">#</th>
            <th className="px-5 py-3 font-medium">Fecha</th>
            <th className="px-5 py-3 font-medium">Flujo</th>
            <th className="px-5 py-3 font-medium">Recibido</th>
            <th className="px-5 py-3 font-medium">Tasa</th>
            <th className="px-5 py-3 font-medium">USDT</th>
            <th className="px-5 py-3 font-medium">Comisión</th>
            <th className="px-5 py-3 font-medium">Estado</th>
            <th className="px-5 py-3 font-medium">Referencia</th>
            <th className="px-5 py-3 font-medium">Comprobantes</th>
            {esAdmin && <th className="px-5 py-3 font-medium"></th>}
            <th className="px-5 py-3 font-medium"></th>
          </tr>
        </thead>
        <tbody>
          {visibles.length === 0 && (
            <tr>
              <td
                colSpan={totalColumnas}
                className="px-5 py-10 text-center text-[14px] text-ink-soft"
              >
                Ningún movimiento coincide con el filtro.
              </td>
            </tr>
          )}

          {visibles.map((item) => {
            const filas = porItem.get(item.id) ?? [];
            const conComprobante = filas.filter(tieneComprobante);
            const totalOrigen = filas.reduce((acc, d) => acc + Number(d.valor_origen), 0);
            const referencias = filas.map((d) => d.referencia).filter(Boolean) as string[];

            // Lo que aporta cada deposito: su USDT fijado si ya se aprobo, y
            // si no, su parte del total segun cuanto entro. Es el mismo
            // reparto que hace la base al aprobar.
            const usdtDe = (d: DepositoFila) =>
              d.usdt !== null
                ? Number(d.usdt)
                : totalOrigen > 0
                  ? Math.round((Number(item.usdt_total) * Number(d.valor_origen) * 100) / totalOrigen) / 100
                  : 0;

            // La comision de cada deposito NO se calcula por separado: se
            // REPARTE la del movimiento. Calculada una por una, la suma de
            // los hijos puede diferir en centavos de la del padre, y una
            // tabla donde el detalle no suma el total no sirve para nada.
            const comisiones = repartir(Number(item.comision), filas.map(usdtDe));
            const coincidePorRef =
              refBuscada !== "" &&
              filas.some((d) => normalizar(d.referencia).includes(refBuscada));
            // Si la busqueda encontro la referencia en un deposito, la fila
            // se abre sola: si no, el usuario ve que el movimiento coincide
            // pero no cual de sus comprobantes fue.
            const expandida = abierto === item.id || coincidePorRef;

            return (
              <Fragment key={item.id}>
              <tr className="border-b border-border last:border-0">
                <td className="px-5 py-3 font-mono text-ink-soft">{item.numero}</td>
                <td className="px-5 py-3 text-ink-soft">{formatFecha(item.fecha)}</td>
                <td className="px-5 py-3">
                  <span
                    className={`whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide ${
                      item.tipo_flujo === "bs_a_usdt"
                        ? "bg-accent-soft text-[#8f5e1f]"
                        : "bg-teal-soft text-[#215d4d]"
                    }`}
                  >
                    {ETIQUETA_FLUJO[item.tipo_flujo]}
                  </span>
                </td>
                <td className="px-5 py-3 text-ink-soft">
                  {formatMonto(totalOrigen, item.moneda_origen)}
                </td>
                <td className="px-5 py-3 text-ink-soft">
                  {item.tasa ? formatMonto(item.tasa, item.moneda_origen) : "—"}
                </td>
                <td className="px-5 py-3 font-medium text-ink">
                  {formatMonto(item.usdt_total, "USDT")}
                </td>
                <td className="px-5 py-3 text-ink-soft">
                  {formatMonto(item.comision, "USDT")}
                </td>
                <td className="px-5 py-3">
                  {item.revisado_at === null ? (
                    <span
                      title="Esperando que la contraparte lo revise"
                      className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-[#8f5e1f]"
                    >
                      En revisión
                    </span>
                  ) : (
                    <span
                      title={item.nota_revision ?? "Revisado y aprobado"}
                      className="whitespace-nowrap rounded-full bg-teal-soft px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-[#215d4d]"
                    >
                      Aprobado
                    </span>
                  )}
                </td>
                <td
                  className="px-5 py-3 font-mono text-[12px] text-ink-soft"
                  title={referencias.length > 1 ? referencias.join("  ·  ") : undefined}
                >
                  {referencias.length === 0
                    ? "—"
                    : referencias.length === 1
                      ? referencias[0]
                      : "varias"}
                </td>
                <td className="px-5 py-3">
                  {filas.length === 0 ? (
                    <span className="text-ink-soft">—</span>
                  ) : (
                    <span
                      title={`${filas.length} depósito${filas.length === 1 ? "" : "s"}, ${conComprobante.length} con comprobante`}
                      className="font-mono text-ink-soft"
                    >
                      {conComprobante.length}
                    </span>
                  )}
                </td>
                {esAdmin && (
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/dashboard/items/${item.id}/edit`}
                        className="text-[13px] text-accent hover:underline"
                      >
                        Editar
                      </Link>
                      <DeleteButton itemId={item.id} numero={item.numero} />
                    </div>
                  </td>
                )}
                <td className="px-5 py-3 text-right">
                  {filas.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAbierto(expandida ? null : item.id)}
                      aria-expanded={expandida}
                      aria-label={expandida ? "Ocultar depósitos" : "Ver depósitos"}
                      title={expandida ? "Ocultar depósitos" : "Ver depósitos"}
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[10px] transition ${
                        expandida
                          ? "border-accent bg-accent-soft/50 text-[#8f5e1f]"
                          : "border-border text-ink-soft hover:bg-surface-alt hover:text-ink"
                      }`}
                    >
                      <span className={`transition-transform ${expandida ? "rotate-180" : ""}`}>
                        ▼
                      </span>
                    </button>
                  )}
                </td>
              </tr>

              {/* Los depositos son FILAS de la misma tabla, no una grilla
                  aparte: asi cada columna cae exactamente debajo de la del
                  padre sin tener que adivinar anchos. */}
              {expandida &&
                filas.map((d, i) => (
                  <tr
                    key={d.id}
                    className={`border-b border-border text-[12.5px] ${
                      depositoCoincide(d)
                        ? "bg-accent-soft/60"
                        : "bg-surface-alt/50"
                    }`}
                  >
                    <td className="py-2 pl-5 pr-0">
                      <span
                        className={`block h-4 w-px ${
                          depositoCoincide(d) ? "bg-accent" : "bg-border"
                        }`}
                        aria-hidden
                      />
                    </td>
                    <td className="px-5 py-2 text-ink-soft">{formatFecha(d.fecha)}</td>
                    <td className="px-5 py-2" />
                    <td className="px-5 py-2 text-ink-soft">
                      {formatMonto(d.valor_origen, item.moneda_origen)}
                    </td>
                    <td className="px-5 py-2 text-ink-soft">
                      {item.tasa ? formatMonto(item.tasa, item.moneda_origen) : "—"}
                    </td>
                    <td
                      className="px-5 py-2 font-medium text-ink"
                      title={d.usdt === null ? "Proporcional: todavía no se aprobó" : undefined}
                    >
                      {formatMonto(usdtDe(d), "USDT")}
                      {d.usdt === null && <span className="text-ink-soft">*</span>}
                    </td>
                    <td className="px-5 py-2 text-ink-soft">
                      {formatMonto(comisiones[i] ?? 0, "USDT")}
                    </td>
                    <td className="px-5 py-2">
                      {d.aprobado_at === null ? (
                        <span className="whitespace-nowrap rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#8f5e1f]">
                          Pendiente
                        </span>
                      ) : (
                        <span className="whitespace-nowrap rounded-full bg-teal-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[#215d4d]">
                          Aprobado
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 font-mono text-[12px] text-ink-soft">
                      {(() => {
                        if (!d.referencia) return "sin referencia";
                        const partes = partirPorBusqueda(d.referencia, refBuscada);
                        if (!partes) return d.referencia;
                        return (
                          <>
                            {partes.antes}
                            <mark className="rounded bg-accent/30 px-0.5 text-ink">
                              {partes.match}
                            </mark>
                            {partes.despues}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-2">
                      {tieneComprobante(d) ? (
                        <button
                          type="button"
                          onClick={() => abrirComprobante(d)}
                          className="text-accent transition hover:underline"
                        >
                          {d.comprobante_path ? "Ver comprobante" : "Ver texto"}
                        </button>
                      ) : (
                        <span className="text-ink-soft/60">sin comprobante</span>
                      )}
                    </td>
                    {esAdmin && <td className="px-5 py-2" />}
                    <td className="px-5 py-2" />
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      </div>

      <VisorComprobante ref={visorRef} />
    </>
  );
}
