import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItemForm from "../item-form";
import { crearItem } from "../actions";
import { leerComisiones } from "@/lib/configuracion";
import { leerMonedaPreferida } from "@/lib/preferencias";

export default async function NuevoItemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const rol = profile?.role ?? "sin_acceso";
  const esAdmin = rol === "admin";
  if (!esAdmin && rol !== "colaborador") {
    redirect("/dashboard");
  }

  // Solo entre los pendientes: al liquidar, el contador vuelve a empezar.
  // maybeSingle y no single porque "no hay ninguno" es el caso NORMAL
  // justo despues de un corte, no un error.
  const { data: ultimo } = await supabase
    .from("items")
    .select("numero")
    .is("liquidacion_id", null)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const siguienteNumero = (ultimo?.numero ?? 0) + 1;
  const comisiones = await leerComisiones();
  // El colaborador solo registra COP -> USDT; la politica de RLS rechaza
  // cualquier otra cosa, asi que el formulario no le ofrece elegir.
  const monedaPreferida = esAdmin ? await leerMonedaPreferida() : "COP";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:w-[90%] sm:px-6 sm:py-10">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition hover:text-ink"
      >
        <span className="text-[15px] leading-none">←</span> Volver al panel
      </Link>

      <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
        Nuevo item
      </p>
      <h1
        className="mb-8 text-[26px] font-medium text-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Registrar movimiento #{siguienteNumero}
      </h1>

      <ItemForm
        action={crearItem}
        siguienteNumero={siguienteNumero}
        comisiones={comisiones}
        monedaPreferida={monedaPreferida}
        puedeCambiarMoneda={esAdmin}
      />
    </div>
  );
}
