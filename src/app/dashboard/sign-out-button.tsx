"use client";

import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  return (
    <button
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = "/login";
      }}
      className="rounded-lg border border-border px-3 py-1.5 text-sm text-ink-soft transition hover:bg-surface-alt"
    >
      Cerrar sesión
    </button>
  );
}
