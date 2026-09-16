"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Una ráfaga de cambios tiene que dar UN refresco. No es una optimización
// de lujo: aprobar un movimiento dispara triggers que tocan la fila más de
// una vez, y sin espera el panel se re-renderizaría varias veces seguidas
// mostrando estados intermedios.
const ESPERA_MS = 600;

/**
 * Mantiene el dashboard al día sin que haya que recargar.
 *
 * El evento se usa como SEÑAL, no como dato: no se lee el payload, se
 * llama a router.refresh() y el servidor vuelve a renderizar. Meter el
 * contenido del evento en estado del cliente obligaría a reimplementar en
 * el navegador la consulta, el orden y los permisos —- y el día que
 * difieran, lo que ves deja de ser lo que hay.
 *
 * No pinta nada: vive en el layout para que valga en todas las pantallas
 * del panel, incluida la campanita del header.
 */
export default function EscuchaMovimientos() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let pendiente: ReturnType<typeof setTimeout> | null = null;

    const canal = supabase
      .channel("movimientos")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "items" },
        () => {
          if (pendiente) clearTimeout(pendiente);
          pendiente = setTimeout(() => {
            pendiente = null;
            router.refresh();
          }, ESPERA_MS);
        },
      )
      .subscribe();

    return () => {
      if (pendiente) clearTimeout(pendiente);
      // Sin esto, cada navegación dejaría un canal abierto: las conexiones
      // se acumularían hasta chocar contra el límite del plan.
      supabase.removeChannel(canal);
    };
  }, [router]);

  return null;
}
