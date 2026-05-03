import { describe, it, expect } from "vitest";
import { computeShopKpis, EMPTY_SHOP_KPIS } from "./shopKpis";
import type { Sale } from "@/types";

// A fixed reference "now" in local time — 2026-04-23 14:00:00.
// Each test case constructs Sale rows relative to this anchor.
const NOW = new Date(2026, 3, 23, 14, 0, 0);

function sold(opts: { soldAt: Date; price: number; cells?: (string | null)[] }): Sale {
  return {
    collectionId: "col1",
    packagingId: "pkg1",
    cells: opts.cells ?? ["p1", "p2", "p3", "p4"],
    price: opts.price,
    status: "sold",
    preparedAt: new Date(opts.soldAt.getTime() - 60_000),
    soldAt: opts.soldAt,
  };
}

function prepared(): Sale {
  return {
    collectionId: "col1",
    packagingId: "pkg1",
    cells: [null, null, null, null],
    price: 20,
    status: "prepared",
    preparedAt: NOW,
  };
}

describe("computeShopKpis", () => {
  it("returns empty KPIs for an empty sales list", () => {
    expect(computeShopKpis([], NOW)).toEqual(EMPTY_SHOP_KPIS);
  });

  it("sums today's sold boxes, revenue, and bonbons", () => {
    const today10 = new Date(2026, 3, 23, 10, 0, 0);
    const today12 = new Date(2026, 3, 23, 12, 30, 0);
    const kpis = computeShopKpis(
      [
        sold({ soldAt: today10, price: 12, cells: ["p1", "p2", "p3", "p4"] }),
        sold({ soldAt: today12, price: 36, cells: Array(12).fill("p1") }),
      ],
      NOW,
    );
    expect(kpis.boxesSoldToday).toBe(2);
    expect(kpis.revenueToday).toBe(48);
    expect(kpis.bonbonsToday).toBe(16);
  });

  it("counts only filled cavities (ignores null entries)", () => {
    const today = new Date(2026, 3, 23, 9, 0, 0);
    const kpis = computeShopKpis(
      [sold({ soldAt: today, price: 20, cells: ["p1", null, "p2", null] })],
      NOW,
    );
    expect(kpis.bonbonsToday).toBe(2);
  });

  it("excludes sales from yesterday from today's totals", () => {
    const yesterday = new Date(2026, 3, 22, 23, 0, 0);
    const kpis = computeShopKpis(
      [sold({ soldAt: yesterday, price: 100 })],
      NOW,
    );
    expect(kpis.boxesSoldToday).toBe(0);
    expect(kpis.revenueToday).toBe(0);
  });

  it("excludes sales from tomorrow from today's totals", () => {
    const tomorrow = new Date(2026, 3, 24, 0, 1, 0);
    const kpis = computeShopKpis(
      [sold({ soldAt: tomorrow, price: 100 })],
      NOW,
    );
    expect(kpis.boxesSoldToday).toBe(0);
  });

  it("treats midnight as the start of today (inclusive)", () => {
    const midnightToday = new Date(2026, 3, 23, 0, 0, 0);
    const kpis = computeShopKpis(
      [sold({ soldAt: midnightToday, price: 15 })],
      NOW,
    );
    expect(kpis.boxesSoldToday).toBe(1);
    expect(kpis.revenueToday).toBe(15);
  });

  it("averages box price across the 7-day window", () => {
    // 7 calendar days = today + previous 6. Boxes at day -6, -3, today.
    const minus6 = new Date(2026, 3, 17, 10, 0, 0);
    const minus3 = new Date(2026, 3, 20, 10, 0, 0);
    const today = new Date(2026, 3, 23, 10, 0, 0);
    const kpis = computeShopKpis(
      [
        sold({ soldAt: minus6, price: 20 }),
        sold({ soldAt: minus3, price: 30 }),
        sold({ soldAt: today, price: 40 }),
      ],
      NOW,
    );
    // (20 + 30 + 40) / 3 = 30
    expect(kpis.avgBox7Day).toBe(30);
  });

  it("excludes sales older than 7 days from the average", () => {
    const minus7 = new Date(2026, 3, 16, 23, 0, 0);
    const today = new Date(2026, 3, 23, 10, 0, 0);
    const kpis = computeShopKpis(
      [
        sold({ soldAt: minus7, price: 100 }),  // out of window
        sold({ soldAt: today, price: 20 }),
      ],
      NOW,
    );
    expect(kpis.avgBox7Day).toBe(20);
  });

  it("returns null avg when no sales fall in the 7-day window", () => {
    const longAgo = new Date(2026, 1, 1, 12, 0, 0);
    const kpis = computeShopKpis(
      [sold({ soldAt: longAgo, price: 50 })],
      NOW,
    );
    expect(kpis.avgBox7Day).toBeNull();
  });

  it("counts prepared boxes regardless of age", () => {
    const kpis = computeShopKpis(
      [prepared(), prepared(), prepared()],
      NOW,
    );
    expect(kpis.preparedCount).toBe(3);
  });

  it("does not count prepared boxes toward today's revenue or box count", () => {
    const kpis = computeShopKpis(
      [prepared()],
      NOW,
    );
    expect(kpis.revenueToday).toBe(0);
    expect(kpis.boxesSoldToday).toBe(0);
    expect(kpis.bonbonsToday).toBe(0);
  });

  it("skips sold sales missing a soldAt timestamp", () => {
    // A malformed row (sold without soldAt) shouldn't crash or count.
    const bad: Sale = {
      collectionId: "c",
      packagingId: "p",
      cells: ["p1"],
      price: 10,
      status: "sold",
      preparedAt: new Date(2026, 3, 23),
    };
    const kpis = computeShopKpis([bad], NOW);
    expect(kpis.boxesSoldToday).toBe(0);
  });
});
