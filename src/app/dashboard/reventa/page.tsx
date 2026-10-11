import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Reventa from "./reventa";

/**
 * Reventa: las listas mayoristas de créditos de cada proveedor y la cuenta
 * para revenderlos.
 *
 * Como Venta público, es herramienta de trabajo de los dos roles. Las
 * listas son un catálogo fijo (@/lib/reventa) y no tocan la base: acá la
 * sesión solo decide quién entra.
 */
export default async function ReventaPage() {
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

  return (
    <div className="mx-auto w-full px-4 py-8 sm:w-[90%] sm:px-6 sm:py-10">
      <div className="mb-8">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Listas mayoristas de créditos
        </p>
        <h1
          className="text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Reventa
        </h1>
        <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-soft">
          Lo que cuesta cada paquete de créditos con el proveedor, en USDT, y
          cuánto conviene comprar por volumen. Tocá un paquete para llevarlo a
          la calculadora y sacar el precio de venta en pesos y bolívares.
        </p>
      </div>

      <Reventa />
    </div>
  );
}
