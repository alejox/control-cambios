"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { FuenteTasa, RespuestaReferencia } from "@/app/api/tasa-referencia/route";
import {
  buscarProveedor,
  calcularReventa,
  etiquetaVariante,
  formatear,
  PROVEEDORES,
  textoCotizacion,
} from "@/lib/reventa";
import {
  conProveedor,
  conVariante,
  creditosDe,
  SUELTO_INICIAL,
  type Seleccion,
} from "./seleccion";
import { fmt2 } from "./ui";

const PRESETS = [0, 10, 20, 30];
const MARGEN_POR_DEFECTO = "20";
const MARGEN_MAX = 300;
const CLAVE_MARGEN = "reventa:margen";

/**
 * La calculadora de reventa: costo del paquete → precio de venta con el
 * margen, convertido a pesos y bolívares.
 *
 * Las tasas arrancan en la referencia de cada moneda (la misma de los
 * movimientos: TRM en pesos, P2P en bolívares) y se pueden pisar. Si la
 * referencia no responde, la calculadora sigue andando con la que se
 * escriba: no tener tasa no es motivo para no poder cotizar en USDT.
 */
export default function Calculadora({
  sel,
  onCambiar,
}: {
  sel: Seleccion;
  onCambiar: (sel: Seleccion) => void;
}) {
  const proveedor = buscarProveedor(sel.proveedorId) ?? PROVEEDORES[0];
  const variante =
    proveedor.variantes.find((v) => v.id === sel.varianteId) ?? proveedor.variantes[0];

  // --- Margen -----------------------------------------------------------
  const guardado = useSyncExternalStore(suscribirStorage, leerMargenGuardado, () => null);
  const [margenManual, setMargenManual] = useState<string | null>(null);
  const margenTexto = margenManual ?? guardado ?? MARGEN_POR_DEFECTO;
  const margenLeido = leerNumero(margenTexto);
  const margen = margenLeido === null ? null : Math.min(MARGEN_MAX, Math.max(0, margenLeido));

  function cambiarMargen(texto: string) {
    setMargenManual(texto);
    // Comodidad de cada uno: si el navegador no deja guardar, se pierde
    // al recargar y nada más.
    try {
      localStorage.setItem(CLAVE_MARGEN, texto);
    } catch {}
  }

  // --- Tasas ------------------------------------------------------------
  const cop = useTasaReferencia("USD_COP");
  const ves = useTasaReferencia("VES_USDT");
  const [copManual, setCopManual] = useState<string | null>(null);
  const [vesManual, setVesManual] = useState<string | null>(null);
  const copTexto = copManual ?? textoDeReferencia(cop.estado);
  const vesTexto = vesManual ?? textoDeReferencia(ves.estado);
  const tasaCop = leerNumero(copTexto);
  const tasaVes = leerNumero(vesTexto);

  // --- Cuenta -----------------------------------------------------------
  const creditos = creditosDe(sel.cantidad);
  const resultado =
    creditos !== null && margen !== null
      ? calcularReventa({
          variante,
          creditos,
          margenPct: margen,
          tasaCop: tasaCop !== null && tasaCop > 0 ? tasaCop : null,
          tasaVes: tasaVes !== null && tasaVes > 0 ? tasaVes : null,
        })
      : null;

  const suelto = variante.suelto;
  const valorCantidad = sel.cantidad.tipo === "suelto" ? "suelto" : String(sel.cantidad.creditos);

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div>
        <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-accent">
          Calculadora
        </p>
        <h2
          className="text-[19px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Precio de reventa
        </h2>
      </div>

      {/* Qué se vende */}
      <div className="grid gap-3">
        <Campo etiqueta="Proveedor" htmlFor="rv-proveedor">
          <select
            id="rv-proveedor"
            value={proveedor.id}
            onChange={(e) => onCambiar(conProveedor(sel, e.target.value))}
            className={CLASE_CONTROL}
          >
            {PROVEEDORES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Campo>

        {proveedor.variantes.length > 1 && (
          <Campo etiqueta="Variante" htmlFor="rv-variante">
            <select
              id="rv-variante"
              value={variante.id}
              onChange={(e) => onCambiar(conVariante(sel, e.target.value))}
              className={CLASE_CONTROL}
            >
              {proveedor.variantes.map((v) => (
                <option key={v.id} value={v.id}>
                  {etiquetaVariante(v)}
                </option>
              ))}
            </select>
          </Campo>
        )}

        <Campo etiqueta="Paquete" htmlFor="rv-paquete">
          <select
            id="rv-paquete"
            value={valorCantidad}
            onChange={(e) =>
              onCambiar({
                ...sel,
                cantidad:
                  e.target.value === "suelto"
                    ? { tipo: "suelto", texto: SUELTO_INICIAL }
                    : { tipo: "tramo", creditos: Number(e.target.value) },
              })
            }
            className={CLASE_CONTROL}
          >
            {variante.tramos.map((t) => (
              <option key={t.creditos} value={t.creditos}>
                {t.creditos} créditos · {fmt2(t.totalUsdt)} USDT
              </option>
            ))}
            {suelto && <option value="suelto">Cantidad personalizada (recarga suelta)</option>}
          </select>
        </Campo>

        {sel.cantidad.tipo === "suelto" && suelto && (
          <Campo
            etiqueta="Créditos"
            htmlFor="rv-creditos"
            ayuda={`De ${suelto.min} a ${suelto.max} créditos a ${fmt2(suelto.precioUsdt)} USDT c/u. Desde ${variante.tramos[0].creditos}, el precio del paquete.`}
          >
            <input
              id="rv-creditos"
              inputMode="numeric"
              autoComplete="off"
              placeholder={`${suelto.min}–${suelto.max}`}
              value={sel.cantidad.texto}
              onChange={(e) =>
                onCambiar({ ...sel, cantidad: { tipo: "suelto", texto: e.target.value } })
              }
              className={CLASE_CONTROL}
            />
          </Campo>
        )}
      </div>

      {/* Margen */}
      <div className="flex flex-col gap-2">
        <label htmlFor="rv-margen" className={CLASE_ETIQUETA}>
          Margen
        </label>
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label="Márgenes frecuentes"
            className="flex flex-none items-center gap-0.5 rounded-[10px] border border-border bg-surface-alt/60 p-0.5"
          >
            {PRESETS.map((p) => {
              const activo = margen === p && margenLeido === p;
              return (
                <button
                  key={p}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => cambiarMargen(String(p))}
                  className={`rounded-[8px] px-2.5 py-1.5 font-mono text-[11.5px] tabular-nums transition ${
                    activo ? "bg-ink text-[#F3F1EA]" : "text-ink-soft hover:bg-surface"
                  }`}
                >
                  {p}%
                </button>
              );
            })}
          </div>
          <div className="relative min-w-0 flex-1">
            <input
              id="rv-margen"
              inputMode="decimal"
              autoComplete="off"
              value={margenTexto}
              onChange={(e) => cambiarMargen(e.target.value)}
              aria-invalid={margenLeido === null}
              className={`${CLASE_CONTROL} pr-8 text-right tabular-nums`}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-soft">
              %
            </span>
          </div>
        </div>
        {margenLeido === null ? (
          <p className="text-[12px] text-critical">Escribí el margen como número, por ejemplo 20 o 12,5.</p>
        ) : margenLeido !== margen ? (
          <p className="text-[12px] text-ink-soft">
            Se usa {margen} %: el margen va de 0 a {MARGEN_MAX} %.
          </p>
        ) : null}
      </div>

      {/* Tasas */}
      <div className="flex flex-col gap-3">
        <p className={CLASE_ETIQUETA}>Tasas</p>
        <FilaTasa
          id="rv-tasa-cop"
          moneda="Pesos"
          sufijo="COP por USDT"
          consulta={cop}
          texto={copTexto}
          manual={copManual !== null}
          onTexto={setCopManual}
          onRestablecer={() => {
            setCopManual(null);
            cop.refrescar();
          }}
        />
        <FilaTasa
          id="rv-tasa-ves"
          moneda="Bolívares"
          sufijo="Bs por USDT"
          consulta={ves}
          texto={vesTexto}
          manual={vesManual !== null}
          onTexto={setVesManual}
          onRestablecer={() => {
            setVesManual(null);
            ves.refrescar();
          }}
        />
      </div>

      <Resultado
        proveedor={proveedor.nombre}
        variante={variante}
        creditos={creditos}
        resultado={resultado}
        margen={margen}
        sinPrecio={creditos !== null && margen !== null && resultado === null}
      />
    </div>
  );
}

const CLASE_CONTROL =
  "h-10 w-full rounded-[10px] border border-border bg-surface px-3 text-[13.5px] text-ink outline-none transition focus:border-teal focus:ring-2 focus:ring-teal-soft aria-[invalid=true]:border-critical";

const CLASE_ETIQUETA = "font-mono text-[10.5px] uppercase tracking-widest text-ink-soft";

function Campo({
  etiqueta,
  htmlFor,
  ayuda,
  children,
}: {
  etiqueta: string;
  htmlFor: string;
  ayuda?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className={CLASE_ETIQUETA}>
        {etiqueta}
      </label>
      {children}
      {ayuda && <p className="text-[12px] leading-snug text-ink-soft">{ayuda}</p>}
    </div>
  );
}

// --- Resultado -------------------------------------------------------------

function Resultado({
  proveedor,
  variante,
  creditos,
  resultado,
  margen,
  sinPrecio,
}: {
  proveedor: string;
  variante: Parameters<typeof textoCotizacion>[0]["variante"];
  creditos: number | null;
  resultado: ReturnType<typeof calcularReventa>;
  margen: number | null;
  sinPrecio: boolean;
}) {
  const [copiado, setCopiado] = useState<"no" | "si" | "error">("no");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copiar() {
    if (!resultado || creditos === null) return;
    const texto = textoCotizacion({ proveedor, variante, creditos, resultado });
    let estado: "si" | "error";
    try {
      await navigator.clipboard.writeText(texto);
      estado = "si";
    } catch {
      estado = "error";
    }
    setCopiado(estado);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setCopiado("no"), 2200);
  }

  if (!resultado) {
    return (
      <div className="rounded-[14px] border border-dashed border-border bg-surface-alt/40 px-4 py-6 text-center text-[13px] text-ink-soft">
        {sinPrecio
          ? `${creditos} créditos no es un paquete de esta lista. Elegí un paquete${
              variante.suelto
                ? ` o una recarga suelta de ${variante.suelto.min} a ${variante.suelto.max}`
                : ""
            }.`
          : creditos === null
            ? "Escribí cuántos créditos querés vender."
            : "Falta un margen válido para calcular."}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-[14px] bg-ink p-4 text-[#F3F1EA]">
      <div className="flex flex-col gap-1.5 text-[13px] tabular-nums">
        <Linea etiqueta={`Costo · ${creditos} créditos`} valor={formatear(resultado.costoUsdt, "USDT")} />
        <Linea
          etiqueta={`Ganancia · ${margen ?? 0} %`}
          valor={`+ ${formatear(resultado.gananciaUsdt, "USDT")}`}
          resaltado
        />
      </div>

      <div className="border-t border-[#3A4237] pt-3">
        <p className="font-mono text-[10.5px] uppercase tracking-widest text-[#A9AE9F]">
          Precio de venta
        </p>
        <p
          className="text-[30px] font-medium leading-tight tabular-nums"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {fmt2(resultado.ventaUsdt)}{" "}
          <span className="text-[15px] font-normal text-[#A9AE9F]">USDT</span>
        </p>
        <p className="text-[12px] tabular-nums text-[#A9AE9F]">
          {fmt2(resultado.ventaPorCreditoUsdt)} USDT por crédito
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Conversion
          moneda="En pesos"
          redondeado={resultado.ventaCopRedondeada}
          exacto={resultado.ventaCop}
          formato="COP"
        />
        <Conversion
          moneda="En bolívares"
          redondeado={resultado.ventaVesRedondeada}
          exacto={resultado.ventaVes}
          formato="VES"
        />
      </div>

      <button
        type="button"
        onClick={copiar}
        className="h-10 rounded-[10px] bg-[#D99A46] text-[13.5px] font-medium text-ink transition hover:bg-[#e3a95a]"
      >
        {copiado === "si"
          ? "Copiado"
          : copiado === "error"
            ? "No se pudo copiar"
            : "Copiar cotización"}
      </button>
      <span className="sr-only" aria-live="polite">
        {copiado === "si" ? "Cotización copiada" : copiado === "error" ? "No se pudo copiar" : ""}
      </span>

      <p className="text-[11.5px] leading-relaxed text-[#A9AE9F]">
        Pesos redondeados al millar y bolívares a la decena, al más cercano.
        El valor exacto queda debajo de cada uno.
      </p>
    </div>
  );
}

function Linea({
  etiqueta,
  valor,
  resaltado = false,
}: {
  etiqueta: string;
  valor: string;
  resaltado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[#A9AE9F]">{etiqueta}</span>
      <span className={resaltado ? "font-medium text-[#8fd1bd]" : ""}>{valor}</span>
    </div>
  );
}

function Conversion({
  moneda,
  redondeado,
  exacto,
  formato,
}: {
  moneda: string;
  redondeado: number | null;
  exacto: number | null;
  formato: "COP" | "VES";
}) {
  return (
    <div className="min-w-0 rounded-[10px] bg-[#252c22] px-3 py-2.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#A9AE9F]">{moneda}</p>
      {redondeado === null || exacto === null ? (
        <p className="mt-1 text-[12.5px] text-[#A9AE9F]">Falta la tasa</p>
      ) : (
        <>
          <p
            className="mt-0.5 truncate text-[17px] font-medium tabular-nums"
            style={{ fontFamily: "var(--font-display)" }}
            title={`Sin redondear: ${formatear(exacto, formato, { exacto: true })}`}
          >
            {formatear(redondeado, formato)}
          </p>
          <p className="truncate text-[11px] tabular-nums text-[#7C8375]">
            exacto {formatear(exacto, formato, { exacto: true })}
          </p>
        </>
      )}
    </div>
  );
}

// --- Tasas -----------------------------------------------------------------

type ParTasa = "USD_COP" | "VES_USDT";

type EstadoTasa =
  | { estado: "cargando" }
  | { estado: "ok"; fuente: FuenteTasa; recibida: number }
  | { estado: "error"; mensaje: string };

type ConsultaTasa = { estado: EstadoTasa; refrescar: () => void };

/**
 * La tasa de referencia de un par, de la misma ruta que usan los
 * movimientos. "Restablecer" vuelve a pedirla: la del servidor tiene 5
 * minutos de cache, así que no castiga a la fuente.
 */
function useTasaReferencia(par: ParTasa): ConsultaTasa {
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

function FilaTasa({
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
        <label htmlFor={id} className="text-[13px] font-medium text-ink">
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
            className="h-10 flex-none rounded-[10px] border border-border bg-surface px-3 text-[12.5px] text-ink-soft transition hover:text-ink"
          >
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
            ? `Ajustada a mano · ${estado.fuente.etiqueta}: ${fmt2(estado.fuente.valor)}`
            : `${estado.fuente.detalle}${minutos === null ? "" : ` · consultada ${antiguedad(minutos)}`}`)}
      </p>
    </div>
  );
}

// --- Utilidades --------------------------------------------------------------

/** Acepta coma o punto decimal; con coma, los puntos son de miles. */
function leerNumero(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;
  const normal = limpio.includes(",") ? limpio.replace(/\./g, "").replace(",", ".") : limpio;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

function textoDeReferencia(estado: EstadoTasa) {
  if (estado.estado !== "ok") return "";
  return String(Math.round(estado.fuente.valor * 100) / 100).replace(".", ",");
}

function leerMargenGuardado() {
  try {
    return localStorage.getItem(CLAVE_MARGEN);
  } catch {
    return null;
  }
}

function suscribirStorage(avisar: () => void) {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
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
