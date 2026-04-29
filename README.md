# Choc-collab

Your entire chocolate workshop in one app. Product development, production planning, cost tracking, and business analytics — running on your iPad, phone, or laptop.

## Why this exists
I'm a small-scale artisan chocolatier with a background in IT. My recipes lived 
everywhere — notebooks, PDFs, Google Docs, the occasional scrap of paper — and 
rescaling them was always a guessing game that ended in too much ganache or not 
enough. I had no real production planning, no inventory tracking, and only a 
rough Excel mockup to tell me what my bonbons actually cost to make. I couldn't 
even tell you what I'd produced in a given week.

The tools that could have solved this exist — but they're priced for factories, 
not for someone making bonbons in a home kitchen.

So I built the tool I wished I had.

Choc-collab is designed for a single chocolatier running a small workshop. The 
UI favours speed: one-tap production plans, inline editing, no clutter. The data 
model is currently opinionated toward moulded and bar-style products, though the 
category system is flexible enough for other formats.

I'm sharing it as open source in the same spirit as people like James Parsons of 
[SoSaSe Chocolat](https://www.sosasechocolat.com), who freely shares his craft 
and knowledge with the chocolate community through his weekly Chocy Chats. choc-collab 
is my way of giving something back. If it saves you a batch of wasted ganache, 
[I'd love to hear from you](mailto:choccollab@proton.me) — and a [coffee is always welcome](https://ko-fi.com/choccollab).

## About

Choc-collab keeps everything a chocolatier needs in one place: products built from reusable fillings, ingredient libraries with full composition and allergen data, production plans that auto-scale to your moulds, and an observatory that tracks your costs and margins over time. All data lives in your browser — no account required, no server dependency. You own your data completely. For multi-device sync, you can optionally connect your own [Dexie Cloud](https://dexie.org/cloud/) database.

## Table of contents

- [Features](#features)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Community seed data](#community-seed-data)
- [Project structure](#project-structure)
- [Data model](#data-model)
- [Allergen system](#allergen-system)
- [Production scaling](#production-scaling)
- [Nutrition tracking](#nutrition-tracking)
- [Design system](#design-system)
- [Contributing](#contributing)
- [Third-party services](#third-party-services)
- [About `/choccy-chat`](#about-choccy-chat)
- [License](#license)

## Features

### The Pantry — your ingredient and product library

- **Products** — build products from reusable fillings; select a per-product shell chocolate ingredient and adjust its shell percentage (0–100); set popularity, tags, shelf life, and vegan flag; define shell decoration steps with 13 techniques (airbrushing, sponging, transfer sheets, etc.) linked to your decoration material inventory
- **Product categories** — top-level groupings (e.g. moulded, bar) with configurable shell-percentage range and default per category; bar-style categories (0% min) hide the shell ingredient and (100% max) hide the layers section
  > ** Note that the app is currently only really supporting these two categories. In the future, we could add support for enrobed bonbons, truffles, etc.
- **Fillings** — standalone fillings (ganaches, caramels, pralines, fruit gels, croustillants) with drag-and-drop ingredient lists, version history with fork-and-track, and allergens that auto-aggregate from ingredients
- **Filling categories** — configurable categories (Ganaches, Pralines, Caramels, Fruit-Based, Croustillants) with a shelf-stable flag that controls how the production wizard scales recipes (batch multiplier vs. fill-to-mould)
- **Ingredients** — full library with composition breakdown (cacao fat, sugar, water, milk fat, solids, alcohol, etc.), structured allergen tracking, purchase pricing with cost-per-gram, price history, and per-100g nutrition data with market-aware display
- **Ingredient categories** — configurable categories (Chocolate, Fats, Sugars, Nuts, Liquids, etc.); the "Chocolate" category is protected as it drives shell ingredient selection
- **Moulds** — cavity weight, cavity count, and filling weight per cavity; used to auto-scale production quantities
- **Packaging** — box/container library with order history, supplier tracking, cost-per-unit, and low-stock alerts
- **Collections** — curated product sets for seasonal or permanent ranges; each collection has box offerings with sell prices, cost breakdowns, and margin health indicators
- **Decoration materials** — cocoa butters, lustre dusts, chocolate, transfer sheets — tracked separately from filling ingredients with colour swatches and stock management
- **Decoration categories** — configurable material types (cocoa butter, lustre dust, chocolate, transfer sheet, etc.); add your own to match your workshop
- **Shell designs** — configurable decoration techniques (airbrushing, sponging, splatter, etc.) with a default production phase (colour, shell, cap, unmould); used in shell decoration steps on products

### The Workshop — production and stock

- **Production plans** — select products, assign moulds, set quantities; the app scales every filling amount to fill volume automatically. Shelf-stable fillings use a separate batch multiplier. Shared fillings across products are consolidated into a single step with combined weight. Shell decoration colour steps are scheduled across all products to minimise cocoa butter colour switches
- **Step-by-step checklist** — colour, shell, filling, fill, cap, post-cap decoration, unmould — track progress through each phase of a batch. Low-stock ingredient and packaging warnings surface directly in the wizard
- **Yield tracking** — record actual piece count on unmoulding; defaults to expected yield (moulds x cavities) but adjustable for breakage or overruns
- **Leftover filling stock** — after the fill step, register leftover filling in grams; tracked on the stock page and offered as "use stock" in future production plans
- **Batch tracing** — auto-generated plain-text batch summary (ingredients used, piece counts, dates) saved when a batch is marked done
- **Product stock** — monitor remaining inventory from completed batches with sell-by dates calculated from shelf life; manual stock counts reconcile FIFO across batches; low-stock threshold alerts per product
- **Filling stock** — track leftover filling quantities from production; adjust, discard, or consume in future batches (FIFO deduction)
- **Freezer management** — freeze products or fillings with a preserved shelf-life value; frozen items are excluded from available stock and low-stock alerts; defrost restores them with an adjusted sell-by date

### The Lab — product development
  > COMING SOON
- **Product Lab** — ganache formulation scratchpad with live balance bars checking water, sugar, fat, and solids against validated target ranges for 6 configurations (dark/milk/white x moulded/coated)
- **Test batches** — scale an experiment to a mould, make a test batch, rate taste and texture, and add notes
- **Promote or iterate** — save a proven formula directly as a confirmed reusable filling, or fork a new version and keep refining

### The Observatory — business intelligence

- **Product cost analysis** — per-product cost breakdown by ingredient and filling, cost ranking across your full catalogue, and similar-product comparison to spot pricing patterns
- **Pricing & Margins** — compare profitability across collections and box configurations; track margin snapshots over time with trigger labels (price change, coating swap, etc.)
- **Production statistics** — KPIs (pieces made, batches, products produced), monthly/weekly volume charts colour-coded by product, and a product leaderboard with trend indicators

### Cross-cutting

- **Market region support** — configure your target market (EU, UK, US, AU, or CA); drives allergen checklists, nutrition panel format, and label compliance rules
- **Currency** — choose your currency (EUR, USD, CAD, GBP, CHF); all cost displays and formatting adapt accordingly
- **Allergen compliance** — market-specific allergen checklists (EU 14 allergens per FIC 1169/2011, UK per Natasha's Law, US 9 per FALCPA + FASTER Act, AU/NZ per PEAL, CA 11 per Health Canada); allergens cascade automatically from ingredients through fillings into products; facility-level "may contain" for cross-contamination advisories
- **Nutrition tracking** — per-ingredient nutrition data (per 100g) aggregated at the product level using actual product weights (shell, cap, and fill); market-aware display for EU/UK (Nutrition Declaration), US (Nutrition Facts with %DV), and AU (Nutrition Information Panel)
- **Cost tracking** — automatic cost snapshots triggered by ingredient price changes, filling version forks, mould changes, and shell chocolate swaps; full cost history per product
- **Filling versioning** — fork a filling to create a new version while preserving history; all products using the old version are automatically updated; impact analysis before forking shows which products are affected
- **Low-stock management** — flag ingredients, packaging, or decoration materials as low/out of stock with inline confirmation; mark as ordered; restock; low-stock items surface in the shopping list and as warnings in the production wizard
- **Shopping list** — aggregates low-stock ingredients, packaging, and decoration materials alongside free-text items; mark items as ordered and track delivery status
- **CSV import** — import ingredients from CSV files with column mapping, validation, and duplicate detection; download a template to get started
- **Backup & restore** — full JSON export/import of all data from Settings
- **Automatic safety snapshots** — before any destructive operation (restore, clear, schema upgrade) the app downloads a recovery JSON so you can always roll back
- **Optional cloud sync** — bring your own [Dexie Cloud](https://dexie.org/cloud/) database to sync across devices; works offline and syncs automatically when reconnected. The app is fully functional without it
- **PWA** — installable on iPad, iPhone, or desktop; feels like a native app

## Tech stack

- [Next.js](https://nextjs.org/) 16 + TypeScript + [Tailwind CSS](https://tailwindcss.com/) v4
- [Dexie.js](https://dexie.org/) (IndexedDB) — local-first; optionally connects to [Dexie Cloud](https://dexie.org/cloud/) for cross-device sync
- [dnd-kit](https://dndkit.com/) — drag-and-drop ingredient reordering
- [Lucide React](https://lucide.dev/) for icons
- [Vitest](https://vitest.dev/) for unit tests
- [Playwright](https://playwright.dev/) for end-to-end tests
- Service worker for offline support

## Getting started

### Prerequisites

- Node.js 18+
- npm, yarn, or pnpm

### Install and run

```bash
npm install
npm run dev
```

- [http://localhost:3000](http://localhost:3000) — public landing page with a welcome and two tiles (Open the app / Getting started)
- [http://localhost:3000/app](http://localhost:3000/app) — the app itself (login screen when Dexie Cloud is configured, otherwise straight in)
- [http://localhost:3000/getting-started](http://localhost:3000/getting-started) — end-user guide (install as PWA, demo data, ingredient → filling → product → production walkthrough, FAQ)

### Build for production

```bash
npm run build
npm start
```

### Lint

```bash
npm run lint
```

### Tests

```bash
npm test                # unit tests (run once)
npm run test:watch      # unit tests in watch mode
npm run test:coverage   # unit tests with coverage report
npm run test:e2e        # end-to-end tests (Playwright)
```

### Getting-started screenshots

```bash
npm run docs:screenshots
```

Playwright script (`e2e/docs-screenshots.spec.ts`) that boots the dev server, loads demo data, and captures the 7 screenshots referenced by the Getting Started guide into `public/docs/screenshots/`. Re-run and commit the PNGs whenever a captured screen's UI meaningfully changes.

## Community seed data

Want to explore before entering your own data? Go to **Settings → Load demo data** to populate the app with example ingredients, fillings, products, and moulds. Demo data can be cleared at any time.

We'd love for the community to contribute shared ingredient libraries and mould catalogues — these would save every new user hours of manual data entry. The app loads seed data from CSV files in `public/seed/`; column names must match the field names in `src/types/index.ts`. If you're interested in contributing, see [Contributing](#contributing).

## Project structure

Routes are organised into two Next.js **route groups** — `(public)` for open pages, `(app)` for everything behind the Dexie Cloud auth gate. Parenthesised folders don't appear in URLs, so `(app)/workshop/page.tsx` serves at `/workshop`.

```
src/
  app/
    layout.tsx              — root layout (html/body, fonts, error boundary, service worker)
    globals.css             — design tokens + base styles
    (public)/               — public, unauthenticated
      layout.tsx            — simple header + footer
      page.tsx              — landing page at /  (welcome + two tiles)
      getting-started/      — end-user guide (14-section walkthrough, linear + hub variants)
    (app)/                  — auth-gated product
      layout.tsx            — AuthGate + SideNav + SectionAccent + demo-mode overlay + iOS install banner
      app/                  — /app home: greeting + section cards (Workshop / Pantry / Lab / Observatory / Shop)
      products/             — product list + detail pages
      fillings/              — filling list + detail pages, plus Categories tab and category detail (configurable shelf-stable flag)
      ingredients/          — ingredient library
      moulds/               — mould library
      packaging/            — packaging library + order history
      collections/          — collections list + detail pages
      shopping/             — shopping list (low-stock + free-text items)
      production/           — production planning (list, new wizard, detail, summary)
      stock/                — in-stock batch tracker (sell-before dates, mark as gone)
      calculator/           — Product Lab (ganache formulation + test batches + promotion)
      pantry/               — The Pantry section home (Products, Product Categories, Fillings, Ingredients, Moulds, Packaging, Collections, Decoration)
        decoration/         — decoration material list + detail pages
        product-categories/ — product category list + detail pages (manage shell % range and default per category)
      observatory/          — The Observatory section home (Pricing & Margins, Production Stats, Product Cost)
        product-cost/       — product cost analysis: ranked overview, breakdown bars, similar-product comparison
      pricing/              — cross-collection margin comparison dashboard
      stats/                — production statistics: KPIs, monthly chart, product leaderboard
      settings/             — export / import backup; coating chocolate mappings; Preferences (market region EU/US); Demo Mode (load demo data, touch indicators)
  components/
    pantry/                 — shared primitives for list + detail pages
    side-nav.tsx            — vertical side navigation (logo and Home link point to /app)
    ingredient-form.tsx     — ingredient add/edit form
    category-picker.tsx     — filling category selector
    add-filling-ingredient.tsx — search & add ingredient to a filling
    filling-ingredient-row.tsx — inline-editable ingredient row
    sortable-filling-ingredient-row.tsx — drag-and-drop ingredient reordering
    inline-name-editor.tsx  — name field with hover-pencil for inline rename
    stock-status-panel.tsx  — stock workflow widget (flag low/out, mark ordered, restock)
    page-header.tsx         — reusable page title/description header
    auth-gate.tsx           — login wall when Dexie Cloud is configured
    seed-loader.tsx         — triggers seed on first load
    error-boundary.tsx      — React error boundary
    global-error-handler.tsx — global unhandled-error/rejection logger
    sw-register.tsx         — registers service worker
  lib/
    db.ts                   — Dexie database setup (v3: per-product shell chocolate + v2→v3 upgrade migration)
    hooks.ts                — all reactive queries and mutations
    production.ts           — fill-volume scaling, step scheduling, batch summary
    costCalculation.ts      — pure cost calculation: shell/cap/filling weights, product cost, breakdown serialization
    productCategories.ts    — pure helpers: range validation, range-based bar/moulded discrimination, formatting
    ganacheBalance.ts       — pure ganache balance calculation + range checks (6 configs)
    collectionPricing.ts    — pure pricing/margin calculations for collection box offerings
    nutrition.ts            — per-ingredient nutrition data, market-specific display, product-level aggregation
    productSimilarity.ts     — Jaccard-based product similarity scoring and ranking
    colors.ts               — cocoa butter colour name → CSS hex mapping
    backup.ts               — export / import all data
    seed.ts                 — CSV → IndexedDB seed logic
    csv.ts                  — CSV parser
  types/
    index.ts                — all TypeScript types and constants
e2e/
  docs-screenshots.spec.ts  — NOT a test — generation script for the Getting Started guide's screenshots; run via `npm run docs:screenshots`
public/
  seed/                     — seed CSV files
  docs/screenshots/         — PNGs used by /getting-started (regenerated by `npm run docs:screenshots`)
  manifest.json             — PWA manifest
  sw.js                     — service worker
```

## Data model

The full data model with all fields, types, and relationships is documented in [AGENT.md](AGENT.md) under "Data Model". Key entities: Ingredient, Product, Filling, Mould, Packaging, Collection, DecorationMaterial, ProductionPlan, Experiment — plus category tables, join tables, and history/snapshot tables for cost tracking and filling versioning.

## Allergen system

Allergens are tracked at the ingredient level and cascade automatically into fillings and products.

### Market region

Configure in **Settings → Preferences**. Default is EU.

| Region | Regulation | Allergens |
|---|---|---|
| EU | FIC 1169/2011 | 14 — cereals/gluten, crustaceans, eggs, fish, peanuts, soybeans, milk, tree nuts (8 types), celery, mustard, sesame, sulphites, lupin, molluscs |
| UK | Assimilated FIC + Natasha's Law | 14 — same as EU (retained post-Brexit); PPDS products require full ingredient list with allergens emphasised |
| US | FALCPA 2004 + FASTER Act 2023 | 9 — milk, eggs, fish, shellfish, tree nuts (8 types), wheat, peanuts, soybeans, sesame |
| AU | FSANZ Food Standards Code | AU/NZ PEAL — no celery, lupin, or mustard; mandatory "Contains:" summary statement |
| CA | Health Canada / CFIA | 11 — milk, eggs, fish, crustaceans, molluscs, tree nuts (named individually), peanuts, wheat, sesame, soybeans, mustard; no celery or lupin; bilingual EN/FR labels required |

Key differences:
- **EU/UK** require all **gluten-containing cereals**; US requires only **wheat**; CA declares wheat and gluten sources separately
- EU/UK list **crustaceans** and **molluscs** separately; US uses a combined **shellfish** entry; CA lists both separately
- EU/UK include **celery, lupin, and sulphites**; these have no US, AU, or CA equivalent
- **Sesame** was added to the US list by the FASTER Act, mandatory from 1 January 2023
- **AU** excludes celery, lupin, and mustard but requires a "Contains:" summary statement
- **CA** requires bilingual EN/FR labels (not yet implemented in the app)
- All regions require **tree nuts to be declared by individual variety** (all 8 types tracked separately)

### Cascade flow

```
Ingredient.allergens[]
  ↓ (auto-aggregated when ingredient is added/removed from a filling)
Filling.allergens[]
  ↓ (shown per filling on product detail; cascades into product allergen summary)
Product — derived allergens (from fillings)

Settings → facilityMayContain[] (facility-wide cross-contamination advisories)
```

`facilityMayContain` is stored as a **facility-level setting** (not per-product) — it represents cross-contamination risk from shared equipment or production environment and is configured once in Settings → Preferences.

## Production scaling

Fill weight per mould entry = `cavityVolumeMl × DENSITY × numberOfCavities × quantity × fillFactor`

- `fillFactor` = `(100 - product.shellPercentage) / 100` — derived from the per-product shell percentage (e.g. 37% shell → 0.63 fill factor). The legacy constant `FILL_FACTOR = 0.63` is kept as a fallback.
- In **percentage mode** (default), each filling's weight = `fillWeightG × (fillPercentage / 100)`.
- In **grams mode**, each filling uses its `fillGrams` value directly per cavity × total cavities.

Shelf-stable fillings (categories with `shelfStable = true`, e.g. Pralines, Fruit-Based) are not fill-scaled — they use their base recipe weight multiplied by a user-supplied batch multiplier.

**Cook-loss and measured yield.** Fillings that reduce on the stove (caramels, pâtes de fruits) can record an optional `measuredYieldG` on the filling — the weight of the pan full minus the pan empty after cooking. When set, it becomes the *base yield* for all rescaling: raw ingredients scale up to produce the target cooked weight (e.g. a caramel with `rawTotal = 688`, `measuredYieldG = 503` and target = 600 g cooked scales ingredients by 600 / 503 ≈ 1.19×, not 600 / 688). When the field is left blank (ganaches, pralinés — no reduction), the raw ingredient total is used as before.

Shared fillings across products are consolidated into a single production step with combined weight.

Colour steps are auto-scheduled across all products in a plan to minimise cocoa butter colour switches (greedy algorithm: batch tasks by current colour, switch to the colour with the most ready tasks).

## Nutrition tracking

Nutrition values are entered per 100g on each ingredient and aggregated at the product level to produce per-product and per-100g figures. The calculation mirrors the cost calculation model — it uses the same shell/cap/fill weight breakdown so that nutrition reflects the actual composition of a finished product.

### Per-product weight breakdown

A product's total weight is derived from the mould's `cavityVolumeMl` and the product's `shellPercentage`:

| Component | Weight formula | Source |
|---|---|---|
| **Shell + Cap** | `cavityWeightG × (shellPercentage / 100)` | Product's `shellIngredientId` (direct FK to a shell-capable Chocolate ingredient) |
| **Fill** | `cavityWeightG × ((100 - shellPercentage) / 100) × density` | Split across fillings by `fillPercentage` (or `fillGrams` in grams mode) |

Shell and cap are combined into a single breakdown entry. The shell percentage is adjustable per product and bounded by its category's allowed range (e.g. moulded: 15–50%, bar: 0–100%).

Within each filling, ingredients contribute proportionally to their amounts. For example, if a ganache uses 200g cream and 100g chocolate, cream accounts for 2/3 of that filling's weight and chocolate 1/3.

### Aggregation

Each ingredient's per-100g nutrition data is scaled to its actual gram contribution in the product, then all contributions (shell + fill ingredients) are summed and normalised back to per-100g of the finished product. A separate per-piece column shows the absolute values for one cavity.

### Market-specific display

The ingredient edit form and the product nutrition tab adapt to the target market setting:

| Market | Panel name | Energy units | Mandatory nutrients | Columns |
|---|---|---|---|---|
| **EU / UK** | Nutrition Declaration | kJ + kcal | Fat, saturates, carbohydrate, sugars, protein, salt | Per 100g |
| **US** | Nutrition Facts | kcal only | + trans fat, cholesterol, added sugars, fibre, vitamin D, calcium, iron, potassium | Per 100g, per serving (30g RACC), %DV |
| **AU** | Nutrition Information Panel | kJ only | Fat, saturated fat, carbohydrate, sugars, protein, sodium | Per 100g, per piece |
| **CA** | Nutrition Facts / Valeur nutritive | kcal only | Same as US | Per 100g, per serving (30g RACC), %DV |

The ingredient form only shows fields relevant to the current market. Energy (kJ ↔ kcal) and salt (g) ↔ sodium (mg) are auto-derived when you enter one side.

## Design system

See [DESIGN.md](DESIGN.md) — palette tokens, accent system, typography, geometry, focus styles, side nav, and contribution rules.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and guidelines. Please open an issue before submitting a large pull request. All participants are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).

Community-contributed seed data (ingredient libraries, mould catalogues) is especially valuable — it saves every new user hours of setup. All contributions are accepted under the same MIT license as the project.

## Third-party services

Cross-device sync is available via [Dexie Cloud](https://dexie.org/cloud/), a third-party service with its own [terms](https://dexie.org/cloud/docs/terms). The app works fully offline without it.

## About `/choccy-chat`

The repo also contains a small side-project hosted on the same domain at [`choc-collab.org/choccy-chat`](https://choc-collab.org/choccy-chat) — **a fan-run directory of home and small-batch chocolatiers who hang out around James Parsons' weekly Choccy Chat lives on Instagram**. It is not affiliated with James or [SoSaSe Chocolat](https://www.sosasechocolat.com), and **it is not part of Choc-collab the app**. The two share a domain because the maintainer of both is the same person — nothing more.

The directory's code lives under [`src/app/(public)/choccy-chat/`](src/app/(public)/choccy-chat), [`src/app/admin/choccy-chat/`](src/app/admin/choccy-chat), and [`worker/`](worker). Submissions are stored in a Cloudflare D1 database; admin endpoints are gated by Cloudflare Access. The submission form, public map, and admin queue are all separate from the Choc-collab app and do not share its IndexedDB.

This directory subsystem **handles community PII** (submitter emails and contact names, kept private; workshop name, city, country, and chosen links, shown publicly). PRs touching `/choccy-chat`, `/admin`, or `worker/` are reviewed with extra care to make sure private columns never leak into the public `/api/choccy-chat/friends` response. See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

If you fork Choc-collab to run your own workshop tool, you almost certainly do not want any of this — feel free to delete the three directories above and the related routes.

## License

Choc-collab is MIT-licensed — see [LICENSE](LICENSE).
