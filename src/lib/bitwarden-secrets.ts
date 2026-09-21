import "server-only";

import {
  BitwardenClient,
  type SecretResponse,
} from "@bitwarden/sdk-napi";

/**
 * Bitwarden Secrets Manager: donde viven las claves de los paneles.
 *
 * Este módulo es la ÚNICA puerta al SDK. Nada de afuera construye un
 * cliente ni toca `secrets()` directamente, porque hay dos invariantes que
 * se sostienen solo si todo pasa por acá:
 *
 *   1. Un valor de secreto nunca sale en un log ni en un mensaje de error.
 *      Los errores del SDK se reducen a su `message` antes de tocar la
 *      consola; el objeto crudo no se imprime nunca.
 *   2. Solo se leen secretos del proyecto configurado. Un secret_id que
 *      apunte a otro proyecto de la organización se descarta en silencio
 *      en vez de devolverse.
 *
 * Lo que este módulo NO resuelve, dicho acá para que nadie lo suponga: la
 * cuenta de máquina es una sola para toda la app, así que el servidor puede
 * leer el secreto de cualquier usuario. Quién puede pedir cuál se decide
 * arriba, con RLS: un secret_id solo llega hasta acá si vino de una fila
 * que la política de `paneles` ya dejó ver. Este módulo confía en eso y no
 * lo puede verificar por su cuenta.
 */

const ACCESS_TOKEN = process.env.BITWARDEN_ACCESS_TOKEN;
const ORGANIZATION_ID = process.env.BITWARDEN_ORGANIZATION_ID;
const PROJECT_ID = process.env.BITWARDEN_PROJECT_ID;

/**
 * Si falta cualquiera de las tres, el gestor no existe para esta app.
 *
 * Se pregunta ANTES de llamar, y no se descubre con una excepción, porque
 * la app tiene que seguir andando sin Bitwarden: en esta fase las claves
 * siguen estando en la base y el gestor es un respaldo, no la fuente. Un
 * entorno sin configurar —- un preview, una máquina local -— debe mostrar
 * los paneles igual, no una pantalla de error.
 */
export function estaConfigurado() {
  return Boolean(ACCESS_TOKEN && ORGANIZATION_ID && PROJECT_ID);
}

/**
 * El interruptor que retira el texto plano de la base.
 *
 * Mientras está apagado, cada clave se guarda en los dos lados: el secreto
 * en el gestor y el texto en Supabase. Encenderlo hace que la app deje de
 * escribir el texto, y recién ahí el `update` de la fase 50 sirve de algo:
 * sin este interruptor, borrar las claves con SQL dura hasta el próximo
 * guardado de cada panel, que las vuelve a escribir sin que nadie lo note.
 *
 * Es una variable de entorno y no una deducción del estado de los datos a
 * propósito. Es la decisión de tirar la única copia de respaldo: la toma
 * una persona que miró el diagnóstico, no un `if` que la infiere.
 *
 * El `estaConfigurado()` del final no es redundante. Si algún día falta una
 * variable del gestor, esto tiene que devolver false y la app tiene que
 * volver a escribir el texto: lo contrario es guardar claves vacías sin
 * respaldo en ningún lado, que es exactamente la pérdida que toda esta
 * migración vino a evitar.
 */
export function textoPlanoRetirado() {
  return process.env.BITWARDEN_RETIRE_PLAINTEXT === "1" && estaConfigurado();
}

function configuracion() {
  if (!ACCESS_TOKEN || !ORGANIZATION_ID || !PROJECT_ID) {
    throw new Error("Bitwarden Secrets Manager no está configurado completamente.");
  }
  return {
    accessToken: ACCESS_TOKEN,
    organizationId: ORGANIZATION_ID,
    projectId: PROJECT_ID,
  };
}

/**
 * De un error cualquiera sale solo su texto.
 *
 * Existe porque `console.error(error)` imprime el objeto entero, y el
 * objeto entero de un SDK puede arrastrar el cuerpo de la petición. Acá
 * pasan claves: el día que un error traiga el payload, el valor termina en
 * los logs de Vercel, que es exactamente el lugar del que lo estamos
 * sacando.
 */
export function mensajeDeError(error: unknown) {
  return error instanceof Error ? error.message : "error desconocido";
}

/**
 * El cliente se memoriza entre peticiones.
 *
 * `loginAccessToken` es un viaje de red a identity.bitwarden.com. Hacerlo
 * en cada lectura convertiría "abrir mis paneles" en dos segundos de
 * espera, y guardar un panel con tres cuentas en cuatro viajes en vez de
 * uno. Con Fluid Compute la instancia se reutiliza entre peticiones, así
 * que esta promesa sobrevive y el login se paga una vez por instancia.
 *
 * Es la MISMA cuenta de máquina para todos los usuarios, así que compartir
 * el cliente no mezcla permisos de nadie: no hay permisos por usuario que
 * mezclar. Quién puede pedir qué se decidió arriba, con RLS.
 *
 * Y si el login falla, la promesa se olvida. Sin esa línea, un corte de
 * treinta segundos en Bitwarden deja la instancia con una promesa
 * rechazada pegada para siempre: el corte se arregla y la app sigue rota
 * hasta el próximo deploy, sin que nada en los logs explique por qué.
 */
let clientePrometido: Promise<BitwardenClient> | null = null;

function cliente() {
  if (clientePrometido) return clientePrometido;

  clientePrometido = (async () => {
    const { accessToken } = configuracion();
    const sdk = new BitwardenClient(
      {
        apiUrl: "https://api.bitwarden.com",
        identityUrl: "https://identity.bitwarden.com",
        userAgent: "control-cambios/bitwarden",
      },
      4,
    );
    await sdk.auth().loginAccessToken(accessToken);
    return sdk;
  })();

  clientePrometido.catch(() => {
    clientePrometido = null;
  });

  return clientePrometido;
}

/** El texto que se guarda junto al secreto en Bitwarden. Nunca la clave. */
function nota(panelId: string, usuario: string) {
  return [
    "control-cambios · clave de panel",
    `panel: ${panelId}`,
    usuario ? `usuario: ${usuario}` : "usuario: (sin usuario)",
  ].join("\n");
}

/**
 * Cómo se llama el secreto en la pantalla de Bitwarden.
 *
 * Es una etiqueta para el humano que entra a mirar, no una identidad: las
 * cuentas se direccionan por `secret_id`, que no cambia aunque se renombre
 * el panel. Por eso puede repetirse entre paneles sin romper nada.
 *
 * Se recorta porque el nombre lo escribe el usuario y no tiene tope.
 */
function etiqueta(nombrePanel: string, usuario: string) {
  const crudo = usuario ? `${nombrePanel} · ${usuario}` : nombrePanel;
  return crudo.slice(0, 180);
}

/**
 * Lee varios secretos de una sola vez y devuelve id -> valor.
 *
 * Los ids que no existan, o que estén fuera del proyecto configurado, no
 * aparecen en el mapa. No es un error: un secreto borrado a mano en
 * Bitwarden deja una referencia colgada en la base, y la pantalla tiene
 * que saber mostrar "esta cuenta perdió su clave" en vez de romperse.
 *
 * El camino rápido es `getByIds`, un viaje para todos. Si ese viaje falla
 * se reintenta de a uno, porque `getByIds` es todo o nada: un solo id
 * muerto tumba la respuesta entera y dejaría sin clave a las cuentas sanas
 * del mismo panel.
 */
export async function leerSecretos(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  const valores = new Map<string, string>();
  if (unicos.length === 0 || !estaConfigurado()) return valores;

  const { projectId } = configuracion();
  const sdk = await cliente();

  function aceptar(secreto: SecretResponse) {
    if (secreto.projectId === projectId) valores.set(secreto.id, secreto.value);
  }

  try {
    const respuesta = await sdk.secrets().getByIds(unicos);
    for (const secreto of respuesta.data ?? []) aceptar(secreto);
    return valores;
  } catch (error) {
    console.warn(
      "[bitwarden] la lectura en lote falló, se reintenta de a uno:",
      mensajeDeError(error),
    );
  }

  const sueltos = await Promise.allSettled(
    unicos.map((id) => sdk.secrets().get(id)),
  );
  for (const resultado of sueltos) {
    if (resultado.status === "fulfilled") aceptar(resultado.value);
  }
  return valores;
}

/**
 * Reintenta SOLO cuando el servidor contestó 429.
 *
 * La distinción no es un detalle: un 429 significa que la petición fue
 * rechazada y no llegó a ejecutarse, así que repetirla no puede duplicar
 * nada. Cualquier otro error es ambiguo —- un timeout puede ser una petición
 * que sí creó el secreto y cuya respuesta se perdió -— y reintentar eso deja
 * dos secretos donde tenía que haber uno, con la fila apuntando a uno solo y
 * el otro colgado para siempre.
 *
 * Por eso no hay un reintento genérico acá. Cuando el error es de los
 * ambiguos, la operación falla, la clave se conserva en la base y el usuario
 * vuelve a apretar el botón: ese camino SÍ es idempotente, porque
 * `respaldarPendientes` solo crea lo que falta.
 */
async function conEsperaSiLimitan<T>(operacion: () => Promise<T>, intentos = 3) {
  for (let intento = 1; ; intento += 1) {
    try {
      return await operacion();
    } catch (error) {
      const limitado = /\b429\b|too many requests/i.test(mensajeDeError(error));
      if (!limitado || intento >= intentos) throw error;
      await new Promise((listo) => setTimeout(listo, 300 * 2 ** (intento - 1)));
    }
  }
}

/** Crea el secreto de una cuenta y devuelve su id. */
export async function crearSecreto(opciones: {
  panelId: string;
  nombrePanel: string;
  usuario: string;
  clave: string;
}) {
  const { organizationId, projectId } = configuracion();
  const sdk = await cliente();
  const secreto = await conEsperaSiLimitan(() =>
    sdk
      .secrets()
      .create(
        organizationId,
        etiqueta(opciones.nombrePanel, opciones.usuario),
        opciones.clave,
        nota(opciones.panelId, opciones.usuario),
        [projectId],
      ),
  );
  return secreto.id;
}

/** Pisa el valor de un secreto que ya existe, conservando su id. */
export async function actualizarSecreto(opciones: {
  secretId: string;
  panelId: string;
  nombrePanel: string;
  usuario: string;
  clave: string;
}) {
  const { organizationId, projectId } = configuracion();
  const sdk = await cliente();
  await conEsperaSiLimitan(() =>
    sdk
      .secrets()
      .update(
        organizationId,
        opciones.secretId,
        etiqueta(opciones.nombrePanel, opciones.usuario),
        opciones.clave,
        nota(opciones.panelId, opciones.usuario),
        [projectId],
      ),
  );
}

/**
 * Borra secretos que ya no tienen dueño.
 *
 * Se llama cuando se saca una cuenta de un panel o se borra el panel
 * entero. No es cosmética: sin esto, el contador de /api/bitwarden/health
 * crece con cada edición y deja de significar "cuántas claves hay
 * guardadas", que es lo único que ese número sirve para responder.
 */
export async function borrarSecretos(ids: string[]) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return;
  const sdk = await cliente();
  await sdk.secrets().delete(unicos);
}

/**
 * Comprueba la conexión sin devolver valores secretos al navegador ni a
 * logs: cuenta cuántos secretos del proyecto configurado ve la cuenta de
 * máquina, y nada más.
 *
 * `list` devuelve identificadores de TODA la organización, sin valores.
 * Para saber cuáles son de nuestro proyecto hace falta el detalle, y eso
 * sí trae el valor: por eso se pide en un solo lote y se tira todo menos
 * el id, la etiqueta y la organización. Los valores no salen de esta
 * función.
 */
export async function listPanelSecretMetadata() {
  const { organizationId, projectId } = configuracion();
  const sdk = await cliente();

  const identificadores = (await sdk.secrets().list(organizationId)).data ?? [];
  if (identificadores.length === 0) return [];

  const detalle = await sdk
    .secrets()
    .getByIds(identificadores.map((item) => item.id));

  return (detalle.data ?? [])
    .filter((secreto) => secreto.projectId === projectId)
    .map((secreto) => ({
      id: secreto.id,
      key: secreto.key,
      organizationId: secreto.organizationId,
    }));
}
