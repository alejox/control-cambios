"use client";

import { useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import ControlMargen, { leerMargen } from "./margen";
import {
  FilaTasa,
  leerNumero,
  textoDeReferencia,
  type ConsultaTasa,
} from "./tasas";
import { CLASE_CONTROL, CLASE_ETIQUETA, fmt2 } from "./ui";

const MARGEN_POR_DEFECTO = "20";
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
  cop,
  ves,
}: {
  sel: Seleccion;
  onCambiar: (sel: Seleccion) => void;
  cop: ConsultaTasa;
  ves: ConsultaTasa;
}) {
  const proveedor = buscarProveedor(sel.proveedorId) ?? PROVEEDORES[0];
  const variante =
    proveedor.variantes.find((v) => v.id === sel.varianteId) ?? proveedor.variantes[0];

  // --- Margen -----------------------------------------------------------
  const guardado = useSyncExternalStore(suscribirStorage, leerMargenGuardado, () => null);
  const [margenManual, setMargenManual] = useState<string | null>(null);
  const margenTexto = margenManual ?? guardado ?? MARGEN_POR_DEFECTO;
  const { margen } = leerMargen(margenTexto);

  function cambiarMargen(texto: string) {
    setMargenManual(texto);
    // Comodidad de cada uno: si el navegador no deja guardar, se pierde
    // al recargar y nada más.
    try {
      localStorage.setItem(CLAVE_MARGEN, texto);
    } catch {}
  }

  // --- Tasas ------------------------------------------------------------
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

      <ControlMargen id="rv-margen" texto={margenTexto} onTexto={cambiarMargen} />
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
        Pesos redondeados al millar y bolívares a la decena, siempre hacia arriba.
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
