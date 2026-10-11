import assert from "node:assert/strict";
import test from "node:test";

/**
 * La tarjeta "Movimientos" del panel cuenta todo lo pendiente: items y
 * ventas de créditos, que comparten la numeración (el total coincide con el
 * último número). El desglose "Canje de créditos: N" va en su propia línea,
 * solo si hay alguno. "Sin aprobar" sigue siendo solo de items.
 */
const { resumenTarjetaMovimientos } = await import("../src/lib/ventas.ts");

const aprobado = { revisado_at: "2026-10-11T00:00:00Z" };
const sinAprobar = { revisado_at: null };

test("el número grande cuenta movimientos y canjes juntos", () => {
  const r = resumenTarjetaMovimientos([aprobado, sinAprobar], 1);
  assert.equal(r.movimientos, 3);
  assert.equal(r.canjes, "Canje de créditos: 1");
});

test("sin canjes pendientes no se muestra la línea", () => {
  const r = resumenTarjetaMovimientos([aprobado], 0);
  assert.equal(r.canjes, null);
  assert.equal(r.estado, "Todos aprobados");
});

test("el estado de aprobación mira solo los movimientos", () => {
  const r = resumenTarjetaMovimientos([aprobado, sinAprobar, sinAprobar], 3);
  assert.equal(r.estado, "2 sin aprobar");
  assert.equal(r.canjes, "Canje de créditos: 3");
});

test("sin nada pendiente dice que no hay nada que liquidar", () => {
  const r = resumenTarjetaMovimientos([], 0);
  assert.equal(r.movimientos, 0);
  assert.equal(r.estado, "Nada que liquidar");
  assert.equal(r.canjes, null);
});

test("solo canjes: no hay estado de aprobación, sí la línea de canjes", () => {
  const r = resumenTarjetaMovimientos([], 2);
  assert.equal(r.movimientos, 2);
  assert.equal(r.estado, null);
  assert.equal(r.canjes, "Canje de créditos: 2");
});
