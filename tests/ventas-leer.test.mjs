import assert from "node:assert/strict";
import test from "node:test";

/**
 * leerVenta es la única regla de lo que entra por el formulario de ventas:
 * la acción del servidor solo la llama. Estos tests la corren sin servidor.
 * La venta comparte la numeración de los movimientos (fase 51), así que el
 * número también pasa por acá.
 */
const { leerVenta, siguienteNumeroPendiente, VENTA_DESCRIPCION_MAX } = await import(
  "../src/lib/ventas.ts"
);

const VALIDA = { usdt: "69", fecha: "2026-10-11", descripcion: "30 Creditos Stella", numero: "44" };

test("una venta válida se lee con sus tipos", () => {
  const { error, venta } = leerVenta(VALIDA);
  assert.equal(error, null);
  assert.deepEqual(venta, {
    usdt: 69,
    fecha: "2026-10-11",
    descripcion: "30 Creditos Stella",
    numero: 44,
  });
});

test("la coma decimal se acepta y la descripción vacía queda en null", () => {
  const { error, venta } = leerVenta({ ...VALIDA, usdt: "12,5", descripcion: "   " });
  assert.equal(error, null);
  assert.equal(venta.usdt, 12.5);
  assert.equal(venta.descripcion, null);
});

test("el monto tiene que ser mayor que cero", () => {
  for (const usdt of ["0", "-5", "", "abc", null]) {
    const { error, venta } = leerVenta({ ...VALIDA, usdt });
    assert.match(error ?? "", /mayor que cero/, `usdt=${usdt}`);
    assert.equal(venta, null);
  }
});

test("el monto admite hasta dos decimales", () => {
  const { error, venta } = leerVenta({ ...VALIDA, usdt: "10.123" });
  assert.match(error ?? "", /dos decimales/);
  assert.equal(venta, null);
});

test("la fecha tiene que existir en el calendario", () => {
  for (const fecha of ["2026-02-31", "2026-13-01", "2026-04-31", "11/10/2026", "", null]) {
    const { error, venta } = leerVenta({ ...VALIDA, fecha });
    assert.match(error ?? "", /fecha/, `fecha=${fecha}`);
    assert.equal(venta, null);
  }
  // Un bisiesto sí tiene 29 de febrero.
  assert.equal(leerVenta({ ...VALIDA, fecha: "2028-02-29" }).error, null);
});

test("la descripción tiene un largo máximo", () => {
  const larga = "x".repeat(VENTA_DESCRIPCION_MAX + 1);
  const { error, venta } = leerVenta({ ...VALIDA, descripcion: larga });
  assert.match(error ?? "", /descripción/);
  assert.equal(venta, null);
  const justa = "x".repeat(VENTA_DESCRIPCION_MAX);
  assert.equal(leerVenta({ ...VALIDA, descripcion: justa }).error, null);
});

test("el número tiene que ser un entero positivo", () => {
  for (const numero of ["0", "-3", "4.5", "", "abc", null]) {
    const { error, venta } = leerVenta({ ...VALIDA, numero });
    assert.match(error ?? "", /número/, `numero=${numero}`);
    assert.equal(venta, null);
  }
});

test("el siguiente número mira movimientos y ventas pendientes", () => {
  assert.equal(siguienteNumeroPendiente([], []), 1);
  assert.equal(siguienteNumeroPendiente([43, 12], []), 44);
  assert.equal(siguienteNumeroPendiente([43], [44]), 45);
  assert.equal(siguienteNumeroPendiente([], [7]), 8);
});
