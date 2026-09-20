"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();
  const [saliendo, setSaliendo] = useState(false);

  async function cerrarSesion() {
    if (saliendo) return;
    setSaliendo(true);

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      // Si la red falla, el botón vuelve a quedar operativo para reintentar.
      setSaliendo(false);
    }
  }

  return (
    <button
      type="button"
      onClick={cerrarSesion}
      disabled={saliendo}
      aria-busy={saliendo}
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink-soft transition hover:bg-surface-alt disabled:cursor-wait disabled:opacity-60"
    >
      {saliendo ? "Cerrando sesión…" : "Cerrar sesión"}
    </button>
  );
}
