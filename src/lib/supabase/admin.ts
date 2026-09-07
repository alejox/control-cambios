import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente "admin" con la service_role key: se salta Row Level Security.
 *
 * SOLO se importa desde código que corre en el servidor (Server Actions,
 * Route Handlers) y SOLO para operaciones privilegiadas muy puntuales,
 * como que un admin cambie el rol de otro usuario. Nunca se expone al
 * navegador ni se usa para leer/escribir items normales.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
