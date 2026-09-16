import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  ORDEN_MONEDAS,
  type MediosPorMoneda,
  type MonedaLista,
} from "@/lib/venta-publico";
import MediosPago from "./medios-pago";

/**
 * Mis medios de cobro, uno por moneda.
 *
 * Vive en su propia pantalla y no dentro de cada lista por lo que dice el
 * título: son MÍOS y son de la MONEDA. Meterlos en el editor de Stella
 * haría creer que Oleada cobra por otro lado, y que el Nequi del otro
 * usuario es el mismo que el tuyo. Ninguna de las dos cosas es cierta.
 */
export default async function MediosPagoPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = perfil?.role ?? "sin_acceso";
  if (role !== "admin" && role !== "colaborador") redirect("/dashboard");

  // Sin filtrar por usuario: las políticas RLS de la tabla ya dejan pasar
  // únicamente las filas propias. El filtro acá haría creer que la
  // protección vive en la consulta.
  const { data, error } = await supabase
    .from("venta_publico_medios_pago")
    .select("moneda, texto");

  const medios: MediosPorMoneda = {};
  for (const fila of data ?? []) {
    medios[fila.moneda as MonedaLista] = fila.texto;
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:w-[90%] sm:px-6 sm:py-10">
      <Link
        href="/dashboard/venta-publico"
        className="mb-6 inline-block text-[13px] text-ink-soft transition hover:text-ink"
      >
        ← Volver a las listas
      </Link>

      <div className="mb-8">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Venta público
        </p>
        <h1
          className="text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Mis medios de cobro
        </h1>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
          Uno por moneda, y valen para las cuatro marcas: se cobra con la misma
          cuenta se venda Stella u Oleada. Entran en el mensaje donde el pie de
          cada lista dice <code className="font-mono">{"{medios}"}</code>.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
          Son tuyos. El otro usuario tiene los suyos y no ve los tuyos.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-critical-soft bg-critical-soft/40 p-10 text-center text-[14.5px] text-critical shadow-sm">
          No pudimos leer tus medios de cobro: {error.message}
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {ORDEN_MONEDAS.map((moneda) => (
            <MediosPago
              key={moneda}
              moneda={moneda}
              texto={medios[moneda] ?? ""}
            />
          ))}
        </div>
      )}
    </div>
  );
}
