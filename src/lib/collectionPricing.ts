import type { PackagingOrder } from "@/types";

/** Product cost entry: one product's cost-per-product from its latest snapshot */
export interface ProductCostEntry {
  productId: string;
  costPerProduct: number;
}

/** Summary stats for product costs within a collection */
export interface ProductCostStats {
  avg: number;
  min: number;
  max: number;
  count: number;
}

/** Full cost/margin breakdown for one box configuration */
export interface BoxPricingResult {
  /** Cost of products in the box (avg cost × capacity) */
  productCost: number;
  /** Cost of the packaging unit itself */
  packagingUnitCost: number;
  /** Total cost = productCost + packagingUnitCost */
  totalCost: number;
  /** Sell price as entered by the user */
  sellPrice: number;
  /** Absolute margin = sellPrice - totalCost */
  marginAbsolute: number;
  /** Margin as percentage of sell price (0–100 scale) */
  marginPercent: number;
}

export type MarginHealth = "healthy" | "thin" | "negative";

/**
 * Get the most recent packaging unit cost from order history.
 * Returns null if no orders exist.
 */
export function latestPackagingUnitCost(orders: PackagingOrder[]): number | null {
  if (orders.length === 0) return null;
  const sorted = [...orders].sort(
    (a, b) => new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime()
  );
  return sorted[0].pricePerUnit;
}

/**
 * Calculate average, min, and max product cost from product cost entries.
 * Returns null if the list is empty.
 */
export function averageProductCost(costs: ProductCostEntry[]): ProductCostStats | null {
  if (costs.length === 0) return null;
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const c of costs) {
    sum += c.costPerProduct;
    if (c.costPerProduct < min) min = c.costPerProduct;
    if (c.costPerProduct > max) max = c.costPerProduct;
  }
  return { avg: sum / costs.length, min, max, count: costs.length };
}

/**
 * Calculate the total cost of a box: product cost × capacity + packaging unit cost.
 */
export function calculateBoxCost(
  avgProductCost: number,
  capacity: number,
  packagingUnitCost: number,
): number {
  return avgProductCost * capacity + packagingUnitCost;
}

/**
 * Full box pricing: cost breakdown, margin, and margin percentage.
 * packagingUnitCost defaults to 0 if no order history exists.
 */
export function calculateBoxPricing(
  avgProductCost: number,
  capacity: number,
  packagingUnitCost: number,
  sellPrice: number,
): BoxPricingResult {
  const productCost = avgProductCost * capacity;
  const totalCost = productCost + packagingUnitCost;
  const marginAbsolute = sellPrice - totalCost;
  const marginPercent = sellPrice > 0 ? (marginAbsolute / sellPrice) * 100 : 0;
  return { productCost, packagingUnitCost, totalCost, sellPrice, marginAbsolute, marginPercent };
}

/**
 * Classify margin health based on margin percentage.
 * - healthy: >= 40%
 * - thin: >= 0% but < 40%
 * - negative: < 0%
 */
export function marginHealth(marginPercent: number): MarginHealth {
  if (marginPercent < 0) return "negative";
  if (marginPercent < 40) return "thin";
  return "healthy";
}

/**
 * Format a price for display (2 decimal places) with the given currency symbol.
 */
export function formatPrice(amount: number, currencySymbol = "€"): string {
  return `${currencySymbol}${amount.toFixed(2)}`;
}

/**
 * Format margin percentage for display.
 */
export function formatMarginPercent(percent: number): string {
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(1)}%`;
}

export interface MarginDelta {
  /** Absolute change in margin % points (current - previous) */
  value: number;
  /** Formatted label, e.g. "+2.3pp" or "-5.1pp" */
  label: string;
  /** True when current margin is higher than previous */
  improved: boolean;
}

/**
 * Compute the change in margin % between two snapshots.
 * current and previous are margin percentages (0–100 scale).
 */
export function marginDelta(current: number, previous: number): MarginDelta {
  const value = current - previous;
  const sign = value >= 0 ? "+" : "";
  return {
    value,
    label: `${sign}${value.toFixed(1)}pp`,
    improved: value > 0,
  };
}
