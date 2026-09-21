"use client";

import { useActionState, useEffect, useState } from "react";
import { eliminarPanel, guardarPanel } from "./actions";
import { ESTADO_INICIAL, type Cuenta, type Panel, type PanelState } from "./estado";

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

      {(panel.cuentas ?? []).map((cuenta, i) => (
        <div
          key={i}
          className={`flex flex-col gap-2 ${
            i > 0 ? "border-t border-border/70 pt-3" : ""
          }`}
        >
          {/* El número solo cuando hay más de una: con una sola, "Cuenta 1"
              es ruido que hace pensar que falta la 2. */}
          {panel.cuentas.length > 1 && (
            <span className={`${ETIQUETA} text-ink-soft/70`}>Cuenta {i + 1}</span>
          )}
          {cuenta.usuario && <Campo etiqueta="Usuario" valor={cuenta.usuario} />}
          {cuenta.clave && <Campo etiqueta="Clave" valor={cuenta.clave} secreto />}
          {/* Tenía una clave respaldada y el gestor no la devolvió. Se dice
              en vez de no mostrar nada: un hueco donde iba la clave se lee
              como "esta cuenta no tiene", y la respuesta a eso sería
              escribirla de nuevo, que es justo lo que no hay que hacer
              mientras el gestor esté caído. */}
          {cuenta.claveNoDisponible && (
            <p className="text-[12.5px] leading-relaxed text-critical">
              La clave está en el gestor de secretos y no pudimos leerla ahora.
              Probá recargar en un momento; no la vuelvas a escribir todavía.
            </p>
          )}
        </div>
      ))}

      {panel.notas && (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
          {panel.notas}
        </p>
      )}
    </div>
  );
}

/**
 * Un dato con su botón de copiar. Si es secreto, arranca tapado y hay un
 * botón para mostrarlo.
 *
 * Copiar sigue siendo el camino principal —- la clave va del portapapeles
 * al panel del proveedor sin pasar por la pantalla -— pero hay casos donde
 * la clave hay que leerla: dictarla, tipearla en otro aparato, o comparar
 * si la que está guardada es la que todavía sirve.
 *
 * Por eso el estado arranca en tapado y vuelve solo: a los 20 segundos se
 * cierra de nuevo, para que una clave no quede a la vista en una pantalla
 * que alguien dejó abierta. Si el portapapeles falla, se revela también,
 * con el aviso de seleccionarla a mano.
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
  const [revelado, setRevelado] = useState(false);
  const [falloAlCopiar, setFalloAlCopiar] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  // Se vuelve a tapar sola: una clave revelada no se queda a la vista
  // porque alguien se olvidó de apretar "Ocultar".
  useEffect(() => {
    if (!secreto || !revelado) return;
    const t = setTimeout(() => setRevelado(false), 20000);
    return () => clearTimeout(t);
  }, [secreto, revelado]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
    } catch {
      setFalloAlCopiar(true);
      setRevelado(true);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`${ETIQUETA} w-16 flex-none`}>{etiqueta}</span>
      <span className="min-w-0 flex-1 break-all font-mono text-[13px] text-ink">
        {secreto && !revelado ? "••••••••••" : valor}
      </span>
      {falloAlCopiar && (
        <span className="text-[11.5px] text-ink-soft">
          No pude copiar: seleccionala a mano.
        </span>
      )}
      {secreto && (
        <button
          type="button"
          onClick={() => setRevelado((p) => !p)}
          aria-pressed={revelado}
          className={`${BOTON_SUAVE} px-2.5 text-[12px]`}
        >
          {revelado ? "Ocultar" : "Mostrar"}
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
  //
  // Salvo que venga un aviso. Cerrar en ese caso haría desaparecer la única
  // señal de que la clave quedó sin respaldo: el usuario vería el formulario
  // cerrarse, que es exactamente lo que ve cuando sale todo bien, y se iría
  // creyendo que el respaldo existe. El formulario se queda abierto con el
  // aviso hasta que lo cierre a mano.
  useEffect(() => {
    if (state.ok && !state.aviso) alTerminar();
  }, [state.ok, state.aviso, alTerminar]);

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
      <Cuentas valores={panel?.cuentas} />

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
          {/* Después de un guardado exitoso, "Cancelar" se lee como
              "deshacer lo que acabás de guardar". No lo deshace: solo
              cierra. */}
          {state.ok ? "Cerrar" : "Cancelar"}
        </button>
        {panel && <Eliminar panel={panel} />}
        {state.error && (
          <span className="text-[12.5px] text-critical">{state.error}</span>
        )}
        {state.aviso && (
          <span className="text-[12.5px] text-ink-soft">{state.aviso}</span>
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

/**
 * Las cuentas del panel: usuario y clave, juntos, una o varias.
 *
 * Los dos campos viven en la MISMA fila y no en dos listas separadas
 * porque se leen emparejados por posición del otro lado. Separarlos en la
 * pantalla —- una lista de usuarios acá, otra de claves allá -— dejaría
 * que se borre uno sin el otro, y la clave de la tercera cuenta terminaría
 * pegada a la segunda.
 *
 * Siempre queda al menos una fila, y la × aparece recién con la segunda.
 */
function Cuentas({ valores }: { valores?: Cuenta[] }) {
  const [cuentas, setCuentas] = useState<Cuenta[]>(
    valores && valores.length > 0 ? valores : [{ usuario: "", clave: "" }],
  );

  function cambiar(i: number, campo: keyof Cuenta, valor: string) {
    setCuentas((previas) =>
      previas.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className={ETIQUETA}>
        {cuentas.length === 1 ? "Cuenta" : "Cuentas"}
      </span>

      {cuentas.map((cuenta, i) => (
        <div key={i} className="flex items-start gap-2">
          {/* Va DENTRO de la fila, al lado de su usuario y su clave, porque
              del otro lado los tres campos se emparejan por posición. Es lo
              que permite borrar la cuenta 2 y que la 3 siga apuntando a SU
              secreto en vez de al de la que se fue.

              Que viaje al navegador y vuelva no lo convierte en una llave:
              el servidor solo reutiliza un secret_id que ya figure en esa
              fila de la base, así que mandar uno ajeno no da acceso a nada,
              simplemente se ignora y la cuenta estrena secreto nuevo. */}
          <input type="hidden" name="secret_id" value={cuenta.secret_id ?? ""} />
          {/* Si el campo de al lado llegó con la clave adentro.
              Va vacío solo cuando la cuenta tiene un secreto que el gestor
              no devolvió: ahí el campo se ve en blanco sin que nadie lo
              haya borrado, y guardar así no puede significar "borrala". */}
          <input
            type="hidden"
            name="clave_legible"
            value={cuenta.claveNoDisponible ? "" : "1"}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
            <input
              name="usuario"
              value={cuenta.usuario}
              onChange={(e) => cambiar(i, "usuario", e.target.value)}
              placeholder="Usuario"
              aria-label={`Usuario de la cuenta ${i + 1}`}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={INPUT}
            />
            <input
              name="clave"
              type="password"
              value={cuenta.clave}
              onChange={(e) => cambiar(i, "clave", e.target.value)}
              placeholder="Clave"
              aria-label={`Clave de la cuenta ${i + 1}`}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className={INPUT}
            />
          </div>
          {cuentas.length > 1 && (
            <button
              type="button"
              onClick={() => setCuentas((p) => p.filter((_, j) => j !== i))}
              aria-label={`Quitar la cuenta ${i + 1}`}
              title="Quitar esta cuenta"
              className="h-9 w-9 flex-none rounded-[9px] border border-border bg-surface text-[15px] leading-none text-ink-soft transition hover:border-critical-soft hover:text-critical"
            >
              ×
            </button>
          )}
        </div>
      ))}

      {/* Se avisa una sola vez, no por fila: repetirlo en cada cuenta
          convierte una advertencia en ruido que se saltea. */}
      {cuentas.some((c) => c.claveNoDisponible) && (
        <p className="text-[12px] leading-relaxed text-critical">
          Alguna clave no se pudo leer del gestor de secretos y su campo está
          en blanco. Podés guardar igual —- no se va a borrar -— pero no
          escribas una clave nueva ahí hasta poder ver la que hay.
        </p>
      )}

      <button
        type="button"
        onClick={() => setCuentas((p) => [...p, { usuario: "", clave: "" }])}
        className="self-start text-[12.5px] text-accent transition hover:underline"
      >
        + Agregar otra cuenta
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
