"use client";

import { useActionState, useEffect, useState } from "react";
import {
  armarMensaje,
  avisosDeLista,
  formatMontoLista,
  formatUsd,
  necesitaTasa,
  NOMBRE_MONEDA,
  precioDePlan,
  type Lista,
  type PlanLista,
} from "@/lib/venta-publico";
import { ajustarPrecio, marcarRevisado } from "./actions";
import { ESTADO_INICIAL } from "./estado";
import EditorLista from "./editor-lista";
import TasaLista from "./tasa-lista";

/**
 * Una lista: sus avisos, su tasa, sus planes y el mensaje armado.
 *
 * Los dos roles pueden editar todo: esto no es configuración de
 * administrador, es la lista de precios con la que trabajan los dos.
 */
export default function ListaProveedor({ lista }: { lista: Lista }) {
  const [editando, setEditando] = useState(false);

  const avisos = avisosDeLista(lista);
  const planes = lista.grupos.reduce((total, g) => total + g.planes.length, 0);
  const faltaTasa = necesitaTasa(lista.moneda) && lista.tasa === null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          className="text-[19px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {lista.proveedor}
        </h2>
        <button
          type="button"
          onClick={() => setEditando((v) => !v)}
          className="h-9 rounded-[9px] border border-border bg-surface px-3.5 text-[13px] text-ink-soft transition hover:text-ink"
        >
          {editando ? "Listo" : "Editar la lista"}
        </button>
      </div>

      {avisos.length > 0 && <Avisos lista={lista} />}

      <TasaLista lista={lista} />

      {editando ? (
        <EditorLista lista={lista} />
      ) : planes === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-[14px] leading-relaxed text-ink-soft shadow-sm">
          <p className="text-ink">Esta lista todavía está vacía.</p>
          <p className="mt-2">
            Tocá <strong className="font-medium text-ink">Editar la lista</strong>{" "}
            para escribir el encabezado y el pie del mensaje, crear los grupos de
            planes y cargar cada precio en dólares.
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            {lista.grupos.map((grupo) => (
              <div key={grupo.id} className="border-b border-border last:border-0">
                <p className="bg-surface-alt/60 px-5 py-2.5 text-[13.5px] font-medium text-ink">
                  {grupo.titulo ?? (
                    <span className="italic text-ink-soft">
                      {grupo.nombre} — sin título en esta moneda
                    </span>
                  )}
                </p>
                {grupo.planes.length === 0 ? (
                  <p className="px-5 py-3 text-[13px] text-ink-soft">
                    Este grupo no tiene planes todavía.
                  </p>
                ) : (
                  <table className="w-full text-left text-[13.5px]">
                    <tbody>
                      {grupo.planes.map((plan) => (
                        <tr key={plan.id} className="border-t border-border/70">
                          <td className="px-5 py-2.5 text-ink-soft">
                            {plan.etiqueta ?? (
                              <span className="italic">
                                {plan.nombre} — sin etiqueta en esta moneda
                              </span>
                            )}
                            {plan.sufijo && (
                              <span className="ml-1.5 text-ink-soft/70">
                                {plan.sufijo}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-5 py-2.5 text-right font-mono text-[12.5px] text-ink-soft">
                            {formatUsd(plan.precioUsd)}
                          </td>
                          <td className="w-56 px-5 py-2">
                            <CeldaPrecio lista={lista} plan={plan} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          {necesitaTasa(lista.moneda) && !faltaTasa && (
            <p className="text-[12.5px] text-ink-soft">
              Los precios en {NOMBRE_MONEDA[lista.moneda]} se pueden ajustar a
              mano: al cambiar uno se recalcula la tasa de venta de esta lista y
              los demás se re-derivan desde su precio en dólares. Todos quedan
              redondeados hacia arriba al múltiplo de{" "}
              {lista.redondeo.toLocaleString("es")}, incluido el que escribas.
            </p>
          )}

          <MensajeWhatsApp lista={lista} faltaTasa={faltaTasa} />
        </>
      )}
    </div>
  );
}

function Avisos({ lista }: { lista: Lista }) {
  const [state, formAction, pending] = useActionState(marcarRevisado, ESTADO_INICIAL);
  const avisos = avisosDeLista(lista);

  return (
    <div className="rounded-2xl border border-critical-soft bg-critical-soft/25 px-5 py-4">
      <p className="font-mono text-[10.5px] uppercase tracking-widest text-critical">
        Antes de mandar esta lista
      </p>
      <ul className="mt-2 flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink">
        {avisos.map((aviso, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className="text-critical">
              {aviso.tono === "alerta" ? "▲" : "•"}
            </span>
            <span>{aviso.texto}</span>
          </li>
        ))}
      </ul>

      {lista.revisar.trim() && (
        <form action={formAction} className="mt-3 flex items-center gap-3">
          <input type="hidden" name="lista_id" value={lista.id} />
          <button
            type="submit"
            disabled={pending}
            className="h-9 rounded-[9px] border border-border bg-surface px-3.5 text-[13px] text-ink-soft transition hover:text-ink disabled:opacity-40"
          >
            {pending ? "Guardando…" : "Ya lo revisé"}
          </button>
          <span className="text-[12.5px] text-ink-soft">
            Saca este aviso. Los demás se van solos cuando se corrige lo que
            avisan.
          </span>
          {state.error && (
            <span className="text-[12.5px] text-critical">{state.error}</span>
          )}
        </form>
      )}
    </div>
  );
}

/**
 * El precio en la moneda de la lista. Si se convierte es editable: escribir
 * un monto acá es fijar la tasa de venta de toda la lista.
 */
function CeldaPrecio({ lista, plan }: { lista: Lista; plan: PlanLista }) {
  const [state, formAction, pending] = useActionState(ajustarPrecio, ESTADO_INICIAL);
  const precio = precioDePlan(lista, plan);

  if (!necesitaTasa(lista.moneda)) {
    return (
      <span className="block text-right font-medium text-ink">
        {precio === null ? (
          <span className="text-[12.5px] font-normal italic text-ink-soft">
            precio pendiente
          </span>
        ) : (
          formatMontoLista(precio, lista.moneda)
        )}
      </span>
    );
  }

  if (plan.precioUsd === null) {
    return (
      <span className="block text-right text-[12.5px] italic text-ink-soft">
        precio pendiente
      </span>
    );
  }

  if (precio === null) {
    return <span className="block text-right text-ink-soft/70">—</span>;
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {/* La clave incluye el precio para que el campo se reescriba cuando
          la tasa cambia por el ajuste de otra fila. */}
      <form
        key={`${plan.id}-${precio}`}
        action={formAction}
        className="flex items-center justify-end gap-1.5"
      >
        <input type="hidden" name="lista_id" value={lista.id} />
        <input type="hidden" name="plan_id" value={plan.id} />
        <input
          name="monto"
          inputMode="numeric"
          defaultValue={formatMontoLista(precio, lista.moneda)}
          aria-label={`Precio de ${plan.nombre} en la lista de ${lista.proveedor}`}
          className="h-9 w-28 rounded-[9px] border border-border bg-surface px-3 text-right text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-[9px] border border-border bg-surface px-2.5 text-[12.5px] text-ink-soft transition hover:text-ink disabled:opacity-40"
        >
          {pending ? "…" : "Ajustar"}
        </button>
      </form>
      {state.error && (
        <span className="text-right text-[11.5px] text-critical">{state.error}</span>
      )}
    </div>
  );
}

/**
 * El mensaje completo, a la vista y listo para copiar.
 *
 * Se muestra entero y no solo detrás del botón: si el portapapeles falla
 * —- sin https o sin permiso —- el texto sigue ahí para seleccionarlo a
 * mano, que es el mismo criterio del link de acceso en usuarios.
 */
function MensajeWhatsApp({ lista, faltaTasa }: { lista: Lista; faltaTasa: boolean }) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  if (faltaTasa) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-[13.5px] text-ink-soft shadow-sm">
        El mensaje se arma con los precios en {NOMBRE_MONEDA[lista.moneda]}:
        calculá la tasa y aparece acá, listo para copiar.
      </div>
    );
  }

  const mensaje = armarMensaje(lista);

  if (!mensaje.trim()) {
    return (
      <div className="rounded-2xl border border-border bg-surface px-5 py-4 text-[13.5px] text-ink-soft shadow-sm">
        Todavía no hay nada para mandar: faltan los textos y los precios.
      </div>
    );
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensaje);
      setCopiado(true);
    } catch {
      // Sin https o sin permiso el portapapeles no está disponible. El
      // mensaje queda igual a la vista, así que se puede copiar a mano.
      setCopiado(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
          Mensaje para WhatsApp
        </span>
        <button
          type="button"
          onClick={() => void copiar()}
          className="h-9 rounded-[9px] bg-ink px-3.5 text-[13.5px] font-medium text-[#F3F1EA] transition hover:bg-[#2a3127]"
        >
          {copiado ? "Copiado" : "Copiar mensaje"}
        </button>
      </div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap px-5 py-4 font-sans text-[13.5px] leading-relaxed text-ink">
        {mensaje}
      </pre>
    </div>
  );
}
