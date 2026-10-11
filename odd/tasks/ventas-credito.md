# Feature: ventas-credito

## Objective
Let the Bs side (admin, product owner) record a credit/USDT sale to the COP side that is
deducted from the COP side's balance at liquidation, instead of being paid externally.

## Problem / Why
The Bs side sells credits to the COP side. Today that sale must be paid outside the app even
though the COP side usually has a balance in its favor. Netting it inside the liquidation
removes the external payment.

## Scope
- New `ventas` table: usdt (> 0), fecha, descripcion (optional), created_by, liquidacion_id.
- Only admin (Bs side) creates/edits/deletes pending ventas; colaborador can read them.
- No approval flow, no commission.
- Net at liquidation: `(usdt_bs - com_bs) - (usdt_cop - com_cop) + ventas` (positive favors Bs).
- `liquidar_pendientes` includes pending ventas, freezes `total_ventas` on liquidaciones,
  stamps `liquidacion_id`; liquidated ventas become immutable.
- UI: register venta (admin), list pending ventas on dashboard, show in liquidate dialog
  and liquidation detail.

## Constraints
- Schema changes are hand-run `supabase/phaseN_*.sql` files (next: phase50).
- SQL net and TS mirror (`src/lib/liquidaciones.ts`) must stay in sync.
- Next.js 16 has breaking changes: read `node_modules/next/dist/docs/` before writing code.

## Tasks
- [x] T1 SQL phase50: ventas table, RLS, immutability, liquidaciones.total_ventas, liquidar_pendientes with ventas. Route: delegated (writer trigger: multi-file feature).
- [x] T2 TS math: include ventas in `cobraCadaLado`/`previaDeCorte`, with node:test RED→GREEN. Route: delegated.
- [x] T3 UI: create/delete venta (admin), pending list on dashboard, liquidate dialog, liquidation detail. Route: delegated.

- [x] T4 Ventas share movement numbering and appear in the movements list (user request: the 69 USDT venta is movement #44). Route: delegated (writer trigger: SQL + list + form + actions).

- [x] T5 Contiguous numbering: deleting a pending item/venta shifts later numbers down by 1 (shared series); one-time compaction closes existing gap (#33). Movements card shows items count + "Canje de créditos: N". Branch feat/renumerar-movimientos. Route: delegated.

## Acceptance criteria
- A 69 USDT venta raises the pending net by 69 in favor of the Bs side.
- Liquidating includes pending ventas and freezes them.
- Colaborador cannot create ventas.
- `npm test`, `npm run lint`, `npm run build` pass.

## Delivery
Strategy: ask-on-risk. Forecast: ~400–500 authored lines.

## Progress / Evidence
- T1: `supabase/phase50_ventas_credito.sql` written (table, RLS, immutability trigger, `liquidaciones.total_ventas`, `liquidar_pendientes` with ventas, realtime). Check: structural readback only (hand-run SQL, no local Postgres). Must be run manually in the Supabase SQL Editor. Commit `dd576e0`.
- T2: optional `total_ventas` in `cobraCadaLado`/`previaDeCorte` (bs += ventas); `Liquidacion.total_ventas`. RED: `npm test` 3 failing in `tests/liquidacion-ventas.test.mjs` (actual 151 vs expected 220; -108 vs 42; 151 vs 220.5). GREEN: `npm test` 62 pass, 0 fail. Commit `d0c732f`.
- T3: `src/lib/ventas.ts`, `src/app/dashboard/ventas/{actions.ts,ventas-credito.tsx}` (admin-only "Generar venta" button in the list header opens a dialog; closes on success; colaborador read-only), dashboard pending net + Bs card line, liquidate dialog line (cut with only ventas allowed), detail page frozen `total_ventas` + list, separate realtime channel for `ventas`. `tests/responsive-liquidaciones.test.mjs` expected detail summary rows 4 -> 5 (parent-approved). Checks: `npm test` 62 pass / 0 fail; `npm run lint` pass; `npm run build` pass. List page needed no change: `cobraCadaLado(l)` reads the row's `total_ventas`.

- Applied phase50 to production via Supabase MCP (2026-10-11): RLS on, 4 policies, trigger, total_ventas, guard kept, ventas in net, grant ok, realtime ok. Security advisors: no new findings for ventas.

- T4: `supabase/phase51_ventas_numeradas.sql` (commit `42246cb`): `ventas.numero` backfilled (pending after max pending numero of items+ventas, so the 69 USDT venta becomes #44; liquidated per cut), not null + check > 0, unique partial indexes mirroring items, symmetric cross-table triggers (advisory lock `items.numero.pendiente`, same key as the bot, errcode unique_violation), `numero` frozen on liquidated ventas, `crear_item_desde_bot` numbers over items+ventas (grants reaffirmed). TS/UI: `leerVenta` parses `numero` and rejects impossible dates (round-trip y/m/d); `siguienteNumeroPendiente` used by the new-item page and the "Generar venta" dialog (new numero field); `eliminarVenta` returns a result object; pending ventas listed in the movements table (mobile + desktop) sorted by numero with a "Venta" badge, tasa/comisión shown as 0, admin delete, numero/fecha/flujo ("Ventas de créditos") filters match them; the separate "Ventas de créditos" section was removed (duplicate of the table) and "Generar venta" moved to the header; "Movimientos" card counts ventas; liquidation detail shows `#numero`. RED: `npm test` 4 failing in `tests/ventas-leer.test.mjs` (numero, Feb 31, siguienteNumeroPendiente missing). GREEN: `npm test` 70 pass / 0 fail; `npm run lint` pass; `npm run build` pass. Commit `02ac074`.

- Applied phase51 to production via Supabase MCP (2026-10-11, no-op drop triggers stripped): venta "30 Creditos Stella" = #44, 2 cross-table triggers, 2 unique indexes, bot numbers over items+ventas, bot grant service_role only. Security advisors: no new findings.

- T5: `supabase/phase52_numeracion_continua.sql` (commit `c405748`): `compactar_numeracion_pendiente()` (security definer, advisory lock `items.numero.pendiente`) walks pending items+ventas in ascending numero and assigns positions 1..N one row at a time, so the non-deferrable unique partial indexes and the phase51 cross-table triggers never see a duplicate (no negative offsets, `ventas.numero > 0` respected); AFTER DELETE row triggers `items_renumerar_tras_borrar` / `ventas_renumerar_tras_borrar` (`when old.liquidacion_id is null`, `create or replace trigger`, no drops) call it, which also handles multi-row deletes; one-time `select compactar_numeracion_pendiente()` closes the #33 gap (venta #44 -> #43). Trigger audit: items has only `items_liquidados_inmutables` (passes pending rows) and `items_numero_unico_con_ventas`; no trigger resets `revisado_at` (approval changes live only in RPCs), so renumbering keeps approvals. Check: structural readback only (hand-run SQL, no local Postgres); must be applied in the SQL Editor / MCP. Dashboard: `resumenTarjetaMovimientos` in `src/lib/ventas.ts`; the "Movimientos" card counts pending items only, keeps the approval line (items only; hidden when only ventas are pending) and adds "Canje de créditos: N" when N > 0. Delete actions unchanged (admin-only RLS delete + revalidatePath). RED: `npm test` 5 failing in `tests/tarjeta-movimientos.test.mjs` (`resumenTarjetaMovimientos is not a function`). GREEN: `npm test` 75 pass / 0 fail; `npm run lint` pass; `npm run build` pass. Commits `c405748` (db) + dashboard commit (this one).
- Open note: the web new-item form proposes max+1 at render; if a delete happens while a form is open, saving the stale number leaves a gap until the next delete compacts. Not addressed in T5.

- Applied phase52 to production via Supabase MCP (2026-10-11): pending items 1..42 (all still approved), venta #43, 0 gaps, 2 delete triggers. Advisors: no new findings.

## Next step
Apply phase52 to production, then verify pending numbering is 1..43.