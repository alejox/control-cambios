import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItemForm from "../../item-form";
import { actualizarItem } from "../../actions";
import { leerComisiones } from "@/lib/configuracion";
import { monedaDeFlujo } from "@/lib/items";

export default async function EditarItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: item } = await supabase
    .from("items")
    .select("*")
    .eq("id", id)
    .single();

  if (!item) notFound();

  const { data: depositos } = await supabase
    .from("depositos")
    .select("referencia, fecha, valor_origen, comprobante_path, comprobante_texto")
    .eq("item_id", id)
    .order("fecha", { ascending: true });

  const comisiones = await leerComisiones();
  const actualizarConId = actualizarItem.bind(null, id);

  return (
    <div className="mx-auto w-[90%] max-w-5xl px-6 py-10">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-ink-soft transition hover:text-ink"
      >
        <span className="text-[15px] leading-none">←</span> Volver al panel
      </Link>

      <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
        Editar item
      </p>
      <h1
        className="mb-8 text-[26px] font-medium text-ink"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Movimiento #{item.numero}
      </h1>

      <ItemForm
        action={actualizarConId}
        siguienteNumero={item.numero}
        comisiones={comisiones}
        // Un cierre ya registrado conserva su propia moneda: la
        // preferencia del header no reescribe el pasado.
        monedaPreferida={monedaDeFlujo(item.tipo_flujo)}
        initial={{
          numero: item.numero,
          tipo_flujo: item.tipo_flujo,
          tasa: item.tasa,
          usdt_total: item.usdt_total,
          detalle: item.detalle,
          fecha: item.fecha,
          depositos: depositos ?? [],
        }}
      />
    </div>
  );
}
