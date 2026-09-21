import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const extraer = await readFile(
  new URL("../src/app/api/comprobante/extraer/route.ts", import.meta.url),
  "utf8",
);
const usuarios = await readFile(
  new URL("../src/app/dashboard/usuarios/actions.ts", import.meta.url),
  "utf8",
);
const migracion = await readFile(
  new URL("../supabase/phase48_limite_ia_y_origen_publico.sql", import.meta.url),
  "utf8",
);

test("OCR reserves a database-backed quota before calling Gemini", () => {
  assert.match(extraer, /rpc\(\s*"consumir_cupo_comprobante_ia"/);
  assert.match(extraer, /status: 429/);
  assert.match(extraer, /Retry-After/);
  assert.ok(
    extraer.indexOf('"consumir_cupo_comprobante_ia"') < extraer.lastIndexOf("extraerConIA("),
  );
  assert.doesNotMatch(extraer, /Map<|new Map\(/);
});

test("database quota is atomic, scoped to auth.uid, and not exposed to anon", () => {
  assert.match(migracion, /create table if not exists public\.comprobante_ia_rate_limits/);
  assert.match(migracion, /for update/i);
  assert.match(migracion, /auth\.uid\(\)/);
  assert.match(migracion, /security definer/i);
  assert.match(migracion, /revoke execute on function public\.consumir_cupo_comprobante_ia\(\) from public, anon/i);
  assert.match(migracion, /grant execute on function public\.consumir_cupo_comprobante_ia\(\) to authenticated, service_role/i);
});

test("access links require a validated canonical HTTPS origin", () => {
  assert.match(usuarios, /process\.env\.APP_ORIGIN/);
  assert.match(usuarios, /origen\.protocol !== "https:"/);
  assert.match(usuarios, /origen\.pathname === "\/"/);
  assert.match(usuarios, /APP_ORIGIN debe ser un origen HTTPS/);
  assert.doesNotMatch(usuarios, /from "next\/headers"/);
  assert.doesNotMatch(usuarios, /x-forwarded-proto/);
  assert.doesNotMatch(usuarios, /\.get\("host"\)/);
});
