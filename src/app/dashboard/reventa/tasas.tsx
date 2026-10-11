"use client";

import { useEffect, useState } from "react";
import type { FuenteTasa, RespuestaReferencia } from "@/app/api/tasa-referencia/route";
import { formatMargen } from "@/lib/venta-publico";
import { IconoCambio, IconoRefrescar } from "./iconos";
import { CLASE_CONTROL, fmt2 } from "./ui";

// Las tasas de referencia de la sección: las piden una sola vez arriba de
// todo y las usan el listado para WhatsApp y la calculadora, cada uno con
// su propia tasa escrita a mano encima.

// --- Tasas -----------------------------------------------------------------

export type ParTasa = "USD_COP" | "VES_USDT";

export type EstadoTasa =
  | { estado: "cargando" }
  | { estado: "ok"; fuente: FuenteTasa; recibida: number }
  | { estado: "error"; mensaje: string };

export type ConsultaTasa = { estado: EstadoTasa; refrescar: () => void };

/**
 * La tasa de referencia de un par, de la misma ruta que usan los
 * movimientos. "Restablecer" vuelve a pedirla: la del servidor tiene 5
 * minutos de cache, así que no castiga a la fuente.
 */
export function useTasaReferencia(par: ParTasa): ConsultaTasa {
  const [consulta, setConsulta] = useState(0);
  const [resultado, setResultado] = useState<{ consulta: number; estado: EstadoTasa } | null>(
    null,
  );

  useEffect(() => {
    let cancelado = false;
    fetch(`/api/tasa-referencia?par=${par}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json().catch(() => ({}));
        if (cancelado) return;
        if (!respuesta.ok) {
          setResultado({
            consulta,
            estado: { estado: "error", mensaje: cuerpo.error ?? `Error ${respuesta.status}.` },
          });
          return;
        }
        const { fuente } = cuerpo as RespuestaReferencia;
        setResultado({ consulta, estado: { estado: "ok", fuente, recibida: Date.now() } });
      })
      .catch((e: Error) => {
        if (!cancelado) setResultado({ consulta, estado: { estado: "error", mensaje: e.message } });
      });
    return () => {
      cancelado = true;
    };
  }, [par, consulta]);

  // Una respuesta de otra consulta es la vieja: la nueva sigue en vuelo.
  const estado: EstadoTasa =
    resultado !== null && resultado.consulta === consulta ? resultado.estado : { estado: "cargando" };

  return { estado, refrescar: () => setConsulta((c) => c + 1) };
}

export function FilaTasa({
  id,
  moneda,
  sufijo,
  consulta,
  texto,
  manual,
  onTexto,
  onRestablecer,
}: {
  id: string;
  moneda: string;
  sufijo: string;
  consulta: ConsultaTasa;
  texto: string;
  manual: boolean;
  onTexto: (texto: string) => void;
  onRestablecer: () => void;
}) {
  const { estado } = consulta;
  const minutos = useMinutosDesde(estado.estado === "ok" ? estado.recibida : null);
  const valor = leerNumero(texto);
  const invalida = texto.trim() !== "" && (valor === null || valor <= 0);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
          <span className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-teal-soft text-[#215d4d]">
            <IconoCambio className="h-3 w-3" />
          </span>
          {moneda}
        </label>
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-soft">
          {estado.estado === "ok" ? estado.fuente.etiqueta : sufijo}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            inputMode="decimal"
            autoComplete="off"
            placeholder={estado.estado === "cargando" ? "Consultando…" : "Escribí la tasa"}
            value={texto}
            onChange={(e) => onTexto(e.target.value)}
            aria-invalid={invalida}
            className={`${CLASE_CONTROL} pr-[5.5rem] text-right tabular-nums`}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-ink-soft">
            {sufijo}
          </span>
        </div>
        {(manual || estado.estado === "error") && (
          <button
            type="button"
            onClick={onRestablecer}
            title="Volver a la tasa de referencia"
            className="inline-flex h-10 flex-none items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-[12.5px] text-ink-soft transition hover:text-ink"
          >
            <IconoRefrescar className="h-3.5 w-3.5" />
            {estado.estado === "error" ? "Reintentar" : "Restablecer"}
          </button>
        )}
      </div>
      <p className="text-[11.5px] leading-snug text-ink-soft" suppressHydrationWarning>
        {estado.estado === "cargando" && "Consultando la tasa de referencia…"}
        {estado.estado === "error" && (
          <span className="text-critical">
            No pudimos traer la referencia ({estado.mensaje}). Escribí la tasa a mano.
          </span>
        )}
        {estado.estado === "ok" &&
          (manual
            ? `Ajustada a mano${
                valor !== null && valor > 0
                  ? ` · ${formatMargen((valor / estado.fuente.valor - 1) * 100)} sobre ${estado.fuente.etiqueta}`
                  : ""
              } (${fmt2(estado.fuente.valor)})`
            : `${estado.fuente.detalle}${minutos === null ? "" : ` · consultada ${antiguedad(minutos)}`}`)}
      </p>
    </div>
  );
}

// --- Utilidades --------------------------------------------------------------

/**
 * Acepta coma o punto decimal; con coma, los puntos son de miles. Sin coma,
 * puntos que separan grupos de exactamente tres cifras ("4.150",
 * "1.234.567") también son de miles: así se escribe la tasa en es-CO y es-VE,
 * y leer "4.150" como 4,15 daría un precio mil veces más bajo.
 */
export function leerNumero(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;
  const normal = limpio.includes(",")
    ? limpio.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(limpio)
      ? limpio.replace(/\./g, "")
      : limpio;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function textoDeReferencia(estado: EstadoTasa) {
  if (estado.estado !== "ok") return "";
  return String(Math.round(estado.fuente.valor * 100) / 100).replace(".", ",");
}

function antiguedad(minutos: number) {
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `hace ${horas} h`;
}

/** Minutos desde un instante, refrescados solos cada 30 s. */
function useMinutosDesde(desde: number | null) {
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (desde === null) return null;
  return Math.max(0, Math.floor((ahora - desde) / 60_000));
}
