import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const leer = (ruta) => readFile(new URL(`../${ruta}`, import.meta.url), "utf8");

const gestor = await leer("src/lib/bitwarden-secrets.ts");
const puente = await leer("src/lib/paneles-secretos.ts");
const acciones = await leer("src/app/dashboard/paneles/actions.ts");
const pantalla = await leer("src/app/dashboard/paneles/paneles.tsx");
const migrar = await leer("src/app/api/bitwarden/migrar/route.ts");
const fase49 = await leer("supabase/phase49_paneles_claves_en_bitwarden.sql");

/**
 * Devuelve el texto de cada llamada a console.* del archivo.
 *
 * Existe porque el riesgo no es "que se loguee una clave" escrito así de
 * claro —- eso nadie lo escribe -— sino `console.error(error)` con un error
 * del SDK que arrastra el cuerpo de la petición. Por eso la aserción mira
 * los ARGUMENTOS de cada log y no el archivo entero.
 */
function llamadasALaConsola(fuente) {
  // Los comentarios se sacan primero. Este mismo repositorio EXPLICA en un
  // comentario por qué no se hace `console.error(error)`, y sin esta
  // limpieza la explicación se lee como la infracción que describe.
  const codigo = fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  return [...codigo.matchAll(/console\.\w+\(([\s\S]*?)\);/g)].map((m) => m[1]);
}

test("secret values never reach the logs as raw error objects", () => {
  for (const [nombre, fuente] of [
    ["bitwarden-secrets", gestor],
    ["paneles-secretos", puente],
    ["migrar/route", migrar],
  ]) {
    for (const argumentos of llamadasALaConsola(fuente)) {
      assert.doesNotMatch(
        argumentos,
        // El `$` importa: el paréntesis de cierre lo consume el regex de
        // arriba, así que el último argumento termina al final del texto y
        // sin esta alternativa `console.error("x:", error)` pasaba de largo.
        /(^|[^a-zA-Z_.(])(error|reason)\s*([,)]|$)/,
        `${nombre}: un console.* recibe un error crudo en vez de mensajeDeError()`,
      );
    }
  }
  assert.match(gestor, /export function mensajeDeError/);
});

test("the Bitwarden module is the only door to the SDK, and it is server-only", () => {
  assert.match(gestor, /^import "server-only";/m);
  assert.match(puente, /^import "server-only";/m);
  for (const [nombre, fuente] of [
    ["actions", acciones],
    ["migrar/route", migrar],
    ["paneles.tsx", pantalla],
  ]) {
    assert.doesNotMatch(
      fuente,
      /@bitwarden\/sdk-napi/,
      `${nombre}: importa el SDK directamente en vez de pasar por lib`,
    );
  }
});

test("only secrets from the configured project resolve", () => {
  assert.match(gestor, /secreto\.projectId === projectId/);
  // getByIds es todo o nada: un id muerto no puede dejar sin clave al resto.
  assert.match(gestor, /getByIds\(unicos\)/);
  assert.match(gestor, /Promise\.allSettled/);
});

test("a secret_id coming back from the browser is checked against the row", () => {
  // La lista blanca sale de la base, no del formulario.
  assert.match(acciones, /\.from\("paneles"\)\s*\n\s*\.select\("cuentas"\)/);
  assert.match(acciones, /permitidos: previos/);
  assert.match(puente, /const habilitados = new Set\(permitidos\)/);

  // El filtro corre UNA vez, antes de cualquier rama. Es lo que impide que
  // una rama olvidada guarde el secret_id de otro usuario en una fila
  // propia: resolverCuentas lo resolvería después sin sospechar nada y la
  // pantalla mostraría una clave ajena.
  const cuerpo = puente.slice(
    puente.indexOf("export async function sincronizarCuentas"),
    puente.indexOf("export async function limpiarSecretos"),
  );
  assert.match(
    cuerpo,
    /const validadas: CuentaGuardada\[\] = cuentas\.map\(\(cuenta\) => \(\{[\s\S]*?habilitados\.has\(cuenta\.secret_id\)[\s\S]*?\}\)\);/,
  );
  assert.ok(
    cuerpo.indexOf("const validadas") < cuerpo.indexOf("if (!estaConfigurado())"),
    "la validación tiene que correr antes del atajo de entorno sin gestor",
  );

  // Y después de esa línea nadie vuelve a leer el secret_id del formulario:
  // `cuentas[i]` solo puede consultarse para claveLegible.
  for (const uso of cuerpo.matchAll(/cuentas\[i\]\.(\w+)/g)) {
    assert.equal(
      uso[1],
      "claveLegible",
      `sincronizarCuentas vuelve a leer cuentas[i].${uso[1]} del formulario`,
    );
  }
  assert.doesNotMatch(cuerpo, /return \{ cuentas,/);
  // Ni devolviendo la cuenta entera del formulario, que es la misma fuga
  // escrita sin acceder a ninguna propiedad.
  assert.doesNotMatch(cuerpo, /return cuentas\[i\]\s*[;,]/);
});

test("usuario, clave and secret_id are paired by position and dropped together", () => {
  assert.match(acciones, /formData\.getAll\("usuario"\)/);
  assert.match(acciones, /formData\.getAll\("clave"\)/);
  assert.match(acciones, /formData\.getAll\("secret_id"\)/);
  // El filtro va DESPUÉS del map que arma la terna: filtrar antes correría
  // las claves un lugar y le pegaría a cada cuenta la de la siguiente.
  assert.ok(
    acciones.indexOf("secret_id: secretIds[i] || undefined") <
      acciones.indexOf('c.usuario !== "" ||'),
  );

  // Y en la pantalla, el campo oculto vive dentro de la MISMA fila que su
  // usuario: si saliera del map, el navegador mandaría una sola referencia
  // para todas las cuentas.
  const filas = pantalla.split('name="secret_id"');
  assert.equal(filas.length, 2, "debe haber exactamente un campo secret_id");
  assert.ok(pantalla.indexOf("cuentas.map(") < pantalla.indexOf('name="secret_id"'));
  assert.ok(pantalla.indexOf('name="secret_id"') < pantalla.indexOf('name="usuario"'));
});

test("saving keeps working when the secrets manager is down", () => {
  // El respaldo fallido avisa; no cancela el guardado ni lanza.
  assert.match(puente, /falloElRespaldo/);
  assert.doesNotMatch(puente, /throw new Error/);
  assert.match(acciones, /aviso: respaldo\.falloElRespaldo \? RESPALDO_FALLIDO : null/);
  // Y el formulario NO se cierra con un aviso pendiente: cerrarlo se ve
  // igual que un guardado perfecto.
  assert.match(pantalla, /if \(state\.ok && !state\.aviso\) alTerminar\(\)/);
});

test("orphan secrets are collected instead of piling up in Bitwarden", () => {
  assert.match(acciones, /limpiarSecretos\(respaldo\.huerfanos/);
  assert.match(acciones, /limpiarSecretos\(respaldo\.creados/);
  // Al borrar el panel, las referencias se leen ANTES del delete: después
  // no queda de dónde sacarlas.
  const antes = acciones.indexOf('.select("cuentas")\n    .eq("id", id)');
  const borrado = acciones.indexOf('.delete()');
  assert.ok(antes !== -1 && antes < borrado);
  assert.match(acciones, /se borró el panel/);
});

test("the migration runs under the caller's own RLS, never service_role", () => {
  assert.doesNotMatch(migrar, /createAdminClient|SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(migrar, /runtime = "nodejs"/);
  assert.match(migrar, /auth\.getUser\(\)/);
  assert.match(migrar, /status: 401/);
  assert.match(migrar, /status: 403/);
});

test("the migration only creates missing secrets and never returns values", () => {
  // Solo crea: una clave rotada a mano en Bitwarden no puede quedar
  // revertida al valor viejo de la base en la próxima pasada.
  assert.match(puente, /if \(!cuenta\.clave \|\| cuenta\.secret_id\) return cuenta;/);
  assert.doesNotMatch(migrar, /actualizarSecreto/);
  // La respuesta lleva números y nombres de panel, nunca valores.
  assert.doesNotMatch(migrar, /\.value\b/);
  // Solo la palabra en los comentarios: ninguna clave se lee ni se devuelve.
  assert.doesNotMatch(migrar, /\.clave\b|clave:/);
  // Y el texto plano no se toca: esta fase agrega la referencia.
  assert.match(migrar, /\.update\(\{ cuentas: resultado\.cuentas \}\)/);
});

test("the plaintext retirement is documented but not executed", () => {
  // Cada línea que tocaría los datos tiene que estar comentada: correr esto
  // antes de verificar borra la única copia que se sabe buena.
  for (const linea of fase49.split("\n")) {
    if (/^\s*(update|delete|alter)\s+/i.test(linea)) {
      assert.fail(`la fase 49 ejecuta una sentencia que debería estar comentada: ${linea}`);
    }
  }
  assert.match(fase49, /--\s*update public\.paneles/);
  // El order by no es decorativo: sin él jsonb_agg puede reordenar las
  // cuentas y emparejar cada usuario con la clave de otra.
  assert.match(fase49, /order by orden_cuenta/);
  assert.match(fase49, /listoParaRetirarTextoPlano: true/);
});

test("the verification gate demands zero pending, zero unresolved, zero mismatched", () => {
  assert.match(
    puente,
    /listoParaRetirarTextoPlano =\s*\n?\s*diagnostico\.pendientes === 0 &&\s*\n?\s*diagnostico\.noResuelven\.length === 0 &&\s*\n?\s*diagnostico\.difieren\.length === 0/,
  );
  // Y la comparación pasa entera en el servidor.
  assert.match(puente, /delGestor !== cuenta\.clave/);
});

test("a password field left blank because it could not be read never deletes the secret", () => {
  // La pantalla marca cada fila con si llegó a mostrar la clave.
  assert.match(pantalla, /name="clave_legible"/);
  assert.match(pantalla, /value=\{cuenta\.claveNoDisponible \? "" : "1"\}/);
  assert.match(acciones, /claveLegible: legibles\[i\] === "1"/);

  // Y el servidor conserva la referencia cuando el campo vino vacío sin
  // haberse podido mostrar. Es la diferencia entre "el usuario la borró" y
  // "el gestor estaba caído", y confundirlas borra el único respaldo que
  // queda una vez retirado el texto plano de la base.
  assert.match(
    puente,
    /if \(cuenta\.secret_id && !cuentas\[i\]\.claveLegible\) return cuenta;/,
  );

  // Y la fila no se descarta por venir sin usuario y sin clave si lo que
  // tiene es un secreto que no se pudo leer.
  assert.match(acciones, /\(c\.secret_id !== undefined && !c\.claveLegible\)/);
});

test("claveLegible is a form field and never gets stored in the database", () => {
  // Todo lo que se guarda sale de `validadas`, que se arma campo por campo
  // y no lleva claveLegible. Propagar la CuentaEntrante con spread la
  // arrastraría hasta la columna jsonb.
  const cuerpo = puente.slice(
    puente.indexOf("export async function sincronizarCuentas"),
    puente.indexOf("export async function limpiarSecretos"),
  );
  assert.doesNotMatch(cuerpo, /\.\.\.cuentas\[i\]/);
  assert.match(cuerpo, /const validadas: CuentaGuardada\[\]/);
  assert.match(puente, /export type CuentaEntrante = CuentaGuardada & \{ claveLegible: boolean \}/);
});
