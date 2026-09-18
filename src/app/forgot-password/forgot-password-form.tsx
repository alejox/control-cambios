"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm({
  enlaceInvalido,
}: {
  enlaceInvalido: boolean;
}) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/update-password`,
    });

    // No distinguimos "ese correo no tiene cuenta" de "correo enviado".
    // Responder distinto convertiría esta pantalla en un buscador de
    // qué correos están registrados. El único error que sí mostramos es
    // el del límite de envíos, porque ahí el usuario necesita saber que
    // tiene que esperar en vez de seguir reintentando.
    if (error?.status === 429) {
      setError("Demasiados intentos. Espera unos minutos y vuelve a probar.");
    } else {
      setEnviado(true);
    }

    setLoading(false);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Cotejo
        </p>
        <h1
          className="mb-3 text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Recupera tu acceso
        </h1>

        {enviado ? (
          <>
            <p className="text-sm leading-relaxed text-ink-soft">
              Si <span className="font-medium text-ink">{email}</span> tiene una
              cuenta, le acabamos de enviar un enlace para crear una contraseña
              nueva. El enlace vence en una hora y sirve una sola vez.
            </p>
            <p className="mt-4 rounded-[10px] bg-surface-alt px-3.5 py-3 text-[13px] leading-relaxed text-ink-soft">
              Ábrelo en este mismo navegador. Si lo abres en otro, el enlace no
              va a funcionar por seguridad.
            </p>
          </>
        ) : (
          <>
            <p className="mb-8 text-sm leading-relaxed text-ink-soft">
              Escribe tu correo y te enviamos un enlace para definir una
              contraseña nueva.
            </p>

            {enlaceInvalido && (
              <p className="mb-5 rounded-[10px] bg-critical-soft px-3.5 py-3 text-[13px] leading-relaxed text-critical">
                Ese enlace ya venció, ya se había usado, o se abrió en otro
                navegador. Pide uno nuevo.
              </p>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="email"
                  className="text-[13px] font-medium text-ink-soft"
                >
                  Correo
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 rounded-[10px] border border-border bg-surface px-3.5 text-sm outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                  placeholder="tú@correo.com"
                />
              </div>

              {error && <p className="text-sm text-critical">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="mt-1 h-[46px] rounded-[10px] bg-ink text-sm font-medium text-[#F3F1EA] transition hover:bg-[#2a3127] disabled:opacity-50"
              >
                {loading ? "Enviando…" : "Enviar enlace"}
              </button>
            </form>
          </>
        )}

        <p className="mt-6 text-center text-sm text-ink-soft">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
