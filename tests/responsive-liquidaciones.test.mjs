import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const liquidaciones = await readFile(
  new URL("../src/app/dashboard/liquidaciones/page.tsx", import.meta.url),
  "utf8",
);
const detalleLiquidacion = await readFile(
  new URL("../src/app/dashboard/liquidaciones/[id]/page.tsx", import.meta.url),
  "utf8",
);
const itemsTable = await readFile(
  new URL("../src/app/dashboard/items-table.tsx", import.meta.url),
  "utf8",
);

test("liquidaciones keeps the wide table and provides a complete compact view", () => {
  assert.match(liquidaciones, /hidden xl:block/);
  assert.match(liquidaciones, /xl:hidden/);
  assert.match(liquidaciones, /Ver detalle/);
  assert.match(liquidaciones, /Cobra lado Bs/);
  assert.match(liquidaciones, /Cobra lado COP/);
});

test("liquidacion detail stacks summary labels and amounts on narrow screens", () => {
  const filaResumen =
    /flex flex-col gap-0\.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3/g;

  assert.equal([...detalleLiquidacion.matchAll(filaResumen)].length, 4);
});

test("items switch to cards until the content channel can fit the semantic table", () => {
  assert.match(itemsTable, /hidden 2xl:block/);
  assert.match(itemsTable, /2xl:hidden/);
  assert.doesNotMatch(itemsTable, /md:min-w-\[1000px\]/);
});

test("compact item cards preserve financial data, proofs, actions, and deposits", () => {
  for (const label of [
    "Tasa",
    "Comisión",
    "Referencia",
    "Comprobantes",
    "Ver comprobante",
    "Ver depósitos",
    "Editar",
  ]) {
    assert.match(itemsTable, new RegExp(label));
  }
});
