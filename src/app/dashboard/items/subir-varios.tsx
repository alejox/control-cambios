"use client";

import { useRef, useState } from "react";
import type { DatosComprobante } from "@/lib/comprobante";
import { leerComprobante, subirComprobante } from "./subir-comprobante";

export type ComprobanteCargado = {
  path: string;
  datos: DatosComprobante | null;
  error: string | null;
};

type Progreso = { hecho: number; total: number; nombre: string };

/**
 * Carga varios comprobantes de una. Sube y lee cada archivo EN ORDEN, no en
 * paralelo: asi el progreso es real y no se le tiran diez pedidos juntos al
 * lector automatico.
 *
 * Un archivo que falla no corta la tanda. Si la lectura falla pero la subida
 * salio bien, la fila igual se crea con el comprobante adjunto y el aviso a
 * la vista, para cargar el monto a mano.
 */
export default function SubirVarios({
  onAplicar,
}: {
  onAplicar: (cargados: ComprobanteCargado[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progreso, setProgreso] = useState<Progreso | null>(null);
  const [errores, setErrores] = useState<string[]>([]);

  async function procesar(archivos: File[]) {
    setErrores([]);
    const cargados: ComprobanteCargado[] = [];
    const fallados: string[] = [];

    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      setProgreso({ hecho: i, total: archivos.length, nombre: archivo.name });

      const subido = await subirComprobante(archivo);
      if ("error" in subido) {
        fallados.push(`${archivo.name}: ${subido.error}`);
        continue;
      }

      const leido = await leerComprobante(subido.path);
      cargados.push(
        "error" in leido
          ? { path: subido.path, datos: null, error: leido.error }
          : { path: subido.path, datos: leido.datos, error: null },
      );
    }

    setProgreso(null);
    setErrores(fallados);
    if (cargados.length > 0) onAplicar(cargados);
  }

  const ocupado = progreso !== null;

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const archivos = Array.from(e.target.files ?? []);
          if (archivos.length > 0) void procesar(archivos);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={ocupado}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-border px-2.5 py-1 text-xs text-ink-soft transition hover:bg-surface-alt disabled:opacity-50"
      >
        {ocupado
          ? `Cargando ${progreso.hecho + 1} de ${progreso.total}…`
          : "Subir varios"}
      </button>

      {errores.map((e, i) => (
        <span key={i} className="text-[11px] text-critical">
          {e}
        </span>
      ))}
    </div>
  );
}
