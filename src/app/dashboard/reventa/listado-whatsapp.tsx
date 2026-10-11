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

  return (
    <section
      aria-label="Listado para WhatsApp"
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-accent">
            Listado para WhatsApp
          </p>
          <h2
            className="text-[21px] font-medium leading-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {proveedor.nombre}{" "}
            <span className="text-ink-soft">· {ETIQUETA_SECCION[moneda]}</span>
          </h2>
        </div>
        <p className="max-w-sm text-[12.5px] leading-relaxed text-ink-soft">
          Cada moneda tiene su margen y su tasa. Lo que cambies acá no toca las
          otras listas.
        </p>
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <ControlMargen
            key={moneda}
            id={`rv-listado-margen-${moneda}`}
            etiqueta={`Margen de la lista ${ETIQUETA_SECCION[moneda]}`}
            texto={margenTexto}
            onTexto={cambiarMargen}
          />

          {moneda === "USD" || consulta === null ? (
            <p className="rounded-[10px] border border-border bg-surface-alt/50 px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
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

          <p className="text-[12px] leading-relaxed text-ink-soft">
            {moneda === "USD"
              ? "Totales y precio por crédito a centavos."
              : moneda === "VES"
                ? "Totales a la decena y precio por crédito al bolívar,"
                : "Totales al millar y precio por crédito a la decena,"}
            {moneda === "USD" ? "" : " siempre hacia arriba, como en Venta público."} El
            mensaje no lleva ni el costo ni el margen.
          </p>
        </div>

        <Vista mensaje={mensaje} moneda={moneda} sinMargen={margen === null} />
      </div>
    </section>
  );
}

function Medios({ moneda, texto }: { moneda: MonedaLista; texto: string }) {
  const vacio = !texto.trim();
  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-2 rounded-[10px] border px-4 py-3 text-[12.5px] ${
        vacio ? "border-critical-soft bg-critical-soft/30" : "border-teal-soft bg-teal-soft/30"
      }`}
    >
      <span className={vacio ? "text-critical" : "text-ink-soft"}>
        {vacio
          ? `Sin medios de cobro en ${NOMBRE_MONEDA[moneda]}: el listado sale sin decir por dónde pagar.`
          : `Al final van tus medios de cobro en ${NOMBRE_MONEDA[moneda]}.`}
      </span>
      <Link
        href="/dashboard/venta-publico/medios-pago"
        className="font-medium text-ink underline decoration-border underline-offset-4 hover:decoration-ink"
      >
        {vacio ? "Cargarlos" : "Editar"}
      </Link>
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
  sinMargen,
}: {
  mensaje: string | null;
  moneda: MonedaLista;
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
      <div className="flex min-h-[240px] items-center justify-center rounded-[14px] border border-dashed border-border bg-surface-alt/40 px-6 text-center text-[13.5px] leading-relaxed text-ink-soft">
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={CLASE_ETIQUETA}>Vista previa</span>
        <div className="flex flex-wrap gap-2">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(texto)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-9 items-center rounded-[9px] border border-border bg-surface px-3.5 text-[13px] text-ink-soft transition hover:text-ink"
          >
            Abrir en WhatsApp
          </a>
          <button
            type="button"
            onClick={() => void copiar()}
            className="h-9 rounded-[9px] bg-ink px-3.5 text-[13.5px] font-medium text-[#F3F1EA] transition hover:bg-[#2a3127]"
          >
            {copiado ? "Copiado" : "Copiar mensaje"}
          </button>
          <span className="sr-only" aria-live="polite">
            {copiado ? "Mensaje copiado" : ""}
          </span>
        </div>
      </div>

      {/* El fondo del chat y la burbuja salen de los tokens del tema: el
          verde de WhatsApp no existe en la paleta, y el teal claro cumple
          el mismo papel de "mensaje enviado". */}
      <div className="rounded-[14px] bg-surface-alt/70 p-3 sm:p-4">
        <div className="relative ml-auto max-w-[34rem] rounded-[12px] rounded-tr-[4px] bg-teal-soft px-3.5 py-3 shadow-sm">
          <div className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-ink">
            {texto.split("\n").map((linea, i) => (
              <span key={i} className="block min-h-[1lh]">
                {conFormato(linea)}
              </span>
            ))}
          </div>
        </div>
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
