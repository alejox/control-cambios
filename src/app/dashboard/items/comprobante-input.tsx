"use client";

import { useRef, useState } from "react";
import type { DatosComprobante } from "@/lib/comprobante";
import { leerComprobante, subirComprobante } from "./subir-comprobante";
import type { VisorHandle } from "../visor-comprobante";

/**
 * Sube el comprobante al bucket privado apenas se elige el archivo y deja
 * la ruta en un input hidden. Se sube antes de guardar el item a proposito:
 * asi el formulario solo mueve texto y no depende de un multipart pesado.
 */
export default function ComprobanteInput({
  path,
  texto,
  titulo,
  visorRef,
  onChange,
  onQuitarTexto,
  onDatos,
}: {
  path: string;
  /** El comprobante cuando llego pegado como texto en vez de archivo. */
  texto: string;
  /** Como se llama este comprobante en el visor. */
  titulo: string;
  /** El visor lo pone el formulario: uno solo para todas las filas. */
  visorRef: React.RefObject<VisorHandle | null>;
  onChange: (path: string) => void;
  onQuitarTexto?: () => void;
  /** Se llama con lo que se pudo leer del comprobante recien subido. */
  onDatos?: (datos: DatosComprobante) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    setError(null);
    setSubiendo(true);
    const resultado = await subirComprobante(archivo);
    setSubiendo(false);

    if ("error" in resultado) {
      setError(resultado.error);
      return;
    }
    onChange(resultado.path);

    // La lectura automatica es un extra: si falla, el comprobante ya quedo
    // subido y el usuario carga los datos a mano como siempre.
    if (!onDatos) return;
    setLeyendo(true);
    const leido = await leerComprobante(resultado.path);
    setLeyendo(false);

    if ("error" in leido) setError(leido.error);
    else onDatos(leido.datos);
  }

  function ver() {
    visorRef.current?.abrir({ path: path || null, texto: texto || null, titulo });
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) void subir(archivo);
          e.target.value = "";
        }}
      />
      {/* Siempre presente, tambien vacio: el server action lee los depositos
          con getAll() y necesita que los indices de cada columna coincidan. */}
      <input type="hidden" name="deposito_comprobante" value={path} />
      <input type="hidden" name="deposito_comprobante_texto" value={texto} />

      {path ? (
        <div className="flex h-10 items-center gap-2 rounded-[9px] border border-border bg-surface px-3">
          <button
            type="button"
            onClick={ver}
            className="text-[12.5px] text-accent transition hover:underline"
          >
            {leyendo ? "Leyendo…" : "Ver comprobante"}
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[12.5px] text-ink-soft transition hover:text-critical"
            aria-label="Quitar comprobante"
          >
            ✕
          </button>
        </div>
      ) : texto ? (
        <div className="flex h-10 items-center gap-2 rounded-[9px] border border-border bg-surface px-3">
          <button
            type="button"
            onClick={ver}
            className="font-mono text-[11px] uppercase tracking-wide text-accent transition hover:underline"
            title="Ver el texto pegado"
          >
            Texto
          </button>
          {onQuitarTexto && (
            <button
              type="button"
              onClick={onQuitarTexto}
              className="text-[12.5px] text-ink-soft transition hover:text-critical"
              aria-label="Quitar comprobante de texto"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={subiendo || leyendo}
          onClick={() => inputRef.current?.click()}
          className="h-10 whitespace-nowrap rounded-[9px] border border-dashed border-border px-3 text-[12.5px] text-ink-soft transition hover:bg-surface-alt disabled:opacity-50"
        >
          {subiendo ? "Subiendo…" : leyendo ? "Leyendo…" : "+ Comprobante"}
        </button>
      )}

      {error && <span className="text-[11.5px] text-critical">{error}</span>}
    </div>
  );
}
