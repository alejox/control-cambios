import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItemForm from "../../item-form";
import { actualizarItem } from "../../actions";

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
    .select("referencia, fecha, valor_origen")
    .eq("item_id", id)
    .order("fecha", { ascending: true });

  const actualizarConId = actualizarItem.bind(null, id);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-surface px-10 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-mono text-xs uppercase tracking-widest text-accent">
            Control de Cambios
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-14">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Editar item
        </p>
        <h1
          className="mb-8 text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Cierre #{item.numero}
        </h1>

        <ItemForm
          action={actualizarConId}
          siguienteNumero={item.numero}
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
      </main>
    </div>
  );
}
