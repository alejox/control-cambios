import "server-only";

import {
  actualizarSecreto,
  borrarSecretos,
  crearSecreto,
  estaConfigurado,
  leerSecretos,
  mensajeDeError,
} from "@/lib/bitwarden-secrets";
import type { Cuenta } from "@/app/dashboard/paneles/estado";

/**
 * El puente entre una fila de `paneles` y los secretos de Bitwarden.
 *
 * Vive en lib y no en las actions de la pantalla porque lo usan dos
 * caminos distintos: guardar un panel a mano y la migración masiva de
 * /api/bitwarden/migrar. Si cada uno tuviera su copia, el día que cambie
 * la forma de `cuentas` uno de los dos se queda viejo, y el que se queda
 * viejo es el que escribe claves.
 *
 * DURANTE LA MIGRACIÓN se escribe en los dos lados: el secreto va a
 * Bitwarden Y el texto sigue en la base. No es indecisión, es el único
 * orden que permite volver atrás: hasta que no esté verificado que cada
 * cuenta resuelve su valor desde Bitwarden, borrar el texto plano es
 * borrar la única copia que se sabe buena. El texto se retira en una fase
 * posterior, cuando /api/bitwarden/migrar informe cero pendientes y cero
 * diferencias.
 */

/** Una cuenta tal como está guardada en la columna `cuentas` (jsonb). */
export type CuentaGuardada = {
  usuario: string;
  clave: string;
  secret_id?: string;
};

/**
 * Una cuenta tal como VUELVE del formulario.
 *
 * `claveLegible` dice si la pantalla llegó a mostrar la clave en el campo.
 * Sin ese dato, una clave vacía es ambigua de la peor manera posible: puede
 * significar "la borré" o puede significar "nunca me la mostraste porque el
 * gestor estaba caído". Tratar la segunda como la primera borra el secreto
 * —- y una vez retirado el texto plano de la base, no hay de dónde
 * recuperarlo.
 *
 * Que el dato venga del navegador y se pueda falsificar no lo invalida: el
 * único efecto de mentir es borrar UN secreto propio, que es exactamente lo
 * que hace la × de esa fila. No abre nada que el usuario no pudiera hacer.
 */
export type CuentaEntrante = CuentaGuardada & { claveLegible: boolean };

/** Lo que hay que escribir en la base después de tocar Bitwarden. */
export type Sincronizacion = {
  cuentas: CuentaGuardada[];
  /** Secretos que quedaron sin dueño y hay que borrar de Bitwarden. */
  huerfanos: string[];
  /** Secretos creados en ESTA pasada: se deshacen si la base rechaza la fila. */
  creados: string[];
  /** Alguna cuenta no llegó a respaldarse. La fila se guarda igual. */
  falloElRespaldo: boolean;
};

function normalizar(valor: unknown): CuentaGuardada[] {
  if (!Array.isArray(valor)) return [];
  return valor.map((c) => ({
    usuario: typeof c?.usuario === "string" ? c.usuario : "",
    clave: typeof c?.clave === "string" ? c.clave : "",
    secret_id: typeof c?.secret_id === "string" && c.secret_id ? c.secret_id : undefined,
  }));
}

/** Lee la columna `cuentas` cruda de la base con la forma esperada. */
export function cuentasGuardadas(valor: unknown) {
  return normalizar(valor);
}

/**
 * Deja cada cuenta con su clave resuelta, prefiriendo Bitwarden.
 *
 * Una sola lectura en lote para TODOS los paneles de la pantalla, no una
 * por cuenta: con cinco paneles de tres cuentas serían quince viajes de
 * red antes de pintar nada.
 *
 * Si Bitwarden no contesta, cae al texto de la base y la pantalla se ve
 * igual que antes de la migración. Eso es deliberado: en esta fase el
 * gestor es el respaldo, no la fuente, y un corte suyo no puede dejar al
 * usuario sin poder entrar a sus paneles.
 */
export async function resolverCuentas<T extends { cuentas: unknown }>(
  filas: T[],
): Promise<Array<Omit<T, "cuentas"> & { cuentas: Cuenta[] }>> {
  const porFila = filas.map((fila) => normalizar(fila.cuentas));

  const ids = porFila.flatMap((cuentas) =>
    cuentas.map((c) => c.secret_id).filter((id): id is string => Boolean(id)),
  );

  let valores = new Map<string, string>();
  if (ids.length > 0 && estaConfigurado()) {
    try {
      valores = await leerSecretos(ids);
    } catch (error) {
      console.error(
        "[paneles] no se pudieron leer las claves del gestor:",
        mensajeDeError(error),
      );
    }
  }

  return filas.map((fila, i) => ({
    ...fila,
    cuentas: porFila[i].map((cuenta) => {
      const delGestor = cuenta.secret_id ? valores.get(cuenta.secret_id) : undefined;
      return {
        usuario: cuenta.usuario,
        clave: delGestor ?? cuenta.clave,
        secret_id: cuenta.secret_id,
        // Solo cuando NO hay de dónde sacarla: había referencia, el gestor
        // no la resolvió y en la base tampoco quedaba texto.
        claveNoDisponible: Boolean(
          cuenta.secret_id && delGestor === undefined && !cuenta.clave,
        ),
      };
    }),
  }));
}

/**
 * Manda a Bitwarden las claves de un panel y devuelve qué guardar.
 *
 * `permitidos` es la lista de secret_id que HOY tiene esa fila en la base.
 * Un secret_id que no esté ahí se ignora y la cuenta estrena secreto
 * nuevo. Eso no es paranoia de más: el secret_id viaja al navegador en un
 * campo oculto para sobrevivir a que se reordenen o se borren filas, así
 * que vuelve del cliente y el cliente puede escribir lo que quiera. Sin
 * este filtro, un usuario podría mandar el secret_id de OTRO y pisarle la
 * clave —- el servidor tiene una sola cuenta de máquina y puede escribir
 * cualquier secreto de la organización.
 *
 * Las llamadas van en paralelo pero el orden de `cuentas` se conserva:
 * la posición es lo que empareja a cada usuario con SU clave.
 *
 * Nunca lanza. Un panel se guarda aunque el gestor esté caído; lo que se
 * pierde en ese caso es el respaldo, no la clave, que sigue yendo a la
 * base. Por eso devuelve `falloElRespaldo` en vez de una excepción.
 */
export async function sincronizarCuentas(opciones: {
  panelId: string;
  nombrePanel: string;
  cuentas: CuentaEntrante[];
  permitidos: string[];
  /** Secretos de la fila anterior que ya no aparecen en `cuentas`. */
  previos: string[];
}): Promise<Sincronizacion> {
  const { panelId, nombrePanel, cuentas, permitidos, previos } = opciones;
  const habilitados = new Set(permitidos);

  // Las referencias se validan UNA vez, acá arriba, y de acá para abajo no
  // se vuelve a mirar lo que mandó el navegador.
  //
  // Hacerlo en un solo lugar no es prolijidad: cada rama que se olvidara de
  // filtrar sería la misma fuga. Un secret_id ajeno guardado en una fila
  // propia lo resolvería después `resolverCuentas` sin sospechar nada, y
  // esa pantalla mostraría la clave de otro usuario —- el servidor tiene
  // una sola cuenta de máquina y puede leer cualquier secreto de la
  // organización. El filtro de abajo es lo único que lo impide.
  //
  // De paso se descarta `claveLegible`, que es un dato del formulario para
  // decidir, no un dato para guardar en la base.
  const validadas: CuentaGuardada[] = cuentas.map((cuenta) => ({
    usuario: cuenta.usuario,
    clave: cuenta.clave,
    secret_id:
      cuenta.secret_id && habilitados.has(cuenta.secret_id)
        ? cuenta.secret_id
        : undefined,
  }));

  if (!estaConfigurado()) {
    // Sin gestor configurado no se inventa nada: la fila se guarda como
    // siempre y se conservan las referencias que ya tenía, para que un
    // deploy sin las variables no borre el trabajo de la migración.
    return {
      cuentas: validadas,
      huerfanos: [],
      creados: [],
      falloElRespaldo: false,
    };
  }

  const resultados = await Promise.allSettled(
    validadas.map(async (cuenta, i): Promise<CuentaGuardada> => {
      if (!cuenta.clave) {
        // Vacío porque nunca se pudo mostrar: se conserva la referencia y
        // no se toca el secreto. El campo vino en blanco por un corte del
        // gestor, no por una decisión del usuario, y guardar el panel para
        // corregir una URL no puede costarle la contraseña.
        //
        // Para sacarle la clave a una cuenta está la × de su fila, que es
        // un gesto explícito y no un efecto secundario de un campo vacío.
        if (cuenta.secret_id && !cuentas[i].claveLegible) return cuenta;

        // Vacío habiéndola mostrado: el usuario la borró. Si tenía secreto,
        // queda huérfano y lo recoge el cálculo de abajo.
        return { usuario: cuenta.usuario, clave: "" };
      }

      if (cuenta.secret_id) {
        // Se actualiza siempre, sin comparar con el valor anterior. La
        // comparación pediría leer el secreto primero —- un viaje más -—
        // y además la etiqueta depende del nombre del panel y del
        // usuario, que pueden haber cambiado aunque la clave no.
        await actualizarSecreto({
          secretId: cuenta.secret_id,
          panelId,
          nombrePanel,
          usuario: cuenta.usuario,
          clave: cuenta.clave,
        });
        return cuenta;
      }

      const secret_id = await crearSecreto({
        panelId,
        nombrePanel,
        usuario: cuenta.usuario,
        clave: cuenta.clave,
      });
      return { ...cuenta, secret_id };
    }),
  );

  const creados: string[] = [];
  let falloElRespaldo = false;

  const finales = resultados.map((resultado, i): CuentaGuardada => {
    if (resultado.status === "rejected") {
      falloElRespaldo = true;
      console.error(
        "[paneles] no se pudo respaldar una clave en el gestor:",
        mensajeDeError(resultado.reason),
      );
      // Se conserva la referencia vieja si la tenía: perder el respaldo es
      // malo, perder el puntero al respaldo que ya existía es peor.
      return validadas[i];
    }
    const cuenta = resultado.value;
    if (cuenta.secret_id && cuenta.secret_id !== validadas[i].secret_id) {
      creados.push(cuenta.secret_id);
    }
    return cuenta;
  });

  const vivos = new Set(
    finales.map((c) => c.secret_id).filter((id): id is string => Boolean(id)),
  );
  const huerfanos = [...new Set(previos)].filter((id) => id && !vivos.has(id));

  return { cuentas: finales, huerfanos, creados, falloElRespaldo };
}

/**
 * Borra secretos sin dueño sin que su fracaso arrastre a nadie.
 *
 * Un secreto que sobra es basura; una excepción acá cancelaría el guardado
 * o el borrado que el usuario ya dio por hecho. Se avisa en los logs y se
 * sigue.
 */
export async function limpiarSecretos(ids: string[], motivo: string) {
  if (ids.length === 0 || !estaConfigurado()) return;
  try {
    await borrarSecretos(ids);
  } catch (error) {
    console.error(
      `[paneles] quedaron ${ids.length} secretos sin borrar (${motivo}):`,
      mensajeDeError(error),
    );
  }
}

/** Una fila de `paneles` reducida a lo que la migración necesita mirar. */
export type FilaParaMigrar = { id: string; nombre: string; cuentas: unknown };

/**
 * Crea el secreto de las cuentas que todavía no tienen uno.
 *
 * SOLO crea: a una cuenta que ya tiene `secret_id` no la toca. La
 * diferencia con `sincronizarCuentas` es deliberada y es la que hace que
 * esta función se pueda correr mil veces sin miedo. Acá la fuente es el
 * texto de la base, y si además pisara los secretos existentes, una clave
 * rotada directamente en Bitwarden —- sin pasar por la app -— quedaría
 * revertida al valor viejo de la base en la próxima pasada.
 *
 * Devuelve las cuentas listas para guardar. Si no hubo nada que crear,
 * devuelve las mismas y `creados: 0`, así el llamador puede saltearse el
 * update.
 */
export async function respaldarPendientes(opciones: {
  panelId: string;
  nombrePanel: string;
  cuentas: CuentaGuardada[];
}) {
  const { panelId, nombrePanel, cuentas } = opciones;

  const resultados = await Promise.allSettled(
    cuentas.map(async (cuenta) => {
      if (!cuenta.clave || cuenta.secret_id) return cuenta;
      const secret_id = await crearSecreto({
        panelId,
        nombrePanel,
        usuario: cuenta.usuario,
        clave: cuenta.clave,
      });
      return { ...cuenta, secret_id };
    }),
  );

  let creados = 0;
  let fallidos = 0;

  const finales = resultados.map((resultado, i): CuentaGuardada => {
    if (resultado.status === "rejected") {
      fallidos += 1;
      console.error(
        "[migración] no se pudo respaldar una clave:",
        mensajeDeError(resultado.reason),
      );
      return cuentas[i];
    }
    if (resultado.value.secret_id !== cuentas[i].secret_id) creados += 1;
    return resultado.value;
  });

  return { cuentas: finales, creados, fallidos };
}

/**
 * El semáforo para retirar el texto plano.
 *
 * Responde una sola pregunta: ¿se puede borrar la clave de la base sin
 * perder nada? La respuesta es sí únicamente cuando toda cuenta con clave
 * tiene su secreto, todo secreto resuelve, y lo que resuelve es EXACTAMENTE
 * lo que dice la base. Cualquier otra cosa es un "todavía no".
 *
 * Los valores no salen de acá: se comparan adentro y afuera solo viaja el
 * nombre del panel y la posición de la cuenta, que es lo que hace falta
 * para ir a mirarla.
 */
export type Diagnostico = {
  /** Cuentas que tienen una clave para respaldar. */
  conClave: number;
  /** De esas, cuántas ya tienen su secreto en el gestor. */
  respaldadas: number;
  /** Tienen clave en la base y todavía ningún secreto. */
  pendientes: number;
  /** Tienen secret_id pero el gestor no devolvió nada para ese id. */
  noResuelven: Array<{ panel: string; cuenta: number }>;
  /** El gestor devolvió un valor distinto al texto de la base. */
  difieren: Array<{ panel: string; cuenta: number }>;
  /** Ya no tienen texto plano: su clave vive solo en el gestor. */
  soloEnElGestor: number;
  /** Cierto cuando se puede borrar el texto plano sin perder nada. */
  listoParaRetirarTextoPlano: boolean;
};

export async function verificarRespaldo(
  filas: FilaParaMigrar[],
): Promise<Diagnostico> {
  const porFila = filas.map((fila) => normalizar(fila.cuentas));
  const ids = porFila.flatMap((cuentas) =>
    cuentas.map((c) => c.secret_id).filter((id): id is string => Boolean(id)),
  );

  const valores = ids.length > 0 ? await leerSecretos(ids) : new Map<string, string>();

  const diagnostico: Diagnostico = {
    conClave: 0,
    respaldadas: 0,
    pendientes: 0,
    noResuelven: [],
    difieren: [],
    soloEnElGestor: 0,
    listoParaRetirarTextoPlano: false,
  };

  filas.forEach((fila, i) => {
    porFila[i].forEach((cuenta, j) => {
      const ubicacion = { panel: fila.nombre, cuenta: j + 1 };

      if (!cuenta.secret_id) {
        // Una cuenta sin clave y sin secreto no es un pendiente: es una
        // cuenta a la que nunca le pusieron contraseña.
        if (cuenta.clave) {
          diagnostico.conClave += 1;
          diagnostico.pendientes += 1;
        }
        return;
      }

      diagnostico.conClave += 1;
      diagnostico.respaldadas += 1;

      const delGestor = valores.get(cuenta.secret_id);
      if (delGestor === undefined) {
        diagnostico.noResuelven.push(ubicacion);
        return;
      }
      if (!cuenta.clave) {
        // Ya se le retiró el texto plano y el gestor la resuelve: esta
        // cuenta terminó la migración. No hay contra qué compararla, y no
        // hace falta.
        diagnostico.soloEnElGestor += 1;
        return;
      }
      if (delGestor !== cuenta.clave) diagnostico.difieren.push(ubicacion);
    });
  });

  diagnostico.listoParaRetirarTextoPlano =
    diagnostico.pendientes === 0 &&
    diagnostico.noResuelven.length === 0 &&
    diagnostico.difieren.length === 0;

  return diagnostico;
}
