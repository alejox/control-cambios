import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./sign-out-button";

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = profile?.role ?? "sin_acceso";

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border bg-surface px-10 py-4">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <span className="font-mono text-xs uppercase tracking-widest text-accent">
            Control de Cambios
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[13.5px] text-ink-soft">{user.email}</span>
          <span className="rounded-full bg-accent-soft px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-[#8f5e1f]">
            {role.replace("_", " ")}
          </span>
          <SignOutButton />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-14">
        {role === "sin_acceso" ? (
          <div className="rounded-2xl border border-accent-soft bg-accent-soft/40 p-7">
            <h1
              className="mb-2.5 text-xl font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Tu cuenta está pendiente de aprobación
            </h1>
            <p className="text-[14.5px] leading-relaxed text-ink-soft">
              Ya te registraste correctamente, pero todavía no tienes acceso a
              los datos. Un administrador debe asignarte un rol
              (colaborador o admin) para que puedas ver los items y montos.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-surface p-7 shadow-sm">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-teal">
              Conexión verificada
            </p>
            <h1
              className="mb-2.5 text-xl font-medium text-ink"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Supabase está conectado ✓
            </h1>
            <p className="text-[14.5px] leading-relaxed text-ink-soft">
              Tu rol es{" "}
              <span className="font-medium text-ink">{role}</span>. Aquí va a
              vivir el panel de items, totales y comisión — lo construimos en
              la siguiente fase.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
