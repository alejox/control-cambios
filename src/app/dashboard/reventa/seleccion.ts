import { buscarProveedor, PROVEEDORES, type Variante } from "@/lib/reventa";

/**
 * Qué está mirando la calculadora. La comparten la lista (tocar un tramo
 * lo elige) y la calculadora (los selectores), por eso vive arriba de las
 * dos y no adentro de ninguna.
 */
export type Cantidad =
  | { tipo: "tramo"; creditos: number }
  /** Recarga suelta: lo que se escribe, tal cual, hasta que sea número. */
  | { tipo: "suelto"; texto: string };

export type Seleccion = {
  proveedorId: string;
  varianteId: string;
  cantidad: Cantidad;
};

export const SUELTO_INICIAL = "10";

export function seleccionInicial(): Seleccion {
  const proveedor = PROVEEDORES[0];
  const variante = proveedor.variantes[0];
  const treinta = variante.tramos.find((t) => t.creditos === 30) ?? variante.tramos[0];
  return {
    proveedorId: proveedor.id,
    varianteId: variante.id,
    cantidad: { tipo: "tramo", creditos: treinta.creditos },
  };
}

/**
 * La misma cantidad en otra variante, si existe. Cambiar de proveedor
 * para comparar "30 créditos acá contra 30 allá" no debería hacerte
 * elegir los 30 de nuevo.
 */
function cantidadEn(variante: Variante, cantidad: Cantidad): Cantidad {
  if (cantidad.tipo === "suelto") {
    return variante.suelto
      ? cantidad
      : { tipo: "tramo", creditos: variante.tramos[0].creditos };
  }
  const mismo = variante.tramos.some((t) => t.creditos === cantidad.creditos);
  return mismo ? cantidad : { tipo: "tramo", creditos: variante.tramos[0].creditos };
}

export function conProveedor(sel: Seleccion, proveedorId: string): Seleccion {
  const proveedor = buscarProveedor(proveedorId);
  if (!proveedor) return sel;
  // La variante del mismo nombre si el proveedor nuevo la tiene: de
  // Multidispositivo a Multidispositivo.
  const variante =
    proveedor.variantes.find((v) => v.id === sel.varianteId) ?? proveedor.variantes[0];
  return { proveedorId, varianteId: variante.id, cantidad: cantidadEn(variante, sel.cantidad) };
}

export function conVariante(sel: Seleccion, varianteId: string): Seleccion {
  const variante = buscarProveedor(sel.proveedorId)?.variantes.find((v) => v.id === varianteId);
  if (!variante) return sel;
  return { ...sel, varianteId, cantidad: cantidadEn(variante, sel.cantidad) };
}

/** Los créditos elegidos, o null si lo escrito no es una cantidad. */
export function creditosDe(cantidad: Cantidad): number | null {
  if (cantidad.tipo === "tramo") return cantidad.creditos;
  const texto = cantidad.texto.trim();
  if (!/^\d+$/.test(texto)) return null;
  return Number(texto);
}
