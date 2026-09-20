import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const dashboardLoadingUrl = new URL(
  "../src/app/dashboard/loading.tsx",
  import.meta.url,
);
const signOut = await readFile(
  new URL("../src/app/dashboard/sign-out-button.tsx", import.meta.url),
  "utf8",
);
const currencySelector = await readFile(
  new URL("../src/app/dashboard/selector-moneda.tsx", import.meta.url),
  "utf8",
);

test("dashboard has an accessible route-level loading state", async () => {
  await access(dashboardLoadingUrl);
  const source = await readFile(dashboardLoadingUrl, "utf8");

  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Cargando/);
});

test("sign out exposes pending feedback and prevents duplicate requests", () => {
  assert.match(signOut, /useState/);
  assert.match(signOut, /disabled=\{.*(?:pending|saliendo).*\}/);
  assert.match(signOut, /Cerrando sesión…/);
});

test("currency selector stays disabled throughout authentication and persistence", () => {
  assert.match(currencySelector, /setGuardando\(true\)/);
  assert.match(currencySelector, /disabled=\{guardando \|\| pendiente\}/);
  assert.match(currencySelector, /aria-busy=\{guardando \|\| pendiente\}/);
});
