"use client";

import { useRef, useState } from "react";
import { parseComprobantesTexto, type ComprobanteTexto } from "@/lib/comprobante";
import { formatFecha, formatMonto, type Moneda } from "@/lib/items";

/**
 * Carga un deposito a partir del texto del comprobante, ese que mandan por
 * WhatsApp.
 *
 * No pasa por la API: es texto con etiquetas, se lee con expresiones
 * regulares. Sale gratis, responde al instante y no depende de que Google
 * este de buen humor.
 */
export default function PegarComprobante({
  moneda,
  onAplicar,
}: {
  moneda: Moneda;
  onAplicar: (lote: ComprobanteTexto[]) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [texto, setTexto] = useState("");

  // Se parsea en cada tecla: es una funcion pura sobre un texto corto, no
  // hace falta debounce ni estado derivado. Pueden venir varios pegados.
  const leidos = texto.trim() === "" ? [] : parseComprobantesTexto(texto);
  const utiles = leidos.filter((c) => c.datos.monto !== null);
  const sirve = utiles.length > 0;

  function cerrar() {
    dialogRef.current?.close();
  }

  function aplicar() {
    if (!sirve) return;
    // Solo los que tienen monto: uno sin monto no sirve como deposito.
    onAplicar(utiles);
    setTexto("");
    cerrar();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="rounded-lg border border-border px-2.5 py-1 text-xs text-ink-soft transition hover:bg-surface-alt"
      >
        Pegar texto
      </button>

      <dialog
        ref={dialogRef}
        onClose={() => setTexto("")}
        onClick={(e) => {
          if (e.target === dialogRef.current) cerrar();
        }}
        className="m-auto w-[min(92vw,540px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
      >
        <div className="border-b border-border px-6 py-4">
          <p className="font-mono text-[11.5px] uppercase tracking-widest text-accent">
            Sin subir archivo
          </p>
          <h2
            className="mt-1 text-[20px] font-medium text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Pegar comprobante
          </h2>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            Pegá el mensaje tal como te llegó. Podés pegar varios de corrido:
            se separan solos. Se lee acá mismo, sin enviarlo a ningún lado.
          </p>
        </div>

        <div className="flex flex-col gap-3 px-6 py-5">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={7}
            autoFocus
            placeholder={"App BNC - Comprobante de la Operación:\nMonto: Bs. *3.200,00*\nReferencia: *885504185*\nFecha de Operación: *9/9/2026 19:43:32*"}
            className="rounded-[10px] border border-border bg-surface px-3.5 py-2.5 font-mono text-[12.5px] leading-relaxed outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />

          {leidos.length > 0 && (
            <div className="rounded-[10px] border border-border bg-surface-alt/50 px-4 py-3">
              <p className="mb-2.5 font-mono text-[10.5px] uppercase tracking-widest text-ink-soft">
                {leidos.length === 1
                  ? "Lo que leímos"
                  : `${leidos.length} comprobantes encontrados`}
              </p>

              <div className="flex flex-col divide-y divide-border">
                {leidos.map(({ datos: d }, i) => (
                  <div key={i} className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0">
                    <div className="grid grid-cols-[1fr_auto] items-baseline gap-3 text-[13px]">
                      <span className="truncate font-mono text-[12px] text-ink-soft">
                        {d.referencia ? `Ref. ${d.referencia}` : "sin referencia"}
                        {d.fecha ? ` · ${formatFecha(d.fecha)}` : ""}
                      </span>
                      {d.monto !== null ? (
                        <span className="font-medium text-ink">
                          {formatMonto(d.monto, moneda)}
                        </span>
                      ) : (
                        <span className="text-[12px] text-critical">sin monto</span>
                      )}
                    </div>
                    {d.avisos.map((a, j) => (
                      <span key={j} className="text-[11.5px] text-accent">
                        {a}
                      </span>
                    ))}
                  </div>
                ))}
              </div>

              {leidos.length > utiles.length && (
                <p className="mt-2.5 text-[11.5px] text-ink-soft">
                  Se van a cargar {utiles.length} de {leidos.length}: los que no
                  tienen monto quedan afuera.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={cerrar}
            className="text-[13.5px] text-ink-soft transition hover:text-ink"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={aplicar}
            disabled={!sirve}
            title={sirve ? undefined : "Hace falta al menos el monto"}
            className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {utiles.length > 1 ? `Agregar ${utiles.length} depósitos` : "Agregar depósito"}
          </button>
        </div>
      </dialog>
    </>
  );
}

