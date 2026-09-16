"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * El paso final compartido por todo lo que genera un link de acceso: el link a
 * la vista, el botón de copiar y el cierre.
 *
 * Vive aparte porque el alta de una cuenta nueva y el link para una que ya
 * existe terminan exactamente igual; lo único que cambia es el texto, y por eso
 * entra como prop en vez de resolverse con un booleano acá adentro.
 */
export default function PanelLink({
  link,
  instruccion,
  aviso,
  onCerrar,
}: {
  link: string;
  instruccion: ReactNode;
  aviso: ReactNode;
  onCerrar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  async function copiar(valor: string) {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
    } catch {
      // Sin https o sin permiso el portapapeles no esta disponible. El link
      // queda igual a la vista, asi que se puede seleccionar y copiar a mano.
      setCopiado(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-3 px-6 py-5 text-[13.5px] leading-relaxed text-ink-soft">
        <p>{instruccion}</p>
        <input
          readOnly
          value={link}
          onFocus={(e) => e.currentTarget.select()}
          className="h-11 rounded-[10px] border border-border bg-surface-alt px-3.5 font-mono text-[12px] outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <p className="rounded-[10px] bg-surface-alt px-3.5 py-3 text-[12.5px]">{aviso}</p>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
        <button
          type="button"
          onClick={onCerrar}
          className="text-[13.5px] text-ink-soft transition hover:text-ink"
        >
          Cerrar
        </button>
        <button
          type="button"
          onClick={() => copiar(link)}
          className="h-10 rounded-[10px] bg-ink px-4 text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127]"
        >
          {copiado ? "Copiado" : "Copiar link"}
        </button>
      </div>
    </>
  );
}
