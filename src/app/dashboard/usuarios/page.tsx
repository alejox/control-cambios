import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import RolSelect from "./rol-select";
import EliminarUsuario from "./eliminar-usuario";

type Perfil = {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
};

export default async function UsuariosPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: yo } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (yo?.role !== "admin") redirect("/dashboard");

  const { data } = await supabase
    .from("profiles")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });

  const perfiles = (data ?? []) as Perfil[];

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Quién entra y qué puede hacer
        </p>
        <h1
          className="text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Usuarios
        </h1>
      </div>

      <div className="mb-6 rounded-2xl border border-accent-soft bg-accent-soft/30 px-5 py-4 text-[13.5px] leading-relaxed text-ink-soft">
        Las cuentas se crean solas cuando alguien se registra en la pantalla
        de inicio de sesión. Entran <strong className="font-medium text-ink">sin acceso</strong>{" "}
        hasta que le asignes un rol acá.
        <br />
        <span className="mt-1.5 inline-block">
          <strong className="font-medium text-ink">Colaborador</strong> ve los
          movimientos y revisa los pendientes (ajusta el USDT y confirma).{" "}
          <strong className="font-medium text-ink">Admin</strong> además carga,
          edita y liquida.
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        {perfiles.length === 0 ? (
          <div className="p-10 text-center text-[14.5px] text-ink-soft">
            Todavía no hay cuentas registradas.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {perfiles.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-ink">{p.email ?? "—"}</p>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                    {p.role.replace("_", " ")}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <RolSelect userId={p.id} rol={p.role} esYo={p.id === user.id} />
                  {p.id !== user.id && (
                    <EliminarUsuario userId={p.id} email={p.email} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
