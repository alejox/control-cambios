"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * El estado de la migración de claves al gestor de secretos.
 *
 * Existe porque la migración no puede ser un comando que alguien corre por
 * consola y nadie más ve: el paso siguiente —- borrar el texto plano de la
 * base -— solo se puede dar cuando ESTA pantalla dice que no queda nada
 * pendiente. Si el semáforo vive en una terminal, se retira el texto plano
 * por memoria, y "me acordaba que estaba todo" no es una verificación.
 *
 * Nunca muestra ni pide una clave: la comparación entre lo que hay en la
 * base y lo que hay en el gestor pasa entera en el servidor, y de acá solo
 * viajan números y, cuando algo no cuadra, el nombre del panel.
 */

type Ubicacion = { panel: string; cuenta: number };

type Diagnostico = {
  conClave: number;
  respaldadas: number;
  pendientes: number;
  noResuelven: Ubicacion[];
  difieren: Ubicacion[];
  soloEnElGestor: number;
  listoParaRetirarTextoPlano: boolean;
  creados?: number;
  fallidos?: number;
};

const BOTON =
  "h-9 rounded-[9px] bg-ink px-3.5 text-[13px] font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-40";
const ENLACE = "text-[12.5px] text-accent transition hover:underline disabled:opacity-40";

export default function RespaldoBitwarden({ pendientes }: { pendientes: number }) {
  const router = useRouter();
  const [diagnostico, setDiagnostico] = useState<Diagnostico | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function pedir(metodo: "GET" | "POST") {
    setTrabajando(true);
    setError(null);
    try {
      const respuesta = await fetch("/api/bitwarden/migrar", { method: metodo });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok && respuesta.status !== 207) {
        setError(cuerpo?.error ?? "No pudimos hablar con el gestor de secretos.");
        return;
      }
      setDiagnostico(cuerpo as Diagnostico);
      // Un POST que creó secretos cambió lo que hay en la base, y el
      // "pendientes" que bajó del servidor quedó viejo.
      //
      // refresh() y no location.reload(): el refresh vuelve a pedir el
      // componente de servidor y mezcla el resultado SIN tirar el estado de
      // React. Una recarga entera se llevaría puesto el diagnóstico que el
      // usuario acaba de pedir, que es justo lo que vino a ver.
      if (metodo === "POST" && cuerpo?.creados > 0) router.refresh();
    } catch {
      setError("No pudimos hablar con el gestor de secretos.");
    } finally {
      setTrabajando(false);
    }
  }

  // Sin pendientes y sin haber preguntado nada, esto es una línea al
  // margen. Ocupar una tarjeta entera para decir "está todo bien" sería
  // empujar los paneles hacia abajo todos los días por una migración que
  // pasa una vez.
  if (pendientes === 0 && !diagnostico && !error) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-soft">
        <span>Tus claves ya están respaldadas en el gestor de secretos.</span>
        <button
          type="button"
          onClick={() => void pedir("GET")}
          disabled={trabajando}
          className={ENLACE}
        >
          {trabajando ? "Verificando…" : "Verificar"}
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/[0.04] p-5 shadow-sm">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-ink-soft">
          Gestor de secretos
        </p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink">
          {pendientes > 0 ? (
            <>
              {pendientes === 1
                ? "Queda 1 clave sin respaldar"
                : `Quedan ${pendientes} claves sin respaldar`}{" "}
              en el gestor. Respaldarlas no cambia nada de lo que ves acá:
              guarda una copia en Bitwarden para poder sacarlas de la base más
              adelante.
            </>
          ) : (
            "Tus claves ya están respaldadas en el gestor de secretos."
          )}
        </p>
      </div>

      {diagnostico && <Resumen diagnostico={diagnostico} />}

      {error && <p className="text-[12.5px] text-critical">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        {pendientes > 0 && (
          <button
            type="button"
            onClick={() => void pedir("POST")}
            disabled={trabajando}
            className={BOTON}
          >
            {trabajando ? "Respaldando…" : "Respaldar ahora"}
          </button>
        )}
        <button
          type="button"
          onClick={() => void pedir("GET")}
          disabled={trabajando}
          className={ENLACE}
        >
          {trabajando ? "Verificando…" : "Verificar"}
        </button>
      </div>
    </div>
  );
}

function Resumen({ diagnostico }: { diagnostico: Diagnostico }) {
  const {
    conClave,
    respaldadas,
    pendientes,
    noResuelven,
    difieren,
    listoParaRetirarTextoPlano,
  } = diagnostico;

  return (
    <div className="flex flex-col gap-1.5 border-t border-border/70 pt-3 text-[12.5px] leading-relaxed text-ink-soft">
      <p>
        {respaldadas} de {conClave}{" "}
        {conClave === 1 ? "clave respaldada" : "claves respaldadas"}
        {pendientes > 0 && `, ${pendientes} sin respaldar`}.
      </p>

      {/* Estas dos listas son las que importan: una referencia que no
          resuelve o un valor que no coincide significa que el respaldo
          NO sirve todavía, por más que el contador diga que está lleno. */}
      {noResuelven.length > 0 && (
        <p className="text-critical">
          {noResuelven.length === 1
            ? "Una cuenta apunta a un secreto que el gestor no encuentra"
            : `${noResuelven.length} cuentas apuntan a secretos que el gestor no encuentra`}
          : {noResuelven.map((u) => `${u.panel} (cuenta ${u.cuenta})`).join(", ")}.
          Volvé a guardar esos paneles.
        </p>
      )}

      {difieren.length > 0 && (
        <p className="text-critical">
          {difieren.length === 1
            ? "Una cuenta tiene en el gestor un valor distinto al de la base"
            : `${difieren.length} cuentas tienen en el gestor un valor distinto al de la base`}
          : {difieren.map((u) => `${u.panel} (cuenta ${u.cuenta})`).join(", ")}.
          Abrí ese panel y guardá la clave que sea la correcta.
        </p>
      )}

      {listoParaRetirarTextoPlano ? (
        <p className="text-ink">
          Todo verificado: el gestor devuelve exactamente lo que dice la base.
          Ya se puede sacar el texto plano de Supabase.
        </p>
      ) : (
        <p>Todavía no se puede retirar el texto plano de la base.</p>
      )}
    </div>
  );
}
