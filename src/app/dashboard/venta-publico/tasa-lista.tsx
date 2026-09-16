"use client";

import { useActionState, useEffect, useState } from "react";
import {
  formatMargen,
  formatTasa,
  margenSobreReferencia,
  necesitaTasa,
  NOMBRE_MONEDA,
  type Lista,
} from "@/lib/venta-publico";
import { calcularConReferencia } from "./actions";
import { ESTADO_INICIAL } from "./estado";

// A partir de acá la tasa de referencia deja de ser "la de recién" y se
// avisa. Media hora es generoso para el P2P y suficientemente corto para
// que nadie mande a la tarde una lista calculada a la mañana.
const MINUTOS_PARA_AVISAR = 30;

/**
 * La tasa de venta de esta lista: cuánto vale el dólar acá adentro.
 *
 * No es la tasa de referencia: es la referencia más el margen del
 * usuario, que es su negocio. Por eso se muestran las dos y la distancia
 * entre ellas —- ajustar un precio a ojo sin ver el margen es adivinar.
 *
 * Cuál es la referencia depende de la moneda —- P2P de Binance en
 * bolívares, TRM oficial en pesos -— y por eso el nombre se lee de la
 * lista en vez de escribirse acá.
 */
export default function TasaLista({ lista }: { lista: Lista }) {
  const [state, formAction, pending] = useActionState(
    calcularConReferencia,
    ESTADO_INICIAL,
  );

  const minutosReferencia = useMinutosDesde(lista.tasaReferenciaAt);
  const fuente = lista.tasaFuente ?? "la referencia";

  if (!necesitaTasa(lista.moneda)) {
    return (
      <p className="rounded-[10px] border border-border bg-surface-alt/50 px-4 py-3 text-[13px] text-ink-soft">
        Esta lista ya está en dólares: los precios se muestran tal cual y no hay
        nada que convertir.
      </p>
    );
  }

  const margen = margenSobreReferencia(lista);
  const vieja =
    minutosReferencia !== null && minutosReferencia >= MINUTOS_PARA_AVISAR;
  const ajustada = lista.tasaOrigen === "ajuste";

  const boton = (
    <form action={formAction}>
      <input type="hidden" name="lista_id" value={lista.id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          // Calcular pisa el ajuste manual, y con él el margen que
          // alguien decidió. Que no se pierda sin avisar.
          if (!ajustada || lista.tasa === null) return;
          const resumen = `${formatTasa(lista.tasa, lista.moneda)}${
            margen === null ? "" : ` (${formatMargen(margen)} sobre ${fuente})`
          }`;
          if (
            !confirm(
              `Esta lista tiene una tasa ajustada a mano: ${resumen}. Calcular la reemplaza por ${fuente}. ¿Seguir?`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40"
      >
        {pending
          ? "Calculando…"
          : lista.tasa === null
            ? "Calcular con la tasa de referencia"
            : "Calcular de nuevo"}
      </button>
    </form>
  );

  if (lista.tasa === null) {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border bg-surface-alt/50 px-4 py-3">
          <p className="text-[13px] text-ink-soft">
            Esta lista todavía no tiene tasa de venta, así que no hay precios
            en {NOMBRE_MONEDA[lista.moneda]} que mostrar ni mensaje que copiar.
          </p>
          {boton}
        </div>
        {state.error && <Error texto={state.error} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[10px] border px-4 py-3 ${
          vieja
            ? "border-critical-soft bg-critical-soft/40"
            : "border-teal-soft bg-teal-soft/40"
        }`}
      >
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
              Tasa de venta
            </span>
            <strong className="text-[17px] font-medium text-ink">
              {formatTasa(lista.tasa, lista.moneda)}
            </strong>
            {margen !== null && (
              <span className="text-[13px] text-ink-soft">
                {formatMargen(margen)} sobre {fuente}
              </span>
            )}
          </div>

          {/* La hora de la consulta no es adorno: un precio calculado con
              una tasa de hace tres horas es un precio viejo disfrazado de
              nuevo, y en pantalla no se distingue de uno recién hecho. */}
          <p className="text-[12.5px] text-ink-soft" suppressHydrationWarning>
            {ajustada ? "Ajustada a mano" : `Traída de ${fuente}`}
            {lista.tasaReferencia !== null && (
              <>
                {` · ${fuente} `}
                {formatTasa(lista.tasaReferencia, lista.moneda)}
                {lista.tasaDetalle ? ` (${lista.tasaDetalle})` : ""}
                {minutosReferencia === null
                  ? ""
                  : `, consultado ${antiguedad(minutosReferencia)}`}
              </>
            )}
          </p>

          {vieja && (
            <p className="text-[12.5px] font-medium text-critical">
              {fuente === "la referencia" ? "La referencia" : fuente} ya tiene
              rato: calculá de nuevo antes de mandar la lista.
            </p>
          )}
        </div>

        {boton}
      </div>

      {state.error && <Error texto={state.error} />}
    </div>
  );
}

function Error({ texto }: { texto: string }) {
  return (
    <p className="rounded-[10px] border border-critical-soft bg-critical-soft/40 px-4 py-3 text-[13px] text-critical">
      {texto}
    </p>
  );
}

function antiguedad(minutos: number) {
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    return resto === 0 ? `hace ${horas} h` : `hace ${horas} h ${resto} min`;
  }
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "hace 1 día" : `hace ${dias} días`;
}

/**
 * Minutos transcurridos desde un instante, refrescados solos.
 *
 * Sin el intervalo, el cartel se quedaría con la antigüedad del primer
 * render y diría "recién" para siempre, que es justo la mentira que hay
 * que evitar: un precio calculado con una tasa de hace tres horas es un
 * precio viejo disfrazado de nuevo.
 */
function useMinutosDesde(iso: string | null) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!iso) return null;
  return Math.max(0, Math.floor((ahora - new Date(iso).getTime()) / 60_000));
}
