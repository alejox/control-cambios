"use client";

import { useActionState } from "react";
import {
  ETIQUETA_SECCION,
  NOMBRE_MONEDA,
  type MonedaLista,
} from "@/lib/venta-publico";
import { guardarMediosPago } from "../actions";
import { ESTADO_INICIAL } from "../estado";

// Lo que se espera en cada moneda, con las palabras de quien cobra. No es
// decoracion: un campo vacio sin ejemplo se llena con cualquier cosa, y lo
// que se escriba acá sale tal cual en el chat de un cliente.
const EJEMPLO: Record<MonedaLista, string> = {
  VES: "💳 *¿Por qué medio desea realizar el pago?*\n\n🏦 *Pago Móvil*",
  COP: "🏦 Métodos de pago disponibles\n\nNequi\n\nDaviplata",
  USD: "Medios de pago disponibles:\n\n🏦 Wise\n🏦 Binance",
};

/**
 * Los medios de cobro de una moneda.
 *
 * Cada moneda se guarda por su cuenta, con su propia acción. Un formulario
 * único para las tres obligaría a mandar todo para corregir una cuenta, y
 * un error en una dejaría las otras dos a medio guardar.
 */
export default function MediosPago({
  moneda,
  texto,
}: {
  moneda: MonedaLista;
  texto: string;
}) {
  const [state, formAction, pending] = useActionState(
    guardarMediosPago,
    ESTADO_INICIAL,
  );

  const vacio = !texto.trim();

  return (
    <form
      action={formAction}
      className={`flex flex-col gap-3 rounded-2xl border p-5 shadow-sm ${
        vacio ? "border-critical-soft bg-critical-soft/20" : "border-border bg-surface"
      }`}
    >
      <input type="hidden" name="moneda" value={moneda} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label
          htmlFor={`medios-${moneda}`}
          className="text-[15px] font-medium text-ink"
        >
          {ETIQUETA_SECCION[moneda]}
        </label>
        <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
          Cómo cobrás en {NOMBRE_MONEDA[moneda]}
        </span>
      </div>

      {vacio && (
        <p className="text-[12.5px] text-critical">
          Sin cargar: las listas en {NOMBRE_MONEDA[moneda]} salen sin decirle al
          cliente por dónde pagar.
        </p>
      )}

      <textarea
        id={`medios-${moneda}`}
        name="texto"
        rows={6}
        defaultValue={texto}
        placeholder={EJEMPLO[moneda]}
        className="rounded-[10px] border border-border bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed outline-none focus:border-accent focus:ring-1 focus:ring-accent"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[9px] bg-ink px-3.5 text-[13px] font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {state.error && (
          <span className="text-[12.5px] text-critical">{state.error}</span>
        )}
        {state.ok && <span className="text-[12.5px] text-teal">Guardado.</span>}
        <span className="text-[12.5px] text-ink-soft">
          Los emojis y los asteriscos van tal cual: WhatsApp los usa para dar
          formato.
        </span>
      </div>
    </form>
  );
}
