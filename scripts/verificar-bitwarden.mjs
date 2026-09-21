/**
 * Comprueba que el gestor de secretos está bien conectado, de punta a punta.
 *
 *   node --env-file=.env.local scripts/verificar-bitwarden.mjs
 *
 * Usa el SDK de verdad y el mismo código que usa la app, así que si esto
 * pasa, la app funciona; si falla, dice exactamente en qué paso.
 *
 * NO toca tus paneles. Crea un secreto de prueba con un nombre reconocible,
 * lo lee, lo modifica, lo vuelve a leer y lo borra. Si el script se corta a
 * la mitad, el secreto queda en el proyecto y se puede borrar a mano.
 *
 * NUNCA imprime el valor de un secreto, ni siquiera el de prueba: este
 * script está pensado para correrse mientras alguien mira la pantalla, y
 * para poder pegar su salida sin revisarla.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

register("../tests/entorno/resolver.mjs", pathToFileURL(`${import.meta.dirname}/`), {
  data: { sdkFalso: false },
});

const VARIABLES = [
  "BITWARDEN_ACCESS_TOKEN",
  "BITWARDEN_ORGANIZATION_ID",
  "BITWARDEN_PROJECT_ID",
];

let pasos = 0;
let fallos = 0;

function bien(texto) {
  pasos += 1;
  console.log(`  ok   ${texto}`);
}

function mal(texto, detalle) {
  fallos += 1;
  console.log(`  FALLA ${texto}`);
  if (detalle) console.log(`        ${detalle}`);
}

console.log("\nVariables de entorno");
const faltan = VARIABLES.filter((v) => !process.env[v]?.trim());
for (const v of VARIABLES) {
  // Solo si está y cuánto mide. El valor no se imprime jamás.
  if (process.env[v]?.trim()) bien(`${v} presente (${process.env[v].trim().length} caracteres)`);
  else mal(`${v} FALTA`);
}

if (faltan.length > 0) {
  console.log(
    `\nFaltan ${faltan.length} variables. Sin las tres, estaConfigurado() da falso y la app` +
      "\nsigue guardando las claves en texto en la base, sin avisar.\n",
  );
  process.exit(1);
}

const { estaConfigurado, textoPlanoRetirado, listPanelSecretMetadata, leerSecretos } =
  await import("@/lib/bitwarden-secrets");

console.log("\nConfiguración");
if (estaConfigurado()) bien("la app se considera configurada");
else mal("la app NO se considera configurada");

const retirado = textoPlanoRetirado();
console.log(
  `  info BITWARDEN_RETIRE_PLAINTEXT ${retirado ? "ENCENDIDO: los guardados dejan de escribir el texto en la base" : "apagado: cada clave se guarda en los dos lados"}`,
);

console.log("\nConexión y permisos");
let metadata;
try {
  metadata = await listPanelSecretMetadata();
  bien(`autenticó y ve ${metadata.length} secreto(s) en el proyecto configurado`);
} catch (error) {
  mal("no pudo autenticar o listar", error instanceof Error ? error.message : String(error));
  console.log("\nSe corta acá: sin conexión no tiene sentido probar lectura y escritura.\n");
  process.exit(1);
}

console.log("\nEscritura y lectura (sobre un secreto de prueba, no sobre tus paneles)");
const { crearSecreto, actualizarSecreto, borrarSecretos } = await import(
  "../src/lib/bitwarden-secrets.ts"
);

const marca = randomUUID();
const valorInicial = `valor-de-prueba-${marca}`;
const valorNuevo = `valor-cambiado-${marca}`;
let id = null;

try {
  id = await crearSecreto({
    panelId: "verificacion",
    nombrePanel: "PRUEBA — borrar si quedó",
    usuario: marca.slice(0, 8),
    clave: valorInicial,
  });
  bien("creó un secreto de prueba");

  const leido = await leerSecretos([id]);
  if (leido.get(id) === valorInicial) bien("lo leyó y el valor volvió idéntico");
  else mal("lo leyó pero el valor NO coincide", "el ida y vuelta del valor está alterándolo");

  await actualizarSecreto({
    secretId: id,
    panelId: "verificacion",
    nombrePanel: "PRUEBA — borrar si quedó",
    usuario: marca.slice(0, 8),
    clave: valorNuevo,
  });
  const releido = await leerSecretos([id]);
  if (releido.get(id) === valorNuevo) bien("lo actualizó y devolvió el valor nuevo");
  else mal("lo actualizó pero sigue devolviendo el valor viejo");

  // Un id que no existe no puede tumbar la lectura de los que sí.
  const mezcla = await leerSecretos([id, randomUUID()]);
  if (mezcla.get(id) === valorNuevo) bien("un id inexistente no arrastra a los sanos");
  else mal("un solo id muerto dejó sin clave a las cuentas sanas");
} catch (error) {
  mal("falló la escritura o la lectura", error instanceof Error ? error.message : String(error));
} finally {
  if (id) {
    try {
      await borrarSecretos([id]);
      bien("borró el secreto de prueba");
    } catch (error) {
      mal(
        `NO pudo borrar el secreto de prueba ${id}`,
        `borralo a mano en Bitwarden: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

console.log(
  `\n${fallos === 0 ? "Todo en orden" : `${fallos} problema(s)`} — ${pasos} comprobación(es) pasaron.\n`,
);
process.exit(fallos === 0 ? 0 : 1);
