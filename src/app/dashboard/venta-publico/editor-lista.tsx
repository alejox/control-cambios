"use client";

import { useActionState } from "react";
import {
  ETIQUETA_SECCION,
  NOMBRE_MONEDA,
  formatMontoLista,
  necesitaTasa,
  type GrupoLista,
  type Lista,
  type PlanLista,
} from "@/lib/venta-publico";
import {
  crearGrupo,
  crearPlan,
  eliminarGrupo,
  eliminarPlan,
  guardarGrupo,
  guardarPlan,
  guardarTextos,
  moverEnLista,
} from "./actions";
import { ESTADO_INICIAL, type VentaState } from "./estado";

const INPUT =
  "h-9 rounded-[9px] border border-border bg-surface px-3 text-[13.5px] outline-none focus:border-accent focus:ring-1 focus:ring-accent";
const BOTON =
  "h-9 rounded-[9px] bg-ink px-3.5 text-[13px] font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40";
const BOTON_SUAVE =
  "h-9 rounded-[9px] border border-border bg-surface px-3 text-[13px] text-ink-soft transition hover:text-ink disabled:opacity-40";
const ETIQUETA_CAMPO =
  "font-mono text-[10px] uppercase tracking-widest text-ink-soft";

/**
 * Todo lo que se puede cambiar de una lista sin tocar la base.
 *
 * Lo que se edita acá es la PRESENTACIÓN de esta moneda: el encabezado,
 * el pie, el formato de la línea, el título de cada grupo y la etiqueta
 * de cada plan. El precio en dólares es la excepción a propósito: es uno
 * solo para todas las monedas, y por eso está avisado al lado del campo.
 *
 * Cada cosa se guarda por su cuenta, con su propia acción. Un único
 * formulario gigante obligaría a mandar la lista entera para corregir un
 * número, y cualquier error dejaría a medio guardar todo lo demás.
 */
export default function EditorLista({ lista }: { lista: Lista }) {
  return (
    <div className="flex flex-col gap-5">
      <FormTextos lista={lista} />

      {lista.grupos.map((grupo) => (
        <TarjetaGrupo key={grupo.id} lista={lista} grupo={grupo} />
      ))}

      <FormNuevoGrupo lista={lista} />
    </div>
  );
}

function Aviso({ state, hecho = "Guardado." }: { state: VentaState; hecho?: string }) {
  if (state.error) {
    return <span className="text-[12.5px] text-critical">{state.error}</span>;
  }
  if (state.ok) {
    return <span className="text-[12.5px] text-teal">{hecho}</span>;
  }
  return null;
}

function FormTextos({ lista }: { lista: Lista }) {
  const [state, formAction, pending] = useActionState(guardarTextos, ESTADO_INICIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm"
    >
      <input type="hidden" name="lista_id" value={lista.id} />

      <p className="text-[13px] text-ink-soft">
        Estos textos son los de{" "}
        <strong className="font-medium text-ink">
          {ETIQUETA_SECCION[lista.moneda]}
        </strong>
        . Las otras monedas tienen los suyos.
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`encabezado-${lista.id}`} className={ETIQUETA_CAMPO}>
          Encabezado del mensaje
        </label>
        <textarea
          id={`encabezado-${lista.id}`}
          name="encabezado"
          rows={6}
          defaultValue={lista.encabezado}
          placeholder="La presentación del servicio, tal como la mandás por WhatsApp."
          className="rounded-[10px] border border-border bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`plantilla-${lista.id}`} className={ETIQUETA_CAMPO}>
          Formato de cada línea de precio
        </label>
        <input
          id={`plantilla-${lista.id}`}
          name="plantilla_linea"
          defaultValue={lista.plantilla}
          className={`${INPUT} font-mono`}
        />
        <p className="text-[12.5px] text-ink-soft">
          Marcadores: <code className="font-mono">{"{monto}"}</code>,{" "}
          <code className="font-mono">{"{etiqueta}"}</code> y{" "}
          <code className="font-mono">{"{sufijo}"}</code>. Lo que saques de acá
          deja de salir en el mensaje.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`pie-${lista.id}`} className={ETIQUETA_CAMPO}>
          Pie del mensaje
        </label>
        <textarea
          id={`pie-${lista.id}`}
          name="pie"
          rows={12}
          defaultValue={lista.pie}
          placeholder="El ejemplo de compra y la advertencia legal."
          className="rounded-[10px] border border-border bg-surface px-3.5 py-3 text-[13.5px] leading-relaxed outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <p className="text-[12.5px] text-ink-soft">
          Marcador: <code className="font-mono">{"{medios}"}</code>. Ahí entran
          tus medios de cobro en {ETIQUETA_SECCION[lista.moneda]}, que se cargan
          una vez para las cuatro marcas en “Mis medios de cobro”. Si lo sacás,
          el mensaje sale sin decir por dónde pagar.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={BOTON}>
          {pending ? "Guardando…" : "Guardar textos"}
        </button>
        <Aviso state={state} />
        <span className="text-[12.5px] text-ink-soft">
          Los emojis y los asteriscos van tal cual: WhatsApp los usa para dar
          formato.
        </span>
      </div>
    </form>
  );
}

function TarjetaGrupo({ lista, grupo }: { lista: Lista; grupo: GrupoLista }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <FormTituloGrupo lista={lista} grupo={grupo} />
        <BotonesOrden entidad="grupo" id={grupo.id} />
        <FormEliminarGrupo grupo={grupo} />
      </div>

      <div className="flex flex-col gap-2">
        {grupo.planes.length === 0 ? (
          <p className="text-[13px] text-ink-soft">
            Todavía no hay planes en este grupo.
          </p>
        ) : (
          grupo.planes.map((plan) => (
            <FilaPlan key={plan.id} lista={lista} plan={plan} />
          ))
        )}
      </div>

      <FormNuevoPlan lista={lista} grupoId={grupo.id} />
    </div>
  );
}

function FormTituloGrupo({ lista, grupo }: { lista: Lista; grupo: GrupoLista }) {
  const [state, formAction, pending] = useActionState(guardarGrupo, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex min-w-0 flex-1 items-center gap-2">
      <input type="hidden" name="grupo_id" value={grupo.id} />
      <input type="hidden" name="moneda" value={lista.moneda} />
      <input
        name="titulo"
        required
        defaultValue={grupo.titulo ?? ""}
        placeholder={`Título de "${grupo.nombre}" en ${NOMBRE_MONEDA[lista.moneda]}`}
        aria-label={`Título del grupo en ${NOMBRE_MONEDA[lista.moneda]}`}
        className={`${INPUT} min-w-0 flex-1`}
      />
      <button type="submit" disabled={pending} className={BOTON_SUAVE}>
        {pending ? "Guardando…" : "Guardar"}
      </button>
      <Aviso state={state} />
    </form>
  );
}

function FormEliminarGrupo({ grupo }: { grupo: GrupoLista }) {
  const [state, formAction, pending] = useActionState(eliminarGrupo, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="grupo_id" value={grupo.id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (
            !confirm(
              `¿Eliminar "${grupo.nombre}"? Se borra en TODAS las monedas, con sus ${grupo.planes.length} planes y sus precios.`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="h-9 rounded-[9px] px-2 text-[13px] text-ink-soft transition hover:text-critical disabled:opacity-40"
      >
        {pending ? "Eliminando…" : "Eliminar grupo"}
      </button>
      <Aviso state={state} hecho="Eliminado." />
    </form>
  );
}

function FilaPlan({ lista, plan }: { lista: Lista; plan: PlanLista }) {
  const [state, formAction, pending] = useActionState(guardarPlan, ESTADO_INICIAL);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-[10px] bg-surface-alt/50 px-3 py-2">
      <form
        action={formAction}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      >
        <input type="hidden" name="plan_id" value={plan.id} />
        <input type="hidden" name="moneda" value={lista.moneda} />
        <input
          name="etiqueta"
          required
          defaultValue={plan.etiqueta ?? ""}
          placeholder={`"${plan.nombre}" en ${NOMBRE_MONEDA[lista.moneda]}`}
          aria-label={`Etiqueta en ${NOMBRE_MONEDA[lista.moneda]}`}
          className={`${INPUT} min-w-0 flex-1`}
        />
        <input
          name="sufijo"
          defaultValue={plan.sufijo}
          placeholder="sufijo (va pegado al precio)"
          aria-label="Sufijo, va pegado después del precio"
          className={`${INPUT} w-52`}
        />
        <div className="flex items-center gap-1.5">
          <input
            name="precio_usd"
            inputMode="decimal"
            defaultValue={plan.precioUsd === null ? "" : formatMontoLista(plan.precioUsd, "USD")}
            placeholder="pendiente"
            aria-label="Precio en dólares, común a todas las monedas"
            className={`${INPUT} w-24 text-right`}
          />
          <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
            USD
          </span>
        </div>
        <button type="submit" disabled={pending} className={BOTON_SUAVE}>
          {pending ? "Guardando…" : "Guardar"}
        </button>
        <Aviso state={state} />
      </form>

      <BotonesOrden entidad="plan" id={plan.id} />
      <FormEliminarPlan plan={plan} />
    </div>
  );
}

function FormEliminarPlan({ plan }: { plan: PlanLista }) {
  const [state, formAction, pending] = useActionState(eliminarPlan, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="plan_id" value={plan.id} />
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (
            !confirm(
              `¿Eliminar "${plan.nombre}"? Se borra en todas las monedas, con su precio.`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="h-9 rounded-[9px] px-2 text-[13px] text-ink-soft transition hover:text-critical disabled:opacity-40"
      >
        {pending ? "Eliminando…" : "Eliminar"}
      </button>
      <Aviso state={state} hecho="Eliminado." />
    </form>
  );
}

/**
 * Subir y bajar. Los dos botones son submit del mismo formulario: el
 * name/value del que se apretó viaja en el FormData, así que la acción
 * sabe para qué lado mover sin necesidad de estado en el cliente.
 */
function BotonesOrden({ entidad, id }: { entidad: "grupo" | "plan"; id: string }) {
  const [state, formAction, pending] = useActionState(moverEnLista, ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="entidad" value={entidad} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        name="direccion"
        value="arriba"
        disabled={pending}
        title="Subir"
        aria-label={`Subir ${entidad}`}
        className="h-9 w-9 rounded-[9px] border border-border bg-surface text-[13px] text-ink-soft transition hover:text-ink disabled:opacity-40"
      >
        ↑
      </button>
      <button
        type="submit"
        name="direccion"
        value="abajo"
        disabled={pending}
        title="Bajar"
        aria-label={`Bajar ${entidad}`}
        className="h-9 w-9 rounded-[9px] border border-border bg-surface text-[13px] text-ink-soft transition hover:text-ink disabled:opacity-40"
      >
        ↓
      </button>
      {state.error && <span className="text-[12.5px] text-critical">{state.error}</span>}
    </form>
  );
}

function FormNuevoPlan({ lista, grupoId }: { lista: Lista; grupoId: string }) {
  const [state, formAction, pending] = useActionState(crearPlan, ESTADO_INICIAL);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 border-t border-border pt-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="grupo_id" value={grupoId} />
        <input type="hidden" name="moneda" value={lista.moneda} />
        <input
          name="etiqueta"
          required
          placeholder={lista.moneda === "USD" ? "Mensual" : "1 mes"}
          aria-label="Etiqueta del plan nuevo"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <input
          name="sufijo"
          placeholder="sufijo (opcional)"
          aria-label="Sufijo del plan nuevo"
          className={`${INPUT} w-52`}
        />
        <div className="flex items-center gap-1.5">
          <input
            name="precio_usd"
            inputMode="decimal"
            placeholder="7"
            aria-label="Precio en dólares del plan nuevo"
            className={`${INPUT} w-24 text-right`}
          />
          <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
            USD
          </span>
        </div>
        <button type="submit" disabled={pending} className={BOTON}>
          {pending ? "Agregando…" : "Agregar plan"}
        </button>
        <Aviso state={state} hecho="Agregado." />
      </div>
      <p className="text-[12.5px] text-ink-soft">
        El precio en dólares es uno solo para todas las monedas
        {necesitaTasa(lista.moneda)
          ? ": en esta lista se convierte con la tasa de venta."
          : "."}{" "}
        Dejalo vacío si todavía no lo sabés: el plan queda cargado y avisado, sin
        salir en el mensaje. La etiqueta, en cambio, es de{" "}
        {ETIQUETA_SECCION[lista.moneda].toLowerCase()}.
      </p>
    </form>
  );
}

function FormNuevoGrupo({ lista }: { lista: Lista }) {
  const [state, formAction, pending] = useActionState(crearGrupo, ESTADO_INICIAL);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-border bg-surface p-5"
    >
      <input type="hidden" name="proveedor_id" value={lista.proveedorId} />
      <input type="hidden" name="moneda" value={lista.moneda} />
      <input
        name="titulo"
        required
        placeholder={
          lista.moneda === "USD"
            ? "Plan 3 dispositivos: 📺📲"
            : "📺📲 *Plan 3 dispositivos*"
        }
        aria-label="Título del grupo nuevo"
        className={`${INPUT} min-w-0 flex-1`}
      />
      <button type="submit" disabled={pending} className={BOTON}>
        {pending ? "Agregando…" : "Agregar grupo"}
      </button>
      <Aviso state={state} hecho="Agregado." />
    </form>
  );
}
