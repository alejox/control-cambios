"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { ActionState } from "./actions";
import type { Deposito, TipoFlujo } from "@/lib/items";

type FilaDeposito = {
  key: number;
  referencia: string;
  fecha: string;
  valor: string;
};

function filaVacia(key: number): FilaDeposito {
  return { key, referencia: "", fecha: "", valor: "" };
}

export default function ItemForm({
  action,
  siguienteNumero,
  initial,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  siguienteNumero: number;
  initial?: {
    numero: number;
    tipo_flujo: TipoFlujo;
    tasa: number | null;
    usdt_total: number;
    detalle: string | null;
    fecha: string | null;
    depositos: Deposito[];
  };
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {
    error: null,
  });

  const [tipoFlujo, setTipoFlujo] = useState<TipoFlujo>(
    initial?.tipo_flujo ?? "bs_a_usdt",
  );
  const [filas, setFilas] = useState<FilaDeposito[]>(() => {
    if (initial && initial.depositos.length > 0) {
      return initial.depositos.map((d, i) => ({
        key: i,
        referencia: d.referencia ?? "",
        fecha: d.fecha,
        valor: String(d.valor_origen),
      }));
    }
    return [filaVacia(0)];
  });
  let nextKey = filas.length > 0 ? Math.max(...filas.map((f) => f.key)) + 1 : 0;

  const esBs = tipoFlujo === "bs_a_usdt";

  return (
    <form action={formAction} className="flex flex-col gap-7">
      <div className="grid grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-ink-soft">Número de item</label>
          <input
            name="numero"
            type="number"
            required
            min={1}
            defaultValue={initial?.numero ?? siguienteNumero}
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-ink-soft">Fecha</label>
          <input
            name="fecha"
            type="date"
            defaultValue={initial?.fecha ?? new Date().toISOString().slice(0, 10)}
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-ink-soft">Tipo de flujo</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setTipoFlujo("bs_a_usdt")}
            className={`rounded-[10px] border px-4 py-3 text-left text-sm transition ${
              esBs
                ? "border-accent bg-accent-soft/50 text-ink"
                : "border-border bg-surface text-ink-soft hover:bg-surface-alt"
            }`}
          >
            <div className="font-mono text-[11px] uppercase tracking-widest text-accent">Bs → USDT</div>
            <div className="mt-1 text-[13.5px]">Recibimos Bs y Carlos convierte a USDT</div>
          </button>
          <button
            type="button"
            onClick={() => setTipoFlujo("cop_a_usdt")}
            className={`rounded-[10px] border px-4 py-3 text-left text-sm transition ${
              !esBs
                ? "border-teal bg-teal-soft/50 text-ink"
                : "border-border bg-surface text-ink-soft hover:bg-surface-alt"
            }`}
          >
            <div className="font-mono text-[11px] uppercase tracking-widest text-teal">COP → USDT</div>
            <div className="mt-1 text-[13.5px]">Recibimos COP, convertimos y queda a favor de Carlos</div>
          </button>
        </div>
        <input type="hidden" name="tipo_flujo" value={tipoFlujo} />
      </div>

      <div className="grid grid-cols-2 gap-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-ink-soft">
            Tasa {esBs ? "(Bs por USDT)" : "(opcional)"}
          </label>
          <input
            name="tasa"
            type="number"
            step="0.0001"
            min={0}
            defaultValue={initial?.tasa ?? ""}
            placeholder="Opcional"
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-ink-soft">Total USDT</label>
          <input
            name="usdt_total"
            type="number"
            step="0.01"
            min={0}
            required
            defaultValue={initial?.usdt_total ?? ""}
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-ink-soft">Detalle (opcional)</label>
        <textarea
          name="detalle"
          rows={2}
          defaultValue={initial?.detalle ?? ""}
          placeholder="Alguna nota sobre este cierre…"
          className="rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-[13px] font-medium text-ink-soft">
            Depósitos {esBs ? "(en Bs)" : "(en COP)"}
          </label>
          <button
            type="button"
            onClick={() => setFilas((f) => [...f, filaVacia(nextKey)])}
            className="rounded-lg border border-border px-2.5 py-1 text-xs text-ink-soft transition hover:bg-surface-alt"
          >
            + Agregar depósito
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {filas.map((fila, idx) => (
            <div key={fila.key} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2.5">
              <input
                name="deposito_referencia"
                placeholder="Referencia (opcional)"
                defaultValue={fila.referencia}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <input
                name="deposito_fecha"
                type="date"
                defaultValue={fila.fecha}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <input
                name="deposito_valor"
                type="number"
                step="0.01"
                placeholder="Valor"
                defaultValue={fila.valor}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                onClick={() => setFilas((f) => f.filter((_, i) => i !== idx))}
                className="h-10 rounded-[9px] border border-border px-3 text-[13.5px] text-ink-soft transition hover:bg-critical-soft hover:text-critical"
                aria-label="Quitar depósito"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>

      {state.error && <p className="text-sm text-critical">{state.error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-[10px] bg-ink px-6 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Link
          href="/dashboard"
          className="text-sm text-ink-soft transition hover:text-ink"
        >
          Cancelar
        </Link>
      </div>
    </form>
  );
}
