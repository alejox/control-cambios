import assert from "node:assert/strict";
import test from "node:test";

/**
 * Una venta de créditos es plata que el lado COP le debe al lado Bs. Entra
 * en el neto sumando a favor de Bs, igual que en liquidar_pendientes
 * (supabase/phase50_ventas_credito.sql):
 *
 *   neto = (usdt_bs - comision_bs) - (usdt_cop - comision_cop) + ventas
 *
 * Estos tests corren la cuenta de verdad: la previa del panel y el corte
 * congelado tienen que dar el mismo número que la base.
 */
const { cobraCadaLado, previaDeCorte, favorDe } = await import(
  "../src/lib/liquidaciones.ts"
);

const PENDIENTE = { usdt_bs: 500, usdt_cop: 300, comision_bs: 70, comision_cop: 21 };

test("sin ventas, la cuenta no cambia", () => {
  const sin = previaDeCorte(PENDIENTE);
  const conCero = previaDeCorte({ ...PENDIENTE, total_ventas: 0 });
  // (500 - 70) - (300 - 21) = 151
  assert.equal(sin.neto, 151);
  assert.deepEqual(conCero, sin);
  assert.deepEqual(cobraCadaLado(PENDIENTE), { bs: 521, cop: 370 });
});

test("una venta de 69 USDT sube el neto en 69 a favor de Bs", () => {
  const sin = previaDeCorte(PENDIENTE);
  const con = previaDeCorte({ ...PENDIENTE, total_ventas: 69 });
  assert.equal(con.neto, sin.neto + 69);
  assert.equal(con.cobra.bs, sin.cobra.bs + 69);
  assert.equal(con.cobra.cop, sin.cobra.cop);
  assert.equal(cobraCadaLado({ ...PENDIENTE, total_ventas: 69 }).bs, 521 + 69);
});

test("si COP iba ganando por menos que la venta, el saldo pasa a Bs", () => {
  // (100 - 14) - (200 - 6) = -108: a favor de COP.
  const totales = { usdt_bs: 100, usdt_cop: 200, comision_bs: 14, comision_cop: 6 };
  assert.equal(previaDeCorte(totales).favor.lado, "cop");

  const con = previaDeCorte({ ...totales, total_ventas: 150 });
  assert.equal(con.neto, 42);
  assert.equal(con.favor.lado, "bs");
  assert.deepEqual(con.favor, favorDe(42));
});

test("las ventas en texto (como llegan de numeric) se suman como número", () => {
  const con = previaDeCorte({ ...PENDIENTE, total_ventas: "69.50" });
  assert.equal(con.neto, 220.5);
});
