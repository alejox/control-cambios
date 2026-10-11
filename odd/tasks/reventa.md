# Feature: reventa

## Objective
A "Reventa" dashboard section with the wholesale credit price lists of StellaTV, OleadaTV,
Flujo TV and TeleLatino, plus a calculator that turns a plan's USDT cost into a resale price
in COP (TRM) and VES (Binance P2P) with an adjustable markup (e.g. 20%).

## Problem / Why
The price lists live as chat messages. Quoting a reseller means doing the USDT → COP/VES and
markup math by hand.

## Scope
- Static catalog in `src/lib/reventa.ts` (providers → variants → tiers, loose per-credit price,
  panel notes). No DB: lists are reference data; an editor can come later if needed.
- Pure pricing helpers (tier cost, per-credit, loose recharge, markup, conversion) with tests.
- `/dashboard/reventa` page (admin + colaborador, like Venta público) with a significantly
  polished design, and a sidebar entry.
- Calculator: pick provider/variant/plan or custom credits, markup % (presets + free input),
  rates prefilled from `/api/tasa-referencia` (COP → TRM, VES → P2P) and overridable.

## Constraints
- Reuse `src/lib/tasa-referencia.ts` sources via the existing API route; no new rate source.
- Next.js 16 breaking changes: read `node_modules/next/dist/docs/` before writing code.
- TeleLatino "Un dispositivo" 300 (1.15 c/u) and 500 ($450 vs 0.8 c/u) look inconsistent;
  loaded as given and flagged in code until the user confirms.

## Tasks
- [ ] T1 Catalog + pricing helpers + tests (RED→GREEN). Route: delegated.
- [ ] T2 Reventa page (lists design) + calculator + sidebar. Route: delegated.

## Acceptance criteria
- All four lists render exactly as provided, grouped by variant, with panel badges.
- Calculator: 30 Stella credits at 20% markup = 82.80 USDT, converted with the current rates.
- `npm test`, `npm run lint`, `npm run build` pass.

## Progress / Evidence
(pending)

## Next step
T1.
