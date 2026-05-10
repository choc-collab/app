/**
 * Pure derivation for the /today dashboard. No React, no IndexedDB —
 * inputs are plain arrays of DB rows + a reference `now`. The hook layer
 * (`useTodaySignals` in hooks.ts) wires the live queries on top.
 *
 * Signals computed:
 *   - inProgressBatches: count of plans with status "active" or "draft"
 *   - expiring: in-stock batches whose sell-by lies within `expiringWithinDays`
 *     (defaults to 7), sorted soonest first; expired batches (daysLeft < 0)
 *     come first
 *   - lowStockProducts: products with `lowStockThreshold` set whose total
 *     in-stock pieces (across done batches, frozen excluded) sit below the
 *     threshold; sorted by severity (most-depleted first)
 *   - shopKpis + week aggregates: same KPIs as the Shop landing, plus a
 *     7-day rolling revenue/box-count window for the Today week-sales tile
 */

import type { PlanProduct, ProductionPlan, Product, Sale } from "@/types";
import { computeShopKpis, type ShopKpis } from "@/lib/shopKpis";
import { batchSellBy, DAY_MS } from "@/lib/freezer";

export interface ExpiringBatch {
  planProductId: string;
  productId: string;
  productName: string;
  sellBy: Date;
  /** Whole days from `now` to sell-by. Negative when already expired. */
  daysLeft: number;
  /** Available pieces still in stock for this batch. Frozen pieces excluded. */
  pieces: number;
}

export interface LowStockProduct {
  productId: string;
  productName: string;
  threshold: number;
  pieces: number;
}

export interface TodaySignals {
  inProgressBatches: number;
  pendingShoppingCount: number;
  expiring: ExpiringBatch[];
  lowStockProducts: LowStockProduct[];
  shopKpis: ShopKpis;
  /** Total revenue across "today + previous 6 days" of sold sales. */
  weekRevenue: number;
  /** Box count across the same 7-day window. */
  weekBoxesSold: number;
}

export type TodayProductInfo = Pick<Product, "id" | "name" | "lowStockThreshold" | "shelfLifeWeeks">;

export interface ComputeTodaySignalsInput {
  now: Date;
  /** Every plan-product row. Filtering by plan status happens here against
   *  `plans` so callers don't need to pre-filter. */
  planProducts: readonly PlanProduct[];
  plans: readonly ProductionPlan[];
  /** Lightweight product snapshot keyed by id. Photos are intentionally absent. */
  products: ReadonlyMap<string, TodayProductInfo>;
  pendingShoppingCount: number;
  sales: readonly Sale[];
  /** How many days ahead "expiring" looks. Default 7. */
  expiringWithinDays?: number;
}

export function computeTodaySignals(input: ComputeTodaySignalsInput): TodaySignals {
  const {
    now, planProducts, plans, products, pendingShoppingCount, sales,
    expiringWithinDays = 7,
  } = input;
  const nowMs = now.getTime();

  const planById = new Map<string, ProductionPlan>();
  for (const p of plans) if (p.id) planById.set(p.id, p);

  let inProgressBatches = 0;
  for (const p of plans) {
    if (p.status === "active" || p.status === "draft") inProgressBatches++;
  }

  const expiring: ExpiringBatch[] = [];
  const piecesByProduct = new Map<string, number>();

  for (const pb of planProducts) {
    const plan = planById.get(pb.planId);
    if (!plan || plan.status !== "done") continue;
    if (pb.stockStatus === "gone") continue;

    const pieces = pb.currentStock ?? pb.actualYield ?? 0;
    if (pieces <= 0) continue;

    piecesByProduct.set(pb.productId, (piecesByProduct.get(pb.productId) ?? 0) + pieces);

    const product = products.get(pb.productId);
    const sellBy = batchSellBy(pb, plan.completedAt, product?.shelfLifeWeeks);
    if (!sellBy) continue;

    const daysLeft = Math.round((sellBy.getTime() - nowMs) / DAY_MS);
    if (daysLeft <= expiringWithinDays) {
      expiring.push({
        planProductId: pb.id ?? "",
        productId: pb.productId,
        productName: product?.name ?? "Unknown product",
        sellBy,
        daysLeft,
        pieces,
      });
    }
  }
  expiring.sort((a, b) => a.daysLeft - b.daysLeft);

  const lowStockProducts: LowStockProduct[] = [];
  for (const [productId, prod] of products) {
    if (prod.lowStockThreshold == null) continue;
    const pieces = piecesByProduct.get(productId) ?? 0;
    if (pieces < prod.lowStockThreshold) {
      lowStockProducts.push({
        productId,
        productName: prod.name,
        threshold: prod.lowStockThreshold,
        pieces,
      });
    }
  }
  // Most-depleted first: smaller pieces/threshold ratio = more urgent.
  // Out-of-stock (pieces=0, ratio=0) lands at the top.
  lowStockProducts.sort((a, b) => (a.pieces / a.threshold) - (b.pieces / b.threshold));

  const shopKpis = computeShopKpis(sales, now);
  const todayStartMs = startOfLocalDay(now).getTime();
  const todayEndMs = todayStartMs + DAY_MS;
  const weekStartMs = todayStartMs - 6 * DAY_MS;
  let weekRevenue = 0;
  let weekBoxesSold = 0;
  for (const sale of sales) {
    if (sale.status !== "sold" || !sale.soldAt) continue;
    const ts = new Date(sale.soldAt).getTime();
    if (ts >= weekStartMs && ts < todayEndMs) {
      weekRevenue += sale.price;
      weekBoxesSold++;
    }
  }

  return {
    inProgressBatches,
    pendingShoppingCount,
    expiring,
    lowStockProducts,
    shopKpis,
    weekRevenue,
    weekBoxesSold,
  };
}

function startOfLocalDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}
