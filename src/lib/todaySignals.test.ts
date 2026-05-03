import { describe, it, expect } from "vitest";
import { computeTodaySignals, type TodayProductInfo } from "./todaySignals";
import { DAY_MS, WEEK_MS } from "./freezer";
import type { PlanProduct, ProductionPlan, Sale } from "@/types";

const NOW = new Date("2026-04-14T12:00:00Z");

function plan(overrides: Partial<ProductionPlan>): ProductionPlan {
  return {
    id: "p1",
    name: "Plan",
    status: "done",
    createdAt: new Date(NOW.getTime() - 30 * DAY_MS),
    updatedAt: new Date(NOW.getTime() - 30 * DAY_MS),
    completedAt: new Date(NOW.getTime() - 14 * DAY_MS),
    ...overrides,
  } as ProductionPlan;
}

function pb(overrides: Partial<PlanProduct>): PlanProduct {
  return {
    id: "pb1",
    planId: "p1",
    productId: "prodA",
    mouldId: "m1",
    quantity: 1,
    sortOrder: 0,
    currentStock: 10,
    ...overrides,
  } as PlanProduct;
}

function productMap(items: TodayProductInfo[]): Map<string, TodayProductInfo> {
  const m = new Map<string, TodayProductInfo>();
  for (const p of items) if (p.id) m.set(p.id, p);
  return m;
}

describe("computeTodaySignals — in-progress batches", () => {
  it("counts active and draft plans, ignores done", () => {
    const plans: ProductionPlan[] = [
      plan({ id: "a", status: "active" }),
      plan({ id: "b", status: "draft" }),
      plan({ id: "c", status: "done" }),
    ];
    const result = computeTodaySignals({
      now: NOW,
      plans,
      planProducts: [],
      products: new Map(),
      pendingShoppingCount: 0,
      sales: [],
    });
    expect(result.inProgressBatches).toBe(2);
  });
});

describe("computeTodaySignals — expiring batches", () => {
  const products = productMap([
    { id: "prodA", name: "Yuzu domes", shelfLifeWeeks: "4" }, // 28 days from completedAt
  ]);

  it("flags batches expiring within 7 days, sorted soonest first", () => {
    // 4-week shelf life uses the (weeks − 1) × 7 = 21-day convention.
    // Completed 17 days ago → sells by completedAt + 21d → 4 days left
    const plans: ProductionPlan[] = [
      plan({ id: "p_imminent", completedAt: new Date(NOW.getTime() - 17 * DAY_MS) }),
      // Completed 28 days ago → sells by completedAt + 21d → -7 days (expired)
      plan({ id: "p_expired", completedAt: new Date(NOW.getTime() - 28 * DAY_MS) }),
      // Completed 7 days ago → sells by completedAt + 21d → 14 days out — should not appear
      plan({ id: "p_distant", completedAt: new Date(NOW.getTime() - 7 * DAY_MS) }),
    ];
    const planProducts: PlanProduct[] = [
      pb({ id: "pb_imminent", planId: "p_imminent", currentStock: 8 }),
      pb({ id: "pb_expired",  planId: "p_expired",  currentStock: 5 }),
      pb({ id: "pb_distant",  planId: "p_distant",  currentStock: 12 }),
    ];
    const result = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
    });
    expect(result.expiring.map((e) => e.planProductId)).toEqual(["pb_expired", "pb_imminent"]);
    expect(result.expiring[0].daysLeft).toBeLessThan(0);
    expect(result.expiring[1].daysLeft).toBeGreaterThanOrEqual(0);
    expect(result.expiring[1].daysLeft).toBeLessThanOrEqual(7);
  });

  it("excludes batches with no remaining stock or stockStatus=gone", () => {
    const plans = [plan({ id: "p_imminent", completedAt: new Date(NOW.getTime() - 25 * DAY_MS) })];
    const planProducts: PlanProduct[] = [
      pb({ id: "pb_zero",  planId: "p_imminent", currentStock: 0 }),
      pb({ id: "pb_gone",  planId: "p_imminent", currentStock: 4, stockStatus: "gone" }),
      pb({ id: "pb_keep",  planId: "p_imminent", currentStock: 4 }),
    ];
    const result = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
    });
    expect(result.expiring.map((e) => e.planProductId)).toEqual(["pb_keep"]);
  });

  it("uses defrosted sell-by when the batch has been thawed", () => {
    // Completed long ago — frozen — defrosted 5 days ago with 10 days preserved → 5 days left.
    const plans = [plan({ id: "p_frozen", completedAt: new Date(NOW.getTime() - 60 * DAY_MS) })];
    const planProducts: PlanProduct[] = [
      pb({
        id: "pb_thawed", planId: "p_frozen", currentStock: 6,
        defrostedAt: NOW.getTime() - 5 * DAY_MS,
        preservedShelfLifeDays: 10,
      }),
    ];
    const result = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
    });
    expect(result.expiring).toHaveLength(1);
    expect(result.expiring[0].daysLeft).toBe(5);
  });

  it("skips batches whose plan is not done", () => {
    const plans = [plan({ id: "p_active", status: "active", completedAt: new Date(NOW.getTime() - 25 * DAY_MS) })];
    const planProducts = [pb({ id: "pb_active", planId: "p_active", currentStock: 8 })];
    const result = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
    });
    expect(result.expiring).toEqual([]);
  });

  it("respects a custom expiringWithinDays window", () => {
    // 14 days out — outside default 7-day window, inside a 30-day window.
    const plans = [plan({ completedAt: new Date(NOW.getTime() - 7 * DAY_MS) })];
    const planProducts = [pb({ id: "pb", currentStock: 4 })];
    const within7 = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
    });
    const within30 = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
      expiringWithinDays: 30,
    });
    expect(within7.expiring).toHaveLength(0);
    expect(within30.expiring).toHaveLength(1);
  });
});

describe("computeTodaySignals — low-stock products", () => {
  it("flags products whose total stock falls below the threshold", () => {
    const products = productMap([
      { id: "prodA", name: "Yuzu",      lowStockThreshold: 50 },
      { id: "prodB", name: "Pistachio", lowStockThreshold: 40 },
      { id: "prodC", name: "No threshold set" },
    ]);
    const plans = [plan({ completedAt: new Date(NOW.getTime() - 7 * DAY_MS) })];
    const planProducts: PlanProduct[] = [
      pb({ id: "1", productId: "prodA", currentStock: 10 }), // 10 / 50 = 0.2
      pb({ id: "2", productId: "prodA", currentStock: 5 }),  // total 15 → still below 50
      pb({ id: "3", productId: "prodB", currentStock: 60 }), // above threshold → excluded
      pb({ id: "4", productId: "prodC", currentStock: 1 }),  // no threshold → excluded
    ];
    const result = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
    });
    expect(result.lowStockProducts.map((p) => p.productId)).toEqual(["prodA"]);
    expect(result.lowStockProducts[0].pieces).toBe(15);
    expect(result.lowStockProducts[0].threshold).toBe(50);
  });

  it("orders by severity — out-of-stock before merely low", () => {
    const products = productMap([
      { id: "prodA", name: "Almost gone", lowStockThreshold: 50 },
      { id: "prodB", name: "Out",         lowStockThreshold: 30 },
    ]);
    const plans = [plan({ completedAt: new Date(NOW.getTime() - 7 * DAY_MS) })];
    const planProducts = [
      pb({ id: "a", productId: "prodA", currentStock: 20 }), // 20/50 = 0.4
      // prodB has zero stock (no plan products) → ratio 0
    ];
    const result = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
    });
    expect(result.lowStockProducts.map((p) => p.productId)).toEqual(["prodB", "prodA"]);
  });

  it("counts only pieces from done plans (not frozen, not gone)", () => {
    const products = productMap([{ id: "prodA", name: "Yuzu", lowStockThreshold: 100 }]);
    const plans: ProductionPlan[] = [
      plan({ id: "p_done",  status: "done",   completedAt: new Date(NOW.getTime() - 7 * DAY_MS) }),
      plan({ id: "p_draft", status: "draft" }),
    ];
    const planProducts: PlanProduct[] = [
      pb({ id: "1", planId: "p_done",  productId: "prodA", currentStock: 30 }),
      pb({ id: "2", planId: "p_done",  productId: "prodA", currentStock: 200, stockStatus: "gone" }),
      pb({ id: "3", planId: "p_draft", productId: "prodA", currentStock: 999 }), // not done — ignored
    ];
    const result = computeTodaySignals({
      now: NOW, plans, planProducts, products, pendingShoppingCount: 0, sales: [],
    });
    expect(result.lowStockProducts).toHaveLength(1);
    expect(result.lowStockProducts[0].pieces).toBe(30);
  });
});

describe("computeTodaySignals — week revenue & box count", () => {
  function sale(soldAtMs: number, price: number, status: "sold" | "prepared" = "sold"): Sale {
    return {
      id: Math.random().toString(),
      collectionId: "c", packagingId: "p",
      cells: [],
      price,
      status,
      preparedAt: new Date(soldAtMs - 60_000),
      soldAt: status === "sold" ? new Date(soldAtMs) : undefined,
    } as Sale;
  }

  it("sums sold sales in the today + previous 6 days window", () => {
    const todayStart = new Date(NOW); todayStart.setHours(0, 0, 0, 0);
    const sales: Sale[] = [
      sale(todayStart.getTime() + 3 * 60 * 60 * 1000, 25), // today
      sale(todayStart.getTime() - 3 * DAY_MS, 18),         // 3 days ago
      sale(todayStart.getTime() - 6 * DAY_MS, 32),         // exactly 6 days ago — included
      sale(todayStart.getTime() - 7 * DAY_MS, 99),         // 7 days ago — excluded
      sale(todayStart.getTime() - 1 * DAY_MS, 10, "prepared"), // prepared, not sold — excluded
    ];
    const result = computeTodaySignals({
      now: NOW, plans: [], planProducts: [], products: new Map(),
      pendingShoppingCount: 0, sales,
    });
    expect(result.weekBoxesSold).toBe(3);
    expect(result.weekRevenue).toBe(25 + 18 + 32);
  });
});

describe("computeTodaySignals — shopping count passthrough", () => {
  it("forwards pendingShoppingCount unchanged", () => {
    const result = computeTodaySignals({
      now: NOW, plans: [], planProducts: [], products: new Map(),
      pendingShoppingCount: 7, sales: [],
    });
    expect(result.pendingShoppingCount).toBe(7);
  });
});

// Suppress the unused-import warning for WEEK_MS — kept available for
// readability in any future test that needs the constant explicitly.
void WEEK_MS;
