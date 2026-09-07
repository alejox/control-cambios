import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de Supabase para usar en Client Components (navegador).
 * Usa la anon key: nunca tiene permisos por encima de las políticas
 * de Row Level Security definidas en la base de datos.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
