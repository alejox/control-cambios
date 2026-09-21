import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

/**
 * Deja que los tests importen el código de src/ tal como lo importa Next.
 *
 * Resuelve tres cosas que Node solo no sabe hacer:
 *   · el alias "@/..." del tsconfig,
 *   · "server-only", que fuera de un React Server Component lanza al
 *     importarse,
 *   · "@bitwarden/sdk-napi", que es un binario nativo y en los tests se
 *     reemplaza por uno falso que se puede inspeccionar y hacer fallar.
 *
 * Las extensiones se prueban a mano porque en el código los imports van sin
 * ella, como en TypeScript.
 */
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(AQUI, "../../src");

/**
 * El SDK se reemplaza solo si quien registra el loader lo pide.
 *
 * Los tests quieren el falso; el verificador de credenciales quiere el de
 * verdad y el resto del arnés igual (alias y server-only). El dato viaja por
 * `register(..., { data })` y no por una variable de entorno porque los
 * hooks corren en otro hilo y no ven el process.env de acá.
 */
let sdkFalso = true;

export async function initialize(datos) {
  if (datos && typeof datos.sdkFalso === "boolean") sdkFalso = datos.sdkFalso;
}

const SUSTITUTOS = {
  "server-only": path.join(AQUI, "vacio.mjs"),
};

function conExtension(base) {
  for (const intento of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(intento) && !existsSync(path.join(intento, "."))) return intento;
  }
  for (const intento of [`${base}.ts`, `${base}.tsx`]) {
    if (existsSync(intento)) return intento;
  }
  return null;
}

export async function resolve(especificador, contexto, siguiente) {
  if (especificador === "@bitwarden/sdk-napi" && sdkFalso) {
    return {
      url: pathToFileURL(path.join(AQUI, "bitwarden-falso.mjs")).href,
      shortCircuit: true,
    };
  }

  const sustituto = SUSTITUTOS[especificador];
  if (sustituto) {
    return { url: pathToFileURL(sustituto).href, shortCircuit: true };
  }

  if (especificador.startsWith("@/")) {
    const destino = conExtension(path.join(SRC, especificador.slice(2)));
    if (!destino) throw new Error(`No se pudo resolver ${especificador}`);
    // El formato va explícito: sin él Node intenta leer el .ts como
    // CommonJS, falla, y lo reparsea avisando por consola en cada corrida.
    return {
      url: pathToFileURL(destino).href,
      format: "module-typescript",
      shortCircuit: true,
    };
  }

  return siguiente(especificador, contexto);
}
