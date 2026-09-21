"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SesionEnFragmento from "./sesion-en-fragmento";
import Marca from "../marca";

/**
 * Solo inicio de sesión. Las cuentas se crean a mano desde Supabase:
 * la app la usan dos personas y el alta pública era superficie sin uso.
 */
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(traducirError(error.message));
      setLoading(false);
    } else {
      router.push("/dashboard");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Panel de marca */}
      <div className="relative hidden w-[440px] flex-none flex-col justify-between overflow-hidden bg-ink px-12 py-14 lg:flex">
        <div
          className="pointer-events-none absolute -right-36 -top-28 h-80 w-80 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 30% 30%, rgba(184,121,42,0.35), transparent 70%)",
          }}
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 h-72 w-72 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 60% 60%, rgba(47,127,108,0.28), transparent 70%)",
          }}
        />

        <div className="relative">
          <div className="mb-14 flex items-center gap-2.5">
            <Marca tamano={24} className="flex-none" />
            <span className="font-mono text-[12.5px] uppercase tracking-widest text-[#D99A46]">
              Cotejo
            </span>
          </div>

          <h1 className="mb-5 max-w-xs text-[34px] font-medium leading-[1.18] text-[#F3F1EA]" style={{ fontFamily: "var(--font-display)", textWrap: "balance" }}>
            Cada conversión, en un solo lugar.
          </h1>
          <p className="max-w-xs text-sm leading-relaxed text-[#A9AE9F]">
            Bs y COP convertidos a USDT, comisión y saldo calculados al
            instante — sin abrir una hoja de cálculo.
          </p>
        </div>

        <div className="relative flex flex-col gap-3.5 font-mono text-[12.5px] text-[#7C8375]">
          <div className="flex items-center gap-2.5">
            <span className="h-px w-4 bg-[#3A4237]" />
            Bs → USDT
          </div>
          <div className="flex items-center gap-2.5">
            <span className="h-px w-4 bg-[#3A4237]" />
            COP → USDT
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
            Bienvenido de nuevo
          </p>
          <h2
            className="mb-8 text-[26px] font-medium text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Inicia sesión
          </h2>

          {/* Los enlaces de invitación dejan la sesión —o su error— en el
              fragmento de la URL, que nunca llega al servidor. Esto lo lee
              acá, en el navegador, antes de que se pierda. */}
          <SesionEnFragmento />

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-ink-soft">
                Correo
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="tú@correo.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <label className="text-[13px] font-medium text-ink-soft">
                  Contraseña
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[12.5px] font-medium text-accent hover:underline"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-critical">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 h-[46px] rounded-[10px] bg-ink text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-50"
            >
              {loading ? "Un momento…" : "Iniciar sesión"}
            </button>
          </form>

          <p className="mt-6 text-center text-xs leading-relaxed text-ink-soft/80">
            El acceso es por invitación. Si necesitas una cuenta, pídesela a un
            administrador.
          </p>
        </div>
      </div>
    </div>
  );
}

function traducirError(msg: string) {
  if (msg.includes("Invalid login credentials")) {
    return "Correo o contraseña incorrectos.";
  }
  if (msg.includes("Email not confirmed")) {
    return "La cuenta todavía no está confirmada.";
  }
  return msg;
}
