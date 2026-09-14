"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(traducirError(error.message));
      } else {
        window.location.href = "/dashboard";
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setError(traducirError(error.message));
      } else {
        setMessage("Cuenta creada. Revisa tu correo para confirmarla.");
      }
    }

    setLoading(false);
  }

  async function handleGoogle() {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(traducirError(error.message));
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
            <span className="h-2.5 w-2.5 rounded-full bg-[#D99A46]" />
            <span className="font-mono text-[12.5px] uppercase tracking-widest text-[#D99A46]">
              Control de Cambios
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
            {mode === "signin" ? "Inicia sesión" : "Crea tu cuenta"}
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-medium text-ink-soft">
                Correo
              </label>
              <input
                type="email"
                required
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
                {mode === "signin" && (
                  <Link
                    href="/forgot-password"
                    className="text-[12.5px] font-medium text-accent hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link>
                )}
              </div>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm text-critical">{error}</p>}
            {message && <p className="text-sm text-teal">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 h-[46px] rounded-[10px] bg-ink text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-50"
            >
              {loading
                ? "Un momento…"
                : mode === "signin"
                  ? "Iniciar sesión"
                  : "Crear cuenta"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-ink-soft">o</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <button
            onClick={handleGoogle}
            className="flex h-[46px] w-full items-center justify-center gap-2.5 rounded-[10px] border border-border bg-surface text-[14.5px] font-medium text-ink-soft transition hover:bg-surface-alt"
          >
            <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
              <path
                d="M16.6 8.68c0-.6-.05-1.17-.15-1.72H8.5v3.26h4.55c-.2 1.06-.8 1.96-1.7 2.56v2.13h2.75c1.6-1.48 2.5-3.66 2.5-6.23z"
                fill="#4285F4"
              />
              <path
                d="M8.5 17c2.3 0 4.23-.76 5.64-2.07l-2.75-2.13c-.76.51-1.74.82-2.9.82-2.23 0-4.12-1.51-4.8-3.53H.86v2.2A8.5 8.5 0 0 0 8.5 17z"
                fill="#34A853"
              />
              <path
                d="M3.7 10.09A5.1 5.1 0 0 1 3.43 8.5c0-.55.1-1.09.27-1.59V4.71H.86A8.5 8.5 0 0 0 0 8.5c0 1.37.33 2.67.86 3.79l2.84-2.2z"
                fill="#FBBC05"
              />
              <path
                d="M8.5 3.38c1.25 0 2.37.43 3.25 1.28l2.44-2.44C12.72.86 10.8 0 8.5 0A8.5 8.5 0 0 0 .86 4.71l2.84 2.2c.68-2.02 2.57-3.53 4.8-3.53z"
                fill="#EA4335"
              />
            </svg>
            Continuar con Google
          </button>

          <p className="mt-6 text-center text-sm text-ink-soft">
            {mode === "signin" ? "¿Aún no tienes cuenta?" : "¿Ya tienes cuenta?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
                setMessage(null);
              }}
              className="font-medium text-accent hover:underline"
            >
              {mode === "signin" ? "Regístrate" : "Inicia sesión"}
            </button>
          </p>

          <p className="mt-3.5 text-center text-xs leading-relaxed text-ink-soft/80">
            Las cuentas nuevas entran sin acceso a los datos hasta que un
            administrador asigne un rol.
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
  if (msg.includes("User already registered")) {
    return "Ya existe una cuenta con ese correo.";
  }
  return msg;
}
