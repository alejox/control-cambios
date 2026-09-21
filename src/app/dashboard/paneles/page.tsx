import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { estaConfigurado } from "@/lib/bitwarden-secrets";
import { resolverCuentas } from "@/lib/paneles-secretos";
import type { Panel } from "./estado";
import Paneles from "./paneles";
import RespaldoBitwarden from "./respaldo-bitwarden";

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
    .select("id, nombre, urls, cuentas, notas")
    .order("orden", { ascending: true })
    .order("created_at", { ascending: true });

  // Las claves se piden a Bitwarden para TODOS los paneles de una sola vez,
  // y solo para las cuentas que ya tienen referencia. Las que todavía no
  // migraron siguen leyéndose del texto de la base, así que la pantalla se
  // ve igual esté el gestor arriba o abajo.
  //
  // Nada de esto es una barrera de permisos: los secret_id que se resuelven
  // salieron de filas que RLS ya dejó ver. Si esta consulta no devuelve un
  // panel, su clave no se pide.
  const paneles = (await resolverCuentas(data ?? [])) as Panel[];

  const gestorConfigurado = estaConfigurado();

  // Cuántas claves todavía no tienen copia en el gestor. Se cuenta acá,
  // donde los datos ya están, y no con una llamada del navegador: el aviso
  // de migración no vale un viaje de red más por cada visita a la pantalla.
  const pendientes = paneles.reduce(
    (total, panel) =>
      total + panel.cuentas.filter((c) => c.clave && !c.secret_id).length,
    0,
  );

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
        {/* Este párrafo dice DÓNDE está la clave hoy, y hoy la respuesta es
            "en los dos lados". Mientras dure la migración decir solo
            "está en Bitwarden" sería falso: el texto sigue en la base y
            quien tenga acceso a la base lo ve. */}
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft/80">
          {gestorConfigurado ? (
            <>
              Las claves se están pasando al gestor de secretos. Hasta que
              termine la migración quedan también en la base, tal como las
              escribís: eso permite volver atrás si algo sale mal, pero
              significa que todavía no es una caja fuerte.
            </>
          ) : (
            <>
              Las claves se guardan en la base tal como las escribís. Alcanza
              para que no las vea la otra persona ni quien mire tu pantalla,
              pero no es una caja fuerte: el gestor de secretos todavía no está
              configurado en este entorno.
            </>
          )}
        </p>
      </div>

      {gestorConfigurado && !error && <RespaldoBitwarden pendientes={pendientes} />}

      {error ? (
        <div className="rounded-2xl border border-critical-soft bg-critical-soft/40 p-10 text-center text-[14.5px] text-critical shadow-sm">
          No pudimos leer tus paneles: {error.message}
        </div>
      ) : (
        <Paneles paneles={paneles} />
      )}
    </div>
  );
}
