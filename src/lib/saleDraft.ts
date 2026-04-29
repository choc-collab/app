/**
 * Pure state machine for the Shop "fill the box" screen.
 *
 * No React, no DB, no timers — just a reducer over `SaleDraft` + dispatch
 * functions. The UI layer wraps this in `useReducer` and handles
 * persistence (sessionStorage) separately.
 *
 * Responsibilities:
 *   - track which cavity is active (the "insert-next-here" marker)
 *   - place a bonbon into the active cavity, respecting stock
 *   - auto-advance the active cursor to the next empty cavity
 *   - clear a filled cavity, leaving the cursor on it
 *   - track palette search/category filter (purely so the reducer owns
 *     all session state; the filtering itself is done at render time)
 *
 * Stock model:
 *   - `stockAvailable` = pieces in the workshop *before* this box.
 *   - Effective available for a product P = stockAvailable(P) − count(P in cells).
 *   - A place action is a no-op when effective available ≤ 0.
 */

export interface SaleDraft {
  capacity: number;
  cells: (string | null)[];         // length === capacity; productId per cavity
  activeCellIndex: number | null;   // selection marker; null when nothing is active
  query: string;                    // palette search filter
  category: string;                 // palette category filter; "All" = no filter
  note: string;                     // operator note (customer name, pickup time, etc.)
  quantity: number;                 // how many identical copies to save; ≥ 1
}

export type SaleDraftAction =
  | { type: "selectCell"; index: number }
  | { type: "placeBonbon"; productId: string; stockAvailable: number }
  | { type: "clearCell"; index: number }
  | { type: "setQuery"; query: string }
  | { type: "setCategory"; category: string }
  | { type: "setNote"; note: string }
  | { type: "setQuantity"; quantity: number }
  | { type: "reset"; capacity: number };

export const DEFAULT_CATEGORY = "All";

export function initSaleDraft(capacity: number): SaleDraft {
  const cap = Math.max(0, Math.floor(capacity || 0));
  return {
    capacity: cap,
    cells: Array(cap).fill(null),
    activeCellIndex: cap > 0 ? 0 : null,
    query: "",
    category: DEFAULT_CATEGORY,
    note: "",
    quantity: 1,
  };
}

export function saleDraftReducer(state: SaleDraft, action: SaleDraftAction): SaleDraft {
  switch (action.type) {
    case "selectCell": {
      if (!isValidIndex(state, action.index)) return state;
      return { ...state, activeCellIndex: action.index };
    }

    case "placeBonbon": {
      const i = state.activeCellIndex;
      if (i == null || !isValidIndex(state, i)) return state;

      const used = countUses(state.cells, action.productId);
      const effective = action.stockAvailable - used;
      if (effective <= 0) return state;

      const cells = state.cells.slice();
      cells[i] = action.productId;

      // Auto-advance: seek the next empty cavity AFTER i; if none, wrap to
      // the first empty cell (earlier in the grid). When the box is now
      // completely filled, clear the active marker.
      const nextActive = nextEmptyAfter(cells, i) ?? firstEmpty(cells) ?? null;
      return { ...state, cells, activeCellIndex: nextActive };
    }

    case "clearCell": {
      if (!isValidIndex(state, action.index)) return state;
      if (state.cells[action.index] == null) {
        // Already empty — just move the cursor.
        return { ...state, activeCellIndex: action.index };
      }
      const cells = state.cells.slice();
      cells[action.index] = null;
      return { ...state, cells, activeCellIndex: action.index };
    }

    case "setQuery":
      return { ...state, query: action.query };

    case "setCategory":
      return { ...state, category: action.category };

    case "setNote":
      return { ...state, note: action.note };

    case "setQuantity": {
      // Clamp to ≥ 1; floor non-integers. Upper bound is enforced by the UI
      // against stock-derived maxQuantity; the reducer doesn't know about
      // stock, so it accepts any positive integer here.
      const q = Math.max(1, Math.floor(action.quantity || 1));
      return { ...state, quantity: q };
    }

    case "reset":
      return initSaleDraft(action.capacity);
  }
}

// ---------- helpers (also exported for UI display math) ----------

/** Count of how many times `productId` appears in `cells`. */
export function countUses(cells: readonly (string | null)[], productId: string): number {
  let n = 0;
  for (const c of cells) if (c === productId) n++;
  return n;
}

/** Map of productId → placements in the draft. Used for the summary chip row
 *  and for subtracting from available stock when rendering the palette. */
export function usedCounts(cells: readonly (string | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cells) {
    if (!c) continue;
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

/** How many cavities are filled (non-null). */
export function filledCount(cells: readonly (string | null)[]): number {
  let n = 0;
  for (const c of cells) if (c) n++;
  return n;
}

/**
 * Maximum number of identical copies of this box that can be prepared given
 * current stock. For each distinct product P in the cells:
 *   maxPerProduct(P) = floor(stockAvailable(P) / usesInBox(P))
 * The overall cap is the minimum across all products used.
 *
 * Returns 0 when the box is empty (nothing to prep) or when any product has
 * zero available stock. Products missing from `stockAvailable` are treated
 * as out-of-stock (conservative). */
export function maxPrepareQuantity(
  cells: readonly (string | null)[],
  stockAvailable: ReadonlyMap<string, number>,
): number {
  const uses = usedCounts(cells);
  if (uses.size === 0) return 0;
  let cap = Number.POSITIVE_INFINITY;
  for (const [productId, count] of uses) {
    if (count <= 0) continue;
    const avail = stockAvailable.get(productId) ?? 0;
    const perProduct = Math.floor(avail / count);
    if (perProduct < cap) cap = perProduct;
    if (cap <= 0) return 0;
  }
  return cap === Number.POSITIVE_INFINITY ? 0 : cap;
}

function isValidIndex(state: SaleDraft, index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < state.capacity;
}

function nextEmptyAfter(cells: readonly (string | null)[], from: number): number | null {
  for (let i = from + 1; i < cells.length; i++) if (cells[i] == null) return i;
  return null;
}

function firstEmpty(cells: readonly (string | null)[]): number | null {
  for (let i = 0; i < cells.length; i++) if (cells[i] == null) return i;
  return null;
}
