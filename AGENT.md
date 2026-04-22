# ChocCollab — Agent Instructions

## Project Philosophy
ChocCollab is an **open-source, local-first** chocolatier's toolkit. All data lives in the browser's IndexedDB. There is no proprietary backend and no hosted subscription tier — users own their data completely.

**Distribution model** (in order of preference):
1. **Self-hosted** — users clone/fork the repo and run it themselves. Primary path.
2. **Local-only packaged download** — a pre-built, zero-setup version (static bundle or desktop wrapper). For non-technical users who want the app without a dev stack. No sync, single device.
3. **Dexie Cloud sync** — optional add-on for users who need cross-device sync. Users bring their own Dexie Cloud database URL. This is a convenience feature, not a paid service.

A future **cloud file sync** path (File System Access API writing to iCloud Drive, Dropbox, etc.) is on the table for local-only users who want multi-device without a backend — not yet built.

**Liability posture**: this is a tool built for a working chocolatier's own use, shared as OSS under MIT. It is not a certified, supported product. The README and first-run experience should make this clear. Keep the risk surface small: no hosting of other users' data, no uptime promises, prominent backup UX.

## Architecture Constraints
Keep these in mind for every new feature:

- Keep all data logic in `lib/` as pure, backend-agnostic functions — never bake in assumptions that data only lives locally
- Avoid patterns that would be hard to layer sync on top of (e.g. storing derived state that should be recomputed, mutating records without a clear "last updated" timestamp)
- Every table already has an `id` field — ensure any new tables do too, as sync requires stable identifiers
- Prefer additive schema changes (new nullable fields) over destructive ones — sync makes migrations harder to coordinate
- Do not add any features that would only work in a single-device context without flagging it as a known limitation
- All user settings must sync via Dexie Cloud (the `userPreferences` table, not device-local storage) — users expect configuration to be consistent across devices
- **Treat data loss as a primary threat model.** ChocCollab's default tier is local-only IndexedDB — there is no server to rescue a wiped database. Every change that touches persistence, schema, or destructive user flows must preserve the three protections already in place: (1) `navigator.storage.persist()` requested on boot to block eviction; (2) auto-snapshot download before any destructive op (`importBackup`, `clearAllData`); (3) pre-upgrade snapshot download before a Dexie schema migration runs. See "Data-loss protections" under Backup / Restore.

---

## Security
- **Never commit secrets.** API keys, client secrets, passwords, and tokens must never be added to any file that could be committed. If a credential is needed at runtime, use environment variables. If it's a CLI credential file (like `dexie-cloud.key`), add it to `.gitignore`.
- Before committing any new file, check whether it contains sensitive values.

---

## Routing & URL Encoding
Dexie Cloud generates entity IDs containing a `|` pipe character (e.g. `ing0PpjyEqXloLHYjgzZ|nVN7qMzed`). The id also has to survive a static-export + Cloudflare rewrite round-trip. Three rules must hold for every `[id]` route:

1. **Links and `router.push` calls must use `encodeURIComponent(id)`** when embedding an entity ID in a path segment:
   ```tsx
   <Link href={`/ingredients/${encodeURIComponent(id)}`}>…</Link>
   router.push(`/ingredients/${encodeURIComponent(id)}?new=1`);
   ```

2. **Every `[id]` detail page must read the id via `useSpaId(...)`, never `use(params)`:**
   ```tsx
   import { useSpaId } from "@/lib/use-spa-id";

   export default function IngredientDetailPage() {
     const ingredientId = useSpaId("ingredients"); // the segment directly before [id]
     const ingredient = useIngredient(ingredientId);
     if (!ingredientId || !ingredient) return <Loading />;
     // …
   }
   ```
   Why: `output: "export"` builds every `[id]` route with a `_spa` placeholder param, and `public/_redirects` + `vercel.json` rewrite any real id to that placeholder HTML on fresh loads (reload / share / direct link). The RSC payload baked into the served HTML therefore has `params.id = "_spa"` — `use(params)` returns the placeholder forever and the page sits on "Loading". `useSpaId` reads the real id from `window.location.pathname` after mount. See `src/lib/use-spa-id.ts` and the fresh-load Playwright test at `e2e/fresh-load.spec.ts`.

3. **When you add a new `[id]` route, also add the rewrite rule in both hosts' configs.** `public/_redirects` for Cloudflare (nested routes before parents — see the comment in that file) and `vercel.json` for Vercel. Each route needs **two** Cloudflare patterns: `/fillings/*/` (trailing slash, `*` glob — catches `/fillings/xyz/`) and `/fillings/:id` (no trailing slash, named placeholder — catches `/fillings/xyz`). A single `/fillings/*` is a trap: the `*` glob matches empty, so it swallows the list URL `/fillings/` into the detail placeholder.

Never pass a raw route segment directly to a DB lookup or hook.

---

## Performance Constraints
The app targets 300+ products and 1000+ fillings. Keep these rules in mind for every new feature:

- **Never load large blob fields (e.g. `photo`) in list queries.** Use `useProductsList()` (or an equivalent photo-free hook) on list pages; reserve full-record fetches for detail pages. The same principle applies to any future binary/large-text field on any table.
- **Avoid O(N²) loops over lists.** When grouping or joining collections, build a `Map` in one pass rather than calling `.filter()` once per category/type.
- **Don't fetch unbounded tables into memory just to filter in JS.** Prefer Dexie index queries (`.where(...).equals(...)`) over `.toArray().then(all => all.filter(...))` where an index exists.
- **List pages must scale to their expected maximums.** Before shipping a list page, ask: does this render 300/1000 items at once? If so, consider `content-visibility: auto` or windowing.
- **New tables need an index on any field used in a `.where()` query.** Check `db.ts` — adding a field without indexing it forces full table scans.

---

## Keeping Docs in Sync

**Non-negotiable: every user-visible change — feature, UX tweak, or bug fix — ships with a `CHANGELOG.md` entry in the same change.** Add it under `## [Unreleased]` (create the section if absent) at the time you make the code change, not as a follow-up. The only things that don't need an entry are changes the user will never notice: internal refactors with no behavior change, test-only edits, tooling, and `AGENT.md`/contributor-doc tweaks. When in doubt, write the entry. It is easier for a reviewer to delete an unnecessary line than to realise after release that a user-affecting change went undocumented.

Before treating any task as complete, re-check: *"Did this change anything a user would see or feel?"* If yes and `CHANGELOG.md` wasn't touched, the task is not done. Offer a draft entry proactively — don't wait to be asked.

Documentation lives in six places — update the right one(s) when you change the code:

- **`README.md`** — user-facing: what the app does, how to run it, headline features, tech stack. Short and approachable.
- **`AGENT.md`** (this file) — contributor/architecture reference: data model, DB schema, hooks, file structure, tests, design principles.
- **`DESIGN.md`** — design system: palette, typography, geometry, focus, side-nav, accent system.
- **`CONTRIBUTING.md`** — contributor workflow: branch, commit, PR, test conventions.
- **`CHANGELOG.md`** — user-facing release notes, one entry per tagged release.
- **`src/app/(public)/getting-started/page.tsx`** — end-user Getting Started guide (14-section walkthrough). Screenshots referenced by this guide live in `public/docs/screenshots/` and are regenerated by `npm run docs:screenshots` (Playwright script at `e2e/docs-screenshots.spec.ts`).

| Change type | What to update |
|---|---|
| **Any user-visible change (feature, UX, bug fix)** | **`CHANGELOG.md` `[Unreleased]` — always, same PR as the code** |
| New top-level feature / section | README features list + AGENT.md file structure + CHANGELOG `[Unreleased]` + getting-started guide (if user-facing) |
| User-visible behaviour covered by the guide (install flow, demo data, adding/editing entities, production wizard, stock/freezer, backup/cloud sync, keyboard shortcuts) | Update the matching section in `src/app/(public)/getting-started/page.tsx` |
| UI change to a captured screen (Settings → Demo tab, ingredient/filling/product detail, production list, stock, collection detail) | Re-run `npm run docs:screenshots` (dev server does not need to be up — Playwright boots one). Commit regenerated PNGs in `public/docs/screenshots/` |
| New page / route | File structure in AGENT.md |
| New pantry list or detail page | Follow the checklist in "Pantry Shared Components" section of AGENT.md |
| New component | Component list in AGENT.md |
| New table or field | Data model in AGENT.md + **backup/restore** (see below) + CHANGELOG `[Unreleased]` |
| DB version bump | Version number in AGENT.md + CHANGELOG `[Unreleased]` (flag schema change) + **bump `CURRENT_DEXIE_VERSION` in `src/lib/upgrade-snapshot.ts`** (must track `db.ts`, otherwise the pre-upgrade snapshot silently reports "already-current" and users lose the safety net) |
| New `lib/` function or export | Relevant section in AGENT.md |
| New test file | Tests table in AGENT.md |
| New dependency | Tech stack in README |
| New design token / accent / focus rule | DESIGN.md |
| Feature completed from Build Plan | Remove from "remaining" list in AGENT.md |
| Tagged release | Convert CHANGELOG `[Unreleased]` → `[X.Y.Z] — YYYY-MM-DD`; bump `package.json` version; bump `CACHE_NAME` in `public/sw.js` if bundle/schema changed |

## Backup / Restore (`src/lib/backup.ts`)
**Every table in `db.ts` must be included in both `exportBackup` and `importBackup`. No exceptions.**

When you add a new Dexie table, you must update `backup.ts` in the same session:

1. **`BackupData` interface** — add an optional `tableName?: unknown[]` field
2. **`exportBackup`** — add `db.tableName.toArray()` to the `Promise.all` and include it in the backup object
3. **`importBackup`** — add the table to the transaction table list, the `clear()` list, and the `bulkAdd` list

**Coverage checklist** — all tables currently handled in backup/restore:
`ingredients`, `products`, `productCategories`, `fillings`, `fillingCategories`, `ingredientCategories`, `productFillings`, `fillingIngredients`, `moulds`, `productionPlans`, `planProducts`, `planStepStatus`, `settings`, `userPreferences`, `productFillingHistory`, `ingredientPriceHistory`, `coatingChocolateMappings`, `productCostSnapshots`, `packaging`, `packagingOrders`, `decorationMaterials`, `decorationCategories`, `shellDesigns`, `experiments`, `experimentIngredients`, `shoppingItems`, `collections`, `collectionProducts`, `collectionPackagings`, `collectionPricingSnapshots`, `fillingStock`

### Data-loss protections
Three layered safeguards work together so neither a browser eviction, a misclick, nor a schema upgrade can silently wipe a user's data:

1. **Persistent storage request** (`src/lib/persistent-storage.ts` + `src/components/persistent-storage-request.tsx`) — `navigator.storage.persist()` is called on app boot from the root layout. Browsers that grant it will not evict the IndexedDB under storage pressure. Settings → Backup exposes the live status (persisted / usage / quota) and a manual "Request persistent storage" button for browsers (Safari, Firefox) that often refuse the auto-request and only grant on a user gesture.
2. **Auto-snapshot before destructive ops** (`src/lib/backup.ts`) — both `importBackup()` and `clearAllData()` call `writeSafetySnapshot()` before wiping any data. Filenames are prefixed `choc-collab-snapshot-before-restore-` / `choc-collab-snapshot-before-clear-` so users can tell them apart from manual exports in the Downloads folder. Skipped when the DB is empty (nothing to protect). Both functions accept `{ snapshot: false }` for scripts/tests that need to opt out.
3. **Pre-upgrade snapshot** (`src/lib/upgrade-snapshot.ts`) — `snapshotBeforeUpgrade()` is fired from `db.ts` at module init. It reads the stored IDB version via `indexedDB.databases()`, and if lower than `CURRENT_DEXIE_VERSION`, opens a bare `new Dexie("ChocolatierDB")` at the existing version, dumps every table it finds, and downloads `choc-collab-snapshot-before-upgrade-v{old}-to-v{new}-{date}.json`. IDB serializes the real upgrade behind the peek, so the snapshot always observes pre-upgrade state. `localStorage` records metadata so Settings can show a one-time "Recovery snapshot saved" banner explaining the mystery file in Downloads (dismissible via `dismissLastSnapshotMetadata()`). Skips cleanly for fresh installs (version 0), already-current loads, browsers without `indexedDB.databases()` (Safari <16.4), or when the existing DB has no rows.

**When bumping the Dexie schema version in `db.ts`: also bump `CURRENT_DEXIE_VERSION` in `src/lib/upgrade-snapshot.ts`.** These two constants are linked by hand because the snapshot module cannot import the live Dexie instance without triggering a circular open.

## Tests

> **Every new feature ships with tests. No exceptions.**
> This means: if you add a new UI behaviour, a new hook, or a new pure function in the same session — tests for it must be written and passing before the session ends. Do not wait to be asked.

**Always run `npm test` at the end of any session that touches `lib/` or `types/`.** If tests fail, fix them before finishing — never leave the suite red.

**Run `npm run test:e2e` after any session that adds or changes pages, navigation, or UI flows.** All E2E tests must pass before finishing.

**Every exported pure function must have tests. No exceptions.** Before finishing any session that adds or modifies `lib/` or `types/` code, verify that every exported function in those files is covered in the corresponding `.test.ts`. If a function is missing tests, add them in that same session.

**When to add tests:**

| Change type | What to test |
|---|---|
| New pure function in `lib/` or `types/` | Add a `*.test.ts` alongside it covering happy path + edge cases |
| Change to existing pure function | Update or extend existing tests to cover the new behaviour |
| Bug fix in pure logic | Add a regression test that would have caught the bug |
| New React component / page | No unit test needed — test the pure logic it depends on instead |
| New Dexie hook or mutation | No unit test needed — hooks are browser-only; test any pure helpers they call |
| New page / route (list or detail) | Add E2E tests in `e2e/` covering: empty state, create + land on detail, appears in list, edit a field, delete |

**E2E test patterns (Playwright):**
- Tests run with `workers: 1` (sequential) because Dexie Cloud `@id` init can be slow in fresh browser contexts.
- After `router.push('/entity/{id}?new=1')`, `useEntity(id)` may take up to ~30s to resolve in slower positions in the test run. Use `fill()` or `click()` directly (which auto-wait with 30s action timeout) rather than `expect().toBeVisible()` (which uses the 15s `expect.timeout`). For tests that must wait >15s, use `test.setTimeout(60000)` or pass `{ timeout: 30000 }` explicitly.
- **Don't navigate away from the detail page and come back** via `page.goto` + link click — this can cause `useEntity(id)` to fail permanently in slower contexts. Instead: stay on the page (use the "Done" button to exit edit mode, then interact), OR navigate back to the list and verify via list (which uses `toArray()`, always fast).
- Each test gets a fresh browser context (fresh IndexedDB). The `fixtures.ts` prevents CSV seed data from loading.

**What counts as a pure function:** anything in `lib/` or `types/` that takes plain arguments and returns a value with no side effects (no IndexedDB, no React, no `window`). Examples: `costPerGram`, `colorToCSS`, `calculateFillingAmounts`, `consolidateSharedFillings`, `scheduleColorSteps`, `generateBatchSummary`, `parseCSV`, `enrichBreakdownLabels`, `formatCost`, `costDelta`, `groupSnapshotsByEra`, `validateCategoryRange`, `categoryAllowsZeroShell`, `categoryAllowsFullShell`, `clampShellPercentToCategory`, `formatCategoryRange`, `remainingShelfLifeDays`, `defrostedSellBy`, `clampFreezeQty`, `shelfLifeBucket`.

**Coverage checklist for `lib/costCalculation.ts`** (all exported functions are now tested):
`calculateShellWeightG`, `calculateCapWeightG`, `calculateFillingWeightPerCavityG`, `calculateProductCost`, `resolveCoatingCostAtDate`, `resolveCurrentCoatingCostPerGram`, `serializeBreakdown`, `deserializeBreakdown`, `buildIngredientCostMap`, `enrichBreakdownLabels`, `formatCost`, `costDelta`, `groupSnapshotsByEra`

---

## Deletion Confirmation Pattern
**Every destructive/removal action must require a two-step confirmation — no exceptions.** This applies to:
- Delete buttons on detail pages (already use a confirmation panel)
- Remove/dismiss buttons on list pages and inline rows (e.g. the X on shopping list items)
- Any action that silently removes or flags-off a record

**Inline confirmation pattern** (for list rows and compact UI — no modal):
When the user clicks a remove/delete button, replace that button in-place with a compact "Remove?" / "Delete?" prompt and two text buttons:
```tsx
{pendingRemove === key ? (
  <span className="flex items-center gap-1.5 text-xs">
    <span className="text-muted-foreground">Remove?</span>
    <button onClick={() => { doRemove(); setPendingRemove(null); }} className="text-red-600 font-medium hover:underline">Yes</button>
    <button onClick={() => setPendingRemove(null)} className="text-muted-foreground hover:underline">Cancel</button>
  </span>
) : (
  <button onClick={() => setPendingRemove(key)} ...><X /></button>
)}
```
Track pending state with `useState<string | null>(null)` using a namespaced key (e.g. `ing-${id}`, `pkg-${id}`, `item-${id}`). Positive completion actions (e.g. "Restocked", "Mark as done") do **not** need confirmation — only destructive removals do.

**Shopping cart / low-stock flag pattern** — use `<LowStockFlagButton>` from `@/components/pantry`:
- Compact inline button with built-in "Add to list?" / "Remove?" confirmation
- **Flag-only** mode (no `onUnflag`): for read-only contexts like scaled products, calculator batch, production plan materials
- **Toggle** mode (`onUnflag` provided): for list pages where the user can both add and remove (ingredients, packaging, decoration)
- **Detail pages** still use `<StockStatusPanel>` for the full lifecycle (flag → ordered → restocked)
- Never call `setIngredientLowStock` / `setPackagingLowStock` / `setDecorationMaterialLowStock` directly from a click handler without confirmation

---

## Navigation & Page Structure Principles
- **List → detail pattern**: every entity (products, fillings, ingredients, moulds) must follow the same UX pattern: the list page shows items with a chevron, clicking navigates to a dedicated `[id]` detail page. **No inline editing on list pages.**
- All editing happens on the detail page, not via inline forms or modals on the list page.
- Adding a new item from a list page uses the create-then-redirect pattern: collect just enough info (name + key field), create the record, then `router.push(`/[entity]/${id}?new=1`)` to land on the detail page for the rest.
- **Deleting** an item is only possible from the detail page — never from the list. The detail page shows a "Delete [entity]" button at the very bottom; clicking it reveals a confirmation panel (description of consequences + "Yes, delete" + Cancel). After deletion, navigate back to the list with `router.replace`.

## Pantry Shared Components
All pantry list and detail pages are built from shared primitives in `src/components/pantry/` and `src/lib/use-n-shortcut.ts`. **Never inline these patterns by hand** — always import from the barrel export `@/components/pantry`.

### List page checklist (use every time you add a pantry list page)
```
1. <PageHeader title="…" description="…" />           src/components/page-header.tsx
2. <ListToolbar … />                                   search + filter toggle + add button
3. useNShortcut(() => setShowAdd(true), showAdd)        src/lib/use-n-shortcut.ts
4. {showFilters && <FilterPanel …>}                    optional filter card
     └─ <FilterChipGroup … />  for each filter dimension  (radio or multi mode)
     └─ <MultiSelectDropdown … />  for large option sets
5. {showAdd && <QuickAddForm …>}                       inline create form
6. <EmptyState … />                                    no-data / no-results message
7. Grouped pages:
     <CollapseControls … />                            "Collapse all / Expand all"
     <GroupHeader … />                                 per group header with stock badges
     <ul className="space-y-2 ml-6">
       <ListItemCard href={…} … />                     per item row
     </ul>
8. Flat pages: just <ul> + <ListItemCard> without grouping
```
**Canonical reference**: `src/app/pantry/decoration/page.tsx` — copy this file when adding a new pantry list page.

### Detail page pattern (use every time you add a pantry detail page)
All detail pages follow the same read/edit structure. Do **not** leave fields permanently in edit mode.

```
1. Back link                         ← ArrowLeft, links to list page
2. Name row (always visible)
     <InlineNameEditor … />          pencil edits name only; saves immediately on blur
     Pencil button (top-right)       enters full edit mode for all other fields
3. Stock status panel (if entity has stock) — always directly below the name row,
     <StockStatusPanel … />          hidden only while editing (never buried at bottom)
4. Edit form  (shown when editing)
     Fields for all non-name properties
     Save / Cancel buttons
     Opens automatically on ?new=1; strips param after save/cancel via router.replace
5. Read-only view  (shown when !editing)
     Key-value card: <div className="rounded-lg border border-border bg-card divide-y divide-border">
     Notes (plain text paragraph if non-empty)
6. Delete section at very bottom (only in read mode)
     Confirmation panel with consequences + "Yes, delete" + Cancel
     router.replace to list after deletion
```
Escape key should cancel edit mode (or dismiss the delete confirmation).

## Design Principles
The full design system — palette, accent system, typography, geometry, focus, side-nav, contribution rules — lives in [`DESIGN.md`](DESIGN.md). Read it before making UI changes. Binding rules you need on hand:
- **Chrome is black + warm off-white**; per-section pastel accents color only CTAs and tabs via `bg-accent` / `text-accent-foreground`. Never hand-inline a color — use a token.
- **Tokens in [`src/app/globals.css`](src/app/globals.css)**: base (`--color-background` / `--color-foreground` / `--color-muted` / `--color-primary` / …), accent (`--color-accent` + `--color-accent-foreground`, rewired per-section), status (`--color-status-warn` / `-alert` / `-ok` + `-bg` / `-edge`), destructive (`--color-destructive`).
- **Accent routing** is one file: [`src/components/section-accent.tsx`](src/components/section-accent.tsx). To add a new section accent, add a token pair + `body[data-accent="…"]` rule in `globals.css` and one entry in `ROUTE_ACCENTS`.
- **Font**: Inter variable via `next/font` → `--font-sans`. Body tracking `-0.011em`, headings `-0.02em`, kerning on globally.
- **Geometry**: `rounded-full` for CTAs / tabs / chips / icon-only buttons; `rounded-lg` (8px) for cards and dialogs; `rounded-md` for form inputs. Prefer `.btn-primary` / `.btn-secondary` utilities (pill-shaped) over hand-rolled button classes.
- **Focus**: dashed 2px outline on buttons / links / `[role=button]`; solid 2px black border on inputs (dashed on a text field reads as "error").
- **Mono labels**: use the `.mono-label` utility for uppercase technical signposts (`ui-monospace`, `+0.06em` tracking).
- Dark mode intentionally disabled — app always renders in light mode.
- Layout: left-aligned, list-based, mobile-native — not centered SaaS dashboards.

## Input & Dropdown Patterns
Two distinct patterns — use the right one for the field type:

- **Free-text with suggestions** (`<input type="text" list="…">` + `<datalist>`): for open-ended string fields where the user may type anything but benefits from autocomplete based on existing records (e.g. manufacturer on ingredients, brand on moulds). Suggestions are derived dynamically from existing records — never stored as a separate settings list. Never use a `<select>` with a `__add__` escape hatch for these fields.
- **Closed categorical list** (`<select>`): for fixed enum-style values where the set of options is predefined and users should not enter arbitrary text (e.g. product type, coating). Options come from a `DEFAULT_*` constant or a settings-backed list only when the list is truly user-managed and bounded.

## Number Input Pattern
Never validate/clamp on every `onChange` keystroke for manually-edited number inputs — it blocks intermediate states (e.g. deleting a digit to retype it, entering a decimal point) and makes the field feel broken. Instead, use local string state while focused and commit on `onBlur`:

```tsx
const [inputStr, setInputStr] = useState<string | undefined>(undefined);

<input
  type="number"
  value={inputStr ?? committedValue}
  onChange={(e) => setInputStr(e.target.value)}
  onBlur={(e) => {
    const val = parseFloat(e.target.value);
    const clamped = isNaN(val) ? min : Math.max(val, min);
    onCommit(clamped);
    setInputStr(undefined);
  }}
/>
```

## Keyboard Interaction Principles
- **Keyboard-first**: all interactive flows must be completable without a mouse
- **Search dropdowns**: `↑`/`↓` to navigate, `Enter` to select highlighted item, `Escape` to dismiss
- **"Add new" shortcut**: press `n` anywhere on a detail/list page (when no input is focused) to open the add form
- **Escape to cancel**: any open inline form should close on `Escape`
- **`n` shortcut guard**: only fire when `event.target` is not `INPUT`, `TEXTAREA`, or `SELECT`
- Add `title="... (n)"` tooltip to Add buttons that support the shortcut

## Tech Stack
- **Next.js 16** with App Router, TypeScript, Tailwind CSS v4
- **React** (client components — most pages use `"use client"`)
- **Dexie.js** (`dexie` + `dexie-react-hooks` + `dexie-cloud-addon`) — IndexedDB, local-first; syncs via Dexie Cloud when logged in
- **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`) — drag-and-drop ingredient reordering
- **Lucide React** — icons
- **Vitest** — unit tests (node environment; run with `npm test`)
- **PWA** — `public/manifest.json` + `public/sw.js` for offline use

## Project Purpose
A chocolatier's toolkit for iPad/phone/laptop. Manages products, reusable fillings, ingredients, moulds, and production plans. No server — all data lives in the browser's IndexedDB.

## Terminology
The UI and code use **Product** (was Recipe/Bonbon) and **Filling** (was Layer) — the rename is complete. All references in this document use the new names; older external write-ups may still use the old terms.

## Key Terminology
- **Product** = a finished piece the chocolatier makes (e.g. a bonbon, bar, or truffle) — stored in the `products` table
- **Filling** = a standalone, reusable component of a product (ganache, praline, gel, etc.) — stored in the `fillings` table
- **ProductFilling** = join table — many-to-many between products and fillings; holds `fillPercentage` (0–100, must sum to 100 per product)
- **ShellDesignStep** = one decoration step on a moulded product (technique, colors, notes, applyAt)
- **ProductionPlan** = a batch run: one or more products, each with a mould and quantity
- **PlanProduct** = join table between plan and product; holds mouldId, quantity, notes
- **PlanStepStatus** = completion flag per step key within a plan

## Data Model (`src/types/index.ts`)
```
DecorationMaterial  id, name, type ("cocoa_butter" | "lustre_dust" | "chocolate" | "transfer_sheet" | "other"),
               cocoaButterType? ("Type A" | "Type B" | "Type C" | "Type D"; only relevant when type === "cocoa_butter"),
               color (CSS hex for swatch),
               manufacturer?, vendor?, source?,  notes?,
               lowStock?, lowStockSince? (Date.now()), lowStockOrdered?,
               outOfStock? (sets lowStock: true when flagged)

Ingredient     id, name, manufacturer, brand?, vendor?, source, cost, notes, category,
               purchaseCost, purchaseQty, purchaseUnit, gramsPerUnit,
               cacaoFat, sugar, milkFat, water, solids, otherFats, alcohol? (sum must = 100%),
               allergens: string[] (values: "gluten" | "lactose" | "nuts"),
               archived? (soft-delete: hidden from lists, preserved for production history),
               pricingIrrelevant? (true = no meaningful cost e.g. water/salt; costPerGram returns 0, suppresses missing-pricing warnings),
               lowStock?, lowStockSince? (Date.now()), lowStockOrdered?,
               outOfStock? (completely out; sets lowStock: true when flagged),
               shellCapable? (shown only for category "Chocolate"; drives the shell ingredient picker),
               nutrition? (NutritionData — all values per 100g: energyKj, energyKcal, fat, saturatedFat,
                 transFat, cholesterolMg, carbohydrate, sugars, addedSugars, fibre, protein,
                 sodium, salt, vitaminDMcg, calciumMg, ironMg, potassiumMg)

Product         id, name, source, photo (base64), popularity (1–5),
               productCategoryId? (FK → ProductCategory.id; replaces the legacy free-text productType),
               coating (@deprecated — legacy coating name, kept for backward compat),
               shellIngredientId? (FK → Ingredient.id, must have shellCapable=true),
               shellPercentage? (0–100, bounded by category's range, default = category's defaultShellPercent),
               tags, notes, shelfLifeWeeks,
               defaultMouldId, defaultBatchQty,
               shellDesign: ShellDesignStep[],
               vegan? (user-set flag),
               lowStockThreshold? (pieces below which the production wizard flags this product as
                 "low stock" — compared against sum of currentStock across in-stock batches;
                 when unset, wizard falls back to the legacy per-batch stockStatus flag),
               stockCountedAt? (ms timestamp of the most recent manual stock count),
               archived? (soft-delete: hidden from lists, preserved for production history),
               createdAt, updatedAt

IngredientCategory  id, name, archived?, createdAt, updatedAt
                 — configurable list. Seeded from DEFAULT_INGREDIENT_CATEGORIES (Alcohol,
                   Chocolate, Essential Oils, Extra, Fats, Flavors & Additives, Infusions,
                   Liquids, Nuts / Nut Pastes / Pralines, Sugars). Ingredient.category stores
                   the category name as the link key; renames cascade to all ingredients via
                   saveIngredientCategory. The "Chocolate" category is protected — it cannot
                   be deleted because it is required for shell ingredient selection.

ProductCategory  id, name, shellPercentMin (0–100), shellPercentMax (0–100, must be ≥ min),
                 defaultShellPercent (0–100, must lie in [min, max]),
                 archived?, createdAt, updatedAt
                 — top-level grouping for products. Seeded with "moulded" (15–50, default 37)
                   and "bar" (0–100, default 50). Bar-like UI behaviour (allowing 0% or 100%
                   shell) is implicit from the range — see lib/productCategories.ts.

DecorationCategory  id, name, slug (machine key matching DecorationMaterial.type),
                 archived?, createdAt, updatedAt
                 — configurable material types. Seeded from DECORATION_MATERIAL_TYPES
                   (cocoa_butter, lustre_dust, chocolate, transfer_sheet, other).

ShellDesign      id, name, defaultApplyAt? ("colour" | "shell" | "fill" | "cap" | "unmould"),
                 archived?, createdAt, updatedAt
                 — configurable decoration techniques. Seeded from SHELL_TECHNIQUES.
                   defaultApplyAt determines which production phase the step appears in.
                   Legacy values "on_mould" → "colour", "after_cap" → "cap" (use `normalizeApplyAt()`).

ShellDesignStep  technique (string, matches ShellDesign.name), materialIds: string[] (refs to DecorationMaterial.id), notes?,
               applyAt? (ShellDesignApplyAt; default from ShellDesign.defaultApplyAt) — transfer_sheet materials always apply at cap regardless

Filling          id, name, category, source, description, allergens (auto-aggregated),
               instructions, status (free-text; default suggestions: "to try", "testing", "confirmed"),
               rootId? (points to v1.id once any fork is made),
               version? (1-indexed; undefined = unforked legacy record),
               createdAt?, supersededAt? (set when a newer version is forked),
               versionNotes? (describes what changed in this version),
               archived? (soft-delete: hidden from lists, preserved for production history)

FillingCategory  id, name, shelfStable (when true the production wizard prompts for a
                 batch multiplier instead of fill-scaling the recipe), archived?, createdAt, updatedAt
                 — configurable list. Seeded via DEFAULT_FILLING_CATEGORIES (Ganaches,
                   Pralines, Caramels, Fruit-Based, Croustillants — Pralines + Fruit-Based
                   default to shelfStable=true). Filling.category stores the category name
                   as the link key; renames cascade to all fillings via saveFillingCategory.

ProductFilling    id, productId, fillingId, sortOrder,
               fillPercentage (0–100, must sum to 100 per product)

FillingIngredient  id, fillingId, ingredientId, amount, unit (always "g"), sortOrder

ProductFillingHistory  id, productId, fillingId (old version), replacedByFillingId (new version),
                    fillPercentage, sortOrder, replacedAt

IngredientPriceHistory  id, ingredientId, costPerGram, recordedAt, purchaseCost?, purchaseQty?,
                        purchaseUnit?, gramsPerUnit?, note?

CoatingChocolateMapping  id, coatingName, ingredientId (must be category "Chocolate"),
                         effectiveFrom, note?

ProductCostSnapshot  id, productId, costPerProduct, breakdown (JSON: BreakdownEntry[]),
                    recordedAt, triggerType ("ingredient_price" | "filling_version" |
                    "mould_change" | "coating_change" | "shell_change" | "manual"),
                    triggerDetail, mouldId?, coatingName?

UserPreferences  id, marketRegion ("EU"|"UK"|"US"|"AU"), currency (CurrencyCode),
               defaultFillMode ("percentage"|"grams"), facilityMayContain: string[],
               coatings: string[], updatedAt
               — single-record table; syncs across devices via Dexie Cloud

Mould          id, name, productNumber, brand, cavityVolumeMl, numberOfCavities,
               fillingGramsPerCavity, quantityOwned, photo (base64), notes?,
               archived? (soft-delete: hidden from lists, preserved for products/plans that reference it)

Packaging      id, name, capacity (products per unit), manufacturer?, notes?,
               createdAt, updatedAt,
               archived? (soft-delete: hidden from lists, preserved for collections that reference it),
               lowStock?, lowStockSince? (Date.now()), lowStockOrdered?,
               outOfStock? (completely out; sets lowStock: true when flagged)

ShoppingItem   id, name, category? (from SHOPPING_ITEM_CATEGORIES), note?,
               addedAt (Date.now()), orderedAt? (set when marked ordered)

Collection     id, name, description?, startDate (ISO string), endDate? (ISO string; none = ongoing),
               notes?, createdAt, updatedAt

CollectionProduct  id, collectionId, productId, sortOrder

CollectionPackaging  id, collectionId, packagingId, sellPrice (retail price for box),
                     notes?, createdAt, updatedAt

CollectionPricingSnapshot  id, collectionId, packagingId,
                           avgProductCost, packagingUnitCost, totalCost, sellPrice, marginPercent,
                           recordedAt, triggerType ("sell_price_change" | "ingredient_price" |
                           "coating_change" | "packaging_cost" | "manual"), triggerDetail

PackagingOrder id, packagingId, quantity (units ordered), pricePerUnit,
               supplier?, orderedAt, notes?

ProductionPlan id, name, status (draft|active|done), notes,
               batchNumber (YYYYMMDD-NNN, assigned on creation, never changes),
               fillingOverrides (JSON: Record<fillingId, multiplier>),
               batchSummary (plain-text snapshot for recall tracing),
               createdAt, updatedAt, completedAt

PlanProduct     id, planId, productId, mouldId, quantity (number of moulds), sortOrder, notes,
               stockStatus? ("low" | "gone"; undefined = in stock),
               actualYield? (products added to stock after unmoulding; default = quantity × cavities),
               currentStock? (pieces remaining in this batch; defaults to actualYield until
                 updateProductStockCount reconciles a manual count FIFO across batches),
               frozenQty? (pieces in the freezer — tracked separately from currentStock;
                 do NOT count toward available stock or low-stock alerts),
               frozenAt? (ms timestamp of most recent freeze),
               preservedShelfLifeDays? (days of shelf life captured at freeze time;
                 user-editable in the FreezeModal — applied from defrostedAt once thawed),
               defrostedAt? (ms timestamp of most recent defrost; sell-by becomes
                 defrostedAt + preservedShelfLifeDays for the defrosted portion)

PlanStepStatus id, planId, stepKey, done, doneAt

Experiment     id, name, ganacheType ("dark"|"milk"|"white"),
               applicationType ("moulded"|"coated"),
               notes?, sourceFillingId? (if cloned from a filling),
               rootId? (points to v1.id once any fork is made),
               version? (1-indexed; undefined = unforked),
               supersededAt? (set when a newer version is forked),
               status? ("to_improve" | "promoted"; undefined = in-progress),
               promotedFillingId? (filling created on promotion),
               tasteFeedback?, textureFeedback? (1–5 ratings from test batch),
               batchNotes? (free-text notes from test batch),
               createdAt, updatedAt

ExperimentIngredient  id, experimentId, ingredientId, amount (grams), sortOrder

FillingStock     id, fillingId, remainingG (grams left), planId? (production plan that created it),
               madeAt (ISO date), notes?, createdAt (Date.now()),
               frozen? (true = in the freezer — not usable without defrosting),
               frozenAt? (ms timestamp of most recent freeze),
               preservedShelfLifeDays? (captured at freeze time; applied from defrostedAt),
               defrostedAt? (ms timestamp of most recent defrost)
```

### PlanStepStatus key formats
```
"color-{planProductId}"               — fallback colour step (no shellDesign on product)
"color-{planProductId}-{stepIndex}"   — per-design-step colour (when shellDesign is set)
"shell-{planProductId}"               — shell chocolate for one product entry
"filling-{fillingId}"                    — make a filling (consolidated: one step per unique filling, shared fillings show combined weight)
                                       Legacy: "filling-{planProductId}-{fillingId}" — old per-product key; statusMap fallback lookup maps these to the new key
"fill-{planProductId}"                — fill shells for a product
"cap-{planProductId}"                 — cap mould (label changes to "Cap using transfer sheet: …" when product has transfer sheet steps)
"cap-after-{planProductId}-{stepIndex}" — decoration step applied after capping (applyAt === "after_cap")
"unmould-{planProductId}"             — unmould after crystallisation
```

## Database (`src/lib/db.ts`)
- Dexie DB named `"ChocolatierDB"`, currently **version 6** (v2 adds the `productCategories` table and `productCategoryId` FK on Product, replacing the legacy free-text `productType` string; v3 marks Chocolate ingredients as `shellCapable`, back-fills `shellIngredientId` from `CoatingChocolateMapping`, and sets `shellPercentage=37`; v4 adds `decorationCategories` and `shellDesigns` tables, seeded from the formerly hardcoded constants, plus `userPreferences` table to replace the old device-local `settings` key-value store — all preferences now sync across devices via Dexie Cloud; v5 adds the `fillingCategories` table with a per-category `shelfStable` boolean, replacing the hardcoded `SHELF_STABLE_CATEGORIES` constant — categories are seeded from `DEFAULT_FILLING_CATEGORIES` plus one record per unique legacy `Filling.category` string; v6 adds the `ingredientCategories` table, replacing the hardcoded `INGREDIENT_CATEGORIES` constant — categories are seeded from `DEFAULT_INGREDIENT_CATEGORIES` plus one record per unique legacy `Ingredient.category` string).
- All entity IDs are **string UUIDs** (custom-generated via `newId()`). The legacy `settings` table (key-value, `key` as primary key) is kept in the schema for backward-compatible backup import but is no longer written to — all preferences are stored in the `userPreferences` table which has a proper UUID `id` and syncs via Dexie Cloud.
- When adding new fields to existing tables: bump the version and add a migration. **Also bump `CURRENT_DEXIE_VERSION` in `src/lib/upgrade-snapshot.ts`** so the pre-upgrade snapshot runs before the new migration. The constants are kept in sync by hand (importing `db` from the snapshot module would create a circular open).
- On every app boot, `src/lib/upgrade-snapshot.ts` is dynamically imported from `db.ts` before any table access. If the stored IDB version is behind `CURRENT_DEXIE_VERSION * 10`, it peeks at the on-disk DB and downloads a recovery snapshot before the real `db` opens and runs `.upgrade()` hooks. See "Data-loss protections" under Backup / Restore for details.
- Indexes: `fillings` is indexed on `name, category, subcategory, rootId`; `productCategories` is indexed on `name, archived`; `fillingCategories` is indexed on `name, archived`; `ingredientCategories` is indexed on `name, archived`; `decorationCategories` is indexed on `slug, name, archived`; `shellDesigns` is indexed on `name, archived`
- The v1→v2 upgrade hook walks every product, creates a category record per unique legacy `productType` string (always seeding `moulded` + `bar`), and back-fills `productCategoryId`. Fresh users skip the upgrade hook entirely; for them, `ensureDefaultProductCategories()` runs from the seed loader on every page load to seed the two defaults idempotently.
- The v4→v5 upgrade hook seeds `fillingCategories` from `DEFAULT_FILLING_CATEGORIES` (Ganaches, Pralines, Caramels, Fruit-Based, Croustillants — Pralines + Fruit-Based default to `shelfStable=true` to preserve the prior hardcoded behavior) and back-fills one record per unique non-default `Filling.category` string. Fresh users get the same seed via `ensureDefaultFillingCategories()` from the seed loader.
- `Filling.category` continues to store the category **name** as a string (the link key — same approach as decoration categories). Renaming a category cascades to every filling that referenced the old name (handled inside `saveFillingCategory`).
- `Ingredient.category` continues to store the category **name** as a string (link key). Renaming a category cascades to every ingredient that referenced the old name (handled inside `saveIngredientCategory`). The "Chocolate" category is protected and cannot be deleted.
- The v5→v6 upgrade hook seeds `ingredientCategories` from `DEFAULT_INGREDIENT_CATEGORIES` (Alcohol, Chocolate, Essential Oils, Extra, Fats, Flavors & Additives, Infusions, Liquids, Nuts / Nut Pastes / Pralines, Sugars) and back-fills one record per unique non-default `Ingredient.category` string. Fresh users get the same seed via `ensureDefaultIngredientCategories()` from the seed loader.
- Tables: `ingredients`, `products`, `productCategories`, `fillings`, `fillingCategories`, `ingredientCategories`, `productFillings`, `fillingIngredients`, `moulds`, `productionPlans`, `planProducts`, `planStepStatus`, `settings` (legacy, kept for backup compat), `userPreferences`, `productFillingHistory`, `ingredientPriceHistory`, `coatingChocolateMappings`, `productCostSnapshots`, `experiments`, `experimentIngredients`, `packaging`, `packagingOrders`, `shoppingItems`, `collections`, `collectionProducts`, `collectionPackagings`, `collectionPricingSnapshots`, `decorationMaterials`, `decorationCategories`, `shellDesigns`, `fillingStock`

## All Data Operations (`src/lib/hooks.ts`)
Single file for all hooks and mutations. Pattern:
- `useFoo()` / `useFoo(id)` — `useLiveQuery` wrappers (reactive)
- `saveFoo(obj)` — upsert (checks for `obj.id`)
- `deleteFoo(id)` — cascades to related tables

Product stock counts: `useProductStockTotals()` → `Map<productId, { currentStock, lastCountedAt? }>` aggregated across non-"gone" batches from completed plans; `updateProductStockCount(productId, newTotal)` reconciles a manual count FIFO across in-stock batches (deducts from oldest first when total drops, adds to newest when it rises), stamps `stockCountedAt`. `useProductStockAlerts()` prefers `lowStockThreshold` vs. aggregated `currentStock` over the legacy per-batch `stockStatus` flag when the threshold is set.

Key functions: `useIngredients`, `useShellCapableIngredients()` (filtered list: `category === "Chocolate" && shellCapable === true`), `useFilling`, `saveFilling`, `deleteFilling`, `useProductFillings`, `addFillingToProduct`, `removeFillingFromProduct`, `reorderProductFillings` (updates `sortOrder` on a reordered ProductFilling list; used by drag-and-drop on the product detail page), `useFillingIngredients`, `updateFillingAllergens`, `useProductionPlans`, `saveProductionPlan`, `deleteProductionPlan`, `usePlanProducts`, `savePlanProduct`, `usePlanStepStatuses`, `useAllPlanStepStatuses()` (aggregate hook: every step status across every plan; use on list pages instead of N per-plan subscriptions), `toggleStep`, `useCoatings`, `addCoating`, `setPlanProductStockStatus(id, status)` (sets stockStatus on a PlanProduct: "low" | "gone" | undefined), `archiveProduct(id)` (soft-delete for produced products), `unarchiveProduct(id)` (restores archived product to active), `archiveFilling(id)` (soft-delete for produced fillings), `unarchiveFilling(id)` (restores archived filling to active), `getFillingArchiveImpact(fillingId)` (returns `{ soleFillingProducts, multiFillingProducts }` — classifies affected products by impact), `archiveFillingWithCleanup(fillingId, { archiveSoleProducts, removeFromMultiProducts })` (archives filling + optionally archives sole-filling products and removes from multi-filling products with fill % redistribution), `hasProductBeenProduced(productId)`, `hasFillingBeenProduced(fillingId)` (true if any product using this filling has been produced), `getFillingDeleteImpact(fillingId)` (returns `{ soleFillingProducts, multiFillingProducts }` — classifies affected products by filling count), `deleteFillingWithCleanup(fillingId, { removeOrphanedProducts, archivableProductIds })` (removes from multi-filling products with fill % redistribution, archives produced sole-filling products, optionally deletes unproduced sole-filling products, then deletes the filling), `getOrphanedProductsOnFillingDelete(fillingId)`, `duplicateFilling(fillingId)` (copies filling with ingredients; no product associations), `duplicateProduct(productId, { duplicateFillings })` (copies product; if `duplicateFillings` is true each filling is also duplicated as an independent copy)

`useFillings(includeArchived?)` accepts an optional boolean (default `false`) to include archived fillings.
`useAllFillingStatuses()` returns all unique status strings across all fillings (for datalist suggestions).

Market / compliance: `useMarketRegion()` → `"EU" | "UK" | "US" | "AU" | "CA"` (reads from `userPreferences`, default `"EU"`); `setMarketRegion(region)` → persists choice. Controls which allergen checklist is shown in the ingredient form: `EU_ALLERGENS` (14, FIC 1169/2011), `UK_ALLERGENS` (same 14, Assimilated FIC + Natasha's Law), `US_ALLERGENS` (9, FALCPA + FASTER Act), `AU_ALLERGENS` (AU/NZ PEAL — no celery/lupin/mustard, mandatory "Contains:" summary), `CA_ALLERGENS` (Health Canada / CFIA — 11 priority allergens with wheat and gluten sources declared separately, each tree nut named individually, no celery/lupin, no bold emphasis required; bilingual EN/FR labels mandatory once label printing is built). `MARKET_LABEL_RULES` provides per-market metadata (regulation name, label format requirements). `useFacilityMayContain()` → `string[]` (facility-level cross-contamination allergen IDs, default `[]`); `setFacilityMayContain(allergens)` → persists. All preferences live in the `userPreferences` table and sync across devices via Dexie Cloud.

Currency: `useCurrency()` → `CurrencyCode` (reads from `userPreferences`, default `"EUR"`); `setCurrency(code)` → persists choice. Supported codes: `"EUR" | "USD" | "CAD" | "GBP" | "CHF"`. Use `getCurrencySymbol(code)` from `@/types` to get the display symbol (e.g. `"€"`, `"$"`, `"CA$"`). All price formatting functions (`formatCost`, `formatPrice`, `costDelta`) accept an optional `currencySymbol` parameter — pass `getCurrencySymbol(useCurrency())` in UI components.

`useProductsList(includeArchived?)` accepts an optional boolean (default `false`) to include archived products.
`useIngredients(includeArchived?)` accepts an optional boolean (default `false`) to include archived ingredients.

Ingredient protection: `checkIngredientBeforeDelete(ingredientId)` → `{ activeFillings, produced }`, `archiveIngredient(id)`, `unarchiveIngredient(id)`

Moulds: `useMoulds(includeArchived?)`, `useMould(id)`, `saveMould(obj)`, `deleteMould(id)`, `archiveMould(id)`, `unarchiveMould(id)`, `isMouldInUse(id)` (true if referenced by products or production plans)

Product Lab: `useExperiments()` (non-superseded only), `useExperiment(id)`, `saveExperiment(obj)`, `deleteExperiment(id)`, `forkExperimentVersion(id)` (supersedes current version, creates new one with ingredients copied), `useExperimentIngredients(experimentId)`, `saveExperimentIngredient(obj)`, `deleteExperimentIngredient(id)`

Packaging: `usePackagingList(includeArchived?)`, `usePackaging(id)`, `savePackaging(obj)`, `deletePackaging(id)` (cascades orders), `archivePackaging(id)`, `unarchivePackaging(id)`, `isPackagingInUse(id)` (true if referenced by collections), `usePackagingOrders(packagingId)`, `useAllPackagingOrders()`, `useAllPackagingSuppliers()`, `savePackagingOrder(obj)`, `deletePackagingOrder(id)`

Collections: `useCollections()`, `useCollection(id)`, `saveCollection(obj)`, `deleteCollection(id)` (cascades collectionProducts + collectionPackagings), `useCollectionProducts(collectionId)`, `addProductToCollection(collectionId, productId)`, `removeProductFromCollection(id)`

Collection Packagings: `useCollectionPackagings(collectionId)`, `useAllCollectionPackagings()`, `saveCollectionPackaging(obj)`, `deleteCollectionPackaging(id)`

Collection Pricing History: `useCollectionPricingSnapshots(collectionId)` — all snapshots newest-first; `saveCollectionPricingSnapshot(obj)` — record a new snapshot (called on sell-price change, recalculate button)

Shopping list: `useShoppingItems()`, `usePendingShoppingCount()` (badge count), `saveShoppingItem(obj)`, `markShoppingItemOrdered(id)`, `deleteShoppingItem(id)`, `setIngredientLowStock(id, bool)`, `setIngredientOutOfStock(id, bool)`, `markIngredientOrdered(id)`, `unorderIngredient(id)` (moves back to pending), `setPackagingLowStock(id, bool)`, `markPackagingOrdered(id)`, `unorderPackaging(id)` (moves back to pending)

Decoration materials: `useDecorationMaterials()`, `useDecorationMaterial(id)`, `useDecorationMaterialUsage(materialId)`, `useDecorationMaterialUsageCounts()` (aggregate `Map<materialId, productCount>` — use on list pages instead of N per-row subscriptions), `useAllDecorationManufacturers()`, `useAllDecorationVendors()`, `useAllDecorationSources()`, `saveDecorationMaterial(obj)`, `deleteDecorationMaterial(id)`, `archiveDecorationMaterial(id)`, `unarchiveDecorationMaterial(id)`, `setDecorationMaterialLowStock(id, bool)`, `setDecorationMaterialOutOfStock(id, bool)`, `markDecorationMaterialOrdered(id)`, `unorderDecorationMaterial(id)`

Decoration categories: `useDecorationCategories(includeArchived?)` (sorted by name), `useDecorationCategory(id)`, `useDecorationCategoryMap()` (reactive `Map<slug, DecorationCategory>`), `useDecorationCategoryLabels()` (reactive `Map<slug, label>` — replaces the old `DECORATION_MATERIAL_TYPE_LABELS` constant), `useDecorationCategoryUsageCounts()` (`Map<slug, count>` of active materials per category), `saveDecorationCategory(obj)`, `deleteDecorationCategory(id)`, `archiveDecorationCategory(id)`, `unarchiveDecorationCategory(id)`, `ensureDefaultDecorationCategories()` (idempotent — seeds from `DEFAULT_DECORATION_CATEGORIES` if empty)

Shell designs: `useShellDesigns(includeArchived?)` (sorted by name), `useShellDesign(id)`, `useShellDesignUsage(designName)` (products using this technique), `saveShellDesign(obj)`, `deleteShellDesign(id)`, `archiveShellDesign(id)`, `unarchiveShellDesign(id)`, `ensureDefaultShellDesigns()` (idempotent — seeds from `DEFAULT_SHELL_DESIGNS` if empty)

Product categories: `useProductCategories(includeArchived?)` (sorted by name), `useProductCategory(id)`, `useProductCategoryMap()` (reactive `Map<categoryId, ProductCategory>` for fast list lookups), `useProductCategoryUsage(categoryId)` (active products using this category), `useProductCategoryUsageCounts()` (`Map<categoryId, count>`), `saveProductCategory(obj)` (validates the range via `validateCategoryRange` — throws on invalid input), `archiveProductCategory(id)`, `unarchiveProductCategory(id)`, `deleteProductCategory(id)` (refuses if any product still references it — UI must call `useProductCategoryUsage` first and offer Archive instead), `ensureDefaultProductCategories()` (idempotent — seeds `moulded` + `bar` if the table is empty; called from the seed loader on every page load).

Filling categories: `useFillingCategories(includeArchived?)` (sorted by name), `useFillingCategory(id)`, `useFillingCategoryMap()` (reactive `Map<name, FillingCategory>`), `useShelfStableCategoryNames()` (reactive `Set<string>` of category names where `shelfStable === true` — pass to `calculateFillingAmounts`), `useFillingCategoryUsage(name)` (count of active fillings using this category by name), `useFillingCategoryUsageCounts()` (`Map<name, count>`), `saveFillingCategory(obj)` (renames cascade to all `Filling.category` references), `archiveFillingCategory(id)`, `unarchiveFillingCategory(id)`, `deleteFillingCategory(id)` (throws when any filling still uses it — UI calls `useFillingCategoryUsage` first and offers Archive instead), `ensureDefaultFillingCategories()` (idempotent — seeds `DEFAULT_FILLING_CATEGORIES` if the table is empty; called from the seed loader on every page load).

Ingredient categories: `useIngredientCategories(includeArchived?)` (sorted by name), `useIngredientCategory(id)`, `useIngredientCategoryNames()` (reactive list of non-archived category name strings — used by the ingredient form select and list page grouping), `useIngredientCategoryUsage(categoryName)` (non-archived ingredients using this category by name), `useIngredientCategoryUsageCounts()` (`Map<name, count>`), `saveIngredientCategory(obj)` (renames cascade to all `Ingredient.category` references), `archiveIngredientCategory(id)`, `unarchiveIngredientCategory(id)`, `deleteIngredientCategory(id)` (throws when any ingredient still uses it or when attempting to delete "Chocolate" — UI calls `useIngredientCategoryUsage` first and offers Archive instead), `ensureDefaultIngredientCategories()` (idempotent — seeds `DEFAULT_INGREDIENT_CATEGORIES` if the table is empty; called from the seed loader on every page load).

Filling stock (leftover filling): `useFillingStockItems()` (all entries with remaining > 0, including frozen), `useFillingStockForFilling(fillingId)`, `saveFillingStock(obj)`, `adjustFillingStock(id, remainingG)`, `discardFillingStock(id)` (zeros out), `deductFillingStock(fillingId, gramsNeeded, { includeFrozen? })` (FIFO deduction, available-first then frozen when opted in; any frozen entry touched is implicitly defrosted — `frozen=false` + `defrostedAt` stamped), `freezeFillingStock(id, preservedShelfLifeDays, qty?)` (sets `frozen=true` + `frozenAt`; when `qty` < entry's remainingG the row is split into a frozen portion and an available leftover), `defrostFillingStock(id)` (clears frozen + stamps `defrostedAt`)

Product freezer: `freezePlanProduct(id, qty, preservedShelfLifeDays)` (moves pieces from `currentStock` to `frozenQty`; clamped to available), `defrostPlanProduct(id)` (moves `frozenQty` back to `currentStock`, stamps `defrostedAt`, clears the gone flag). `useProductStockAlerts()` and `useProductStockTotals()` exclude `frozenQty` — frozen pieces do NOT count toward available stock or low-stock alerts. `updateProductStockCount` skips fully-frozen batches so manual counts don't accidentally un-freeze anything. The product detail **Batches tab** renders a "Frozen" status pill when a batch is fully frozen, and a `❄ N frozen` sub-pill alongside the "In stock" pill for partial freezes.

Production wizard — frozen filling stock: `FillingPreviousBatch.includeFrozen` (opt-in toggle per filling; defaults to false, pre-checked when only frozen stock exists). When enabled, the wizard treats `available + frozen` as the effective stock pool for the `stockCoversAll` / shortfall math; at fill-step time `deductFillingStock` passes the flag through, consuming available first and then frozen (implicit defrost).

Cost tracking: `useIngredientPriceHistory(ingredientId)`, `useCoatingChocolateMappings()`, `useCurrentCoatingMappings()`, `saveCoatingChocolateMapping(coatingName, ingredientId, note?)`, `useProductCostSnapshots(productId)`, `useLatestProductCostSnapshot(productId)`, `computeAndSaveProductCostSnapshot({productId, triggerType, triggerDetail})`, `recalculateProductCost(productId)`

Auto-triggers: `saveIngredient` detects price field changes → logs to `ingredientPriceHistory` + triggers snapshots for affected products. `saveProduct` detects `defaultMouldId`, `shellIngredientId`, and `shellPercentage` changes → triggers snapshot (`"shell_change"` for the latter two). `forkFillingVersion` triggers snapshots for all affected products post-fork. `saveCoatingChocolateMapping` triggers snapshots for all products with matching coating.

Filling versioning: `useFillingVersionHistory(fillingId)` — all versions in the same chain; `getFillingForkImpact(fillingId)` — async, returns products currently using the filling (for confirmation UI); `forkFillingVersion(fillingId, versionNotes?)` — archives current, creates new version, copies ingredients, updates all ProductFillings, logs to productFillingHistory; `useProductFillingHistory(productId)` — enriched swap history newest-first

`useFillings()` only returns non-superseded (current) fillings. Superseded fillings remain in the DB for history queries.

## Filling Categories (`fillingCategories` table, managed via the Categories tab on `/fillings`)
Seeded with 5 categories (`DEFAULT_FILLING_CATEGORIES` in `src/types/index.ts`); all are user-editable via the Categories tab on the Fillings page:
1. **Ganaches (Emulsions)** — shelfStable=false
2. **Pralines & Giandujas (Nut-Based)** — shelfStable=true
3. **Caramels & Syrups (Sugar-Based)** — shelfStable=false
4. **Fruit-Based (Pectins & Acids)** — shelfStable=true
5. **Croustillants & Biscuits (The "Crunch" Filling)** — shelfStable=false

The `shelfStable` flag drives production-wizard scaling: when set, the wizard asks for a batch multiplier instead of scaling the recipe to fit the moulds. Use `useShelfStableCategoryNames()` from `@/lib/hooks` to read the live `Set<string>` of names; pass it to `calculateFillingAmounts` as the 10th argument. The legacy `SHELF_STABLE_CATEGORIES` constant in `src/types/index.ts` is kept only as a fallback for tests / pre-migration code.

**Leftover filling auto-prompt** fires for **all** filling categories regardless of `shelfStable` — users can register leftovers from any filling after the fill step (the production-date field tracks freshness for non-shelf-stable categories).

## Production Planning (`src/lib/production.ts`)
Key exports and constants:
- `FILL_FACTOR = 0.63` — shell ≈ 30% + cap ≈ 7% of cavity volume; 63% left for filling (default; overridden per-product when `shellPercentage` is set)
- `DENSITY_G_PER_ML = 1.2` — assumed ganache density
- `calculateFillingAmounts(planProducts, productNames, productFillingsMap, fillingIngredientsMap, fillingsMap, moulds, fillingOverrides, fillingPreviousBatches?, productsMap?, shelfStableCategoryNames?)` — returns `FillingAmount[]` per planProduct; fill-scaled or multiplier-based depending on category. Optional `productsMap` enables per-product fill factor derived from `shellPercentage`. Optional `shelfStableCategoryNames` is a `Set<string>` of category names to treat as shelf-stable (callers should pass `useShelfStableCategoryNames()` from hooks; falls back to the legacy `SHELF_STABLE_CATEGORIES` constant when omitted)
- `consolidateSharedFillings(fillingAmounts)` — merges `FillingAmount[]` into `ConsolidatedFilling[]`: one entry per unique filling, weights summed, ingredients aggregated, `shared` flag + `usedBy` breakdown
- `SHELL_FACTOR = 0.30`, `CAP_FACTOR = 0.07` (@deprecated — kept as exports for backward compat; replaced by per-product `shellPercentage`)
- `scheduleColorSteps(tasks)` — greedy algorithm to minimise cocoa butter colour switches; respects within-product step order
- `generateSteps(planProducts, ...)` — emits ordered `ProductionStep[]`; filling steps are consolidated per unique filling (shared fillings = one step with combined weight); colour steps come from `scheduleColorSteps`; step key for fillings is `filling-{fillingId}` (backward compat: legacy `filling-{planProductId}-{fillingId}` keys are still matched in status lookup)
- `generateBatchSummary(params)` — plain-text snapshot for recall tracing, includes "FILLINGS PREPARED" section showing shared fillings with per-product breakdown

## Product Categories (`src/lib/productCategories.ts`)
Pure helpers for the `productCategories` table — no React, no IndexedDB. Used by both the detail page form and the upgrade-time validation in `saveProductCategory`.
- `validateCategoryRange({ shellPercentMin, shellPercentMax, defaultShellPercent })` — returns `{ valid, errors[] }`. Enforces 0–100 bounds, min ≤ max, and default within `[min, max]`.
- `categoryAllowsZeroShell(category)` — `true` when `shellPercentMin === 0` (e.g. bean-to-bar can hide the shell ingredient).
- `categoryAllowsFullShell(category)` — `true` when `shellPercentMax === 100` (e.g. plain bar can hide the layers section).
- `clampShellPercentToCategory(value, category)` — clamps a shell % into the category's allowed range.
- `formatCategoryRange(category)` — display string like `"15%–50%"`.

Bar-like UI behaviour is implicit from the range — there is no explicit "kind" enum on a category. Pages that need to know whether to show/hide the shell or layers section call `categoryAllowsZeroShell`/`categoryAllowsFullShell`.

## Collection Pricing (`src/lib/collectionPricing.ts`)
Pure pricing/margin calculations for collection profitability:
- `latestPackagingUnitCost(orders)` — most recent unit cost from order history
- `averageProductCost(costs)` — average product cost across a list
- `calculateBoxCost(avgProductCost, capacity, packagingUnitCost)` — total cost to fill one box
- `calculateBoxPricing(avgProductCost, capacity, packagingUnitCost, sellPrice)` — full pricing breakdown (cost, revenue, margin)
- `marginHealth(marginPercent)` — returns health category for a given margin %
- `marginDelta(current, previous)` — change in margin % points between two snapshots; returns `{ value, label, improved }`
- `formatPrice(amount)` — locale-aware price formatting
- `formatMarginPercent(percent)` — formatted margin % string

## Nutrition Tracking (`src/lib/nutrition.ts`)
Per-ingredient nutrition data entry (values per 100g) and per-product aggregation. Supports four target markets with different mandatory nutrient sets:
- **EU / UK** — FIC 1169/2011: energy (kJ+kcal), fat, saturates, carbohydrate, sugars, protein, salt
- **US** — FDA Nutrition Facts: adds trans fat, cholesterol, added sugars, fibre, vitamin D, calcium, iron, potassium + %DV column
- **AU** — FSANZ NIP: energy (kJ only), protein, fat, saturated fat, carbohydrate, sugars, sodium

Key exports:
- `getNutrientsByMarket(market)` — returns `NutrientDef[]` with labels, units, mandatory flag, daily values
- `getNutritionPanelTitle(market)` — market-specific panel name
- `ALL_NUTRIENT_FIELDS` — superset of all nutrients for the edit form
- `fillDerivedNutrition(data)` — auto-fills kJ↔kcal and salt↔sodium
- `aggregateNutrition(entries)` — weighted aggregation across ingredients → per-100g result
- `scaleToServing(per100g, servingG)` — scales to a specific serving size
- `formatNutrientValue(value, unit)` — display formatting
- `percentDailyValue(value, dailyValue)` — %DV calculation (US)
- `hasNutritionData(nutrition)` / `getMissingMandatoryNutrients(nutrition, market)` — completeness checks

Nutrition data is stored as an optional `nutrition?: NutritionData` field on `Ingredient`. No new DB table — the field is included in backup automatically via full-object round-trip.

## Seed Data (`public/seed/`, `src/lib/seed.ts`)
- CSV files auto-loaded on first visit via `src/components/seed-loader.tsx`
- `localStorage` key `"chocolatier-seeded"` prevents re-seeding
- Files: `ingredients.csv`, `moulds.csv`, `decorations.csv`, `packaging.csv` — header-only templates. These double as the import templates for the upcoming "Load CSV" feature; `seedIfNeeded()` runs `seedIngredients` + `seedMoulds` and no-ops on empty files. Products, fillings, and their joins are app-only (no CSV import path).
- To re-seed during dev: clear `localStorage` and IndexedDB in browser devtools

## File Structure

Routes are split into two Next.js **route groups** — `(public)` for open pages,
`(app)` for the auth-gated product. Parenthesised folders don't appear in URLs,
so `(app)/workshop/page.tsx` serves at `/workshop`.

```
src/
  app/
    layout.tsx              — root layout: html/body, Inter font, ErrorBoundary, GlobalErrorHandler, ServiceWorkerRegister. No AuthGate, no SideNav here — those move into (app)/layout.tsx.
    globals.css             — design tokens + base styles
    (public)/               — public, unauthenticated marketing + docs
      layout.tsx            — top header (logo + "Getting started" + "Open the app" CTA) + footer
      page.tsx              — landing page at /  (welcome + two tiles: Open the app → /app, Getting started → /getting-started)
      getting-started/
        page.tsx            — 14-section end-user reference hub: four grouped card grids (Get set up, Build your pantry, Run the workshop, Labels/backup/reference); clicking a card opens the full section in a modal with prev/next navigation; Esc closes. Uses <Shot src="/docs/screenshots/…png" /> for real captures.
        getting-started.css — scoped docs styles
    (app)/                  — auth-gated product (login wall when NEXT_PUBLIC_DEXIE_CLOUD_URL is set)
      layout.tsx            — AuthGate + SideNav + SectionAccent + IosInstallBanner + SeedLoader + DemoModeOverlay
      app/page.tsx          — /app "home": greeting, shopping callout, cards for Workshop/Pantry/Lab/Observatory/Shop
      products/
      page.tsx              — products tabbed page (2 tabs: Products list + Categories list)
      [id]/page.tsx         — product detail (photo, header edit, shell design, assign/remove fillings)
      categories/
        [id]/page.tsx       — product category detail (InlineNameEditor, edit shell % min/max/default, usage panel, archive/delete)
    fillings/
      page.tsx              — fillings tabbed page (2 tabs: Fillings list + Categories list)
      [id]/page.tsx         — filling detail (edit, category picker, ingredients, drag-to-reorder)
      categories/
        [id]/page.tsx       — filling category detail (InlineNameEditor, shelfStable checkbox, usage panel, archive/delete)
    ingredients/
      page.tsx              — ingredients tabbed page (2 tabs: Ingredients list + Categories list)
      [id]/page.tsx         — ingredient detail (edit, composition, pricing, usage)
      categories/
        [id]/page.tsx       — ingredient category detail (InlineNameEditor, usage panel, archive/delete; "Chocolate" protected)
    moulds/
      page.tsx              — mould library (search, add, flat list)
      [id]/page.tsx         — mould detail (edit, photo, dimensions, delete)
    packaging/
      page.tsx              — packaging library (search, add, flat list with latest price)
      [id]/page.tsx         — packaging detail (edit, order history, log orders, delete)
    collections/
      page.tsx              — collections list (search by name, hide inactive filter)
      [id]/page.tsx         — collection detail (edit name/dates, add/remove products, delete)
    shopping/
      page.tsx              — shopping list (low-stock ingredients & packaging + free-text items)
    production/
      page.tsx              — plan list (active/history tabs, search, duplicate & delete)
      new/page.tsx          — create plan wizard (select products → configure moulds → batch sizes)
      [id]/
        page.tsx            — plan detail (step checklist, progress bar, 6 phase tabs)
        products/page.tsx    — scaled ingredient amounts per filling
        summary/page.tsx    — read-only batch summary snapshot
    stock/
      page.tsx              — two tabs: Products (in-stock batches, sell-before dates, mark as gone) + Fillings (leftover filling stock, adjust/discard, manual add)
    calculator/
      page.tsx              — Product Lab list (experiments list, new blank, clone from filling; status badges; New version action)
      [id]/page.tsx         — Experiment detail (ingredients, live balance bars, warnings, make-batch setup, save as filling)
      [id]/batch/page.tsx   — Test batch page (scaled product cards with hover highlight + shopping cart; feedback questionnaire; promote or fork)
    pantry/
      page.tsx              — Pantry section home (cards: Products, Fillings, Ingredients, Moulds, Packaging, Collections, Decoration)
      decoration/
        page.tsx            — decoration tabbed page (3 tabs: Materials, Categories, Designs)
        [id]/page.tsx       — decoration material detail (read/edit mode, InlineNameEditor, stock panel at top, delete)
        categories/
          [id]/page.tsx     — decoration category detail (InlineNameEditor, edit slug, usage panel, archive/delete)
        designs/
          [id]/page.tsx     — shell design detail (InlineNameEditor, edit defaultApplyAt, usage panel, archive/delete)
    library/
      page.tsx              — legacy route, superseded by /pantry
    observatory/
      page.tsx              — Observatory section home (cards: Pricing & Margins, Production Stats, Product Cost)
      product-cost/
        page.tsx            — Product cost analysis: ranked overview, per-product breakdown, similar-product comparison table
    pricing/
      page.tsx              — cross-collection margin comparison dashboard (under The Observatory)
    stats/
      page.tsx              — production statistics: KPIs, monthly bar chart, product leaderboard with trend indicators
    settings/page.tsx       — export/import backup; CSV import (Import tab); Target Market tab (currency, market region EU/UK/US/AU/CA, facility allergens)
  components/
    pantry/                 — shared primitives for ALL pantry list + detail pages (see "Pantry Shared Components" section)
      index.ts              — barrel export; import everything from here: `@/components/pantry`
      list-toolbar.tsx      — search input + filter toggle button (with badge) + add button
      filter-panel.tsx      — filter card container with "Clear all filters" footer
      filter-chips.tsx      — FilterChipGroup: labeled row of radio or multi-select chips
      quick-add-form.tsx    — inline create form with submit / cancel button row
      empty-state.tsx       — "No X yet" vs "No X match your filters" message
      group-header.tsx      — collapsible group header: chevron + label + count + stock badges
      stock-badge.tsx       — StockBadge (item-level pill) + GroupStockBadge (header summary)
      list-item-card.tsx    — <li> card: stock border colouring + link + optional action slot
      collapse-controls.tsx — "Collapse all / Expand all" buttons
      multi-select-dropdown.tsx — multi-select checkbox dropdown for large option sets
      low-stock-flag-button.tsx — compact shopping-cart button with inline confirmation for flagging/unflagging low stock
      archive-filter-chip.tsx — standardised "show archived" filter chip for all list pages (wraps FilterChipGroup)
    yield-modal.tsx         — shared yield modal: shown on unmould step completion and past batch logging; collects actual piece count per product
    side-nav.tsx            — vertical side nav: The Pantry (Products, Categories, Fillings, Ingredients, Moulds, Packaging, Collections, Decoration), The Workshop (Production, Stock), The Lab (Calculator), The Observatory (Pricing, Stats, Product Cost), Settings
    category-picker.tsx     — single category select (no subcategories)
    ingredient-form.tsx     — full ingredient form with composition validation
    filling-ingredient-row.tsx — inline-editable ingredient row on filling detail (grams only)
    sortable-filling-ingredient-row.tsx — dnd-kit drag-and-drop wrapper for ingredient rows
    add-filling-ingredient.tsx — search + add ingredient to a filling
    page-header.tsx         — reusable page title/description header: <PageHeader title="…" description="…" />
    inline-name-editor.tsx  — name field with hover-pencil for inline rename; used at top of every detail page
    stock-status-panel.tsx  — full stock workflow widget (flag low/out, mark ordered, restock)
    auth-gate.tsx           — blocks the app behind a login screen when NEXT_PUBLIC_DEXIE_CLOUD_URL is set; pass-through when running local-only
    error-boundary.tsx      — React error boundary (wraps root layout)
    global-error-handler.tsx — global unhandled-error/rejection logger
    csv-import.tsx          — reusable CSV import UI: file pick → preview table → commit (parameterised by CSVImportConfig<T>)
    seed-loader.tsx         — triggers seed on first load
    sw-register.tsx         — registers service worker
    persistent-storage-request.tsx — requests `navigator.storage.persist()` on boot so the browser won't evict IndexedDB under storage pressure; mounted from the root layout alongside `sw-register.tsx`
    leftover-modal.tsx      — modal prompt for registering leftover filling after fill step completion
    freeze-modal.tsx        — FreezeModal (quantity + preserved-shelf-life form) + DefrostConfirmModal (two-step confirmation; shows the new sell-by date)
  lib/
    db.ts                   — Dexie setup (v2 schema; productCategories table + v1→v2 upgrade migration)
    ganacheBalance.ts       — pure ganache balance calculation + range checks (6 configs: dark/milk/white × moulded/coated)
    hooks.ts                — all data hooks and mutations
    production.ts           — scaling, step scheduling, batch summary generation
    costCalculation.ts      — pure cost calculation: shell/cap/filling weights (accept optional shellPercentage), product cost, coating resolution, breakdown serialization; shell + cap are a single combined breakdown entry; SHELL_FACTOR/CAP_FACTOR kept as deprecated exports
    stockCount.ts           — pure FIFO reconciliation for product stock counts (reconcileStockCount)
    freezer.ts              — pure helpers for the freezer workflow: remainingShelfLifeDays, defrostedSellBy, clampFreezeQty + DAY_MS/WEEK_MS constants
    shelfLifeBuckets.ts     — pure bucketing for shelf-life filters (none / ≤4wk / 5–12wk / >12wk); shared between Products + Fillings list pages
    productCategories.ts    — pure helpers: validateCategoryRange, categoryAllowsZero/FullShell, clampShellPercentToCategory, formatCategoryRange
    colors.ts               — cocoa butter colour name → CSS hex mapping + colorToCSS()
    backup.ts               — export/import all IndexedDB data (includes productCategories; back-fills legacy productType strings post-import); `importBackup`/`clearAllData` auto-download a safety snapshot first so destructive ops are always recoverable
    persistent-storage.ts   — `requestPersistentStorage()`, `getStorageStatus()`, `formatBytes()` — SSR-safe wrappers around `navigator.storage` so the UI can show persisted state + usage/quota and offer a manual "Request persistent storage" button
    upgrade-snapshot.ts     — pre-upgrade safety snapshot. `snapshotBeforeUpgrade()` fires at `db.ts` module init; if the stored IDB version is below `CURRENT_DEXIE_VERSION * 10`, it peeks at the DB and downloads a recovery JSON before Dexie runs `.upgrade()` hooks. Exports pure helpers `decideUpgradeSnapshot()` and `buildUpgradeSnapshotFilename()` for unit testing. `CURRENT_DEXIE_VERSION` is kept in sync with `db.ts` by hand
    seed.ts                 — seeding logic
    collectionPricing.ts    — pure pricing/margin calculations
    csv.ts                  — CSV parser
    csv-import.ts           — reusable CSV import: parse, validate, commit with dedup, template download (entity-agnostic)
    csv-import-ingredients.ts — ingredient-specific CSV import config: column mapping, validation, template columns
    productSimilarity.ts     — Jaccard-based product similarity: scoreProductSimilarity, getProductFillingCategories, rankSimilarProducts
    nutrition.ts            — per-ingredient nutrition data (per 100g), market-specific display (EU/UK/US/AU/CA), product-level aggregation, energy/salt conversion
    use-n-shortcut.ts       — hook: fires callback when user presses "n" with no input focused; use on all pantry list pages
    use-persisted-filters.ts — hook: persists filter state to sessionStorage so filters survive list→detail→back navigation; use on all list pages
  types/
    index.ts                — all types + FILLING_CATEGORIES + EU_ALLERGENS + US_ALLERGENS + getAllergensByRegion() + allergenLabel() + migrateAllergens() + ALLERGEN_LIST + costPerGram() + hasPricingData()
```

## Unit Tests (`src/**/*.test.ts`)
Vitest, node environment. Run with `npm test`.

| File | What it covers |
|---|---|
| `src/lib/csv.test.ts` | CSV parser: quoting, whitespace, missing columns, CRLF line endings |
| `src/lib/colors.test.ts` | `colorToCSS` resolution (exact, partial, CSS named, fallback) |
| `src/lib/utils.test.ts` | `cn()` class merging, Tailwind conflict resolution, falsy filtering |
| `src/lib/production.test.ts` | `calculateFillingAmounts`, `consolidateSharedFillings` (10 tests incl. edge cases: zero-weight, rounding, ingredient merging, insertion order), `scheduleColorSteps`, `generateSteps` (incl. shared filling consolidation), `generateBatchSummary` |
| `src/types/index.test.ts` | `costPerGram` utility, `pricingIrrelevant` behaviour; `allergenLabel` (EU, US, legacy, unknown fallback); `migrateAllergens` (lactose→milk, nuts→subtypes, dedup, mixed); `getAllergensByRegion` (EU/UK/US/AU/CA lists, EU-only allergens, AU excludes celery/lupin/mustard, US shellfish/wheat, shared nut subtypes, FASTER Act sesame); `MARKET_LABEL_RULES` (Contains summary, emphasis rules); `getCurrencySymbol` (all 6 currencies); `normalizeApplyAt` (legacy mapping, canonical pass-through, undefined/unknown defaults); `DECORATION_APPLY_AT_OPTIONS` (all phases except filling) |
| `src/lib/costCalculation.test.ts` | `calculateProductCost`, `calculateShellWeightG`, `calculateCapWeightG`, `calculateFillingWeightPerCavityG`, `resolveCoatingCostAtDate`, `resolveCurrentCoatingCostPerGram`, `buildIngredientCostMap`, `enrichBreakdownLabels`, `formatCost`, `costDelta`, `groupSnapshotsByEra`, serialization |
| `src/lib/ganacheBalance.test.ts` | `calculateGanacheBalance`, `checkGanacheBalance` — all 6 type/application combos, water/sugar interaction, white ganache N/A solids |
| `src/lib/collectionPricing.test.ts` | `latestPackagingUnitCost`, `averageProductCost`, `calculateBoxCost`, `calculateBoxPricing`, `marginHealth`, `marginDelta`, `formatPrice`, `formatMarginPercent` |
| `src/lib/productSimilarity.test.ts` | `scoreProductSimilarity`, `getProductFillingCategories`, `rankSimilarProducts` |
| `src/lib/stockCount.test.ts` | `reconcileStockCount` — FIFO deduction across batches, overflow lands on newest, rounding, negative/NaN guards, unsorted input |
| `src/lib/freezer.test.ts` | `remainingShelfLifeDays`, `defrostedSellBy`, `clampFreezeQty` — shelf-life math, defrost sell-by offset, partial-freeze clamping |
| `src/lib/shelfLifeBuckets.test.ts` | `shelfLifeBucket` — boundaries, missing/invalid inputs, string input form |
| `src/lib/productCategories.test.ts` | `validateCategoryRange` (bonbon range, bar range, single-point, NaN, multi-error collection), `categoryAllowsZeroShell`, `categoryAllowsFullShell`, `clampShellPercentToCategory`, `formatCategoryRange` |
| `src/lib/nutrition.test.ts` | `kcalToKj`, `kjToKcal`, `sodiumMgToSaltG`, `saltGToSodiumMg`, `fillDerivedNutrition`, `aggregateNutrition`, `scaleToServing`, `formatNutrientValue`, `percentDailyValue`, `hasNutritionData`, `getMissingMandatoryNutrients`, `getNutrientsByMarket`, `getNutritionPanelTitle` |
| `src/lib/csv-import.test.ts` | `toNum`, `toNumOpt`, `toStrOpt`, `toBoolOpt`, `parseCSVImport` (valid rows, missing/unknown columns, validation errors, row indexing) |
| `src/lib/csv-import-ingredients.test.ts` | `mapIngredientRow` (minimal, purchase, composition, allergens, nutrition, booleans, optional strings), `validateIngredientRow` (required name, composition sum, unknown category, partial pricing), `INGREDIENT_TEMPLATE_COLUMNS` (allergen + nutrition column counts) |
| `src/lib/persistent-storage.test.ts` | `requestPersistentStorage` (SSR, unsupported browser, already-persisted short-circuit, grant/deny paths, error swallowing, persisted() missing), `getStorageStatus` (no navigator, no persist support, full happy path, missing estimate fields, errors from persisted()/estimate()), `formatBytes` (null/negative/NaN placeholders, B/KB/MB/GB boundaries, precision switch at ≥10) |
| `src/lib/upgrade-snapshot.test.ts` | `decideUpgradeSnapshot` (unsupported browser, fresh install, already-current, downgrade, one-step-behind trigger, multi-step-behind trigger), `buildUpgradeSnapshotFilename` (both versions + ISO date in name, multi-step upgrades, default-now date shape) |

When adding new pure functions to `lib/` or `types/`, add a corresponding `.test.ts` file. Browser-dependent code (Dexie hooks, React components) is not unit-tested — test the pure logic layer instead.

## E2E Tests (`e2e/`)
Playwright, Chromium. Run with `npm run test:e2e`. Config: `playwright.config.ts` (workers: 1, fullyParallel: false). Each test gets a fresh browser context (fresh IndexedDB). CSV seed is suppressed via `e2e/fixtures.ts`.

| File | What it covers |
|---|---|
| `e2e/navigation.spec.ts` | All nav items reachable; landing page tiles; Home link returns to `/app` |
| `e2e/products.spec.ts` | Empty state, create, list, search, edit name, duplicate, delete |
| `e2e/fillings.spec.ts` | Empty state, create, list, search, edit notes, duplicate, delete |
| `e2e/ingredients.spec.ts` | Empty state, create, list, search, edit purchase cost |
| `e2e/calculator.spec.ts` | Empty state, create experiment, appears in list, detail shows Ingredients section |
| `e2e/moulds.spec.ts` | Empty state, create, list, search, cancel add form |
| `e2e/packaging.spec.ts` | Empty state, create, list, search, cancel add form |
| `e2e/shopping.spec.ts` | Empty state, add free-text item, mark ordered, delete, cancel |
| `e2e/production.spec.ts` | Empty state, history tab, navigate to new plan wizard |
| `e2e/production-stock-warnings.spec.ts` | Ingredient low/out-of-stock warnings in plan wizard; warning expands to show culprit; ordered status label; stock issues sort to top |
| `e2e/production-leftover.spec.ts` | Leftover modal appears on fill step completion for shelf-stable filling; leftover modal saves stock and it appears on stock page |
| `e2e/product-cost.spec.ts` | Observatory home link to Product Cost; empty state; nav item active; search input present |
| `e2e/stock-fillings.spec.ts` | Fillings tab: empty state, manual add, adjust amount, discard with confirmation, search filtering |
| `e2e/stock-freezer.spec.ts` | Freeze a filling with partial quantity (row splits), filter by Frozen-only / Available, defrost with confirmation modal |
| `e2e/backup.spec.ts` | Export JSON contains all 27 table keys; round-trip data survives export+import; import overwrites post-backup additions; auto safety-snapshot downloads (with real canary content) before both `importBackup` and `clearAllData` run |
| `e2e/product-categories.spec.ts` | Default seed (moulded + bar) appears on fresh DB; range badges visible; create/edit/delete; range validation rejects out-of-range default; pantry home card link |
| `e2e/decoration.spec.ts` | 3 tabs visible; Materials tab CRUD; Categories tab: seeded data, create, cancel, delete; Designs tab: seeded data, create with applyAt, cancel, delete, production step display |
| `e2e/csv-import.spec.ts` | Import tab visible; template download; valid CSV preview + import; validation errors shown; duplicate detection; empty CSV error |
| `e2e/fresh-load.spec.ts` | Detail pages (fillings, products, ingredients) resolve the real id from `window.location.pathname` when served from the `_spa` placeholder — catches any regression to `use(params)` that would strand the page on "Loading" after a reload / share / direct URL load. Uses `page.route()` to simulate the Cloudflare rewrite in dev mode. |

When adding a new page or flow, add E2E coverage in the appropriate spec file (or create a new one). See the E2E test patterns section above for timing/loading guidance.

### Documentation screenshots (`e2e/docs-screenshots.spec.ts`)

Not a test — a **generation script** that happens to use Playwright. Run with
`npm run docs:screenshots`. It boots the dev server, loads demo data via
Settings → Demo Mode → Load demo data, then navigates through the list → detail
flows and writes PNGs to `public/docs/screenshots/` (7 shots: settings-demo,
ingredient-edit, filling-editor, product-composition, production-wizard,
stock-products, collection-pricing). These are referenced by
`src/app/(public)/getting-started/page.tsx`.

The file is excluded from the regular e2e run via a `PLAYWRIGHT_DOCS=1`-gated
`testIgnore` entry in `playwright.config.ts`, so `npm run test:e2e` does not
regenerate screenshots. Re-run the script and commit the PNGs whenever a
captured screen's UI meaningfully changes. The iOS install screenshot in the
Install section of the guide is not automatable — take that one by hand.

## Important Patterns
- `[id]` detail pages read the route param via `useSpaId("<parent-segment>")` (see `src/lib/use-spa-id.ts` and the Routing rules above). Never `use(params)` — the static-export + `_redirects` rewrite bakes `params.id = "_spa"` into every detail page's RSC payload.
- State sync pattern for edit forms: check `!editing && name === ""` before syncing from DB — always use `|| ""` guards since old IndexedDB records may have `undefined` fields
- Allergens are auto-aggregated: adding/removing a `FillingIngredient` calls `updateFillingAllergens(fillingId)`; editing an ingredient also re-aggregates all fillings that use it
- `saveFilling` / `saveProduct` — pass the full object; upsert is handled by presence of `id`
- **Create-then-redirect pattern**: when creating a new record from a list page, immediately redirect to the detail page with `?new=1` so the user can complete all fields there (e.g. `router.push(\`/fillings/${id}?new=1\`)`). The detail page may use `?new=1` to show a welcome prompt or pre-focus the first field.
- **Shell design colour scheduling**: `generateSteps` in `production.ts` calls `scheduleColorSteps` to reorder colour tasks across all products, minimising cocoa butter colour switches. Tests for this live in `production.test.ts`.
- **Shared filling consolidation**: when multiple products in a production plan use the same filling, the filling step is consolidated into one "Make {filling}" step with the combined weight. The scaled products page shows per-filling tabs (not per-product), with a badge on shared fillings. `consolidateSharedFillings()` is the pure function; `generateSteps()` uses it internally for the filling phase.
- **Filling stock (leftover filling)**: After the fill step is completed in a production plan, a modal prompts the user to register leftover filling in grams (pre-filled: amountMade - amountNeeded, positive only for shelf-stable fillings with multiplier > 1). Stock is tracked in the `fillingStock` table and displayed on the stock page's "Fillings" tab. The production wizard shows "Use stock" toggle (instead of "Previous batch") only when stock exists for a shelf-stable filling, with coverage info.

## Export / Import (`src/lib/backup.ts`, `src/app/settings/page.tsx`)
- All data lives in IndexedDB only — no server. But three automatic data-loss protections run on top of the manual export (see "Data-loss protections" under Backup / Restore): persistent-storage request on boot, auto safety-snapshot before destructive ops, and a pre-upgrade snapshot before schema migrations.
- Export/import is fully built: `exportBackup()` / `importBackup()` in `src/lib/backup.ts`
- Backup uses `db.<table>.toArray()` for every table — a full object dump. New fields on any type are automatically included with no changes needed to `backup.ts`.
- Do not maintain a separate field inventory for backup purposes; trust the full-object round-trip.
- `importBackup(file)` and `clearAllData()` both auto-download a timestamped safety snapshot before wiping the DB. Opt out with `{ snapshot: false }` only for scripted/test flows. Snapshots are skipped when the DB is empty.
- Filename prefixes by source, so users can tell files apart in Downloads: `choc-collab-backup-` (manual export), `choc-collab-snapshot-before-restore-`, `choc-collab-snapshot-before-clear-`, `choc-collab-snapshot-before-upgrade-v{old}-to-v{new}-`.

## Build Plan (remaining)
- Allergen tracking + label printing
- Product booklet generator
- Polish: dark mode

## Future Design Directions
These are confirmed design intentions — not yet built, but should inform architecture decisions:

- **Chocolate-as-recipe**: some chocolatiers make their own chocolate and use it for shelling/coating. Short-term: homemade chocolate is added as an Ingredient (category "Chocolate"). Long-term: support chocolate as a Recipe that can be referenced as coating material — needs recipe-in-recipe composition. When working on coating/shelling features, keep the data model flexible enough that a "chocolate recipe" could eventually replace a single ingredient reference.

## Product Lab (`src/app/calculator/`)
- **Experiment** = a scratchpad ganache formulation; stored in IndexedDB (`experiments` + `experimentIngredients` tables)
- Create blank or clone from an existing ganache filling (`sourceFillingId` is set when cloned; `?clone=<fillingId>` param triggers ingredient copy on detail page load)
- Balance calculation: `calculateGanacheBalance()` in `lib/ganacheBalance.ts` — sums each composition field across all ingredients, returns % of total weight
- Range checks: `checkGanacheBalance()` uses `GANACHE_RANGES` constant (6 configs: dark/milk/white × moulded/coated);
- Warnings are contextual: water/sugar interaction, type-specific cocoa butter messages (white = "no cocoa solids to stabilise"), application-specific butter/oil messages (coated = "clean cut" requirement)
- `alcohol?` composition field on `Ingredient` — optional %, included in the 100% sum; tracked in balance as `GanacheBalance.alcohol`; advisory fires when ≥3% (humectant/Aw note); polyols (sorbitol, invert sugar) still count toward `sugar` %
- "Save as filling" creates a real `Filling` (category: Ganaches) + `FillingIngredient` records, then redirects to `/fillings/{id}`
- Ingredient amounts are always grams (no unit picker) — same constraint applies to filling ingredients everywhere in the app

## Nice-to-Have (future)
- **Inventory tracking**: `StockItem` table (ingredientId, quantity, unit, purchaseDate, bestBefore, notes) — multiple batches per ingredient, check stock against products
