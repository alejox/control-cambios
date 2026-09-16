import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  construirListas,
  type MediosPorMoneda,
  type MonedaLista,
} from "@/lib/venta-publico";
import Link from "next/link";
import VentaPublico from "./venta-publico";

/**
 * Venta público: las listas de precios que el usuario manda por WhatsApp.
 *
 * No es configuración de administrador: es una herramienta de trabajo
 * que usan y editan los dos roles. Acá no hay nada de contabilidad —-
 * esta pantalla no toca items, depósitos ni liquidaciones.
 */
export default async function VentaPublicoPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const role = perfil?.role ?? "sin_acceso";
  if (role !== "admin" && role !== "colaborador") redirect("/dashboard");

  // Una sola consulta con todo anidado: los precios, los grupos y los
  // textos de cada moneda son pocos datos y partirlos en varios viajes
  // solo agregaría latencia.
  //
  // venta_publico_lista_usuario no se filtra por el usuario acá: sus
  // políticas RLS ya dejan pasar únicamente las filas propias. Repetir el
  // filtro en la consulta daría la falsa impresión de que es él quien
  // protege el dato, y el día que alguien lo saque de acá nadie se
  // enteraría de que la protección real está en la base.
  const { data, error } = await supabase
    .from("venta_publico_proveedores")
    .select(
      `id, slug, nombre, orden,
       venta_publico_listas(
         id, moneda, encabezado, pie, plantilla_linea, revisar, redondeo,
         venta_publico_lista_usuario(
           tasa, tasa_origen, tasa_fuente, tasa_detalle,
           tasa_referencia, tasa_referencia_at
         )
       ),
       venta_publico_grupos(
         id, titulo, orden,
         venta_publico_grupos_texto(moneda, titulo),
         venta_publico_planes(
           id, etiqueta, precio_usd, orden,
           venta_publico_planes_texto(moneda, etiqueta, sufijo)
         )
       )`,
    )
    .order("orden", { ascending: true });

  // Los medios de cobro se piden aparte y no anidados: no cuelgan de la
  // lista sino de la moneda, y son tres filas. Anidarlos los traería
  // repetidos una vez por marca para decir siempre lo mismo.
  const { data: filasMedios } = await supabase
    .from("venta_publico_medios_pago")
    .select("moneda, texto");

  const medios: MediosPorMoneda = {};
  for (const fila of filasMedios ?? []) {
    medios[fila.moneda as MonedaLista] = fila.texto;
  }

  const listas = construirListas(data ?? [], medios);

  // Un error de la consulta NO se traga. Cuando la fase 29 renombró
  // tasa_binance, esta misma pantalla siguió pidiendo la columna vieja:
  // PostgREST devolvía data null y acá se leía como "no hay listas
  // cargadas". Una pantalla vacía y una pantalla rota tienen que verse
  // distinto, o se pierde una tarde buscando datos que nunca se fueron.

  return (
    <div className="mx-auto w-[90%] px-6 py-10">
      <div className="mb-8">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Listas de precios para clientes
        </p>
        <h1
          className="text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Venta público
        </h1>
        <p className="mt-2.5 max-w-2xl text-[13.5px] leading-relaxed text-ink-soft">
          El precio de cada plan vive una sola vez, en dólares. Cada moneda es
          una forma de presentarlo: las de bolívares y pesos lo convierten con
          la tasa de venta de esa lista y arman el mensaje listo para mandar.
        </p>
      </div>

      <Link
        href="/dashboard/venta-publico/medios-pago"
        className="mb-5 inline-flex items-center gap-2 rounded-[10px] border border-border bg-surface px-3.5 py-2 text-[13px] text-ink-soft shadow-sm transition hover:text-ink"
      >
        🏦 Mis medios de cobro
        <span className="text-ink-soft/70">· uno por moneda, para las cuatro marcas</span>
      </Link>

      {error ? (
        <div className="rounded-2xl border border-critical-soft bg-critical-soft/40 p-10 text-center text-[14.5px] text-critical shadow-sm">
          No pudimos leer las listas: {error.message}
          <span className="mt-2 block text-[13px] text-ink-soft">
            Los datos están; lo que falló es la consulta.
          </span>
        </div>
      ) : listas.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-[14.5px] text-ink-soft shadow-sm">
          Todavía no hay listas cargadas.
        </div>
      ) : (
        <VentaPublico listas={listas} />
      )}
    </div>
  );
}
