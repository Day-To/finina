# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Finina is a personal-finance PWA: plan a monthly/yearly budget, track daily spending, and route surplus into investments. It's a Nuxt 4 **SPA** (`ssr: false`) backed by Firebase (Auth + Firestore client SDK), with an optional Nitro server endpoint for ingesting expenses.

## Commands

Package manager is **pnpm** (see `packageManager` in package.json).

```bash
pnpm dev              # Nuxt dev server (PWA registers in dev too)
pnpm build            # Production build → .output/ (SPA; deployed to Firebase Hosting)
pnpm generate         # Static export
pnpm preview          # Preview a build

pnpm test             # vitest run (one-shot)
pnpm test:watch       # vitest watch
pnpm exec vitest run app/domain/calc/flow.test.js   # single test file
pnpm exec vitest run -t "surplus"                   # single test by name
```

There is **no linter configured** — match the style of surrounding code.

Tests only cover the pure layers: `vitest.config.js` includes `app/domain/**/*.test.js` and `app/composables/**/*.test.js` (Node environment, no Firebase). Repositories, components, and pages are not unit-tested.

## Architecture

The app is strictly layered. Dependencies point downward only; never reach across or upward.

```
pages / components (Vue SFCs)
        │
composables/      Vue reactivity bridge — subscribe to repos, expose reactive state
        │
repositories/     the ONLY layer that touches Firestore
        │
domain/           pure JS — no Firebase, no Vue. Money, schemas, calculations.
```

### domain/ — pure core (test here first)
- `money.js` — **all amounts are integer minor units**, and **currency is a property of money, not a global**. Minor-unit size derives from the currency via `Intl` (INR/USD→2, JPY→0, KWD→3). Use `toMinor`/`fromMinor`/`formatMoney`/`sumMinor`; never hardcode symbols or decimal places.
- `schemas.js` — Zod schemas are the **single source of truth for entity shapes**, used both as Firestore validation converters and as form schemas.
- `calc/` — pure calculation modules (`totals`, `flow`, `daily`, `seed`, `home`, `investments`, `analytics`), re-exported via `calc/index.js`. Currency-agnostic integer math within one document's single currency.
- `ids.js` — UUID minting. `currencies.js` — currency registry.

### repositories/ — Firestore boundary
- `base.js` holds the only Firestore knowledge: `db()`, `userDoc`/`userCollection` helpers, and `makeConverter(schema)`.
- All user data lives under **`users/{uid}/...`** (enforced by `firestore.rules`: owner-only subtree).
- **Validation happens on READ only.** Writes pass through `stripUndefined` untouched so `serverTimestamp()` sentinels survive. A doc that fails Zod validation is returned best-effort (defaults + stored data) so one bad record never blanks the screen.
- Repos mint UUIDs, stamp currency, and return entity-shaped objects — callers never see a `DocumentSnapshot`.

### composables/ — reactive bridge
Each `useX` opens Firestore subscriptions (`onSnapshot`), exposes reactive refs/computeds, and tears down on scope dispose. They get `uid` from the auth store and call repos. This is where domain calc results meet Vue reactivity.

### Key domain model
- **Plans are append-only and versioned.** A plan doc (`monthly`/`yearly`) points at an `activeVersionId`; versions are immutable. Saving edits mints a new version; "revert" branches a new active version from an old one (`usePlan.saveVersion` / `revertTo`). Same pattern for investment routing (`investmentPlan` + `versions`).
- **Months are materialized, editable instances** keyed by `monthId = "YYYY-MM"`, seeded from the active plan versions via `calc/seed.js` (fresh UUIDs per line, flow source refs remapped old→new, yearly recurring items merged in for the due month). Edits to a month do not flow back to the plan.
- **Flow**: income → bank account(s) → allocations, edited with Vue Flow graph editors (`FlowGraphEditor`, `InvestmentFlowEditor`, etc.). Surplus lines route by PCT or AMOUNT and can target investment pools (MUTUAL_FUNDS / STOCKS).

## Conventions

- **Path aliases**: `~/` and `@/` both resolve to `app/`. Imports look like `~/repositories/plans.js`, `~/domain/schemas.js`.
- **Components auto-import** with two conventions:
  - `app/components/ui/` — shadcn-vue primitives, imported with the **`Ui` prefix** (e.g. `<UiButton>`). Managed via `components.json` / `shadcn-vue`.
  - `app/components/shared/` — feature components, imported by **base name, no path prefix** (e.g. `<MoneyInput>`).
- **Auth** is Firebase email/password. `plugins/firebase.client.js` initializes Firebase, feeds the Pinia `auth` store from `onAuthStateChanged`, and provides `$db`, `$firebaseAuth`, and `$authReady()`. `middleware/auth.global.js` gates routes by page meta: `public: true` (anyone), `unauthenticatedOnly: true` (signed-out only), or default (auth required) — it awaits `$authReady()` before redirecting.
- The Firebase **web config in `firebase.client.js` is intentionally public** (standard for client SDKs); real protection is the Firestore owner-only rules. The Admin SDK credentials (server) are the secrets — see `.env.example`.

## Server (Nitro) — optional

`server/api/expenses.{get,post}.js` writes/reads one user's daily expenses via the **Firebase Admin SDK**, configured entirely by env vars (`EXPENSE_API_UID`, optional `EXPENSE_API_TOKEN`, etc. — see `.env.example`). This is a drop-in for an old Apps Script webhook and **only works when deploying the Node server**, not with a static export. Amounts in this API are in **major** units; everything else in the app is minor units.

## Notes

- Source comments reference spec sections like `(§5)`, `(§6)` — these point to an external design doc that is **not in the repo**. Don't try to resolve them against files here.
- Deployment is Firebase Hosting (`firebase.json` serves `.output/public` with SPA rewrites to `/index.html`); project is set in `.firebaserc`.
