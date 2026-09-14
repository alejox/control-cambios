"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Moneda } from "@/lib/items";

const OPCIONES: { moneda: Moneda; etiqueta: string; titulo: string }[] = [
  { moneda: "VES", etiqueta: "Bs", titulo: "Mis cierres son en bolívares (Bs → USDT)" },
  { moneda: "COP", etiqueta: "COP", titulo: "Mis cierres son en pesos (COP → USDT)" },
];

/**
 * Selector de moneda del header. Define con que moneda trabaja este usuario,
 * y por lo tanto el tipo de flujo que traen sus cierres nuevos.
 *
 * Reemplaza a los tabs que estaban dentro del formulario: la moneda es una
 * decision de como trabaja la persona, no algo que se elija cierre por cierre.
 */
export default function SelectorMoneda({ valor }: { valor: Moneda }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  // Optimista: el boton se marca al instante y no espera a la base. Si la
  // escritura falla se vuelve al valor real y se avisa.
  const [elegida, setElegida] = useState<Moneda>(valor);
  const [error, setError] = useState(false);

  async function cambiar(moneda: Moneda) {
    if (moneda === elegida) return;

    const anterior = elegida;
    setElegida(moneda);
    setError(false);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setElegida(anterior);
      setError(true);
      return;
    }

    const { error: errorGuardado } = await supabase
      .from("preferencias_usuario")
      .upsert(
        { user_id: user.id, moneda, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );

    if (errorGuardado) {
      setElegida(anterior);
      setError(true);
      return;
    }

    // El formulario y los totales se arman en el servidor: hay que pedirle
    // que se vuelva a renderizar con la moneda nueva.
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden font-mono text-[10.5px] uppercase tracking-widest text-ink-soft sm:inline">
        Trabajo en
      </span>
      <div
        className="flex items-center gap-0.5 rounded-[9px] border border-border bg-surface-alt/60 p-0.5"
        role="group"
        aria-label="Moneda de mis cierres"
      >
        {OPCIONES.map((o) => {
          const activa = elegida === o.moneda;
          return (
            <button
              key={o.moneda}
              type="button"
              title={o.titulo}
              aria-pressed={activa}
              disabled={pendiente}
              onClick={() => void cambiar(o.moneda)}
              className={`rounded-[7px] px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide transition disabled:opacity-60 ${
                activa
                  ? "bg-ink text-[#F3F1EA]"
                  : "text-ink-soft hover:bg-surface"
              }`}
            >
              {o.etiqueta}
            </button>
          );
        })}
      </div>
      {error && (
        <span className="text-[11px] text-critical">No se pudo guardar.</span>
      )}
    </div>
  );
}
