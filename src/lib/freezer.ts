/**
 * Pure helpers for the freezer workflow. No React, no IndexedDB — all inputs
 * are plain data. Used by the stock page, the production wizard, and the
 * freeze/defrost modals.
 *
 * Shelf-life semantics:
 *   - When a batch is frozen we capture the remaining shelf life (days) at that
 *     moment. It is user-editable in the freeze modal — default = remaining.
 *   - Frozen stock has no active sell-by date; it is "paused".
 *   - Once defrosted, sell-by = defrostedAt + preservedShelfLifeDays.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * DAY_MS;

/** Remaining shelf life in whole days given a production date and a weeks-based
 *  shelf life string (as stored on Product/Filling). Returns 0 if the input is
 *  incomplete or already expired. */
export function remainingShelfLifeDays(
  madeAtMs: number | undefined,
  shelfLifeWeeks: number | string | undefined,
  nowMs: number = Date.now(),
): number {
  if (!madeAtMs) return 0;
  const weeks = typeof shelfLifeWeeks === "string" ? parseFloat(shelfLifeWeeks) : shelfLifeWeeks;
  if (weeks == null || !Number.isFinite(weeks) || weeks <= 0) return 0;
  const expiresAt = madeAtMs + weeks * WEEK_MS;
  const remaining = Math.round((expiresAt - nowMs) / DAY_MS);
  return Math.max(0, remaining);
}

/** Sell-by date for a defrosted batch: defrostedAt shifted forward by the
 *  preserved shelf life. Returns null when inputs are incomplete. */
export function defrostedSellBy(
  defrostedAtMs: number | undefined,
  preservedShelfLifeDays: number | undefined,
): Date | null {
  if (!defrostedAtMs || preservedShelfLifeDays == null) return null;
  return new Date(defrostedAtMs + preservedShelfLifeDays * DAY_MS);
}

/** Clamp a requested freeze quantity to what is actually available to freeze. */
export function clampFreezeQty(
  requested: number,
  availablePieces: number,
): number {
  if (!Number.isFinite(requested) || requested <= 0) return 0;
  return Math.max(0, Math.min(Math.round(requested), Math.max(0, Math.round(availablePieces))));
}
