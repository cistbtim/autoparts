# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start dev server (Vite HMR)
npm run build     # production build → dist/
npm run lint      # ESLint check
npm run preview   # preview production build locally
```

No test suite is configured.

## Environment Variables

Create `.env.local` with:
```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_KEY=<anon-key>
VITE_BASE_PATH=/   # optional, defaults to /
```

## File Structure

The app has been refactored from a single 16 000-line file into modules. `src/App.jsx` is now ~3 260 lines and contains only `App()` and `MainApp`.

```
src/
├── App.jsx                    # App(), MainApp only (~3 260 lines)
├── styles.js                  # CSS template literal (export const CSS)
├── lib/
│   ├── api.js                 # Supabase fetch layer (api, setDemoMode, SUPABASE_URL/KEY)
│   ├── settings.js            # Settings singleton (getSettings, updateSettings, loadSettings, C, curSym)
│   ├── i18n.js                # Translations T object, setCurrentLang, tSt
│   ├── helpers.js             # URL/format utilities (toImgUrl, fmtAmt, makeId, waLink, …)
│   ├── constants.js           # ROLES, CAR_MAKES, getCategories, getSubInfo, canAccess, …
│   └── barcode.js             # Dynamsoft PDF417 decoder for SA eNaTIS licence discs
├── components/
│   ├── shared.jsx             # ErrorBoundary, Overlay, MHead, FL/FG/FD, DriveImg, StatusBadge, ImgLightbox, …
│   ├── Modals.jsx             # All inventory/supplier/customer/settings modals and pages (~3 580 lines): PartModal, SettingsPage, ReportsPage, StockTakePage, OrdersTable, CustomerModal, InquiryModal, PdfInvoiceModal, AddPaymentModal, …
│   ├── RfqVehicles.jsx        # RfqPage, PickingPage, VehiclesPage, VehicleModal, VehicleFitmentTab, PartPhotoUploader, VehiclePhotoUploader, VehicleSearchBar
│   └── Workshop.jsx           # All workshop components — WorkshopPage and ~40 sub-components (BookInModal, WorkshopJobDetail, WsStockPage, print functions, …)
└── pages/
    ├── LoginPage.jsx          # LoginPage, PaywallPage
    └── PublicPages.jsx        # RfqReplyPage, RfqQuoteReplyPage, RfqBatchReplyPage, QuoteConfirmPage
```

## Architecture

### Top-level render flow

```
App()
  ├─ URL param ?rfq=       → RfqReplyPage        (supplier quote reply, no auth)
  ├─ URL param ?rfq_quote= → RfqQuoteReplyPage   (supplier single-quote reply, no auth)
  ├─ URL param ?rfq_batch= → RfqBatchReplyPage   (supplier batch reply, no auth)
  ├─ URL param ?wsq=       → QuoteConfirmPage    (customer quote confirm, no auth)
  ├─ !user                 → LoginPage
  ├─ !canAccess(user)      → PaywallPage
  └─ authenticated         → MainApp
```

`App()` calls `loadSettings()` once before rendering, blocking on a loading screen.

### Navigation

`MainApp` uses a `tab` state string — no URL routing. Initial tab by role:
- `customer` → `shop`
- `shipper` → `orders`
- `stockman` → `stocktake`
- `manager` → `stocktake`
- `workshop` → `workshop`
- `admin`/`demo` → `dashboard`

All modals are tracked via a single `M` state object: `openM(key, data)` / `closeM(key)` / `isOpen(key)` / `mData(key)`.

### API layer (`src/lib/api.js`)

No Supabase JS client — all calls are raw `fetch` to the Supabase REST API:

```js
const api = { get, upsert, patch, delete, insert }
```

`fetchAll` paginates automatically (1 000 rows per request) so there is no row limit.

`setDemoMode(isDemo, onBlock)` makes all write calls no-ops. `SUPABASE_URL` and `SUPABASE_KEY` are exported for use in components that need raw dual-condition PATCH (e.g. `PublicPages.jsx`).

### Settings (`src/lib/settings.js`)

`_settings` is a module-level singleton. Always access via `getSettings()`. Update via `updateSettings(partialObj)` — never reassign directly (ES module constraint). `loadSettings()` fetches from Supabase `settings` table (id=1).

`C()` returns the currency symbol from settings. `curSym("TWD NT$")` → `"NT$"`.

### i18n (`src/lib/i18n.js`)

`T` object holds `en` and `zh` translation maps. `t = T[lang]` is passed as a prop. `tSt(status)` translates status strings only in `zh` mode. Call `setCurrentLang(lang)` when the user switches language.

### CSS (`src/styles.js`)

All styles are in the `CSS` template literal injected via `<style>{CSS}</style>`. Uses CSS custom properties (`--bg`, `--accent`, `--surface`, etc.) with a `[data-theme="light"]` override block. No CSS modules or external stylesheet beyond Google Fonts.

### User roles & auth

Authentication is entirely client-side — credentials are fetched from Supabase and compared in the browser. Roles stored in `users.role`:

| Role | Access |
|---|---|
| `admin` | Full access, bypasses subscription checks |
| `manager` | Inventory, orders, invoicing, reports |
| `shipper` | Orders (picking/shipping) |
| `stockman` | Stock-take only |
| `customer` | Shop only (logs in via `customers` table with phone+password) |
| `workshop` | Workshop module, scoped to their `workshop_id` |
| `demo` | Read-only demo, writes blocked |

Workshop sub-users live in `workshop_users` table with `ws_role`: `main` | `manager` | `mechanic`. On login they are merged into the parent `users` record with `wsRole` injected.

All workshop data is filtered by `workshop_id=eq.${wsId}`.

### Key Supabase tables

**Core:** `settings`, `users`, `customers`, `parts`, `orders`, `payments`

**Stock:** `inventory_logs`, `stock_moves`, `stock_takes`

**Suppliers/Procurement:** `suppliers`, `part_suppliers`, `inquiries`, `supplier_invoices`, `supplier_returns`, `rfq_sessions`, `rfq_items`, `rfq_quotes`

**Sales:** `customer_invoices`, `customer_returns`, `customer_queries`

**Vehicles:** `vehicles`, `part_fitments`

**Workshop:** `workshop_jobs`, `workshop_job_items`, `workshop_invoices`, `workshop_quotes`, `workshop_customers`, `workshop_vehicles`, `workshop_stock`, `workshop_services`, `workshop_suppliers`, `workshop_documents`, `workshop_profiles`, `workshop_users`

**Workshop procurement:** `ws_supplier_requests`, `ws_supplier_quotes`, `ws_supplier_invoices`, `ws_supplier_invoice_items`, `ws_supplier_payments`, `ws_supplier_returns`

**System:** `login_logs`, `record_locks`

### Record locking

`record_locks` table provides optimistic multi-user locking. Locks expire after 5 minutes. `acquireLock(type, id)` / `releaseLock(type, id)` / `isLocked(type, id)`. Fails open (returns true) if the table is missing.

### External integrations

- **Dynamsoft Barcode Reader** (`src/lib/barcode.js`, CDN-loaded at runtime v7.4.0) — PDF417 scanning for South African eNaTIS licence discs. Falls back to native `BarcodeDetector` API first.
- **ipapi.co** — geo-location on login for `login_logs`.
- **Google Drive** — image URLs are auto-converted via `toImgUrl()`, `toSaveUrl()`, `toLogoUrl()`, `extractDriveId()` in `src/lib/helpers.js`.
- **WhatsApp / email** — `waLink()` / `mailLink()` in `src/lib/helpers.js`.
- **Google Apps Script** — `apps_script_url` and `vehicle_script_url` in settings are called for email sending and vehicle lookup.

## ESLint notes

`no-unused-vars` is set to `error` but ignores names matching `^[A-Z_]` — uppercase component names and `_prefixed` variables can remain unused without lint errors. Unused lowercase imports (e.g. `fmtAmt`) in component files will trigger lint errors but do not break `npm run build`.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. The
skill has multi-step workflows, checklists, and quality gates that produce better
results than an ad-hoc answer. When in doubt, invoke the skill. A false positive is
cheaper than a false negative.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke /office-hours
- Strategy, scope, "think bigger", "what should we build" → invoke /plan-ceo-review
- Architecture, "does this design make sense" → invoke /plan-eng-review
- Design system, brand, "how should this look" → invoke /design-consultation
- Design review of a plan → invoke /plan-design-review
- Developer experience of a plan → invoke /plan-devex-review
- "Review everything", full review pipeline → invoke /autoplan
- Bugs, errors, "why is this broken", "wtf", "this doesn't work" → invoke /investigate
- Test the site, find bugs, "does this work" → invoke /qa (or /qa-only for report only)
- Code review, check the diff, "look at my changes" → invoke /review
- Visual polish, design audit, "this looks off" → invoke /design-review
- Developer experience audit, try onboarding → invoke /devex-review
- Ship, deploy, create a PR, "send it" → invoke /ship
- Merge + deploy + verify → invoke /land-and-deploy
- Configure deployment → invoke /setup-deploy
- Post-deploy monitoring → invoke /canary
- Update docs after shipping → invoke /document-release
- Weekly retro, "how'd we do" → invoke /retro
- Second opinion, codex review → invoke /codex
- Safety mode, careful mode, lock it down → invoke /careful or /guard
- Restrict edits to a directory → invoke /freeze or /unfreeze
- Upgrade gstack → invoke /gstack-upgrade
- Save progress, "save my work" → invoke /context-save
- Resume, restore, "where was I" → invoke /context-restore
- Security audit, OWASP, "is this secure" → invoke /cso
- Make a PDF, document, publication → invoke /make-pdf
- Launch real browser for QA → invoke /open-gstack-browser
- Import cookies for authenticated testing → invoke /setup-browser-cookies
- Performance regression, page speed, benchmarks → invoke /benchmark
- Review what gstack has learned → invoke /learn
- Tune question sensitivity → invoke /plan-tune
- Code quality dashboard → invoke /health
