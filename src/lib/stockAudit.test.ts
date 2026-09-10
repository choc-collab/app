import { describe, it, expect } from "vitest";
import { computeStockAudit, STOCK_COUNT_INTERVAL_DAYS } from "./stockAudit";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-10T09:00:00Z").getTime();
const daysAgo = (n: number) => NOW - n * DAY;

describe("computeStockAudit", () => {
  it("stays quiet when nothing is in stock", () => {
    const s = computeStockAudit({ now: NOW, products: [], oldestStockAt: daysAgo(60) });
    expect(s.due).toBe(false);
    expect(s.reason).toBeNull();
    expect(s.trackedProducts).toBe(0);
  });

  it("stays quiet when the most recent count is inside the interval", () => {
    const s = computeStockAudit({
      now: NOW,
      products: [{ productId: "p1", stockCountedAt: daysAgo(3) }],
    });
    expect(s.due).toBe(false);
    expect(s.daysAgo).toBe(3);
  });

  it("fires once the most recent count is a week old", () => {
    const s = computeStockAudit({
      now: NOW,
      products: [{ productId: "p1", stockCountedAt: daysAgo(7) }],
    });
    expect(s.due).toBe(true);
    expect(s.reason).toBe("stale");
    expect(s.daysAgo).toBe(7);
  });

  it("uses the most recent count across products, not the oldest", () => {
    const s = computeStockAudit({
      now: NOW,
      products: [
        { productId: "p1", stockCountedAt: daysAgo(40) },
        { productId: "p2", stockCountedAt: daysAgo(2) },
      ],
    });
    expect(s.due).toBe(false);
    expect(s.lastCountedAt).toBe(daysAgo(2));
    expect(s.daysAgo).toBe(2);
  });

  it("reminds about never-counted stock once the stock itself is old enough", () => {
    const s = computeStockAudit({
      now: NOW,
      products: [{ productId: "p1" }],
      oldestStockAt: daysAgo(9),
    });
    expect(s.due).toBe(true);
    expect(s.reason).toBe("never-counted");
    expect(s.lastCountedAt).toBeNull();
    expect(s.daysAgo).toBe(9);
    expect(s.neverCountedProducts).toBe(1);
  });

  it("does not nag about never-counted stock that was made this week", () => {
    const s = computeStockAudit({
      now: NOW,
      products: [{ productId: "p1" }],
      oldestStockAt: daysAgo(2),
    });
    expect(s.due).toBe(false);
    expect(s.reason).toBeNull();
  });

  it("stays quiet when there is nothing at all to measure against", () => {
    const s = computeStockAudit({ now: NOW, products: [{ productId: "p1" }] });
    expect(s.due).toBe(false);
    expect(s.daysAgo).toBeNull();
  });

  it("prefers a real count over the stock age even when the stock is older", () => {
    const s = computeStockAudit({
      now: NOW,
      products: [{ productId: "p1", stockCountedAt: daysAgo(1) }],
      oldestStockAt: daysAgo(90),
    });
    expect(s.due).toBe(false);
    expect(s.reason).toBeNull();
    expect(s.daysAgo).toBe(1);
  });

  it("counts how many in-stock products have never been counted", () => {
    const s = computeStockAudit({
      now: NOW,
      products: [
        { productId: "p1", stockCountedAt: daysAgo(10) },
        { productId: "p2" },
        { productId: "p3" },
      ],
    });
    expect(s.trackedProducts).toBe(3);
    expect(s.neverCountedProducts).toBe(2);
    expect(s.due).toBe(true);
  });

  it("honours a caller-supplied interval", () => {
    const input = { now: NOW, products: [{ productId: "p1", stockCountedAt: daysAgo(10) }] };
    expect(computeStockAudit({ ...input, intervalDays: 14 }).due).toBe(false);
    expect(computeStockAudit({ ...input, intervalDays: 3 }).due).toBe(true);
  });

  it("defaults to a one-week interval", () => {
    expect(STOCK_COUNT_INTERVAL_DAYS).toBe(7);
    expect(computeStockAudit({ now: NOW, products: [{ productId: "p1", stockCountedAt: daysAgo(6) }] }).due).toBe(false);
    expect(computeStockAudit({ now: NOW, products: [{ productId: "p1", stockCountedAt: daysAgo(8) }] }).due).toBe(true);
  });

  it("ignores a malformed stockCountedAt instead of treating it as a count", () => {
    const s = computeStockAudit({
      now: NOW,
      products: [{ productId: "p1", stockCountedAt: NaN }],
      oldestStockAt: daysAgo(30),
    });
    expect(s.lastCountedAt).toBeNull();
    expect(s.reason).toBe("never-counted");
    expect(s.neverCountedProducts).toBe(1);
  });
});
