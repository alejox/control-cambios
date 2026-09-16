import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Panel } from "./estado";
import Paneles from "./paneles";

/**
 * Mis paneles: dónde entro, con qué usuario y con qué clave.
 *
 * Lo que resuelve no es un problema de seguridad sino de memoria: son
 * varios paneles de proveedor y se pierde cómo se entraba a cada uno.
 *
 * Son de cada usuario y de nadie más —- ni el admin ve los del
 * colaborador -—, y eso lo aplica RLS en la base, no esta pantalla.
 */
export default async function PanelesPage() {
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

  // Sin filtrar por usuario: la política de la tabla ya deja pasar
  // únicamente las filas propias. Repetir el filtro acá daría la falsa
  // impresión de que la protección vive en la consulta.
  const { data, error } = await supabase
    .from("paneles")
    .select("id, nombre, urls, usuario, clave, notas")
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:w-[90%] sm:px-6 sm:py-10">
      <div className="mb-8">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Accesos
        </p>
        <h1
          className="text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Mis paneles
        </h1>
        <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink-soft">
          El link, el usuario y la clave de cada panel de proveedor, para no
          tener que acordarse. Son tuyos: el otro usuario tiene los suyos y no
          ve los tuyos.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft/80">
          Las claves se guardan en la base tal como las escribís. Alcanza para
          que no las vea la otra persona ni quien mire tu pantalla, pero no es
          una caja fuerte: si mañana manejás algo que no puede filtrarse,
          decímelo y lo encriptamos con una clave que solo vos sepas.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-critical-soft bg-critical-soft/40 p-10 text-center text-[14.5px] text-critical shadow-sm">
          No pudimos leer tus paneles: {error.message}
        </div>
      ) : (
        <Paneles paneles={(data ?? []) as Panel[]} />
      )}
    </div>
  );
}
