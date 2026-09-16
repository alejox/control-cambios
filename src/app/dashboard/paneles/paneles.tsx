"use client";

import { useActionState, useEffect, useState } from "react";
import { eliminarPanel, guardarPanel } from "./actions";
import { ESTADO_INICIAL, type Panel, type PanelState } from "./estado";

const INPUT =
  "h-9 w-full rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const ETIQUETA =
  "font-mono text-[10px] uppercase tracking-widest text-ink-soft";
const BOTON =
  "h-9 rounded-[9px] bg-ink px-3.5 text-[13px] font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40";
const BOTON_SUAVE =
  "h-9 rounded-[9px] border border-border bg-surface px-3 text-[13px] text-ink-soft transition hover:text-ink disabled:opacity-40";

export default function Paneles({ paneles }: { paneles: Panel[] }) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {paneles.length === 0 && !creando && (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-[14px] leading-relaxed text-ink-soft shadow-sm">
          Todavía no guardaste ningún panel.
        </div>
      )}

      {paneles.map((panel) => (
        <Tarjeta key={panel.id} panel={panel} />
      ))}

      {creando ? (
        <Formulario
          titulo="Panel nuevo"
          alTerminar={() => setCreando(false)}
        />
      ) : (
        <button type="button" onClick={() => setCreando(true)} className={`${BOTON} self-start`}>
          + Agregar un panel
        </button>
      )}
    </div>
  );
}

/** Un panel guardado: lo que necesitás para entrar, a un toque cada cosa. */
function Tarjeta({ panel }: { panel: Panel }) {
  const [editando, setEditando] = useState(false);

  if (editando) {
    return (
      <Formulario
        titulo={panel.nombre}
        panel={panel}
        alTerminar={() => setEditando(false)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[16px] font-medium text-ink">{panel.nombre}</h2>
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="text-[12.5px] text-accent transition hover:underline"
        >
          Editar
        </button>
      </div>

      {(panel.urls ?? []).length > 0 && (
        <div className="flex flex-col gap-1">
          {panel.urls.map((url) => (
            <a
              key={url}
              href={url}
              target="_blank"
              // noreferrer además de noopener: el panel de un proveedor no
              // tiene por qué enterarse de desde dónde llegaste.
              rel="noopener noreferrer"
              className="break-all text-[13.5px] text-accent transition hover:underline"
            >
              {url}
            </a>
          ))}
        </div>
      )}

      {panel.usuario && <Campo etiqueta="Usuario" valor={panel.usuario} />}
      {panel.clave && <Campo etiqueta="Clave" valor={panel.clave} secreto />}

      {panel.notas && (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
          {panel.notas}
        </p>
      )}
    </div>
  );
}

/**
 * Un dato con su botón de copiar, y si es secreto también el de mostrar.
 *
 * Arranca enmascarado: la razón de existir de esta pantalla es abrirla
 * delante de otra persona para entrar a un panel, y ahí la clave no tiene
 * por qué estar a la vista de quien mire por encima del hombro.
 *
 * Copiar es lo que se usa el 90% de las veces, así que se puede sin
 * revelar nada.
 */
function Campo({
  etiqueta,
  valor,
  secreto = false,
}: {
  etiqueta: string;
  valor: string;
  secreto?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
    } catch {
      // Sin https o sin permiso no hay portapapeles. Se revela el dato
      // para que se pueda seleccionar a mano, que es mejor que un botón
      // que no hace nada y no dice por qué.
      setVisible(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${ETIQUETA} w-16 flex-none`}>{etiqueta}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">
        {secreto && !visible ? "••••••••••" : valor}
      </span>
      {secreto && (
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Ocultar ${etiqueta.toLowerCase()}` : `Mostrar ${etiqueta.toLowerCase()}`}
          className={`${BOTON_SUAVE} px-2.5 text-[12px]`}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      )}
      <button
        type="button"
        onClick={() => void copiar()}
        className={`${BOTON_SUAVE} px-2.5 text-[12px]`}
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}

function Formulario({
  titulo,
  panel,
  alTerminar,
}: {
  titulo: string;
  panel?: Panel;
  alTerminar: () => void;
}) {
  const [state, formAction, pending] = useActionState(guardarPanel, ESTADO_INICIAL);

  // Cerrar en el render que trae ok: el servidor ya revalidó la ruta, así
  // que la tarjeta de atrás tiene los datos nuevos.
  useEffect(() => {
    if (state.ok) alTerminar();
  }, [state.ok, alTerminar]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/[0.04] p-5 shadow-sm"
    >
      {panel && <input type="hidden" name="id" value={panel.id} />}

      <h2 className="text-[16px] font-medium text-ink">{titulo}</h2>

      <Entrada nombre="nombre" etiqueta="Nombre" valor={panel?.nombre} requerido
        ayuda="Cómo lo reconocés vos: “Oleada admin”, “Stella reventa”." />
      <Links valores={panel?.urls} />
      <Entrada nombre="usuario" etiqueta="Usuario" valor={panel?.usuario} />
      <Entrada nombre="clave" etiqueta="Clave" valor={panel?.clave} tipo="password" />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="notas" className={ETIQUETA}>
          Notas
        </label>
        <textarea
          id="notas"
          name="notas"
          rows={3}
          defaultValue={panel?.notas}
          placeholder="Lo que se olvida: el 2FA, a quién pedirle el acceso, qué vence cuándo."
          className="rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-[13.5px] leading-relaxed outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BOTON}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <button type="button" onClick={alTerminar} className={BOTON_SUAVE}>
          Cancelar
        </button>
        {panel && <Eliminar panel={panel} />}
        {state.error && (
          <span className="text-[12.5px] text-critical">{state.error}</span>
        )}
      </div>
    </form>
  );
}

/**
 * Los links del panel: uno o varios, con un + para sumar y una × para sacar.
 *
 * Varios porque un mismo proveedor suele tener más de una puerta —- la de
 * administración, la de reventa, a veces un espejo -— y guardar una sola
 * obligaba a crear dos paneles con el mismo usuario y la misma clave, que
 * después se desincronizan en cuanto cambia la contraseña.
 *
 * Siempre queda al menos una casilla, aunque esté vacía: un formulario sin
 * ninguna obliga a adivinar que primero hay que apretar el +. La × aparece
 * recién con la segunda, que es cuando quitar significa algo.
 *
 * Todas se llaman "url": del otro lado se leen con getAll y se descartan
 * las vacías.
 */
function Links({ valores }: { valores?: string[] }) {
  const [links, setLinks] = useState<string[]>(
    valores && valores.length > 0 ? valores : [""],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="url-0" className={ETIQUETA}>
        {links.length === 1 ? "Link del panel" : "Links del panel"}
      </label>

      {links.map((valor, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            id={`url-${i}`}
            name="url"
            type="url"
            value={valor}
            onChange={(e) =>
              setLinks((previos) =>
                previos.map((v, j) => (j === i ? e.target.value : v)),
              )
            }
            placeholder="https://…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className={INPUT}
          />
          {links.length > 1 && (
            <button
              type="button"
              onClick={() => setLinks((p) => p.filter((_, j) => j !== i))}
              aria-label={`Quitar el link ${i + 1}`}
              title="Quitar este link"
              className="h-9 w-9 flex-none rounded-[9px] border border-border bg-surface text-[15px] leading-none text-ink-soft transition hover:border-critical-soft hover:text-critical"
            >
              ×
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={() => setLinks((p) => [...p, ""])}
        className="self-start text-[12.5px] text-accent transition hover:underline"
      >
        + Agregar otro link
      </button>
    </div>
  );
}

function Entrada({
  nombre,
  etiqueta,
  valor,
  tipo = "text",
  requerido = false,
  marcador,
  ayuda,
}: {
  nombre: string;
  etiqueta: string;
  valor?: string;
  tipo?: string;
  requerido?: boolean;
  marcador?: string;
  ayuda?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nombre} className={ETIQUETA}>
        {etiqueta}
      </label>
      <input
        id={nombre}
        name={nombre}
        type={tipo}
        required={requerido}
        defaultValue={valor}
        placeholder={marcador}
        // El navegador no tiene que ofrecer guardar esto ni autocompletarlo
        // con otra cuenta: acá se escribe la clave DE UN PANEL, no la de
        // esta app, y mezclarlas termina en un acceso pisado.
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        className={INPUT}
      />
      {ayuda && <p className="text-[12px] text-ink-soft">{ayuda}</p>}
    </div>
  );
}

function Eliminar({ panel }: { panel: Panel }) {
  const [state, formAction, pending] = useActionState<PanelState, FormData>(
    eliminarPanel,
    ESTADO_INICIAL,
  );
  const [seguro, setSeguro] = useState(false);

  if (!seguro) {
    return (
      <button
        type="button"
        onClick={() => setSeguro(true)}
        className="text-[12.5px] text-critical transition hover:underline"
      >
        Eliminar
      </button>
    );
  }

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={panel.id} />
      <span className="text-[12.5px] text-ink-soft">¿Seguro?</span>
      <button
        type="submit"
        disabled={pending}
        className="text-[12.5px] font-medium text-critical transition hover:underline disabled:opacity-40"
      >
        {pending ? "Borrando…" : "Sí, borrar"}
      </button>
      <button
        type="button"
        onClick={() => setSeguro(false)}
        className="text-[12.5px] text-ink-soft transition hover:underline"
      >
        No
      </button>
      {state.error && (
        <span className="text-[12.5px] text-critical">{state.error}</span>
      )}
    </form>
  );
}
