/**
 * Cavity grid derivation for Shop packaging.
 *
 * The Shop feature renders a box as a rows×cols divider frame. `Packaging`
 * carries a single `capacity` integer, plus optional `rows` and `cols` that
 * an operator can set when a packaging doesn't factor cleanly (e.g. a
 * prime-capacity box, or a window box where the vendor's layout is 2×4
 * rather than the near-square default).
 *
 * Rules:
 *   - When both `rows` and `cols` are set (and positive), trust them. They
 *     define the grid the Shop renders, regardless of `capacity`.
 *   - When only one is set, derive the other from `capacity` (if divisible).
 *   - When neither is set, return a near-square factorisation of `capacity`:
 *     the largest divisor ≤ √capacity becomes `rows`, with `cols = capacity / rows`.
 *     This yields 3×4 for 12, 3×3 for 9, 2×2 for 4, and 1×7 for 7.
 *
 * Pure function — no React, no DB.
 */

export interface CavityGrid {
  rows: number;
  cols: number;
}

export interface PackagingGridInput {
  capacity: number;
  rows?: number;
  cols?: number;
}

export function derivePackagingGrid(p: PackagingGridInput): CavityGrid {
  const capacity = Math.max(0, Math.floor(p.capacity || 0));
  if (capacity === 0) return { rows: 0, cols: 0 };

  const rows = positiveInt(p.rows);
  const cols = positiveInt(p.cols);

  if (rows && cols) return { rows, cols };
  if (rows && capacity % rows === 0) return { rows, cols: capacity / rows };
  if (cols && capacity % cols === 0) return { rows: capacity / cols, cols };

  return nearSquareFactor(capacity);
}

function positiveInt(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  return i > 0 ? i : 0;
}

function nearSquareFactor(capacity: number): CavityGrid {
  const sqrt = Math.floor(Math.sqrt(capacity));
  for (let r = sqrt; r >= 1; r--) {
    if (capacity % r === 0) return { rows: r, cols: capacity / r };
  }
  return { rows: 1, cols: capacity };
}
