import assert from "node:assert/strict";
import test from "node:test";

/**
 * Los otros tests leen el código como texto: sirven para fijar decisiones
 * ("esto se valida antes de esta rama") pero no ejecutan nada. Estos corren
 * las funciones de verdad contra un Bitwarden falso.
 *
 * La diferencia importa justo acá. Casi todo lo delicado de esta migración
 * —- emparejar cuentas por posición, decidir qué secreto quedó huérfano,
 * cuándo se puede borrar una clave -— es lógica que se ve bien leyéndola y
 * se equivoca corriendo.
 *
 * Las variables van antes de importar: bitwarden-secrets las lee al evaluar
 * el módulo, no en cada llamada.
 */
process.env.BITWARDEN_ACCESS_TOKEN = "token-de-prueba";
process.env.BITWARDEN_ORGANIZATION_ID = "org-1";
process.env.BITWARDEN_PROJECT_ID = "proj-1";

const falso = await import("./entorno/bitwarden-falso.mjs");
const {
  contarMigracion,
  resolverCuentas,
  respaldarPendientes,
  retirarTextoPlano,
  sincronizarCuentas,
  verificarRespaldo,
} = await import("../src/lib/paneles-secretos.ts");
const { leerSecretos } = await import("../src/lib/bitwarden-secrets.ts");

/** Una cuenta como la manda el formulario. */
function entrante(usuario, clave, extra = {}) {
  return { usuario, clave, claveLegible: true, ...extra };
}

function reiniciar({ retirar = false } = {}) {
  falso.reiniciar();
  if (retirar) process.env.BITWARDEN_RETIRE_PLAINTEXT = "1";
  else delete process.env.BITWARDEN_RETIRE_PLAINTEXT;
}

const PANEL = { panelId: "panel-1", nombrePanel: "Oleada" };

// ---------------------------------------------------------------
// Guardar un panel
// ---------------------------------------------------------------

test("a new account gets a secret, and the password lands in the manager", async () => {
  reiniciar();
  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [entrante("ana", "clave-de-ana")],
    permitidos: [],
    previos: [],
  });

  assert.equal(r.falloElRespaldo, false);
  const [cuenta] = r.cuentas;
  assert.ok(cuenta.secret_id, "la cuenta quedó sin referencia");
  assert.equal(falso.almacen.secretos.get(cuenta.secret_id).value, "clave-de-ana");
  assert.equal(falso.almacen.secretos.get(cuenta.secret_id).projectId, "proj-1");
  // Mientras no se retire, el texto sigue yendo a la fila.
  assert.equal(cuenta.clave, "clave-de-ana");
  assert.deepEqual(r.creados, [cuenta.secret_id]);
});

test("an existing account keeps its id and the secret is updated in place", async () => {
  reiniciar();
  const id = falso.sembrar({ value: "vieja" });

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [entrante("ana", "nueva", { secret_id: id })],
    permitidos: [id],
    previos: [id],
  });

  assert.equal(r.cuentas[0].secret_id, id, "estrenó referencia en vez de reusar");
  assert.equal(falso.almacen.secretos.get(id).value, "nueva");
  assert.equal(falso.almacen.secretos.size, 1, "creó un secreto de más");
  assert.deepEqual(r.creados, []);
  assert.deepEqual(r.huerfanos, []);
});

test("a secret_id the row does not own is ignored, not written to", async () => {
  reiniciar();
  // El secreto de otro usuario, que el navegador podría mandar a mano.
  const ajeno = falso.sembrar({ value: "clave-de-otro" });

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [entrante("ana", "clave-de-ana", { secret_id: ajeno })],
    permitidos: [], // esta fila no tiene ninguna referencia propia
    previos: [],
  });

  assert.equal(
    falso.almacen.secretos.get(ajeno).value,
    "clave-de-otro",
    "le pisó la clave a otro usuario",
  );
  assert.notEqual(r.cuentas[0].secret_id, ajeno, "se quedó con la referencia ajena");
  assert.equal(falso.almacen.secretos.get(r.cuentas[0].secret_id).value, "clave-de-ana");
});

test("removing an account from the panel orphans its secret", async () => {
  reiniciar();
  const deAna = falso.sembrar({ value: "a" });
  const deBeto = falso.sembrar({ value: "b" });

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [entrante("ana", "a", { secret_id: deAna })],
    permitidos: [deAna, deBeto],
    previos: [deAna, deBeto],
  });

  assert.deepEqual(r.huerfanos, [deBeto]);
});

test("deleting the middle row does not shift the other passwords", async () => {
  reiniciar();
  const ids = ["a", "b", "c"].map((v) => falso.sembrar({ value: v }));

  // Se borró la fila del medio: vuelven la primera y la tercera, en orden.
  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [
      entrante("ana", "a", { secret_id: ids[0] }),
      entrante("caro", "c", { secret_id: ids[2] }),
    ],
    permitidos: ids,
    previos: ids,
  });

  assert.equal(r.cuentas[0].secret_id, ids[0]);
  assert.equal(r.cuentas[1].secret_id, ids[2]);
  assert.equal(falso.almacen.secretos.get(ids[0]).value, "a");
  assert.equal(falso.almacen.secretos.get(ids[2]).value, "c");
  assert.deepEqual(r.huerfanos, [ids[1]], "no soltó el secreto de la fila borrada");
});

test("clearing a password that was visible removes its secret", async () => {
  reiniciar();
  const id = falso.sembrar({ value: "vieja" });

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [entrante("ana", "", { secret_id: id })],
    permitidos: [id],
    previos: [id],
  });

  assert.equal(r.cuentas[0].secret_id, undefined);
  assert.deepEqual(r.huerfanos, [id]);
});

test("a password field left blank because it could not be read keeps the secret", async () => {
  reiniciar();
  const id = falso.sembrar({ value: "la-que-no-se-pudo-mostrar" });

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [{ usuario: "ana", clave: "", secret_id: id, claveLegible: false }],
    permitidos: [id],
    previos: [id],
  });

  assert.equal(r.cuentas[0].secret_id, id, "soltó la referencia");
  assert.deepEqual(r.huerfanos, [], "mandó a borrar el secreto");
  assert.equal(falso.almacen.secretos.get(id).value, "la-que-no-se-pudo-mostrar");
});

test("when the manager rejects the write, the password still reaches the row", async () => {
  reiniciar();
  falso.almacen.fallar.set("create", new Error("503 del gestor"));

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [entrante("ana", "clave-de-ana")],
    permitidos: [],
    previos: [],
  });

  assert.equal(r.falloElRespaldo, true);
  assert.equal(r.cuentas[0].clave, "clave-de-ana", "se perdió la clave");
  assert.equal(r.cuentas[0].secret_id, undefined, "inventó una referencia que no existe");
  assert.deepEqual(r.creados, []);
});

test("one account failing does not take the others down with it", async () => {
  reiniciar();
  const id = falso.sembrar({ value: "vieja" });
  falso.almacen.fallar.set("create", new Error("503 del gestor"));

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [
      entrante("ana", "nueva", { secret_id: id }), // update: funciona
      entrante("beto", "de-beto"), // create: falla
    ],
    permitidos: [id],
    previos: [id],
  });

  assert.equal(r.falloElRespaldo, true);
  assert.equal(falso.almacen.secretos.get(id).value, "nueva", "perdió el update que sí podía");
  assert.equal(r.cuentas[1].clave, "de-beto");
  assert.deepEqual(r.huerfanos, [], "borró el secreto de la cuenta que sí funcionó");
});

// ---------------------------------------------------------------
// Leer un panel
// ---------------------------------------------------------------

test("the manager's value wins over the copy left in the database", async () => {
  reiniciar();
  const id = falso.sembrar({ value: "la-del-gestor" });

  const [panel] = await resolverCuentas([
    { id: "p", cuentas: [{ usuario: "ana", clave: "la-vieja-de-la-base", secret_id: id }] },
  ]);

  assert.equal(panel.cuentas[0].clave, "la-del-gestor");
  assert.equal(panel.cuentas[0].claveNoDisponible, false);
});

test("with the manager down the screen falls back to the database", async () => {
  reiniciar();
  falso.almacen.fallar.set("getByIds", new Error("503"));
  falso.almacen.fallar.set("get", new Error("503"));

  const [panel] = await resolverCuentas([
    { id: "p", cuentas: [{ usuario: "ana", clave: "la-de-la-base", secret_id: "secreto-9" }] },
  ]);

  assert.equal(panel.cuentas[0].clave, "la-de-la-base");
});

test("a reference with nothing behind it is reported, not shown as blank", async () => {
  reiniciar();
  const [panel] = await resolverCuentas([
    // Referencia a un secreto borrado a mano en Bitwarden, y sin texto en
    // la base: no hay de dónde sacar la clave.
    { id: "p", cuentas: [{ usuario: "ana", clave: "", secret_id: "secreto-borrado" }] },
  ]);

  assert.equal(panel.cuentas[0].claveNoDisponible, true);
});

test("a secret from another project is never resolved", async () => {
  reiniciar();
  const ajeno = falso.sembrar({ value: "de-otro-proyecto", projectId: "proj-2" });

  const [panel] = await resolverCuentas([
    { id: "p", cuentas: [{ usuario: "ana", clave: "", secret_id: ajeno }] },
  ]);

  assert.equal(panel.cuentas[0].clave, "");
  assert.equal(panel.cuentas[0].claveNoDisponible, true);
});

test("one dead id does not cost the healthy accounts their passwords", async () => {
  reiniciar();
  const vivo = falso.sembrar({ value: "sigo-vivo" });

  // getByIds es todo o nada: con un id muerto adentro, falla entero.
  const valores = await leerSecretos([vivo, "secreto-muerto"]);

  assert.equal(valores.get(vivo), "sigo-vivo");
  assert.equal(valores.has("secreto-muerto"), false);
  const metodos = falso.almacen.llamadas.map((l) => l.metodo);
  assert.ok(metodos.includes("getByIds"), "no intentó el lote primero");
  assert.ok(metodos.includes("get"), "no reintentó de a uno");
});

// ---------------------------------------------------------------
// Retirar el texto plano
// ---------------------------------------------------------------

test("with the switch off nothing is retired", async () => {
  reiniciar({ retirar: false });
  const id = falso.sembrar({ value: "igual" });

  const r = await retirarTextoPlano([
    { id: "p", nombre: "Oleada", cuentas: [{ usuario: "ana", clave: "igual", secret_id: id }] },
  ]);

  assert.deepEqual(r.cambios, []);
  assert.equal(r.retiradas, 0);
});

test("a password is only retired when the manager returns it identical", async () => {
  reiniciar({ retirar: true });
  const igual = falso.sembrar({ value: "coincide" });
  const distinto = falso.sembrar({ value: "otra-cosa" });

  const r = await retirarTextoPlano([
    {
      id: "p",
      nombre: "Oleada",
      cuentas: [
        { usuario: "ana", clave: "coincide", secret_id: igual },
        { usuario: "beto", clave: "lo-que-dice-la-base", secret_id: distinto },
        // Una referencia a un secreto borrado a mano en Bitwarden: es el
        // caso que un UPDATE en SQL no puede distinguir y se lleva puesto.
        { usuario: "caro", clave: "sin-respaldo-real", secret_id: "secreto-borrado" },
        // Y una cuenta que nunca se respaldó.
        { usuario: "dani", clave: "nunca-migrada" },
      ],
    },
  ]);

  assert.equal(r.retiradas, 1);
  assert.equal(r.conservadas, 2);
  const [cambio] = r.cambios;
  assert.equal(cambio.cuentas[0].clave, "", "no retiró la que sí coincidía");
  assert.equal(cambio.cuentas[1].clave, "lo-que-dice-la-base", "borró una que no coincidía");
  assert.equal(cambio.cuentas[2].clave, "sin-respaldo-real", "borró la última copia");
  assert.equal(cambio.cuentas[3].clave, "nunca-migrada", "tocó una cuenta sin respaldo");
  assert.equal(cambio.cuentas[3].secret_id, undefined);
});

test("once retired, saving the panel does not put the password back", async () => {
  reiniciar({ retirar: true });
  const id = falso.sembrar({ value: "la-clave" });

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [entrante("ana", "la-clave", { secret_id: id })],
    permitidos: [id],
    previos: [id],
  });

  assert.equal(r.cuentas[0].clave, "", "reescribió el texto plano en la fila");
  assert.equal(r.cuentas[0].secret_id, id);
  assert.equal(falso.almacen.secretos.get(id).value, "la-clave");
});

test("even retired, a rejected write keeps the password in the row", async () => {
  reiniciar({ retirar: true });
  falso.almacen.fallar.set("create", new Error("503 del gestor"));

  const r = await sincronizarCuentas({
    ...PANEL,
    cuentas: [entrante("ana", "clave-de-ana")],
    permitidos: [],
    previos: [],
  });

  // Sin esto la fila queda sin clave y sin respaldo: la pérdida que toda
  // la migración vino a evitar.
  assert.equal(r.cuentas[0].clave, "clave-de-ana");
  assert.equal(r.falloElRespaldo, true);
});

// ---------------------------------------------------------------
// Migración masiva y diagnóstico
// ---------------------------------------------------------------

test("the bulk migration only creates what is missing", async () => {
  reiniciar();
  const yaEsta = falso.sembrar({ value: "no-me-toques" });

  const r = await respaldarPendientes({
    ...PANEL,
    cuentas: [
      { usuario: "ana", clave: "la-de-la-base", secret_id: yaEsta },
      { usuario: "beto", clave: "sin-respaldo" },
      { usuario: "caro", clave: "" },
    ],
  });

  assert.equal(r.creados, 1);
  assert.equal(r.fallidos, 0);
  assert.equal(
    falso.almacen.secretos.get(yaEsta).value,
    "no-me-toques",
    "revirtió un secreto rotado a mano en Bitwarden",
  );
  assert.ok(r.cuentas[1].secret_id);
  assert.equal(r.cuentas[2].secret_id, undefined, "le inventó secreto a una cuenta sin clave");
  const metodos = falso.almacen.llamadas.map((l) => l.metodo);
  assert.equal(metodos.includes("update"), false, "la migración masiva no debe actualizar");
});

test("the gate only opens with zero pending, zero unresolved and zero mismatched", async () => {
  reiniciar();
  const bueno = falso.sembrar({ value: "coincide" });

  const conProblema = await verificarRespaldo([
    {
      id: "p",
      nombre: "Oleada",
      cuentas: [
        { usuario: "ana", clave: "coincide", secret_id: bueno },
        { usuario: "beto", clave: "sin-migrar" },
        { usuario: "caro", clave: "x", secret_id: "secreto-borrado" },
      ],
    },
  ]);

  assert.equal(conProblema.conClave, 3);
  assert.equal(conProblema.pendientes, 1);
  assert.equal(conProblema.noResuelven.length, 1);
  assert.deepEqual(conProblema.noResuelven[0], { panel: "Oleada", cuenta: 3 });
  assert.equal(conProblema.listoParaRetirarTextoPlano, false);

  const limpio = await verificarRespaldo([
    { id: "p", nombre: "Oleada", cuentas: [{ usuario: "ana", clave: "coincide", secret_id: bueno }] },
  ]);
  assert.equal(limpio.listoParaRetirarTextoPlano, true);

  // Y una cuenta ya retirada cuenta como terminada, no como problema.
  const retirada = await verificarRespaldo([
    { id: "p", nombre: "Oleada", cuentas: [{ usuario: "ana", clave: "", secret_id: bueno }] },
  ]);
  assert.equal(retirada.soloEnElGestor, 1);
  assert.equal(retirada.listoParaRetirarTextoPlano, true);
});

test("the screen counters tell apart what is unbacked from what still has text", () => {
  const conteo = contarMigracion([
    { cuentas: [{ usuario: "ana", clave: "x", secret_id: "s1" }] },
    { cuentas: [{ usuario: "beto", clave: "y" }] },
    { cuentas: [{ usuario: "caro", clave: "", secret_id: "s2" }] },
    { cuentas: "basura-que-no-es-un-arreglo" },
  ]);

  assert.deepEqual(conteo, { pendientes: 1, conTextoPlano: 1 });
});
