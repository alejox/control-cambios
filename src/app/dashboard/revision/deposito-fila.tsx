"use client";

import { formatFecha, formatMonto, type Moneda } from "@/lib/items";
import { tieneComprobante, type VisorHandle } from "../visor-comprobante";
import type { DepositoRevision } from "./revision-item";

/**
 * Una fila por comprobante. NO es un formulario: el <form> es uno solo, el
 * de la tarjeta del movimiento, y todas las filas escriben adentro.
 *
 * El tilde es estado local del padre y no del servidor. Atado al servidor
 * volvia a su valor anterior apenas se lo clickeaba —- hasta que volviera la
 * respuesta —- y daba la sensacion de que habia que insistir varias veces.
 */
export default function DepositoFila({
  deposito,
  moneda,
  tasa,
  proporcional,
  tildado,
  onTildar,
  visorRef,
}: {
  deposito: DepositoRevision;
  moneda: Moneda;
  /** La tasa del movimiento: es la misma para todos sus depositos. */
  tasa: number | null;
  /** Lo que le tocaria si no se le escribe un monto propio. */
  proporcional: number;
  tildado: boolean;
  onTildar: (tildado: boolean) => void;
  visorRef: React.RefObject<VisorHandle | null>;
}) {
  const aprobado = deposito.aprobado_at !== null;
  const titulo = deposito.referencia
    ? `Referencia ${deposito.referencia}`
    : `Depósito del ${deposito.fecha}`;

  return (
    <div className="flex flex-col gap-2.5 py-3 text-[12.5px] xl:grid xl:grid-cols-[0.7fr_0.85fr_1.3fr_1fr_0.9fr_0.85fr_1.1fr] xl:items-center xl:gap-3 xl:py-2.5">
      <div className="flex items-center justify-between gap-3 xl:justify-center">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft xl:hidden">Estado</span>
        <label
          className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-1 transition ${
            tildado
              ? "border-teal bg-teal-soft/50 text-[#215d4d]"
              : "border-border text-ink-soft hover:bg-surface-alt"
          }`}
          title={aprobado ? "Ya aprobado — destildalo para dejarlo como estaba" : "Marcar como correcto"}
        >
          <input
            type="checkbox"
            name="seleccion"
            value={deposito.id}
            checked={tildado}
            onChange={(e) => onTildar(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#2f7f6c]"
          />
          <span className="font-mono text-[10.5px] uppercase tracking-wide">
            {aprobado ? "ok" : "va"}
          </span>
        </label>
      </div>

      <div className="flex items-baseline justify-between gap-3 xl:block">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft xl:hidden">Fecha</span>
        <span className="text-ink-soft">{formatFecha(deposito.fecha)}</span>
      </div>

      <div className="flex min-w-0 items-baseline justify-between gap-3 xl:block">
        <span className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-ink-soft xl:hidden">Referencia</span>
        <span className="min-w-0 break-words font-mono text-[12px] text-ink-soft xl:block xl:truncate">
          {deposito.referencia ?? "sin referencia"}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3 xl:block xl:text-right">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft xl:hidden">Recibido</span>
        <span className="text-ink-soft">{formatMonto(deposito.valor_origen, moneda)}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 xl:block xl:text-right">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft xl:hidden">Tasa</span>
        <span className="text-ink-soft">{tasa ? formatMonto(tasa, moneda) : "—"}</span>
      </div>

      <div className="flex items-center justify-between gap-3 xl:justify-end">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft xl:hidden">USDT</span>
        <input
          // El nombre lleva el id adentro: los no tildados no mandan su
          // checkbox, asi que por indice las posiciones no coincidirian.
          name={`usdt_${deposito.id}`}
          type="number"
          step="0.01"
          min={0}
          defaultValue={deposito.usdt !== null ? String(deposito.usdt) : ""}
          placeholder={String(proporcional)}
          aria-label={`USDT de ${titulo}`}
          title={`Vacío, cuenta como ${proporcional} USDT`}
          className="h-8 w-20 rounded-[8px] border border-border bg-surface px-2 text-right text-[12.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex items-baseline justify-between gap-3 xl:block xl:text-right">
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-soft xl:hidden">Comprobante</span>
        {tieneComprobante({
          path: deposito.comprobante_path,
          texto: deposito.comprobante_texto,
        }) ? (
          <button
            type="button"
            onClick={() =>
              visorRef.current?.abrir({
                path: deposito.comprobante_path,
                texto: deposito.comprobante_texto,
                titulo,
              })
            }
            className="text-accent transition hover:underline"
          >
            {deposito.comprobante_path ? "Ver comprobante" : "Ver texto"}
          </button>
        ) : (
          <span className="text-ink-soft/60">sin comprobante</span>
        )}
      </div>
    </div>
  );
}
