import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { leerComisionGlobal } from "@/lib/configuracion";
import { formatMonto, type Item } from "@/lib/items";
import RevisionItem, { type DepositoRevision } from "./revision-item";

export default async function RevisionPage() {
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

  // Pendientes: sin revisar y sin liquidar. Un movimiento ya liquidado
  // entro en los totales congelados de un corte y no se puede tocar.
  // Cada parte revisa lo de la otra: lo que va de Bs a USDT lo aprueba
  // quien trabaja en COP, y al reves. Se expresa como "lo que no cargue
  // yo", que da lo mismo y no depende del selector de moneda.
  const { data } = await supabase
    .from("items")
    .select("*")
    .is("revisado_at", null)
    .is("liquidacion_id", null)
    .neq("created_by", user.id)
    .order("numero", { ascending: true });

  const items = (data ?? []) as Item[];
  const comisionPct = await leerComisionGlobal();

  const porItem = new Map<string, DepositoRevision[]>();
  let errorDepositos: string | null = null;
  if (items.length > 0) {
    const { data: depositos, error } = await supabase
      .from("depositos")
      .select("id, item_id, referencia, fecha, valor_origen, comprobante_path, comprobante_texto, usdt, aprobado_at")
      .in("item_id", items.map((i) => i.id))
      .order("fecha", { ascending: true });

    // Si esta consulta falla, la tarjeta mostraba "Entraron Bs0,00" y ningun
    // comprobante, como si el movimiento no tuviera depositos. Un error
    // tragado que se disfraza de dato vacio es peor que un error a la vista.
    errorDepositos = error?.message ?? null;

    for (const d of depositos ?? []) {
      const lista = porItem.get(d.item_id) ?? [];
      lista.push({
        id: d.id,
        referencia: d.referencia,
        fecha: d.fecha,
        valor_origen: Number(d.valor_origen),
        comprobante_path: d.comprobante_path,
        comprobante_texto: d.comprobante_texto,
        usdt: d.usdt === null ? null : Number(d.usdt),
        aprobado_at: d.aprobado_at,
      });
      porItem.set(d.item_id, lista);
    }
  }

  const totalUsdt = items.reduce((acc, i) => acc + Number(i.usdt_total), 0);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="mb-8">
        <p className="mb-2.5 font-mono text-[11.5px] uppercase tracking-widest text-accent">
          Por revisar
        </p>
        <h1
          className="text-[26px] font-medium text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {items.length === 0
            ? "Nada pendiente"
            : `${items.length} movimiento${items.length === 1 ? "" : "s"} esperando`}
        </h1>
        {items.length > 0 && (
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            Suman {formatMonto(totalUsdt, "USDT")}. Si la conversión real no
            dio ese número, ajustalo antes de confirmar.
          </p>
        )}
      </div>

      {errorDepositos && (
        <div className="mb-6 rounded-2xl border border-critical-soft bg-critical-soft/40 px-5 py-4">
          <p className="mb-1 text-[14px] font-medium text-ink">
            No pudimos leer los comprobantes
          </p>
          <p className="font-mono text-[12.5px] leading-relaxed text-critical">
            {errorDepositos}
          </p>
        </div>
      )}

      {items.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-[14.5px] text-ink-soft shadow-sm">
          No hay nada esperando tu revisión. Acá aparecen los movimientos que
          carga la otra parte —los tuyos los aprueba ella— y la campanita te
          avisa cuando llega uno.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {items.map((item) => (
            <RevisionItem
              key={item.id}
              item={item}
              depositos={porItem.get(item.id) ?? []}
              comisionPct={comisionPct}
            />
          ))}
        </div>
      )}
    </div>
  );
}
