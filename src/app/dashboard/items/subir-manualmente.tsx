"use client";

import { useRef, useState } from "react";
import { subirComprobante } from "./subir-comprobante";
import type { ComprobanteCargado } from "./subir-varios";

type Progreso = { hecho: number; total: number };

/**
 * Sube varios comprobantes y arma una fila por cada uno, pero SIN pasarlos
 * por el lector automatico. Es el hermano en lote del "+ Comprobante" de
 * cada fila, que tampoco lee nada.
 *
 * Existe este camino aparte del de "Subir varios" por tres motivos:
 * - No gasta cupo de Google: la lectura automatica se paga y se agota, y
 *   cargar veinte comprobantes que igual vas a revisar a mano lo quema al
 *   pedo.
 * - No hay que esperar: la lectura tarda hasta 20 segundos por archivo y
 *   va de a uno, asi que una tanda grande es varios minutos mirando el
 *   boton. Subir solo es cuestion de segundos.
 * - Hay comprobantes que la IA no sabe leer —- fotos torcidas, capturas
 *   recortadas, bancos raros —- y para esos la lectura es puro ruido: deja
 *   avisos de error en filas que igual ibas a completar vos.
 *
 * Reusa `subirComprobante` a proposito: el limite de 5 MB y los tipos
 * permitidos tienen que ser los mismos que en los otros dos caminos.
 */
export default function SubirManualmente({
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

    // En orden y no en paralelo, igual que la carga con lectura: asi el
    // contador de progreso dice algo cierto y no se le tiran N subidas
    // juntas al bucket.
    for (let i = 0; i < archivos.length; i++) {
      const archivo = archivos[i];
      setProgreso({ hecho: i, total: archivos.length });

      const subido = await subirComprobante(archivo);
      if ("error" in subido) {
        // Un archivo que falla no corta la tanda ni descarta lo ya subido:
        // se anota con nombre y motivo y se sigue con el resto.
        fallados.push(`${archivo.name}: ${subido.error}`);
        continue;
      }

      // Mismo contrato que "Subir varios": sin datos y sin error, para que
      // el formulario arme la fila con el comprobante adjunto y el resto
      // de los campos vacios.
      cargados.push({ path: subido.path, datos: null, error: null });
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
        title="Sube los comprobantes y arma una fila por cada uno, sin leerlos: los datos los cargás vos."
        className="whitespace-nowrap rounded-lg border border-border px-2.5 py-1 text-xs text-ink-soft transition hover:bg-surface-alt disabled:opacity-50"
      >
        {ocupado
          ? `Cargando ${progreso.hecho + 1} de ${progreso.total}…`
          : "Subir manualmente"}
      </button>

      {errores.map((e, i) => (
        <span key={i} className="text-[11px] text-critical">
          {e}
        </span>
      ))}
    </div>
  );
}
