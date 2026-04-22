# Changelog

All notable user-facing changes to Choc-collab are documented in this file.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) (pre-1.0 — minor bumps may include breaking changes).

## [Unreleased]

### Added
- **Measured cooked yield on fillings** — fillings that lose mass during cooking (caramels, pâtes de fruits, anything reduced on the stove) now have an optional *Measured yield (g)* field on the edit form. Weigh the pan empty, cook the recipe, weigh the pan full, enter the difference once. The filling detail page then shows the raw-to-cooked reckoning under the ingredient total (e.g. `688g raw → 503g cooked · −185g (26.9%)`). When rescaling, ChocCollab uses the cooked yield as the base: asking for *600 g of caramel* in a production plan now produces 600 g on the scale after reducing, not 600 g of raw ingredients that cook down to ~440 g. Fillings without cook-loss (ganaches, pralinés) can leave the field blank and keep using the raw ingredient total as before — behaviour is unchanged until you enter a yield.

## [0.2.0] — 2026-04-26

### Added
- **Alternative mould setup for production plans** — the new-plan wizard has an opt-in "Alternative mould setup" disclosure on each product card (collapsed by default) for the rare cases where a product is poured into more than one mould type or only part of a mould is used. You can add additional moulds, or specify an exact cavity count instead of a mould count. Scaled recipes sum fill volume across every mould, shell/fill/cap steps are emitted per mould so the checklist tracks each physical pour, and the plan list + batch summary show a single row per product that lists every mould used (e.g. `2× Rect 15 + 12 cavities of Heart 24`). The default single-mould path is unchanged.
- **Fillings-only production plans** — you can now produce filling batches on their own (no product required), and mix filling-only batches with product batches in the same plan ("hybrid plans").
- **Persistent storage request on app boot** — ChocCollab now calls `navigator.storage.persist()` on load so browsers that support it won't evict your IndexedDB under storage pressure. Settings → Backup shows a new **Device Storage** card with the current persisted state, usage/quota, and a manual "Request persistent storage" button for browsers (Safari, Firefox) that only grant the request on a user gesture.
- **Auto safety-snapshot before destructive operations** — both **Restore from backup** and **Delete all data** now download a timestamped JSON snapshot of your current data before wiping the database. Filenames are prefixed `choc-collab-snapshot-before-restore-` or `choc-collab-snapshot-before-clear-` so you can tell them apart from manual exports. A misclick or a bad backup file is now always recoverable from the Downloads folder.
- **Pre-upgrade safety snapshot** — when ChocCollab ships a new app version that changes the on-disk data format, the app now downloads `choc-collab-snapshot-before-upgrade-v{old}-to-v{new}-{date}.json` *before* the migration runs. A one-time green banner appears on the Settings page after the upgrade explaining what the file is and how to restore it.

### Changed
- **Ingredient Shell tab now appears instantly** when "Chocolate" is picked from the category dropdown on the ingredient detail page — no save-and-return round-trip needed to reveal it.
- Settings → Backup copy updated to mention that a safety snapshot auto-downloads before any destructive operation.

### Fixed
- Hydration warning on first page load caused by the pre-hydration `data-nav-collapsed` script writing an attribute to `<html>`.

## [0.1.0] — 2026-04-19

### Added
- Initial public release.
