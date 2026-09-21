/**
 * Un Bitwarden Secrets Manager de mentira, con la misma superficie que usa
 * la app y con dos cosas que el de verdad no da: se le puede mirar adentro
 * y se le puede pedir que falle.
 *
 * Guarda los secretos en memoria. Cada test lo reinicia.
 */

export const almacen = {
  secretos: new Map(),
  /** Nombre de método -> error a lanzar. Se limpia en reiniciar(). */
  fallar: new Map(),
  /** Cada llamada que recibió, para poder afirmar sobre lotes vs. de a uno. */
  llamadas: [],
  siguienteId: 0,
};

export function reiniciar() {
  almacen.secretos = new Map();
  almacen.fallar = new Map();
  almacen.llamadas = [];
  almacen.siguienteId = 0;
}

/** Siembra un secreto sin pasar por la app, como si ya existiera. */
export function sembrar({ id, key = "sembrado", value, projectId = "proj-1" }) {
  const secreto = {
    id: id ?? nuevoId(),
    key,
    value,
    note: "",
    organizationId: "org-1",
    projectId,
    creationDate: new Date(),
    revisionDate: new Date(),
  };
  almacen.secretos.set(secreto.id, secreto);
  return secreto.id;
}

function nuevoId() {
  almacen.siguienteId += 1;
  return `secreto-${almacen.siguienteId}`;
}

function registrar(metodo, argumentos) {
  almacen.llamadas.push({ metodo, argumentos });
  const error = almacen.fallar.get(metodo);
  if (error) throw error instanceof Error ? error : new Error(String(error));
}

class SecretsClient {
  async get(id) {
    registrar("get", [id]);
    const secreto = almacen.secretos.get(id);
    if (!secreto) throw new Error(`404: no existe el secreto ${id}`);
    return secreto;
  }

  async getByIds(ids) {
    registrar("getByIds", [ids]);
    // El de verdad es todo o nada: si uno de los ids no existe, falla la
    // respuesta entera. Reproducirlo es el punto de este falso.
    const encontrados = ids.map((id) => almacen.secretos.get(id));
    if (encontrados.some((s) => !s)) {
      throw new Error("404: alguno de los ids no existe");
    }
    return { data: encontrados };
  }

  async create(organizationId, key, value, note, projectIds) {
    registrar("create", [organizationId, key, value, note, projectIds]);
    const secreto = {
      id: nuevoId(),
      key,
      value,
      note,
      organizationId,
      projectId: projectIds[0] ?? null,
      creationDate: new Date(),
      revisionDate: new Date(),
    };
    almacen.secretos.set(secreto.id, secreto);
    return secreto;
  }

  async update(organizationId, id, key, value, note, projectIds) {
    registrar("update", [organizationId, id, key, value, note, projectIds]);
    const previo = almacen.secretos.get(id);
    if (!previo) throw new Error(`404: no existe el secreto ${id}`);
    const secreto = {
      ...previo,
      key,
      value,
      note,
      projectId: projectIds[0] ?? null,
      revisionDate: new Date(),
    };
    almacen.secretos.set(id, secreto);
    return secreto;
  }

  async list(organizationId) {
    registrar("list", [organizationId]);
    return {
      data: [...almacen.secretos.values()].map((s) => ({
        id: s.id,
        key: s.key,
        organizationId: s.organizationId,
      })),
    };
  }

  async delete(ids) {
    registrar("delete", [ids]);
    for (const id of ids) almacen.secretos.delete(id);
    return { data: ids.map((id) => ({ id, error: null })) };
  }
}

export class BitwardenClient {
  constructor(settings, logLevel) {
    almacen.llamadas.push({ metodo: "constructor", argumentos: [settings, logLevel] });
  }
  auth() {
    return {
      loginAccessToken: async (token) => {
        registrar("loginAccessToken", [token]);
      },
    };
  }
  secrets() {
    return new SecretsClient();
  }
  projects() {
    return {};
  }
}
