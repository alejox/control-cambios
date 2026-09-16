/**
 * Lectura de comprobantes bancarios (Venezuela / Colombia).
 *
 * Todo lo de este archivo es puro: no toca red, ni base, ni React. Vive
 * aparte justamente porque es la parte del sistema donde un error no se
 * ve — un monto mal parseado no rompe nada, solo descuadra la plata.
 *
 * El único import es de tipos, que TypeScript borra al compilar: este
 * archivo sigue sin arrastrar nada en tiempo de ejecución.
 */

import type { Moneda } from "@/lib/items";

export type DatosComprobante = {
  referencia: string | null;
  /** yyyy-mm-dd, listo para un input type="date". */
  fecha: string | null;
  /** Monto ya normalizado a número. */
  monto: number | null;
  /** Lo que decía el comprobante, tal cual. Sirve para auditar el parseo. */
  monto_texto: string | null;
  /**
   * Moneda del comprobante, cuando se pudo determinar.
   *
   * Opcional porque en la web no hace falta: el formulario ya sabe en qué
   * flujo está parado. La necesita el bot de Telegram, donde un mensaje
   * llega sin contexto y la moneda decide el tipo de flujo y la tasa.
   */
  moneda?: Moneda | null;
  beneficiario: string | null;
  banco: string | null;
  /** Avisos para mostrarle al usuario; nunca frenan la carga. */
  avisos: string[];
};

/**
 * Convierte el monto de un comprobante a número.
 *
 * En Venezuela y Colombia el punto separa miles y la coma decimales:
 * "3.200,00" son tres mil doscientos. Y acá está la trampa que hay que
 * tener presente siempre:
 *
 *   Number("3.200,00")     -> NaN
 *   parseFloat("3.200,00") -> 3.2   <-- no falla, MIENTE
 *
 * Un depósito de Bs 3.200 guardado como 3,20 no rompe ninguna pantalla:
 * simplemente descuadra la contabilidad en silencio. Por eso esto se
 * parsea a mano y no con parseFloat.
 */
export function parseMontoLatino(raw: string | null | undefined): number | null {
  if (typeof raw !== "string") return null;

  const negativo = /-/.test(raw);
  // Fuera el "Bs.", el "$", los espacios y cualquier otro adorno.
  const limpio = raw.replace(/[^\d.,]/g, "");
  if (limpio === "") return null;

  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");
  const corte = Math.max(ultimaComa, ultimoPunto);

  let entero: string;
  let decimales: string;

  if (corte === -1) {
    entero = limpio;
    decimales = "";
  } else {
    const cola = limpio.slice(corte + 1);
    const hayOtroSeparador = limpio.slice(0, corte).search(/[.,]/) > -1;

    // Un grupo de exactamente 3 digitos despues del ultimo separador, sin
    // ningun otro separador antes, es separador de miles: "3.200" son
    // 3200, no 3,2. Con 1, 2 o 4+ digitos, o si ya hubo otro separador
    // antes ("1.234,56"), el ultimo separador es el decimal.
    const esSeparadorDeMiles = cola.length === 3 && !hayOtroSeparador;

    if (esSeparadorDeMiles) {
      entero = limpio.replace(/[.,]/g, "");
      decimales = "";
    } else {
      entero = limpio.slice(0, corte).replace(/[.,]/g, "");
      decimales = cola;
    }
  }

  if (entero === "" && decimales === "") return null;
  if (!/^\d*$/.test(entero) || !/^\d*$/.test(decimales)) return null;

  const valor = Number(`${entero || "0"}.${decimales || "0"}`);
  if (!Number.isFinite(valor)) return null;

  return negativo ? -valor : valor;
}

/**
 * Pasa la fecha de un comprobante a yyyy-mm-dd.
 *
 * Los comprobantes vienen en dd/mm/yyyy ("12/09/2026", "9/9/2026
 * 19:43:32", "11/09/2026 09:26PM"). Se asume dd/mm y no mm/dd porque es
 * el formato de la region; un "10/09/2026" leido al reves cae en otro mes
 * sin que nada avise.
 */
const MESES: Record<string, number> = {
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6,
  jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

/**
 * Fechas escritas en palabras, como las de Nequi y Bre-B:
 *   "24 de agosto de 2026 a las 12:48 p. m."
 *   "03 ago 2026 - 6:51 a.m."
 * Alcanza con las tres primeras letras del mes: cubre el nombre completo y
 * la abreviatura sin tener que listar las dos formas.
 */
function parseFechaEnPalabras(raw: string): string | null {
  const m = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/(\d{1,2})\s*(?:de\s+)?([a-z]{3,})\.?\s*(?:de\s+)?(\d{4})/);
  if (!m) return null;

  const mes = MESES[m[2].slice(0, 3)];
  if (!mes) return null;

  return fechaValida(Number(m[3]), mes, Number(m[1]));
}

export function parseFechaLatina(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;

  // Si ya viene en ISO, se respeta.
  const iso = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return fechaValida(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const m = raw.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (!m) return parseFechaEnPalabras(raw);

  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let anio = Number(m[3]);
  if (anio < 100) anio += 2000;

  return fechaValida(anio, mes, dia);
}

function fechaValida(anio: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  // Date normaliza de más: un 31/02 se convierte en 03/03 sin protestar.
  // Se compara contra lo pedido para no aceptar una fecha inventada.
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    d.getUTCFullYear() !== anio ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null;
  }

  const mm = String(mes).padStart(2, "0");
  const dd = String(dia).padStart(2, "0");
  return `${anio}-${mm}-${dd}`;
}

/**
 * Lee un comprobante que llega como TEXTO (los que mandan por WhatsApp).
 *
 * No usa la API: es texto con etiquetas, asi que alcanza con leerlo. Sale
 * gratis y responde al instante.
 *
 * Formato tipico del BNC:
 *   App BNC - Comprobante de la Operación:
 *   Monto: Bs. *3.200,00*
 *   Referencia: *885504185*
 *   Fecha de Operación: *9/9/2026 19:43:32*
 *
 * Cada banco pone etiquetas distintas, por eso se busca por patron y no
 * por texto exacto. Y el valor puede venir en la misma linea que la
 * etiqueta o en la siguiente.
 */

const ETIQUETAS: { campo: keyof Etiquetados; patron: RegExp }[] = [
  { campo: "monto", patron: /^monto(\s+de\s+la\s+operaci[oó]n)?$/i },
  { campo: "monto", patron: /^(importe|total)$/i },
  // Nequi y Bancolombia no dicen "Monto".
  { campo: "monto", patron: /^.?cuanto.?$/i },
  { campo: "monto", patron: /^valor(\s+de\s+la\s+transferencia)?$/i },
  { campo: "referencia", patron: /^(nro\.?|n[uú]mero|num\.?)?\s*(de\s+)?referencia$/i },
  { campo: "referencia", patron: /^n[uú]mero\s+de\s+operaci[oó]n$/i },
  { campo: "referencia", patron: /^comprobante(\s+n[o°ºu]?\.?)?$/i },
  { campo: "fecha", patron: /^fecha(\s+y\s+hora)?(\s+(de|del)\s+(la\s+)?(operaci[oó]n|env[ií]o|pago))?$/i },
  { campo: "beneficiario", patron: /^beneficiario$/i },
  { campo: "beneficiario", patron: /^n[uú]mero\s+celular\s+de\s+destino$/i },
  { campo: "beneficiario", patron: /^(cuenta\s+)?destino$/i },
  { campo: "beneficiario", patron: /^(para|enviado\s+a)$/i },
  { campo: "beneficiario", patron: /^n[uú]mero\s+nequi$/i },
];

const BANCOS = [
  "BNC", "Banesco", "Mercantil", "Provincial", "Bicentenario",
  "Banco de Venezuela", "BOD", "Bancamiga", "Banplus",
  "Nequi", "Bancolombia", "Daviplata", "Bre-B", "Davivienda", "BBVA",
];

type Etiquetados = {
  monto?: string;
  referencia?: string;
  fecha?: string;
  beneficiario?: string;
};

function armar(encontrado: Etiquetados, textoCompleto: string): DatosComprobante {
  const avisos: string[] = [];
  const banco = BANCOS.find((b) => new RegExp(`\\b${b}\\b`, "i").test(textoCompleto)) ?? null;

  const monto = parseMontoLatino(encontrado.monto);
  if (encontrado.monto && monto === null) {
    avisos.push(`No entendimos el monto "${encontrado.monto}".`);
  } else if (!encontrado.monto) {
    avisos.push("No encontramos el monto en ese texto.");
  }

  const fecha = parseFechaLatina(encontrado.fecha);
  if (encontrado.fecha && !fecha) {
    avisos.push(`No entendimos la fecha "${encontrado.fecha}".`);
  }

  return {
    // La referencia puede traer texto pegado al lado, asi que nos quedamos
    // con la primera "palabra" util. NO se filtra por digitos: Bre-B usa
    // referencias como "TRuf1aeTHtEC" y Nequi "M09255933", y un
    // match(/\d{4,}/) las decapitaba o las perdia enteras. Tampoco se
    // normaliza la caja: en esos codigos las mayusculas importan.
    referencia:
      encontrado.referencia?.match(/[A-Za-z0-9][A-Za-z0-9-]{3,}/)?.[0] ?? null,
    fecha,
    monto,
    monto_texto: encontrado.monto ?? null,
    beneficiario: encontrado.beneficiario ?? null,
    banco,
    avisos,
  };
}

/**
 * Lee UNO o VARIOS comprobantes pegados de corrido.
 *
 * No se corta por lineas en blanco: hay comprobantes que traen renglones
 * vacios adentro y otros que vienen pegados sin separacion. El corte se
 * hace por repeticion de etiqueta — cuando aparece un dato que el bloque
 * actual ya tenia (una segunda "Referencia", por ejemplo), empieza uno
 * nuevo. Eso funciona con los dos casos sin depender del formato.
 */
export type ComprobanteTexto = {
  datos: DatosComprobante;
  /** El trozo de texto del que salio. Es el respaldo del deposito. */
  texto: string;
};

export function parseComprobantesTexto(texto: string): ComprobanteTexto[] {
  if (typeof texto !== "string" || texto.trim() === "") return [];

  // Los asteriscos son el negrita de WhatsApp, no parte del dato.
  const lineas = texto
    .replace(/\*/g, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== "");

  const bloques: { campos: Etiquetados; lineas: string[] }[] = [];
  let actual: Etiquetados = {};
  let lineasActual: string[] = [];
  // Lineas vistas desde el ultimo dato reconocido. Todavia no se sabe a que
  // bloque pertenecen: un encabezado como "App BNC - Comprobante:" que
  // aparece despues del ultimo dato es del comprobante que EMPIEZA, no del
  // que termina. Se resuelven recien cuando aparece el proximo dato.
  let pendientes: string[] = [];
  let tieneAlgo = false;

  for (let i = 0; i < lineas.length; i++) {
    const corte = lineas[i].indexOf(":");
    if (corte === -1) {
      pendientes.push(lineas[i]);
      continue;
    }

    // La etiqueta puede traer aclaraciones entre parentesis -- "Monto (Bs.)"
    // -- que no son parte del nombre del campo.
    const etiqueta = lineas[i]
      .slice(0, corte)
      .replace(/\([^)]*\)/g, "")
      // Sin acentos: "¿Cuánto?" tiene que matchear el mismo patron que
      // "cuanto", y cada banco los escribe distinto.
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[.\s]+$/, "")
      .trim();

    // Si despues de los dos puntos no hay nada, el valor esta en la linea
    // siguiente: asi vienen varios comprobantes copiados de la app.
    const valor = (lineas[i].slice(corte + 1).trim() || lineas[i + 1] || "").trim();

    let reconocida = false;
    if (valor !== "") {
      for (const { campo, patron } of ETIQUETAS) {
        if (!patron.test(etiqueta)) continue;

        // Solo referencia, monto y fecha cortan un comprobante nuevo. El
        // beneficiario NO: Nequi lo nombra dos veces en el mismo recibo
        // ("Para" y "Numero Nequi"), y tomarlo como corte partia un solo
        // comprobante en dos mitades inservibles.
        const esCorte = campo !== "beneficiario";

        if (actual[campo] !== undefined) {
          if (!esCorte) break; // se queda el primero y sigue de largo
          // Ya teniamos este dato: empieza otro comprobante. El bloque que
          // se cierra NO se lleva las pendientes: esas ya son del nuevo.
          bloques.push({ campos: actual, lineas: lineasActual });
          actual = {};
          lineasActual = [];
        }
        actual[campo] = valor;
        tieneAlgo = true;
        reconocida = true;
        break;
      }
    }

    if (reconocida) {
      lineasActual.push(...pendientes, lineas[i]);
      pendientes = [];
    } else {
      pendientes.push(lineas[i]);
    }
  }

  // Lo que quede colgando al final es del ultimo bloque.
  if (tieneAlgo) bloques.push({ campos: actual, lineas: [...lineasActual, ...pendientes] });
  if (bloques.length === 0) {
    return [{ datos: armar({}, texto), texto: texto.trim() }];
  }

  return bloques.map((b) => ({
    datos: armar(b.campos, b.lineas.join("\n")),
    texto: b.lineas.join("\n"),
  }));
}

/** Atajo para cuando se espera un solo comprobante. */
export function parseComprobanteTexto(texto: string): DatosComprobante {
  const todos = parseComprobantesTexto(texto);
  return todos[0]?.datos ?? armar({}, texto);
}
