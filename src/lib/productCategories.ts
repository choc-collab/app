import type { ProductCategory } from "@/types";

/**
 * Pure helpers for ProductCategory range validation and behaviour discrimination.
 *
 * Bar-like UI behaviour is implicit from the range fields — see `categoryAllowsZeroShell`
 * and `categoryAllowsFullShell`. We deliberately avoid an explicit "kind" enum so that
 * users can define their own categories (e.g. "filled bar", "praline bar") and the UI
 * will adapt automatically based on the range they configure.
 */

export interface CategoryRangeInput {
  shellPercentMin: number;
  shellPercentMax: number;
  defaultShellPercent: number;
}

export interface CategoryRangeValidation {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a product category's shell-percentage range. All three values must lie
 * in [0, 100]; min must be <= max; and default must lie within [min, max].
 *
 * Returns `{ valid: true, errors: [] }` on success, or a list of human-readable
 * error strings suitable for inline display. Multiple errors may be returned at once.
 */
export function validateCategoryRange(input: CategoryRangeInput): CategoryRangeValidation {
  const errors: string[] = [];
  const { shellPercentMin: min, shellPercentMax: max, defaultShellPercent: def } = input;

  if (!Number.isFinite(min) || min < 0 || min > 100) {
    errors.push("Minimum shell % must be between 0 and 100");
  }
  if (!Number.isFinite(max) || max < 0 || max > 100) {
    errors.push("Maximum shell % must be between 0 and 100");
  }
  if (!Number.isFinite(def) || def < 0 || def > 100) {
    errors.push("Default shell % must be between 0 and 100");
  }
  if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
    errors.push("Minimum shell % cannot be greater than maximum");
  }
  if (Number.isFinite(min) && Number.isFinite(max) && Number.isFinite(def) && (def < min || def > max)) {
    errors.push("Default shell % must lie within the min–max range");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * True when this category permits products with no shell at all (e.g. bean-to-bar
 * where the layers section is the whole product). Used to decide whether the shell
 * ingredient field is required and whether the shell section can be hidden.
 */
export function categoryAllowsZeroShell(category: Pick<ProductCategory, "shellPercentMin">): boolean {
  return category.shellPercentMin === 0;
}

/**
 * True when this category permits shell-only products (e.g. a plain chocolate bar
 * with no filling). Used to decide whether the layers section can be hidden.
 */
export function categoryAllowsFullShell(category: Pick<ProductCategory, "shellPercentMax">): boolean {
  return category.shellPercentMax === 100;
}

/**
 * Clamp a shell percentage to the category's allowed range. Used when migrating
 * existing products into a category whose range may be tighter than the prior value.
 */
export function clampShellPercentToCategory(
  shellPercent: number,
  category: Pick<ProductCategory, "shellPercentMin" | "shellPercentMax">,
): number {
  if (!Number.isFinite(shellPercent)) return category.shellPercentMin;
  return Math.min(category.shellPercentMax, Math.max(category.shellPercentMin, shellPercent));
}

/**
 * Format a category's range for display: "15%–50%" or "0%–100%".
 * Compact form for badges and inline labels.
 */
export function formatCategoryRange(category: Pick<ProductCategory, "shellPercentMin" | "shellPercentMax">): string {
  return `${category.shellPercentMin}%–${category.shellPercentMax}%`;
}
