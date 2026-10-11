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
- [ ] T2 TS math: include ventas in `cobraCadaLado`/`previaDeCorte`, with node:test RED→GREEN. Route: delegated.
- [ ] T3 UI: create/delete venta (admin), pending list on dashboard, liquidate dialog, liquidation detail. Route: delegated.

## Acceptance criteria
- A 69 USDT venta raises the pending net by 69 in favor of the Bs side.
- Liquidating includes pending ventas and freezes them.
- Colaborador cannot create ventas.
- `npm test`, `npm run lint`, `npm run build` pass.

## Delivery
Strategy: ask-on-risk. Forecast: ~400–500 authored lines.

## Progress / Evidence
- T1: `supabase/phase50_ventas_credito.sql` written (table, RLS, immutability trigger, `liquidaciones.total_ventas`, `liquidar_pendientes` with ventas, realtime). Check: structural readback only (hand-run SQL, no local Postgres). Must be run manually in the Supabase SQL Editor.

## Next step
T2.
