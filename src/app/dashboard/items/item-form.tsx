"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ActionState } from "./actions";
import type { FuenteTasa, RespuestaReferencia } from "@/app/api/tasa-referencia/route";
import ComprobanteInput from "./comprobante-input";
import VisorComprobante, { type VisorHandle } from "../visor-comprobante";
import PegarComprobante from "./pegar-comprobante";
import SubirVarios, { type ComprobanteCargado } from "./subir-varios";
import SubirManualmente from "./subir-manualmente";
import { PAR_POR_MONEDA, type ParReferencia } from "@/lib/binance";
import type { DatosComprobante } from "@/lib/comprobante";
import {
  ETIQUETA_FLUJO,
  calcularComision,
  comisionDeFlujo,
  flujoDeMoneda,
  formatMonto,
  monedaDeFlujo,
  usdtDesdeOrigen,
  type Comisiones,
  type Deposito,
  type Moneda,
  type TipoFlujo,
} from "@/lib/items";

type FilaDeposito = {
  key: number;
  referencia: string;
  fecha: string;
  valor: string;
  comprobante: string;
  comprobanteTexto: string;
  /** Resumen de lo que se leyo del comprobante, para poder contrastarlo. */
  leido: string | null;
  avisos: string[];
};

// La clave (par + fecha) viaja dentro del resultado para poder decidir en
// render si lo guardado corresponde a lo que se esta pidiendo ahora o si
// todavia estamos esperando la respuesta.
type ResultadoReferencia =
  | { clave: string; estado: "ok"; fuente: FuenteTasa }
  | { clave: string; estado: "error"; mensaje: string };

type EstadoReferencia = { estado: "cargando" } | ResultadoReferencia;

function filaVacia(key: number): FilaDeposito {
  return {
    key,
    referencia: "",
    fecha: "",
    valor: "",
    comprobante: "",
    comprobanteTexto: "",
    leido: null,
    avisos: [],
  };
}

function proximaKey(filas: FilaDeposito[]) {
  return filas.length > 0 ? Math.max(...filas.map((f) => f.key)) + 1 : 0;
}

// Suma de los depositos en la moneda de origen (Bs o COP). Las filas
// todavia vacias o a medio escribir simplemente no suman.
function sumarDepositos(filas: FilaDeposito[]) {
  return filas.reduce((acc, fila) => {
    const valor = Number(fila.valor);
    if (fila.valor.trim() === "" || !Number.isFinite(valor)) return acc;
    return acc + valor;
  }, 0);
}

// El total en USDT es un valor DERIVADO de la conversion: lo que se recibio
// en Bs/COP dividido entre la tasa. No es un dato que haya que tipear.
//
// La division en si vive en lib/items (usdtDesdeOrigen) porque el bot de
// Telegram hace la misma cuenta; aca queda solo la validacion del campo de
// texto, que es lo unico propio del formulario.
function calcularUsdt(totalOrigen: number, tasaRaw: string) {
  const tasa = Number(tasaRaw);
  if (tasaRaw.trim() === "" || !Number.isFinite(tasa) || tasa <= 0) return null;
  if (totalOrigen <= 0) return null;
  return usdtDesdeOrigen(totalOrigen, tasa);
}

function claveDe(par: ParReferencia, fecha: string) {
  return `${par}|${fecha}`;
}

export default function ItemForm({
  action,
  siguienteNumero,
  comisiones,
  monedaPreferida,
  puedeCambiarMoneda = true,
  initial,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  siguienteNumero: number;
  /** Moneda elegida en el header. Define el flujo de los cierres NUEVOS. */
  monedaPreferida: Moneda;
  /** false para el colaborador: solo puede registrar COP -> USDT. */
  puedeCambiarMoneda?: boolean;
  /** Los DOS porcentajes vigentes, solo para mostrar. Llegan los dos y no
   *  el que corresponde ya resuelto, porque el flujo puede cambiar sin
   *  volver al servidor y el numero en pantalla tiene que seguirlo.
   *  El valor que se guarda lo sella la base, no este formulario. */
  comisiones: Comisiones;
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

  // Un solo visor para todo el formulario, no uno por fila de deposito.
  const visorRef = useRef<VisorHandle>(null);

  // El flujo ya no se elige acá. En un cierre nuevo lo define la moneda del
  // header; en uno que ya existe manda el que tiene guardado, porque
  // cambiarlo por una preferencia de hoy reescribiría un cierre viejo.
  const tipoFlujo: TipoFlujo = initial?.tipo_flujo ?? flujoDeMoneda(monedaPreferida);
  const [fecha, setFecha] = useState(
    initial?.fecha ?? new Date().toISOString().slice(0, 10),
  );
  // null = la tasa la manda la fuente oficial de esa moneda. Un string = el
  // usuario la piso a mano porque el cierre se hizo a otra tasa.
  const [tasaManual, setTasaManual] = useState<string | null>(
    initial?.tasa !== null && initial?.tasa !== undefined ? String(initial.tasa) : null,
  );
  const [filas, setFilas] = useState<FilaDeposito[]>(() => {
    if (initial && initial.depositos.length > 0) {
      return initial.depositos.map((d, i) => ({
        key: i,
        referencia: d.referencia ?? "",
        fecha: d.fecha,
        valor: String(d.valor_origen),
        comprobante: d.comprobante_path ?? "",
        comprobanteTexto: d.comprobante_texto ?? "",
        leido: null,
        avisos: [],
      }));
    }
    return [filaVacia(0)];
  });

  // null = el total lo manda el calculo. Un string = el usuario lo piso a mano
  // (pasa cuando lo que llego no cuadra exacto con tasa x depositos).
  const [usdtManual, setUsdtManual] = useState<string | null>(() => {
    if (!initial) return null;
    const guardado = initial.usdt_total;
    const calculado = calcularUsdt(
      initial.depositos.reduce((acc, d) => acc + Number(d.valor_origen), 0),
      initial.tasa !== null ? String(initial.tasa) : "",
    );
    return calculado !== null && Math.abs(calculado - guardado) < 0.005
      ? null
      : String(guardado);
  });

  const esBs = tipoFlujo === "bs_a_usdt";
  const moneda = monedaDeFlujo(tipoFlujo);
  const par = PAR_POR_MONEDA[moneda];
  const clave = claveDe(par, fecha);

  const [resultado, setResultado] = useState<ResultadoReferencia | null>(null);

  useEffect(() => {
    let cancelado = false;

    // La TRM se pide para la fecha del cierre, no para hoy: lo que importa
    // en un registro auditable es la tasa que regia ese dia.
    fetch(`/api/tasa-referencia?par=${par}&fecha=${fecha}`)
      .then(async (respuesta) => {
        const cuerpo = await respuesta.json();
        if (cancelado) return;
        const clave = claveDe(par, fecha);
        if (!respuesta.ok) {
          setResultado({ clave, estado: "error", mensaje: cuerpo.error ?? "Error desconocido." });
          return;
        }
        const { fuente } = cuerpo as RespuestaReferencia;
        setResultado({ clave, estado: "ok", fuente });
      })
      .catch((e: Error) => {
        if (!cancelado) {
          setResultado({ clave: claveDe(par, fecha), estado: "error", mensaje: e.message });
        }
      });

    return () => {
      cancelado = true;
    };
  }, [par, fecha]);

  // Si lo guardado es de otra clave, el usuario acaba de cambiar de flujo o de
  // fecha y la consulta nueva sigue en vuelo: eso es "cargando", sin setState.
  const referencia: EstadoReferencia =
    resultado !== null && resultado.clave === clave ? resultado : { estado: "cargando" };

  // La tasa arranca en la fuente oficial de la moneda: TRM para COP, Binance
  // P2P para Bs. Se puede pisar, pero ese es el valor por defecto.
  const fuente = referencia.estado === "ok" ? referencia.fuente : null;
  const tasa = tasaManual ?? (fuente !== null ? String(fuente.valor) : "");
  const tasaPisadaAMano = tasaManual !== null;

  const totalOrigen = sumarDepositos(filas);
  const usdtCalculado = calcularUsdt(totalOrigen, tasa);
  const usdtValor = usdtManual ?? (usdtCalculado !== null ? String(usdtCalculado) : "");
  const pisadoAMano = usdtManual !== null;

  // El porcentaje no se elige acá: lo fija el admin en la configuracion y
  // la base lo sella al guardar. Lo que SI se decide acá es cual de los dos
  // mostrar, y sale del flujo.
  //
  // Es un valor DERIVADO en render, no estado ni efecto: si el flujo cambia
  // —porque el header cambio de moneda y el servidor volvio a renderizar—
  // el porcentaje cambia solo, sin un useEffect que lo sincronice.
  const comisionPct = comisionDeFlujo(comisiones, tipoFlujo);
  const usdtAGuardar = Number(usdtValor);
  const comisionUsdt =
    usdtValor.trim() !== "" && Number.isFinite(usdtAGuardar) && comisionPct > 0
      ? calcularComision(usdtAGuardar, comisionPct)
      : null;

  const tasaNumero = Number(tasa);
  const desvio =
    fuente !== null && tasa.trim() !== "" && Number.isFinite(tasaNumero) && tasaNumero > 0
      ? ((tasaNumero - fuente.valor) / fuente.valor) * 100
      : null;

  // Completa la fila con lo leido del comprobante, pero SOLO donde esta
  // vacia: si el usuario ya escribio algo, manda lo que escribio. Nada de
  // esto se guarda solo — queda en pantalla para que lo confirme.
  function aplicarDatos(key: number, datos: DatosComprobante) {
    setFilas((f) =>
      f.map((fila) => {
        if (fila.key !== key) return fila;

        const detalle = [datos.banco, datos.beneficiario].filter(Boolean).join(" · ");

        return {
          ...fila,
          referencia:
            fila.referencia.trim() === "" && datos.referencia
              ? datos.referencia
              : fila.referencia,
          fecha: fila.fecha === "" && datos.fecha ? datos.fecha : fila.fecha,
          valor:
            fila.valor.trim() === "" && datos.monto !== null
              ? String(datos.monto)
              : fila.valor,
          leido: detalle === "" ? null : detalle,
          avisos: datos.avisos,
        };
      }),
    );
  }

  function filaEstaVacia(fila: FilaDeposito) {
    return (
      fila.referencia.trim() === "" &&
      fila.fecha === "" &&
      fila.valor.trim() === "" &&
      fila.comprobante === "" &&
      fila.comprobanteTexto === ""
    );
  }

  function datosAFila(datos: DatosComprobante, texto?: string) {
    return {
      comprobanteTexto: texto ?? "",
      referencia: datos.referencia ?? "",
      fecha: datos.fecha ?? "",
      valor: datos.monto !== null ? String(datos.monto) : "",
      leido: [datos.banco, datos.beneficiario].filter(Boolean).join(" · ") || null,
      avisos: datos.avisos,
    };
  }

  // Los comprobantes leidos van completando las filas vacias que ya existan
  // y, cuando se acaban, se agregan filas nuevas. Asi cargar cinco de corrido
  // deja cinco depositos sin huecos y sin pisar lo ya cargado.
  function agregarFilas(lote: Partial<FilaDeposito>[]) {
    if (lote.length === 0) return;

    setFilas((f) => {
      const copia = [...f];
      let key = proximaKey(copia);

      for (const traidos of lote) {
        const libre = copia.findIndex(filaEstaVacia);
        if (libre > -1) {
          copia[libre] = { ...copia[libre], ...traidos };
        } else {
          copia.push({ ...filaVacia(key), ...traidos });
          key += 1;
        }
      }
      return copia;
    });
  }

  // Se guarda el texto crudo de cada comprobante: es el respaldo del
  // deposito, igual que lo seria una imagen.
  function agregarDesdeTexto(lote: { datos: DatosComprobante; texto: string }[]) {
    agregarFilas(lote.map((c) => datosAFila(c.datos, c.texto)));
  }

  function agregarDesdeArchivos(lote: ComprobanteCargado[]) {
    agregarFilas(
      lote.map((c) => ({
        // El comprobante se adjunta siempre, aunque la lectura haya fallado:
        // el archivo ya esta subido y no se puede perder.
        comprobante: c.path,
        ...(c.datos ? datosAFila(c.datos) : {}),
        ...(c.error ? { avisos: [c.error] } : {}),
      })),
    );
  }

  function actualizarFila(
    key: number,
    campo: "referencia" | "fecha" | "valor" | "comprobante" | "comprobanteTexto",
    valor: string,
  ) {
    setFilas((f) => f.map((fila) => (fila.key === key ? { ...fila, [campo]: valor } : fila)));
  }

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
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-ink-soft">Tipo de flujo</label>
        <div
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border px-4 py-3 ${
            esBs ? "border-accent bg-accent-soft/40" : "border-teal bg-teal-soft/40"
          }`}
        >
          <span
            className={`font-mono text-[11px] uppercase tracking-widest ${
              esBs ? "text-accent" : "text-teal"
            }`}
          >
            {ETIQUETA_FLUJO[tipoFlujo]}
          </span>
          <span className="text-[13.5px] text-ink">
            {esBs
              ? "Pagos recibidos en bolívares, convertidos a USDT"
              : "Pagos recibidos en pesos, convertidos a USDT"}
          </span>
          {/* Renglon propio: tres textos de distinto peso en una sola linea
              se leen como uno solo y ninguno se entiende. */}
          <span className="w-full text-[12.5px] text-ink-soft">
            {initial
              ? "Así se registró este cierre."
              : puedeCambiarMoneda
                ? "Cambialo en el selector del header."
                : "Es el único flujo que podés registrar."}
          </span>
        </div>
        <input type="hidden" name="tipo_flujo" value={tipoFlujo} />
      </div>

      <div className="flex flex-col gap-3">
        {/* Con tres botones la barra ya no entra de una linea en pantallas
            chicas: el contenedor envuelve en vez de desbordar, y los botones
            bajan juntos abajo del titulo. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <label className="text-[13px] font-medium text-ink-soft">
            Depósitos {esBs ? "(en Bs)" : "(en COP)"}
          </label>
          <div className="flex flex-wrap items-start justify-end gap-2">
            {/* Los dos primeros suben archivos, pero solo "Subir varios" los
                lee: el orden y el title de cada uno son lo unico que separa
                dos botones que de afuera parecen lo mismo. */}
            <SubirManualmente onAplicar={agregarDesdeArchivos} />
            <SubirVarios onAplicar={agregarDesdeArchivos} />
            <PegarComprobante moneda={moneda} onAplicar={agregarDesdeTexto} />
          </div>
        </div>

        <div className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-surface-alt/40 p-3">
          {/* Los placeholders desaparecen apenas escribis: con tres o cuatro
              filas cargadas ya nadie sabe que columna es cual. El encabezado
              se queda. */}
          {filas.length > 0 && (
            <div className="hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10rem_2.5rem_2.5rem] gap-2.5 px-1 font-mono text-[10.5px] uppercase tracking-wider text-ink-soft md:grid">
              <span>Referencia</span>
              <span>Fecha</span>
              <span>Valor</span>
              <span>Comprobante</span>
            </div>
          )}

          {/* Sin filas no hay ninguna ✕ al lado de la cual poner el +, y el
              formulario quedaria sin salida. Un movimiento puede no tener
              depositos, asi que la fila no se fuerza: se ofrece volver. */}
          {filas.length === 0 && (
            <button
              type="button"
              onClick={() => setFilas((f) => [...f, filaVacia(proximaKey(f))])}
              className="h-10 self-start rounded-[9px] border border-dashed border-border px-3 text-[12.5px] text-ink-soft transition hover:bg-surface-alt"
            >
              + Agregar depósito
            </button>
          )}
          {filas.map((fila, i) => (
            <div key={fila.key} className="flex flex-col gap-1">
              {/* Tres cosas, y las tres importan:
                  - Anchos fijos y no "auto": cada fila es su propia grilla, y
                    con auto el ancho dependia del texto del boton de esa fila
                    ("+ Comprobante" vs "Ver comprobante"), asi que las filas
                    no quedaban alineadas entre si.
                  - minmax(0,1fr) y no 1fr: en una grilla, 1fr es en realidad
                    minmax(auto,1fr), y ese "auto" es el ancho MINIMO propio
                    del input (unos 170px). Tres inputs que se niegan a
                    achicarse se desbordan del panel en vez de repartirse el
                    espacio disponible.
                  - Las seis columnas arrancan recien en md: sin minimo, en un
                    telefono se achicaban hasta quedar inusables. Abajo de md
                    la fila se apila y cada campo ocupa el ancho entero. */}
              <div className="grid items-start gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_10rem_2.5rem_2.5rem]">
              <input
                name="deposito_referencia"
                placeholder="Referencia (opcional)"
                value={fila.referencia}
                onChange={(e) => actualizarFila(fila.key, "referencia", e.target.value)}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <input
                name="deposito_fecha"
                type="date"
                value={fila.fecha}
                onChange={(e) => actualizarFila(fila.key, "fecha", e.target.value)}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <input
                name="deposito_valor"
                type="number"
                step="0.01"
                min={0}
                placeholder={esBs ? "Valor en Bs" : "Valor en COP"}
                value={fila.valor}
                onChange={(e) => actualizarFila(fila.key, "valor", e.target.value)}
                className="h-10 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              />
              <ComprobanteInput
                path={fila.comprobante}
                onChange={(path) => actualizarFila(fila.key, "comprobante", path)}
                onDatos={(datos) => aplicarDatos(fila.key, datos)}
                texto={fila.comprobanteTexto}
                titulo={
                  fila.referencia.trim() !== ""
                    ? `Referencia ${fila.referencia.trim()}`
                    : fila.fecha !== ""
                      ? `Depósito del ${fila.fecha}`
                      : "Comprobante"
                }
                visorRef={visorRef}
                onQuitarTexto={() => actualizarFila(fila.key, "comprobanteTexto", "")}
              />
              {/* md:contents disuelve este contenedor en la grilla: en
                  pantalla angosta es una fila flex con los dos botones
                  juntos, y en md cada boton vuelve a ser su propia celda. */}
              <div className="flex gap-2.5 md:contents">
              <button
                type="button"
                onClick={() => setFilas((f) => f.filter((x) => x.key !== fila.key))}
                className="h-10 w-10 shrink-0 rounded-[9px] border border-border text-[13.5px] text-ink-soft transition hover:bg-critical-soft hover:text-critical"
                aria-label="Quitar depósito"
              >
                ✕
              </button>
              {/* El + vive solo en la ultima fila: en todas seria el mismo
                  boton repetido. Las demas dejan el hueco reservado para que
                  la ✕ no se corra de lugar al agregar o quitar filas. */}
              {i === filas.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setFilas((f) => [...f, filaVacia(proximaKey(f))])}
                  className="h-10 w-10 shrink-0 rounded-[9px] border border-border text-[15px] text-ink-soft transition hover:bg-surface-alt hover:text-accent"
                  aria-label="Agregar otro depósito"
                  title="Agregar otro depósito"
                >
                  +
                </button>
              ) : (
                <div className="hidden w-10 md:block" aria-hidden />
              )}
              </div>
              </div>

              {(fila.leido !== null || fila.avisos.length > 0) && (
                <div className="flex flex-col gap-0.5">
                  {fila.leido !== null && (
                    <span className="text-[11.5px] text-ink-soft">
                      Leído del comprobante: {fila.leido}
                    </span>
                  )}
                  {fila.avisos.map((aviso, n) => (
                    <span key={n} className="text-[11.5px] text-accent">
                      {aviso}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {filas.length > 0 && (
            <div className="mt-0.5 flex items-center justify-between border-t border-border pt-2.5 text-[12.5px] text-ink-soft">
              <span>
                {filas.length} {filas.length === 1 ? "depósito" : "depósitos"}
              </span>
              <span>
                Total recibido:{" "}
                <span className="text-[14px] font-medium text-ink">
                  {formatMonto(totalOrigen, moneda)}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-ink-soft">
              Tasa ({esBs ? "Bs" : "COP"} por USDT)
            </label>
            {tasaPisadaAMano && fuente !== null && (
              <button
                type="button"
                onClick={() => setTasaManual(null)}
                className="text-[11.5px] text-accent transition hover:underline"
              >
                Usar {fuente.etiqueta}
              </button>
            )}
          </div>
          <input
            name="tasa"
            type="number"
            step="0.0001"
            min={0}
            value={tasa}
            onChange={(e) => setTasaManual(e.target.value)}
            placeholder={esBs ? "Ej: 950" : "Se toma la TRM"}
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-ink-soft">Total USDT</label>
            {pisadoAMano && usdtCalculado !== null && (
              <button
                type="button"
                onClick={() => setUsdtManual(null)}
                className="text-[11.5px] text-accent transition hover:underline"
              >
                Usar el cálculo
              </button>
            )}
          </div>
          <input
            name="usdt_total"
            type="number"
            step="0.01"
            min={0}
            required
            value={usdtValor}
            onChange={(e) => setUsdtManual(e.target.value)}
            placeholder="Se calcula solo"
            className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          {/* Misma estructura de fila que Tasa y Total USDT: el dato
              secundario va a la derecha del label. */}
          {/* gap-2 y no justify-between a secas: cuando la columna se
              angosta, "solo admin" se montaba encima del label. Con gap y
              whitespace-nowrap cada uno se queda en su lugar. */}
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="comision_pct_vista"
              className="text-[13px] font-medium text-ink-soft"
            >
              Comisión (%)
            </label>
            <span className="whitespace-nowrap font-mono text-[10.5px] uppercase tracking-widest text-ink-soft/70">
              solo admin
            </span>
          </div>
          {/* Sin atributo name y deshabilitado: este numero no viaja en el
              submit. El porcentaje lo sella la base leyendo la configuracion
              global, asi que aca es estrictamente informativo. */}
          <div className="relative">
            <input
              id="comision_pct_vista"
              type="number"
              value={comisionPct}
              disabled
              title="Lo define el administrador en la configuración global."
              className="h-11 w-full cursor-not-allowed rounded-[10px] border border-border bg-surface-alt pr-9 pl-3.5 text-sm text-ink-soft"
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-ink-soft/70">
              %
            </span>
          </div>
        </div>
      </div>

      <div className="-mt-4 flex flex-col gap-2">
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          {usdtCalculado === null ? (
            <>Carga la tasa y al menos un depósito: el total en USDT sale de esa conversión.</>
          ) : pisadoAMano ? (
            <>
              La conversión da{" "}
              <span className="font-medium text-ink">{formatMonto(usdtCalculado, "USDT")}</span> (
              {formatMonto(totalOrigen, moneda)} ÷ {tasa}). Estás guardando otro valor a mano.
            </>
          ) : (
            <>
              {formatMonto(totalOrigen, moneda)} ÷ {tasa} ={" "}
              <span className="font-medium text-ink">{formatMonto(usdtCalculado, "USDT")}</span>
            </>
          )}
        </p>

        {comisionUsdt !== null && (
          <p className="text-[12.5px] leading-relaxed text-ink-soft">
            Comisión {comisionPct}% sobre {formatMonto(usdtAGuardar, "USDT")}:{" "}
            <span className="font-medium text-ink">{formatMonto(comisionUsdt, "USDT")}</span>{" "}
            <span className="text-ink-soft/80">· porcentaje global, lo cambia un admin</span>
          </p>
        )}

        <div className="rounded-[10px] border border-border bg-surface-alt/50 px-3.5 py-2.5">
          {referencia.estado === "cargando" && (
            <p className="text-[12.5px] text-ink-soft">
              Consultando {esBs ? "el P2P de Binance" : "la TRM oficial"}…
            </p>
          )}

          {referencia.estado === "error" && (
            <p className="text-[12.5px] text-ink-soft">
              Sin referencia ({referencia.mensaje}). Cargá la tasa a mano.
            </p>
          )}

          {fuente !== null && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-soft">
              <span
                className={`font-mono text-[11px] uppercase tracking-widest ${
                  fuente.id === "trm" ? "text-teal" : "text-accent"
                }`}
              >
                {fuente.etiqueta}
              </span>
              <span>
                {fuente.descripcion}:{" "}
                <span className="font-medium text-ink">{formatMonto(fuente.valor, moneda)}</span>
              </span>
              <span className="text-ink-soft/70">{fuente.detalle}</span>
              {tasaPisadaAMano && desvio !== null && Math.abs(desvio) >= 0.005 && (
                <span className={desvio < 0 ? "text-[#8f5e1f]" : "text-[#215d4d]"}>
                  tu tasa está {Math.abs(desvio).toFixed(2)}%{" "}
                  {desvio < 0 ? "por debajo" : "por encima"}
                </span>
              )}
            </div>
          )}
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

      {state.error && <p className="text-sm text-critical">{state.error}</p>}

      <VisorComprobante ref={visorRef} />

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-11 rounded-[10px] bg-ink px-6 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Link href="/dashboard" className="text-sm text-ink-soft transition hover:text-ink">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
