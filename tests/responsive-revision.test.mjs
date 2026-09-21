import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const revisionItem = await readFile(
  new URL("../src/app/dashboard/revision/revision-item.tsx", import.meta.url),
  "utf8",
);
const depositoFila = await readFile(
  new URL("../src/app/dashboard/revision/deposito-fila.tsx", import.meta.url),
  "utf8",
);

test("revision only uses the seven-column grid on a wide content channel", () => {
  const sevenColumns = "grid-cols-[0.7fr_0.85fr_1.3fr_1fr_0.9fr_0.85fr_1.1fr]";

  assert.ok(revisionItem.includes(`hidden xl:grid xl:${sevenColumns}`));
  assert.ok(depositoFila.includes(`xl:grid xl:${sevenColumns}`));
  assert.ok(!depositoFila.includes(`grid ${sevenColumns}`));
});

test("compact revision deposits retain labels and every review control", () => {
  for (const label of [
    "Estado",
    "Fecha",
    "Referencia",
    "Recibido",
    "Tasa",
    "USDT",
    "Comprobante",
    "seleccion",
    "Ver comprobante",
    "Ver texto",
  ]) {
    assert.match(depositoFila, new RegExp(label));
  }
  assert.match(depositoFila, /flex flex-col gap-2\.5 py-3/);
  assert.match(depositoFila, /break-words/);
});
