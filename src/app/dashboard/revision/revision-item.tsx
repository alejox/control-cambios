"use client";

import { useActionState, useRef, useState } from "react";
import { confirmarRevision, type RevisionState } from "./actions";
import VisorComprobante, { type VisorHandle } from "../visor-comprobante";
import DepositoFila from "./deposito-fila";
import { calcularComision, formatFecha, formatMonto, type Item, type Moneda } from "@/lib/items";

export type DepositoRevision = {
  id: string;
  referencia: string | null;
  fecha: string;
  valor_origen: number;
  comprobante_path: string | null;
  comprobante_texto: string | null;
  /** USDT fijado en la revision para ESTE deposito. null = va el proporcional. */
  usdt: number | null;
  aprobado_at: string | null;
};

/**
 * Una tarjeta por movimiento pendiente. Se ve de donde sale el numero
 * —- cuanto entro, a que tasa —- y puede pisar el total en USDT antes de
 * confirmar, porque la conversion real no siempre da exacto.
 */
export default function RevisionItem({
  item,
  depositos,
  comisionPct,
}: {
  item: Item;
  depositos: DepositoRevision[];
  comisionPct: number;
}) {
  // Un movimiento sin depositos no tiene checkboxes que tildar, asi que se
  // confirma entero. Sin esa rama quedaria pendiente para siempre y la
  // campanita lo mostraria sin que nadie pueda sacarlo. La decision la toma
  // la accion por dentro: pasarle una accion DISTINTA segun el caso rompia
  // el identificador que React manda en el formulario.
  const hayDepositos = depositos.length > 0;
  const [state, formAction, pending] = useActionState<RevisionState, FormData>(
    confirmarRevision,
    { error: null, ok: false },
  );

  // El tilde es estado local, no del servidor: asi responde al instante.
  // Los ya aprobados arrancan tildados porque eso es lo que son.
  const [seleccion, setSeleccion] = useState<Set<string>>(
    () => new Set(depositos.filter((d) => d.aprobado_at !== null).map((d) => d.id)),
  );

  function tildar(id: string, tildado: boolean) {
    setSeleccion((s) => {
      const copia = new Set(s);
      if (tildado) copia.add(id);
      else copia.delete(id);
      return copia;
    });
  }

  const visorRef = useRef<VisorHandle>(null);
  const moneda = item.moneda_origen as Moneda;
  const totalOrigen = depositos.reduce((acc, d) => acc + Number(d.valor_origen), 0);
  const aprobados = depositos.filter((d) => d.aprobado_at !== null).length;

  // Lo que le toca a un deposito si nadie lo ajusta: su parte del total
  // actual segun cuanto entro. Es el mismo reparto que hace la base.
  function proporcionalDe(d: DepositoRevision) {
    if (totalOrigen <= 0) return 0;
    return Math.round((Number(item.usdt_total) * Number(d.valor_origen) * 100) / totalOrigen) / 100;
  }

  // Vista previa de la comision con el valor que se esta escribiendo.
  // Sin input de movimiento, la vista previa muestra la comision del total
  // vigente. Al aprobar comprobantes, el total lo recalcula la base.
  const comision = calcularComision(Number(item.usdt_total), comisionPct);

  const contenido = (
    <>
      <input type="hidden" name="item_id" value={item.id} />

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="font-mono text-[13px] text-ink-soft">#{item.numero}</span>
          <span
            className="text-[17px] font-medium text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {formatMonto(item.usdt_total, "USDT")}
          </span>
          <span className="text-[12.5px] text-ink-soft">{formatFecha(item.fecha)}</span>
        </div>
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-accent">
          {item.tipo_flujo === "bs_a_usdt" ? "Bs → USDT" : "COP → USDT"}
        </span>
      </div>

      <div className="rounded-[10px] bg-surface-alt/50 px-4 py-3 text-[12.5px] text-ink-soft">
        Entraron <span className="font-medium text-ink">{formatMonto(totalOrigen, moneda)}</span>
        {item.tasa ? (
          <>
            {" "}a tasa <span className="font-medium text-ink">{formatMonto(item.tasa, moneda)}</span>
          </>
        ) : null}
        {depositos.length > 1 ? ` en ${depositos.length} depósitos` : ""}.
        {item.usdt_original !== null && (
          <>
            {" "}Ya se ajustó antes: venía de{" "}
            <span className="font-medium text-ink">
              {formatMonto(item.usdt_original, "USDT")}
            </span>
            .
          </>
        )}
      </div>

      {depositos.length > 0 && (
        <div className="rounded-[10px] border border-border px-4 py-3">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <p className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
              {depositos.length === 1 ? "Comprobante" : `${depositos.length} comprobantes`}
            </p>
            <p className="text-[11.5px] text-ink-soft">
              {aprobados} de {depositos.length} aprobados
            </p>
          </div>
          <div className="grid grid-cols-[0.7fr_0.85fr_1.3fr_1fr_0.9fr_0.85fr_1.1fr] gap-3 border-b border-border pb-2 font-mono text-[10px] uppercase tracking-widest text-ink-soft">
            <span className="text-center">Ok</span>
            <span>Fecha</span>
            <span>Referencia</span>
            <span className="text-right">Recibido</span>
            <span className="text-right">Tasa</span>
            <span className="text-right">USDT</span>
            <span className="text-right">Comprobante</span>
          </div>
          <div className="flex flex-col divide-y divide-border">
            {depositos.map((d) => (
              <DepositoFila
                key={d.id}
                deposito={d}
                moneda={moneda}
                tasa={item.tasa}
                proporcional={proporcionalDe(d)}
                tildado={seleccion.has(d.id)}
                onTildar={(t) => tildar(d.id, t)}
                visorRef={visorRef}
              />
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12.5px] text-ink-soft">
          Comisión {comisionPct}%:{" "}
          <span className="font-medium text-ink">{formatMonto(comision, "USDT")}</span>
          {aprobados > 0 && aprobados < depositos.length && (
            <span className="text-accent">
              {" "}· {depositos.length - aprobados} sin aprobar
            </span>
          )}
        </p>

        <div className="flex items-center gap-3">
          {state.error && <span className="text-[12.5px] text-critical">{state.error}</span>}
          <button
            type="submit"
            disabled={pending || (hayDepositos && seleccion.size === 0)}
            title={
              seleccion.size === 0
                ? "Tildá los comprobantes que están correctos"
                : undefined
            }
            className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending
              ? "Guardando…"
              : hayDepositos
                ? `Confirmar ${seleccion.size} de ${depositos.length}`
                : "Confirmar movimiento"}
          </button>
        </div>
      </div>
      <VisorComprobante ref={visorRef} />
    </>
  );

  const clases =
    "flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm";

  // Un solo <form> para toda la tarjeta: las filas de comprobante ya no
  // traen el suyo, asi que no hay formularios anidados.
  return (
    <form action={formAction} className={clases}>
      {contenido}
    </form>
  );
}
