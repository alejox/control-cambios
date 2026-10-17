# Reliable receipt amount extraction

## Objective
Make the existing Gemini receipt extractor return explicit amount fields without inventing unreadable amounts.

## Problem and evidence
The supplied receipt visibly contains Bs. 6.400,00. Two exact baseline API calls omitted both amount fields. Adding required amount fields alone recovered 6400 with the same model/image/prompt. The current parser correctly normalizes this amount.

## Scope and constraints
- Authorized: schema/prompt/type correction and deterministic regression tests; isolated Gemini verification of the supplied receipt.
- No Telegram messages, database writes, manual deployment or PR creation. User subsequently authorized publishing this correction to main.
- Preserve unrelated registry/.codex changes; never commit credentials or receipt images.
- Keep gemini-3.8-flash and current parser. Repeated-thousands parsing is a separate follow-up.
- Required fields must allow null; missing/unreadable amounts must remain rejected by the existing consumer.

## Work unit
- [x] T1 — Require nullable amount fields, clarify abstention, and cover readable, absent and unreadable responses with deterministic tests.
  - Route: delegated direct; source and regression tests are non-trivial files and reading prepares implementation.
  - Acceptance: amount fields required in request schema and nullable; Bs. 6.400,00 -> 6400; null/omitted fields never invent amount; numeric fallback remains compatible.
  - Test-first: observe failing focused regression before source correction, then GREEN.
  - Checks: focused test, npm test, npm run lint, npx tsc --noEmit; isolated API smoke test with supplied receipt if available.
  - Native review: disabled globally; ordinary independent verification applies after risk assessment.
  - Implementation commit: c623dbc (`fix(receipts): require nullable amount extraction fields`).
  - Observed RED: focused tests 5 passed / 2 failed before source fix; GREEN 7/7.
  - Writer checks: full suite 103/103, lint exit 0, TypeScript exit 0.
  - Independent checks: focused 7/7 and suite 103/103; no actionable issues.
  - Real corrected Gemini API smoke: original receipt -> 6400, no warnings; blank white image -> explicit null amounts, one warning. Two calls, no transactions.
  - Parent spot check: focused 7/7 and git diff --check passed.
  - Risk assessment: unassessable/high because of pre-existing untracked inventory; independent verification completed. RDD remains disabled/unmanaged.
  - Limitation: blank-image abstention is verified; universal OCR accuracy/hallucination prevention is not guaranteed. Existing Node module-type warning is non-failing.

## Delivery and rollback
Forecast: 150–250 authored changed lines. Strategy: ask-on-risk; single work-unit commit on codex/fix-receipt-amount-extraction. Rollback only extractor correction, its regression test and this feature document.

## Progress
Correction complete and independently verified. Implementation commit contains 110 authored changed lines. Model, parser and retries unchanged. Unrelated registry and .codex changes preserved. User subsequently authorized publishing to main; remote update pending.

## Next step
Publish to main with a non-force fast-forward only, as explicitly requested. Deployment is not independently verified.

