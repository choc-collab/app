# Design System

The UI is intentionally simple so contributors can focus on features, not pixel-tweaking. A few rules keep the app visually consistent.

## Palette

The interface chrome is **black on a warm off-white**; individual top-level sections are **tinted with a muted pastel accent** that identifies the section (Products = cocoa, Fillings = peach, Ingredients = sage, Moulds = powder blue, Packaging = lilac, Collections = butter, Decoration = mint, Workshop / Production = terracotta, Stock = taupe, **Today dashboard = cocoa**, Shop = cocoa, Shop give-aways = lilac). Sections without an accent (Lab, Observatory, Settings, Shopping) stay monochrome.

All palette tokens are CSS variables defined in [`src/app/globals.css`](src/app/globals.css):

- **Base chrome** — `--color-background` (warm white), `--color-foreground` (black), `--color-muted`, `--color-border`, `--color-primary` (black), `--color-primary-foreground` (white). These never change.
- **Per-section accent** — `--color-accent` + `--color-accent-foreground` are rewired by `body[data-accent="…"]` rules (one per pastel). The active value is set at runtime by [`src/components/section-accent.tsx`](src/components/section-accent.tsx), which reads the pathname and applies the right `data-accent`.
- **Status** — `--color-status-warn`, `--color-status-alert`, `--color-status-ok` plus `-bg`/`-edge` variants for informational pills (low stock, expired, ordered).
- **Destructive** — `--color-destructive` (brick red) for delete buttons, exclusion chips, and error states.

## When to use which token

- A primary CTA or active tab that belongs to a *section* → `bg-accent text-accent-foreground` (picks up the pastel automatically).
- A neutral CTA or badge that should always be black → `bg-primary text-primary-foreground`.
- A delete / exclude / error → `bg-destructive text-destructive-foreground`.
- A low-stock / warning / OK pill → the corresponding `--color-status-*` tokens via `text-status-warn`, `bg-status-warn-bg`, etc.

## Adding a new section accent

1. In [`globals.css`](src/app/globals.css), add `--accent-<name>-bg` and `--accent-<name>-ink` tokens.
2. Add a `body[data-accent="<name>"] { --color-accent: …; --color-accent-foreground: …; }` rule alongside the others.
3. In [`section-accent.tsx`](src/components/section-accent.tsx), map one (or more) route prefix(es) to the new name in `ROUTE_ACCENTS`.

Every existing `bg-accent` / `text-accent-foreground` usage (primary buttons, active tabs, filter chips, progress bars) will pick up the new color automatically — no per-page change needed.

## Typography

Inter variable, served via `next/font` and wired to `--font-sans`. Headings use slightly tighter negative letter-spacing than body (`-0.02em` vs `-0.011em`). Kerning is enabled globally. Uppercase technical signposts (small labels, category headers) use the `.mono-label` utility: `ui-monospace`, uppercase, `+0.06em` tracking.

## Geometry

- **Pill** (`rounded-full`) for all interactive CTAs — Add buttons, tabs, filter chips, segmented controls.
- **Rounded 8px** (`rounded-lg`) for cards, dialogs, and list-item rows.
- **Rounded 6px** (`rounded-md`) for form inputs.
- **Circle** (`rounded-full` on a square) for icon-only buttons.
- Icon-only Add buttons always carry a tooltip and the `n` keyboard shortcut (see `src/lib/use-n-shortcut.ts`).

## Focus

- Buttons, links, and `[role="button"]` elements get a **dashed 2px outline** in the foreground color — deliberately distinctive, not a solid browser-default ring.
- Form inputs (`<input>`, `<select>`, `<textarea>`, or anything using `.input`) instead get a **solid 2px black border** on focus. A dashed outline on a text field reads as "error" and feels harsh; a solid border feels intentional.

## Side navigation

- The nav sits on a subtle warm off-white surface (`--color-nav`) so it reads as a distinct column without a divider line — no `border-r` or `border-b`.
- The logo doubles as the home link (→ `/today`). The top-level menu (Today, Workshop, Pantry, Lab, Observatory, Shop) is **always rendered**; when the user is inside a section, that section's sub-items inline-expand beneath its parent with a left-border accent — no mode-switch, no extra navigation step to reach a sibling section.
- A small floating chevron button on the right edge toggles collapse between `w-44` (labeled) and `w-14` (icons-only). The choice is persisted in `localStorage` and applied pre-hydration via an inline script in `layout.tsx` to avoid a flash.

## Today dashboard

`/today` is the in-app home (legacy `/app` redirects). It surfaces actionable signals over a single screen:

- A four-tile header — Shopping list, In progress, Experiments brewing (placeholder for the Lab feature), Week sales — uses the unified `StatTile` card shape with the `cocoa` accent inherited from the route. Empty tiles dim via opacity but stay clickable so the destination is always one tap away.
- The **In progress** tile is a custom mini-board: up to 3 active/draft batches with the row name linking to `/production/[id]` and a small `BookOpen` icon link to its scaled-recipes view, plus a hover popover listing the planned products and target-gram fillings.
- The **To Make** list scopes products to active collections only (matching the convention from `/products` and `/production/new`); each row carries an in-stock count pill (warn-yellow when below `lowStockThreshold`, alert-red at zero) and a blue Snowflake pill when frozen pieces exist.
- The **Sell · Quick** grid mirrors `/shop`'s Ready tab: same `groupPreparedSales` data, same `SaleQuantityStepper` component, same `markSalesSold` path. A tile with `count === 1` shows a plain "Sell" button; `count > 1` shows the stepper plus a "Sell N" pill. An inline accent-coloured toast offers Undo for ~5 s after each sell.
- A **universal search** in the header (⌘K / Ctrl+K) groups results by entity type across Products, Fillings, Ingredients, Moulds, and Batches.

## Dark mode

Disabled on purpose. The warm-white-with-pastels identity depends on a light base; a generated dark mode would fight it. If dark mode is added later, each pastel needs a hand-picked dark-mode counterpart, not an algorithmic inversion.

## Contributing UI changes

Keep the app **list-based, left-aligned, mobile-native** — not centered-SaaS-dashboard. Use the shared primitives in [`src/components/pantry/`](src/components/pantry) (list toolbar, filter panel, chip group, empty state, group header, list-item card) rather than inlining layouts. Every destructive action needs a two-step confirmation (inline or panel — see `AGENT.md`). Every new pure function in `lib/` ships with tests.
