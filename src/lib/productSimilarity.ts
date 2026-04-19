import type { ProductFilling, Filling } from "@/types";

/**
 * Compute a similarity score [0, 1] between two products based on their
 * filling category composition and product type.
 *
 * Algorithm:
 *   - Primary (80%): Jaccard similarity of the unique category sets
 *     (intersection / union of the distinct categories used by each product)
 *   - Secondary (20%): same product type bonus (moulded vs coated etc.)
 */
export function scoreProductSimilarity(
  categoriesA: string[],
  categoriesB: string[],
  productTypeA?: string,
  productTypeB?: string,
): number {
  const setA = new Set(categoriesA);
  const setB = new Set(categoriesB);

  const union = new Set([...setA, ...setB]);
  if (union.size === 0) return 0;

  let intersection = 0;
  for (const c of setA) {
    if (setB.has(c)) intersection++;
  }

  const jaccard = intersection / union.size;
  const typeBonus =
    productTypeA && productTypeB && productTypeA === productTypeB ? 0.2 : 0;

  return Math.min(1, jaccard * 0.8 + typeBonus);
}

/**
 * Resolve the distinct filling categories used in a product from its ProductFillings
 * and a fillings lookup map. Returns the list of category strings (one per filling,
 * preserving duplicates — the caller can deduplicate with Set if needed).
 */
export function getProductFillingCategories(
  productFillings: ProductFilling[],
  fillingsMap: Map<string, Filling>,
): string[] {
  return productFillings
    .map((rl) => fillingsMap.get(rl.fillingId)?.category ?? "")
    .filter(Boolean);
}

export interface SimilarProduct {
  productId: string;
  /** Jaccard-based score with type bonus, range [0, 1]. */
  score: number;
  /** Categories from this product that also appear in the focus product. */
  sharedCategories: string[];
}

/**
 * Given a focus product's filling categories and a list of candidate products,
 * return the candidates ranked by similarity descending (zero-score candidates
 * are excluded).
 */
export function rankSimilarProducts(
  focusCategories: string[],
  focusProductType: string | undefined,
  otherProducts: { productId: string; categories: string[]; productType?: string }[],
): SimilarProduct[] {
  const focusSet = new Set(focusCategories);

  return otherProducts
    .map(({ productId, categories, productType }) => {
      const score = scoreProductSimilarity(
        focusCategories,
        categories,
        focusProductType,
        productType,
      );
      const sharedCategories = [...new Set(categories.filter((c) => focusSet.has(c)))];
      return { productId, score, sharedCategories };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
