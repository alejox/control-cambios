"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { listadoWhatsApp, type Proveedor } from "@/lib/reventa";
import {
  ETIQUETA_SECCION,
  NOMBRE_MONEDA,
  type MediosPorMoneda,
  type MonedaLista,
} from "@/lib/venta-publico";
import {
  Bandera,
  IconoCobro,
  IconoCopiar,
  IconoDobleCheck,
  IconoListo,
  IconoWhatsApp,
} from "./iconos";
import ControlMargen, { leerMargen } from "./margen";
import { FilaTasa, leerNumero, textoDeReferencia, type ConsultaTasa } from "./tasas";
import { CLASE_ETIQUETA } from "./ui";

const MARGEN_POR_DEFECTO = "20";
const CLAVE_MARGENES = "reventa:listado:margenes";

type MonedaConTasa = "VES" | "COP";

/**
 * El listado para mandarle a un revendedor por WhatsApp: la lista del
 * proveedor con el margen aplicado, en la moneda elegida.
 *
 * Es Venta público aplicado al catálogo mayorista. Cada moneda es una
 * lista INDEPENDIENTE —- su margen y su tasa —-: al revendedor de Bs se le
 * puede cobrar otro margen que al de pesos, y cambiar de moneda para
 * mirar la otra no pisa nada de la primera.
 *
 * Los márgenes se recuerdan en este navegador (son la decisión de quien
 * vende); las tasas no, porque una tasa de ayer es un precio viejo.
 */
export default function ListadoWhatsApp({
  proveedor,
  moneda,
  medios,
  tasas,
}: {
  proveedor: Proveedor;
  moneda: MonedaLista;
  medios: MediosPorMoneda;
  tasas: Record<MonedaConTasa, ConsultaTasa>;
}) {
  // --- Margen de cada moneda ---------------------------------------------
  const guardadosCrudo = useSyncExternalStore(suscribirStorage, leerGuardados, () => null);
  const guardados = parsearGuardados(guardadosCrudo);
  const [margenes, setMargenes] = useState<Partial<Record<MonedaLista, string>>>({});
  const margenTexto = margenes[moneda] ?? guardados[moneda] ?? MARGEN_POR_DEFECTO;
  const { margen } = leerMargen(margenTexto);

  function cambiarMargen(texto: string) {
    setMargenes((m) => ({ ...m, [moneda]: texto }));
    try {
      localStorage.setItem(
        CLAVE_MARGENES,
        JSON.stringify({ ...parsearGuardados(leerGuardados()), [moneda]: texto }),
      );
    } catch {}
  }

  // --- Tasa de cada moneda -----------------------------------------------
  const [tasasManual, setTasasManual] = useState<Record<MonedaConTasa, string | null>>({
    VES: null,
    COP: null,
  });
  const consulta = moneda === "USD" ? null : tasas[moneda];
  const tasaTexto =
    moneda === "USD" || consulta === null
      ? ""
      : (tasasManual[moneda] ?? textoDeReferencia(consulta.estado));
  const tasa = moneda === "USD" ? null : leerNumero(tasaTexto);

  const mediosPago = medios[moneda] ?? "";
  const mensaje =
    margen === null
      ? null
      : listadoWhatsApp({ proveedor, moneda, margenPct: margen, tasa, mediosPago });

  const paquetes = proveedor.variantes.reduce((n, v) => n + v.tramos.length, 0);

  return (
    <section
      aria-label="Listado para WhatsApp"
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
    >
      {/* Cabecera oscura, con la paleta del menú lateral: es la acción
          principal de la página y tiene que leerse así de lejos. */}
      <div className="relative overflow-hidden bg-ink px-5 py-5 text-[#F3F1EA] sm:px-6">
        <span
          aria-hidden
          className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-[#D99A46]/15"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute -bottom-20 right-24 h-36 w-36 rounded-full bg-[#25D366]/10"
        />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-12 w-12 flex-none items-center justify-center rounded-[14px] bg-[#25D366] text-[#0b3d22] shadow-sm">
              <IconoWhatsApp className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <p className="font-mono text-[10.5px] uppercase tracking-widest text-[#D99A46]">
                Listado para WhatsApp
              </p>
              <h2
                className="truncate text-[26px] font-medium leading-tight"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {proveedor.nombre}
              </h2>
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-[#2a3127] px-3 py-1.5 text-[12.5px] ring-1 ring-[#3A4237]">
            <Bandera moneda={moneda} />
            Precios en {NOMBRE_MONEDA[moneda]}
          </span>
        </div>
        <div className="relative mt-4 flex flex-wrap gap-2 font-mono text-[10.5px] uppercase tracking-wider text-[#A9AE9F]">
          <span className="rounded-full bg-[#252c22] px-2.5 py-1">
            {paquetes} paquetes
          </span>
          <span className="rounded-full bg-[#252c22] px-2.5 py-1">
            {proveedor.variantes.length === 1
              ? "1 variante"
              : `${proveedor.variantes.length} variantes`}
          </span>
          <span className="rounded-full bg-[#252c22] px-2.5 py-1 text-[#D99A46]">
            Margen {margen === null ? "—" : `${margen.toLocaleString("es-VE")} %`}
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(0,310px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5 rounded-[14px] border border-border bg-surface-alt/40 p-4">
          <ControlMargen
            key={moneda}
            id={`rv-listado-margen-${moneda}`}
            etiqueta={`Margen de la lista ${ETIQUETA_SECCION[moneda]}`}
            texto={margenTexto}
            onTexto={cambiarMargen}
          />

          {moneda === "USD" || consulta === null ? (
            <p className="flex items-start gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 py-3 text-[12.5px] leading-relaxed text-ink-soft">
              <Bandera moneda="USD" className="mt-0.5" />
              Esta lista ya está en dólares: el precio es el del proveedor más
              el margen, sin nada que convertir.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <p className={CLASE_ETIQUETA}>Tasa de venta</p>
              <FilaTasa
                key={moneda}
                id={`rv-listado-tasa-${moneda}`}
                moneda={moneda === "VES" ? "Bolívares" : "Pesos"}
                sufijo={moneda === "VES" ? "Bs por USDT" : "COP por USDT"}
                consulta={consulta}
                texto={tasaTexto}
                manual={tasasManual[moneda] !== null}
                onTexto={(texto) => setTasasManual((t) => ({ ...t, [moneda]: texto }))}
                onRestablecer={() => {
                  setTasasManual((t) => ({ ...t, [moneda]: null }));
                  consulta.refrescar();
                }}
              />
            </div>
          )}

          <Medios moneda={moneda} texto={mediosPago} />

          <p className="text-[11.5px] leading-relaxed text-ink-soft">
            {moneda === "USD"
              ? "Totales y precio por crédito a centavos."
              : moneda === "VES"
                ? "Totales a la decena y precio por crédito al bolívar,"
                : "Totales al millar y precio por crédito a la decena,"}
            {moneda === "USD" ? "" : " siempre hacia arriba, como en Venta público."} El
            mensaje no lleva ni el costo ni el margen.
          </p>
        </div>

        <Vista
          mensaje={mensaje}
          moneda={moneda}
          proveedor={proveedor.nombre}
          sinMargen={margen === null}
        />
      </div>
    </section>
  );
}

function Medios({ moneda, texto }: { moneda: MonedaLista; texto: string }) {
  const vacio = !texto.trim();
  return (
    <div
      className={`flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[12.5px] ${
        vacio ? "border-critical-soft bg-critical-soft/30" : "border-teal-soft bg-teal-soft/40"
      }`}
    >
      <span
        className={`mt-px flex h-5 w-5 flex-none items-center justify-center rounded-[6px] ${
          vacio ? "bg-critical-soft text-critical" : "bg-teal-soft text-[#215d4d]"
        }`}
      >
        <IconoCobro className="h-3 w-3" />
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className={vacio ? "text-critical" : "text-ink-soft"}>
          {vacio
            ? `Sin medios de cobro en ${NOMBRE_MONEDA[moneda]}: el listado sale sin decir por dónde pagar.`
            : `Al final van tus medios de cobro en ${NOMBRE_MONEDA[moneda]}.`}
        </span>
        <Link
          href="/dashboard/venta-publico/medios-pago"
          className="w-fit font-medium text-ink underline decoration-border underline-offset-4 hover:decoration-ink"
        >
          {vacio ? "Cargarlos" : "Editar"}
        </Link>
      </span>
    </div>
  );
}

/**
 * El mensaje como se va a ver en el chat, con los botones de copiar y de
 * abrir WhatsApp. Se muestra entero, como en Venta público: si el
 * portapapeles falla, el texto sigue ahí para seleccionarlo a mano.
 */
function Vista({
  mensaje,
  moneda,
  proveedor,
  sinMargen,
}: {
  mensaje: string | null;
  moneda: MonedaLista;
  proveedor: string;
  sinMargen: boolean;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  if (mensaje === null) {
    return (
      <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-[16px] border border-dashed border-border bg-surface-alt/40 px-6 text-center text-[13.5px] leading-relaxed text-ink-soft">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink-soft ring-1 ring-border">
          <IconoWhatsApp className="h-5 w-5" />
        </span>
        {sinMargen
          ? "Escribí un margen válido y el listado aparece acá."
          : `El listado se arma con los precios en ${NOMBRE_MONEDA[moneda]}: escribí la tasa o esperá la de referencia y aparece acá, listo para copiar.`}
      </div>
    );
  }

  const texto = mensaje;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      // Sin https o sin permiso el portapapeles no está disponible. El
      // mensaje queda igual a la vista, así que se puede copiar a mano.
      setCopiado(false);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Un chat de mentira: la cabecera, el fondo con trama y la burbuja
          con su cola, la hora y el doble check. La burbuja usa el teal
          claro del tema en el papel del verde de "mensaje enviado". */}
      <div className="overflow-hidden rounded-[16px] border border-border shadow-sm">
        <div className="flex items-center gap-3 bg-ink px-4 py-2.5 text-[#F3F1EA]">
          <span
            aria-hidden
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-teal text-[13px] font-medium"
          >
            R
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-[13.5px] font-medium">Revendedor</span>
            <span className="text-[11px] text-[#A9AE9F]">vista previa · {proveedor}</span>
          </span>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-[#7C8375]">
            {texto.length.toLocaleString("es-VE")} caracteres
          </span>
        </div>

        <div
          className="bg-surface-alt px-3 py-4 sm:px-5"
          style={{
            backgroundImage: "radial-gradient(var(--border) 1px, transparent 1px)",
            backgroundSize: "14px 14px",
          }}
        >
          <div className="relative ml-auto max-w-[34rem] rounded-[12px] rounded-tr-none bg-teal-soft px-3.5 pb-2 pt-3 shadow-sm">
            <svg
              aria-hidden
              width="10"
              height="14"
              viewBox="0 0 10 14"
              className="absolute -right-[9px] top-0 text-teal-soft"
            >
              <path d="M0 0h10L0 14V0Z" fill="currentColor" />
            </svg>
            <div className="max-h-[540px] overflow-auto whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">
              {texto.split("\n").map((linea, i) => (
                <span key={i} className="block min-h-[1lh]">
                  {conFormato(linea)}
                </span>
              ))}
            </div>
            <span className="mt-1 flex items-center justify-end gap-1 text-[10.5px] text-ink-soft">
              ahora
              <IconoDobleCheck className="text-teal" />
            </span>
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void copiar()}
          className={`inline-flex h-11 items-center justify-center gap-2 rounded-[11px] text-[14px] font-medium transition ${
            copiado
              ? "bg-teal text-[#F3F1EA]"
              : "bg-ink text-[#F3F1EA] hover:bg-[#2a3127]"
          }`}
        >
          {copiado ? <IconoListo className="h-4 w-4" /> : <IconoCopiar className="h-4 w-4" />}
          {copiado ? "Copiado" : "Copiar mensaje"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-[11px] bg-[#25D366] text-[14px] font-medium text-[#0b3d22] shadow-sm transition hover:bg-[#20bd5a]"
        >
          <IconoWhatsApp className="h-4 w-4" />
          Abrir en WhatsApp
        </a>
        <span className="sr-only" aria-live="polite">
          {copiado ? "Mensaje copiado" : ""}
        </span>
      </div>
    </div>
  );
}

/** *negrita* y _cursiva_ como las muestra WhatsApp, dentro de una línea. */
function conFormato(linea: string): ReactNode[] {
  return linea.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((parte, i) => {
    if (parte.length > 2 && parte.startsWith("*") && parte.endsWith("*")) {
      return (
        <strong key={i} className="font-semibold">
          {parte.slice(1, -1)}
        </strong>
      );
    }
    if (parte.length > 2 && parte.startsWith("_") && parte.endsWith("_")) {
      return <em key={i}>{parte.slice(1, -1)}</em>;
    }
    return parte;
  });
}

function leerGuardados() {
  try {
    return localStorage.getItem(CLAVE_MARGENES);
  } catch {
    return null;
  }
}

function parsearGuardados(crudo: string | null): Partial<Record<MonedaLista, string>> {
  if (!crudo) return {};
  try {
    const valor = JSON.parse(crudo);
    if (!valor || typeof valor !== "object") return {};
    const limpio: Partial<Record<MonedaLista, string>> = {};
    for (const m of ["VES", "USD", "COP"] as const) {
      if (typeof valor[m] === "string") limpio[m] = valor[m];
    }
    return limpio;
  } catch {
    return {};
  }
}

function suscribirStorage(avisar: () => void) {
  window.addEventListener("storage", avisar);
  return () => window.removeEventListener("storage", avisar);
}
