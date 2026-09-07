import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ItemForm from "../item-form";
import { crearItem } from "../actions";

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

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: ultimo } = await supabase
    .from("items")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  const siguienteNumero = (ultimo?.numero ?? 0) + 1;

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
          Nuevo item
        </p>
        <h1
          className="mb-8 text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Registrar cierre #{siguienteNumero}
        </h1>

        <ItemForm action={crearItem} siguienteNumero={siguienteNumero} />
      </main>
    </div>
  );
}
