"use client";

import { useImperativeHandle, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "comprobantes";

export type Abrible = {
  path: string | null;
  texto: string | null;
  titulo: string;
};

export type VisorHandle = { abrir: (c: Abrible) => void };

type Estado =
  | { tipo: "cargando"; titulo: string }
  | { tipo: "archivo"; titulo: string; url: string; esPdf: boolean }
  | { tipo: "texto"; titulo: string; texto: string }
  | { tipo: "error"; titulo: string; mensaje: string };

export function tieneComprobante(c: { path: string | null; texto: string | null }) {
  return Boolean(c.path || c.texto);
}

/**
 * Modal para ver un comprobante, sea archivo o texto pegado.
 *
 * Se abre por ref y no por prop para no necesitar un efecto que sincronice
 * "abierto" con showModal(): setState dentro de useEffect es justo el
 * antipatron que marca el compilador de React.
 *
 * Un solo <dialog> por pantalla, no uno por fila.
 */
export default function VisorComprobante({ ref }: { ref?: React.Ref<VisorHandle> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [estado, setEstado] = useState<Estado | null>(null);

  useImperativeHandle(ref, () => ({
    abrir(c: Abrible) {
      // El texto ya lo tenemos: no hay archivo que firmar ni pedir.
      if (!c.path) {
        if (!c.texto) return;
        setEstado({ tipo: "texto", titulo: c.titulo, texto: c.texto });
        dialogRef.current?.showModal();
        return;
      }

      // El modal abre primero y despues se pide la URL: asi el clic responde
      // al instante en vez de quedarse mudo mientras viaja el pedido.
      setEstado({ tipo: "cargando", titulo: c.titulo });
      dialogRef.current?.showModal();

      void (async () => {
        const supabase = createClient();
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrl(c.path as string, 300);

        if (error || !data) {
          setEstado({
            tipo: "error",
            titulo: c.titulo,
            mensaje: error?.message ?? "No pudimos abrirlo.",
          });
          return;
        }
        setEstado({
          tipo: "archivo",
          titulo: c.titulo,
          url: data.signedUrl,
          esPdf: (c.path as string).toLowerCase().endsWith(".pdf"),
        });
      })();
    },
  }));

  return (
    <dialog
      ref={dialogRef}
      onClose={() => setEstado(null)}
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
      className="m-auto w-[min(92vw,720px)] rounded-2xl border border-border bg-surface p-0 text-ink shadow-xl backdrop:bg-ink/60"
    >
      {estado && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
            <span className="font-mono text-[11.5px] uppercase tracking-widest text-accent">
              {estado.titulo}
            </span>
            <div className="flex items-center gap-3">
              {estado.tipo === "archivo" && (
                <a
                  href={estado.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12.5px] text-accent transition hover:underline"
                >
                  Abrir aparte
                </a>
              )}
              <button
                type="button"
                onClick={() => dialogRef.current?.close()}
                aria-label="Cerrar"
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-border text-ink-soft transition hover:bg-surface-alt hover:text-ink"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="flex min-h-[240px] items-center justify-center overflow-auto bg-surface-alt/40 p-4">
            {estado.tipo === "cargando" && (
              <span className="text-[13.5px] text-ink-soft">Abriendo…</span>
            )}
            {estado.tipo === "error" && (
              <span className="text-[13.5px] text-critical">{estado.mensaje}</span>
            )}
            {estado.tipo === "texto" && (
              <pre className="max-h-[70vh] w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink">
                {estado.texto}
              </pre>
            )}
            {estado.tipo === "archivo" &&
              (estado.esPdf ? (
                <iframe
                  src={estado.url}
                  title={estado.titulo}
                  className="h-[70vh] w-full rounded-lg border border-border bg-surface"
                />
              ) : (
                /* <img> y no next/image: la URL viene firmada y cambia en cada
                   apertura, asi que el optimizador no puede cachearla. */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={estado.url}
                  alt={estado.titulo}
                  className="max-h-[70vh] w-auto rounded-lg object-contain"
                />
              ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
