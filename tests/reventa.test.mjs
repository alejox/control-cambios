import assert from "node:assert/strict";
import test from "node:test";

/**
 * Las listas mayoristas de créditos y la cuenta de reventa.
 *
 * Los totales de cada tramo se copian tal cual de los mensajes de los
 * proveedores: si alguno cambia por accidente, el precio que se le pasa a
 * un revendedor sale mal y nadie se entera hasta que reclama.
 */
const {
  PROVEEDORES,
  buscarVariante,
  precioPorCredito,
  precioReferencia,
  ahorroPct,
  mejorTramo,
  panelDe,
  costoUsdt,
  aplicarMargen,
  convertir,
  redondearVenta,
  calcularReventa,
  textoCotizacion,
} = await import("../src/lib/reventa.ts");

const ESPERADO = {
  stellatv: {
    unica: [[15, 37.5], [30, 69], [50, 110], [100, 200], [300, 585], [500, 950], [1000, 1850]],
  },
  oleadatv: {
    multi: [[30, 57], [50, 90], [100, 170], [200, 320], [300, 465], [400, 600], [500, 700]],
    uno: [[30, 33], [50, 52.5], [100, 100], [200, 190], [300, 270], [400, 340], [500, 400]],
  },
  flujotv: {
    multi: [[30, 75], [50, 115], [100, 220], [300, 600], [500, 950], [1000, 1850], [2000, 3500]],
  },
  telelatino: {
    multi: [[30, 66], [50, 105], [100, 200], [200, 380], [300, 555], [400, 720], [500, 875]],
    uno: [[30, 42], [50, 65], [100, 120], [200, 220], [300, 345], [400, 400], [500, 450]],
  },
};

test("cada tramo de cada lista tiene exactamente el total del proveedor", () => {
  assert.deepEqual(
    PROVEEDORES.map((p) => p.id),
    ["stellatv", "oleadatv", "flujotv", "telelatino"],
  );
  for (const [proveedorId, variantes] of Object.entries(ESPERADO)) {
    const proveedor = PROVEEDORES.find((p) => p.id === proveedorId);
    assert.ok(proveedor, proveedorId);
    assert.deepEqual(
      proveedor.variantes.map((v) => v.id),
      Object.keys(variantes),
      proveedorId,
    );
    for (const [varianteId, tramos] of Object.entries(variantes)) {
      const variante = buscarVariante(proveedorId, varianteId);
      assert.deepEqual(
        variante.tramos.map((t) => [t.creditos, t.totalUsdt]),
        tramos,
        `${proveedorId}/${varianteId}`,
      );
    }
  }
});

test("la recarga suelta solo existe en OleadaTV, de 1 a 29 créditos", () => {
  assert.deepEqual(buscarVariante("oleadatv", "multi").suelto, { precioUsdt: 2.8, min: 1, max: 29 });
  assert.deepEqual(buscarVariante("oleadatv", "uno").suelto, { precioUsdt: 1.8, min: 1, max: 29 });
  assert.equal(buscarVariante("stellatv", "unica").suelto, null);
  assert.equal(buscarVariante("telelatino", "multi").suelto, null);
});

test("el precio por crédito se deriva del total", () => {
  const stella = buscarVariante("stellatv", "unica");
  assert.equal(precioPorCredito(stella.tramos[1]), 2.3); // 69 / 30
  assert.equal(precioPorCredito(stella.tramos[0]), 2.5); // 37.50 / 15
  assert.equal(precioPorCredito(buscarVariante("telelatino", "uno").tramos[6]), 0.9); // 450 / 500
});

test("el ahorro se mide contra el crédito más caro de la variante", () => {
  const stella = buscarVariante("stellatv", "unica");
  assert.equal(precioReferencia(stella), 2.5);
  assert.equal(ahorroPct(stella, stella.tramos[0]), 0);
  // 1000 a 1,85 frente a 2,50 → 26 % menos
  assert.equal(Math.round(ahorroPct(stella, stella.tramos[6])), 26);

  // Con recarga suelta, la referencia es el precio suelto.
  const oleada = buscarVariante("oleadatv", "multi");
  assert.equal(precioReferencia(oleada), 2.8);
  // 500 a 1,40 frente a 2,80 → la mitad
  assert.equal(ahorroPct(oleada, oleada.tramos[6]), 50);
});

test("el mejor tramo es el de menor precio por crédito", () => {
  assert.equal(mejorTramo(buscarVariante("stellatv", "unica")).creditos, 1000);
  assert.equal(mejorTramo(buscarVariante("flujotv", "multi")).creditos, 2000);
  assert.equal(mejorTramo(buscarVariante("telelatino", "uno")).creditos, 500);
});

test("los paneles salen de los umbrales del proveedor", () => {
  const stella = PROVEEDORES.find((p) => p.id === "stellatv");
  assert.equal(panelDe(stella, 15), "Panel nuevo");
  assert.equal(panelDe(stella, 50), "Panel nuevo");
  assert.equal(panelDe(stella, 100), "Super panel");
  assert.equal(panelDe(stella, 500), "Admin panel");
  assert.equal(panelDe(stella, 1000), "Admin panel");

  const flujo = PROVEEDORES.find((p) => p.id === "flujotv");
  assert.equal(panelDe(flujo, 30), null);
  assert.equal(panelDe(flujo, 50), "Super panel");
  assert.equal(panelDe(flujo, 500), "Admin panel");

  const oleada = PROVEEDORES.find((p) => p.id === "oleadatv");
  assert.equal(panelDe(oleada, 500), null);
});

test("el costo de una cantidad: tramo exacto, recarga suelta o nada", () => {
  const oleada = buscarVariante("oleadatv", "multi");
  assert.equal(costoUsdt(oleada, 10), 28); // 10 × 2,80, sin el 28.000000000000004
  assert.equal(costoUsdt(oleada, 29), 81.2);
  assert.equal(costoUsdt(oleada, 30), 57);
  assert.equal(costoUsdt(buscarVariante("oleadatv", "uno"), 7), 12.6);

  // Fuera de los tramos y sin recarga suelta no hay precio que inventar.
  const stella = buscarVariante("stellatv", "unica");
  assert.equal(costoUsdt(stella, 30), 69);
  assert.equal(costoUsdt(stella, 40), null);
  assert.equal(costoUsdt(oleada, 45), null);
  assert.equal(costoUsdt(oleada, 0), null);
  assert.equal(costoUsdt(oleada, 2.5), null);
});

test("el margen se aplica sobre el costo", () => {
  assert.equal(aplicarMargen(69, 20), 82.8);
  assert.equal(aplicarMargen(69, 0), 69);
  assert.equal(aplicarMargen(37.5, 12.5), 42.19); // 42,1875 → 2 decimales
});

test("la conversión y el redondeo de precio de venta", () => {
  assert.equal(convertir(82.8, 4000), 331200);
  assert.equal(redondearVenta(331200, "COP"), 331000);
  assert.equal(redondearVenta(331500, "COP"), 332000);
  assert.equal(redondearVenta(12344.9, "VES"), 12340);
  assert.equal(redondearVenta(12345, "VES"), 12350);
  assert.equal(redondearVenta(82.8049, "USDT"), 82.8);
});

test("la cuenta completa de 30 créditos de StellaTV al 20 %", () => {
  const r = calcularReventa({
    variante: buscarVariante("stellatv", "unica"),
    creditos: 30,
    margenPct: 20,
    tasaCop: 4000,
    tasaVes: 150,
  });
  assert.equal(r.costoUsdt, 69);
  assert.equal(r.ventaUsdt, 82.8);
  assert.equal(r.gananciaUsdt, 13.8);
  assert.equal(r.ventaPorCreditoUsdt, 2.76);
  assert.equal(r.ventaCop, 331200);
  assert.equal(r.ventaCopRedondeada, 331000);
  assert.equal(r.ventaVes, 12420);
  assert.equal(r.ventaVesRedondeada, 12420);
});

test("sin margen la venta es el costo y sin tasa no hay conversión", () => {
  const r = calcularReventa({
    variante: buscarVariante("oleadatv", "multi"),
    creditos: 10,
    margenPct: 0,
    tasaCop: null,
    tasaVes: null,
  });
  assert.equal(r.ventaUsdt, 28);
  assert.equal(r.gananciaUsdt, 0);
  assert.equal(r.ventaCopRedondeada, null);
  assert.equal(r.ventaVesRedondeada, null);

  assert.equal(
    calcularReventa({
      variante: buscarVariante("stellatv", "unica"),
      creditos: 40,
      margenPct: 20,
      tasaCop: 4000,
      tasaVes: 150,
    }),
    null,
  );
});

test("el texto de la cotización lleva todo lo que el cliente necesita", () => {
  const variante = buscarVariante("stellatv", "unica");
  const r = calcularReventa({ variante, creditos: 30, margenPct: 20, tasaCop: 4000, tasaVes: 150 });
  const texto = textoCotizacion({ proveedor: "StellaTV", variante, creditos: 30, resultado: r });
  assert.match(texto, /StellaTV/);
  assert.match(texto, /30 créditos/);
  assert.match(texto, /82,80 USDT/);
  assert.match(texto, /331\.000 COP/);
  assert.match(texto, /Bs 12\.420/);
});
