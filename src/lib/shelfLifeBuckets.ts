/**
 * Pure helpers for shelf-life filtering on list pages. Shared between
 * Products (Product.shelfLifeWeeks — optional string) and Fillings
 * (Filling.shelfLifeWeeks — optional number).
 *
 * Buckets:
 *   - "none"   → no shelf life set (undefined / empty / ≤ 0)
 *   - "short"  → ≤ 4 weeks
 *   - "medium" → 5–12 weeks
 *   - "long"   → > 12 weeks
 */

export type ShelfLifeBucket = "none" | "short" | "medium" | "long";

export const SHELF_LIFE_BUCKET_LABELS: Record<ShelfLifeBucket, string> = {
  none: "Not set",
  short: "≤ 4 weeks",
  medium: "5–12 weeks",
  long: "> 12 weeks",
};

export const SHELF_LIFE_BUCKET_ORDER: ShelfLifeBucket[] = ["short", "medium", "long", "none"];

export function shelfLifeBucket(weeks: number | string | undefined | null): ShelfLifeBucket {
  if (weeks == null || weeks === "") return "none";
  const n = typeof weeks === "string" ? parseFloat(weeks) : weeks;
  if (!Number.isFinite(n) || n <= 0) return "none";
  if (n <= 4) return "short";
  if (n <= 12) return "medium";
  return "long";
}
