import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MediosPorMoneda, MonedaLista } from "@/lib/venta-publico";
import Reventa from "./reventa";

/**
 * Reventa: las listas mayoristas de créditos de cada proveedor y la cuenta
 * para revenderlos.
 *
 * Como Venta público, es herramienta de trabajo de los dos roles. Las
 * listas son un catálogo fijo (@/lib/reventa): de la base solo se leen los
 * medios de cobro, los mismos que cierran los mensajes de Venta público.
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

  // La misma consulta que Venta público: un texto por moneda, de quien
  // mira (RLS). Si falla, el listado sale sin medios y lo avisa; no es
  // motivo para no mostrar los precios.
  const { data: filasMedios } = await supabase
    .from("venta_publico_medios_pago")
    .select("moneda, texto");

  const medios: MediosPorMoneda = {};
  for (const fila of filasMedios ?? []) {
    medios[fila.moneda as MonedaLista] = fila.texto;
  }

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
          Como Venta público, pero para revendedores: elegí la moneda y el
          proveedor, poné tu margen y copiá el listado listo para WhatsApp.
          Cada moneda tiene su propio margen y su propia tasa.
        </p>
      </div>

      <Reventa medios={medios} />
    </div>
  );
}
