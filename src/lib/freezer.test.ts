import { describe, it, expect } from "vitest";
import { remainingShelfLifeDays, defrostedSellBy, clampFreezeQty, DAY_MS, WEEK_MS } from "./freezer";

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
