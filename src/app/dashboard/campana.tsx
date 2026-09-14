import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Campanita del header con los movimientos que esperan revision.
 *
 * El conteo se pide con head:true y count:"exact": trae el numero sin
 * bajarse las filas, que es lo unico que hace falta para el badge.
 */
export default async function Campana() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Solo lo que este usuario PUEDE aprobar: lo que cargo la otra parte.
  // Contar lo propio seria avisarle de algo que no va a poder tocar.
  const { count } = await supabase
    .from("items")
    .select("id", { count: "exact", head: true })
    .is("revisado_at", null)
    .is("liquidacion_id", null)
    .neq("created_by", user?.id ?? "");

  const pendientes = count ?? 0;

  return (
    <Link
      href="/dashboard/revision"
      aria-label={
        pendientes === 0
          ? "Sin movimientos por revisar"
          : `${pendientes} movimientos por revisar`
      }
      title={
        pendientes === 0
          ? "Sin movimientos por revisar"
          : `${pendientes} por revisar`
      }
      className="relative flex h-9 w-9 items-center justify-center rounded-[10px] border border-border text-ink-soft transition hover:bg-surface-alt hover:text-ink"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
        <path
          d="M8 1.8a3.7 3.7 0 0 0-3.7 3.7c0 3.2-1.2 4.2-1.2 4.2h9.8s-1.2-1-1.2-4.2A3.7 3.7 0 0 0 8 1.8Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M6.6 12.2a1.6 1.6 0 0 0 2.8 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>

      {pendientes > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-critical px-1 font-mono text-[10px] font-medium text-white">
          {pendientes > 99 ? "99+" : pendientes}
        </span>
      )}
    </Link>
  );
}
