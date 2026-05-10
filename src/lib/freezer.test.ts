import { describe, it, expect } from "vitest";
import { remainingShelfLifeDays, defrostedSellBy, sellBeforeDate, batchSellBy, clampFreezeQty, DAY_MS, WEEK_MS } from "./freezer";
import type { PlanProduct } from "@/types";

describe("remainingShelfLifeDays", () => {
  const now = Date.UTC(2026, 3, 14); // 14 Apr 2026

  it("returns full shelf life when just made", () => {
    expect(remainingShelfLifeDays(now, 4, now)).toBe(28);
  });

  it("shrinks as time passes", () => {
    const madeAt = now - 7 * DAY_MS;
    expect(remainingShelfLifeDays(madeAt, 4, now)).toBe(21);
  });

  it("returns 0 when expired", () => {
    const madeAt = now - 10 * WEEK_MS;
    expect(remainingShelfLifeDays(madeAt, 4, now)).toBe(0);
  });

  it("accepts weeks as string", () => {
    expect(remainingShelfLifeDays(now, "4", now)).toBe(28);
  });

  it("handles fractional weeks", () => {
    expect(remainingShelfLifeDays(now, 0.5, now)).toBe(4); // 3.5 rounds to 4
  });

  it("returns 0 for missing/invalid inputs", () => {
    expect(remainingShelfLifeDays(undefined, 4, now)).toBe(0);
    expect(remainingShelfLifeDays(now, undefined, now)).toBe(0);
    expect(remainingShelfLifeDays(now, 0, now)).toBe(0);
    expect(remainingShelfLifeDays(now, NaN, now)).toBe(0);
    expect(remainingShelfLifeDays(now, "nope", now)).toBe(0);
  });
});

describe("defrostedSellBy", () => {
  it("shifts defrostedAt forward by preserved days", () => {
    const defrostedAt = Date.UTC(2026, 3, 14);
    const result = defrostedSellBy(defrostedAt, 14);
    expect(result?.getTime()).toBe(defrostedAt + 14 * DAY_MS);
  });

  it("returns null when inputs are incomplete", () => {
    expect(defrostedSellBy(undefined, 14)).toBeNull();
    expect(defrostedSellBy(Date.now(), undefined)).toBeNull();
  });

  it("0 preserved days = same day as defrost", () => {
    const defrostedAt = Date.UTC(2026, 3, 14);
    expect(defrostedSellBy(defrostedAt, 0)?.getTime()).toBe(defrostedAt);
  });
});

describe("sellBeforeDate", () => {
  it("shifts completedAt by (weeks - 1) × 7 days", () => {
    // Convention from the original stock-page implementation: shelf life of N
    // weeks means the batch sells through to the start of the Nth week, not
    // the end. A batch made today with 4-week shelf life sells by today + 21d.
    const completedAt = new Date(Date.UTC(2026, 3, 14));
    const result = sellBeforeDate(completedAt, "4");
    const expected = new Date(completedAt);
    expected.setDate(expected.getDate() + 21);
    expect(result?.toISOString()).toBe(expected.toISOString());
  });

  it("returns null when completedAt is missing", () => {
    expect(sellBeforeDate(undefined, "4")).toBeNull();
  });

  it("returns null when shelfLifeWeeks is missing or invalid", () => {
    const completedAt = new Date(Date.UTC(2026, 3, 14));
    expect(sellBeforeDate(completedAt, undefined)).toBeNull();
    expect(sellBeforeDate(completedAt, "")).toBeNull();
    expect(sellBeforeDate(completedAt, "0")).toBeNull();
    expect(sellBeforeDate(completedAt, "-2")).toBeNull();
    expect(sellBeforeDate(completedAt, "nope")).toBeNull();
  });
});

describe("batchSellBy", () => {
  const completedAt = new Date(Date.UTC(2026, 3, 14));

  function makePb(overrides: Partial<PlanProduct> = {}): PlanProduct {
    return {
      planId: "p1",
      productId: "x",
      mouldId: "m",
      quantity: 1,
      sortOrder: 0,
      ...overrides,
    } as PlanProduct;
  }

  it("returns sellBeforeDate for an in-stock batch", () => {
    const pb = makePb();
    const result = batchSellBy(pb, completedAt, "4");
    expect(result?.toISOString()).toBe(sellBeforeDate(completedAt, "4")?.toISOString());
  });

  it("uses the defrosted sell-by once thawed", () => {
    const defrostedAt = Date.UTC(2026, 5, 1);
    const pb = makePb({ defrostedAt, preservedShelfLifeDays: 14 });
    const result = batchSellBy(pb, completedAt, "4");
    expect(result?.getTime()).toBe(defrostedAt + 14 * DAY_MS);
  });

  it("ignores a defrosted-at without preserved shelf life", () => {
    const pb = makePb({ defrostedAt: Date.UTC(2026, 5, 1) });
    const result = batchSellBy(pb, completedAt, "4");
    // falls through to sellBeforeDate
    expect(result?.toISOString()).toBe(sellBeforeDate(completedAt, "4")?.toISOString());
  });

  it("returns null when neither path can produce a date", () => {
    const pb = makePb();
    expect(batchSellBy(pb, undefined, "4")).toBeNull();
    expect(batchSellBy(pb, completedAt, undefined)).toBeNull();
  });
});

describe("clampFreezeQty", () => {
  it("clamps to available", () => {
    expect(clampFreezeQty(100, 20)).toBe(20);
  });

  it("returns the requested when within available", () => {
    expect(clampFreezeQty(10, 20)).toBe(10);
  });

  it("rounds non-integer inputs", () => {
    expect(clampFreezeQty(10.7, 20)).toBe(11);
  });

  it("returns 0 for invalid or non-positive inputs", () => {
    expect(clampFreezeQty(0, 20)).toBe(0);
    expect(clampFreezeQty(-5, 20)).toBe(0);
    expect(clampFreezeQty(NaN, 20)).toBe(0);
  });

  it("returns 0 when nothing is available", () => {
    expect(clampFreezeQty(10, 0)).toBe(0);
    expect(clampFreezeQty(10, -3)).toBe(0);
  });
});
