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
- [x] T1 Catalog + pricing helpers + tests (RED→GREEN). Route: delegated.
  Commit: 8c3c98d (`feat(reventa): add the resale price catalog and pricing helpers`).
  RED: `tests/reventa.test.mjs` failed (module `src/lib/reventa.ts` missing).
  GREEN: 12/12 reventa tests; `npm test` 87/87; eslint clean on the new files.
  Rules: per-credit is derived (total/credits); custom quantity = exact tier, or loose
  price for 1–29 when the variant has one, otherwise no price (null, no prorating);
  sale rounding to nearest COP 1.000 / VES 10 / USDT 0,01.
- [x] T2 Reventa page (lists design) + calculator + sidebar. Route: delegated.
  Commit: 28313ff (`feat(reventa): add the resale section with price lists and calculator`).
  Checks: `npm test` 87/87; `npm run lint` exit 0; `npm run build` exit 0 (`/dashboard/reventa`).
  Test-first exception: UI only, no runnable component tests in the repo; pricing logic is
  covered by T1. Not checked in a browser (needs a logged-in session).
  Design: provider segmented switcher (with "desde X c/u"), one card per variant (side by side
  at 2xl), tier rows laid out by container query, per-credit bar, panel badge where the panel
  starts, "Mejor precio", loose-recharge chip; sticky calculator on lg+ with rates from
  `/api/tasa-referencia` (overridable, reset/retry), copyable quote, margin kept in
  localStorage.
- [x] T3 WhatsApp price list per currency (primary deliverable, mirrors Venta público). Route: delegated.
  Commit: 25433e1 (`feat(reventa): generate WhatsApp price lists per currency`).
  RED: 11 failing in `tests/reventa.test.mjs` (`listadoWhatsApp` missing + round-up expectations).
  GREEN: 20/20 reventa tests; `npm test` 95/95; `npm run lint` exit 0; `npm run build` exit 0.
  `listadoWhatsApp({ proveedor, moneda: "VES"|"USD"|"COP", margenPct, tasa, mediosPago })` in
  `src/lib/reventa.ts`, reusing `@/lib/venta-publico` (MonedaLista, ORDEN_MONEDAS,
  ETIQUETA_SECCION, NOMBRE_MONEDA, formatMontoLista, formatMargen) and appending the same
  per-currency "medios de cobro" (read-only `venta_publico_medios_pago`, same query as Venta
  público). UI: currency segmented [En Bs | En USD | En COP] + provider tabs on top, "Listado
  para WhatsApp" panel first (own margin per currency persisted in localStorage, own rate per
  currency for Bs/COP with "margen sobre referencia" and reset, WhatsApp-bubble preview with
  *bold*/_italic_, "Copiar mensaje", "Abrir en WhatsApp"); USDT list + calculator below.
  Decision: sale rounding switched to ALWAYS UP (Venta público rule) for list and calculator:
  totals COP 1.000 / Bs 10 / USD 0,01; per-credit COP 10 / Bs 1 / USD 0,01, derived from the
  rounded total. Catalog stays static (no DB/editor).
- [x] T4 Eye-catching WhatsApp lists and page; Oleada note without "soporte activo". Route: delegated.
  Commit: this commit (`feat(reventa): make WhatsApp lists and the page more eye-catching`).
  RED: 9 failing in `tests/reventa.test.mjs` after updating expectations to the new format.
  GREEN: 21/21 reventa tests; `npm test` 96/96; `npm run lint`, `npx tsc --noEmit`,
  `npm run build` exit 0.
  Message: 📺 bold provider + _Créditos para revendedores_ + flag currency line (🇺🇸/🇨🇴/🇻🇪),
  ━ separators, 📺📱/📱 variant headings, ⚡ loose recharge, 💎 tiers with bold credits and price,
  🆕/⭐/👑 panel tags, 🔥 Mejor precio (per variant, decided in USDT), 📌 Condiciones with ✅,
  💬 closing call to action, then payment methods.
  UI: inline SVG icons (`reventa/iconos.tsx`, sidebar style) and small SVG flags on the
  currency switch; provider tabs with initial badges; dark panel header with WhatsApp badge,
  currency chip and stat pills; icon labels on margin/rate/payment methods; chat-style preview
  (header bar, dotted background, bubble tail, "ahora" + double check); WhatsApp-green button.

## User-requested changes (recorded for traceability)
- 46db944: user asked to remove the whole "De consulta" section; the page keeps only the WhatsApp list (USDT lists, provider conditions panel and calculator removed).
- e71f8dc: user asked for currency order USD, COP, Bs (local ORDEN_REVENTA; Venta público unchanged).
- d9d189c: user corrected Flujo TV panels: Super panel at 100 credits (source message said 50), Admin panel at 500.
- 725ad07: user asked the Movimientos card to count items + credit swaps (43).

## Acceptance criteria
- All four lists render exactly as provided, grouped by variant, with panel badges.
- Calculator: 30 Stella credits at 20% markup = 82.80 USDT, converted with the current rates.
- `npm test`, `npm run lint`, `npm run build` pass.

## Progress / Evidence
T1–T4 done (see tasks). TeleLatino "Un dispositivo" 300/500 still flagged TODO(precio).

## Next step
User confirms TeleLatino 300/500 prices and reviews the page in the browser.
