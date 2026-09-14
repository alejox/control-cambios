"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const LARGO_MINIMO = 6;

export default function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmacion) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(traducirError(error.message));
      setLoading(false);
      return;
    }

    // replace y no push: el enlace de recuperación ya se consumió, así que
    // esta pantalla no debería quedar en el historial. El refresh descarta
    // la caché del router para que el dashboard, que es un Server
    // Component, se renderice con la cookie de sesión ya rotada.
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Control de Cambios
        </p>
        <h1
          className="mb-3 text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Define tu contraseña
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-ink-soft">
          Elige una contraseña nueva. Al guardarla entras directo al panel.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-[13px] font-medium text-ink-soft"
            >
              Contraseña nueva
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={LARGO_MINIMO}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
              placeholder="••••••••"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="confirmacion"
              className="text-[13px] font-medium text-ink-soft"
            >
              Repite la contraseña
            </label>
            <input
              id="confirmacion"
              type="password"
              required
              minLength={LARGO_MINIMO}
              autoComplete="new-password"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
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
            {loading ? "Guardando…" : "Guardar y entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}

function traducirError(msg: string) {
  if (msg.includes("should be different from the old password")) {
    return "La contraseña nueva tiene que ser distinta de la anterior.";
  }
  if (msg.includes("Password should be at least")) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`;
  }
  if (msg.includes("Auth session missing")) {
    return "Tu enlace venció. Pide uno nuevo desde “Olvidé mi contraseña”.";
  }
  return msg;
}
