import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  SEED_FROM_TODAY_LIST_KEY,
  writeSeedFromTodayList,
  consumeSeedFromTodayList,
  buildToMakeRows,
} from "./todaySeed";

// Vitest is configured for the node environment; the lib feature-detects
// `window` and no-ops when absent, so for these tests we stub a minimal
// in-memory sessionStorage on a global `window` shim.
function makeMockStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
  };
}

describe("seedFromTodayList round-trip", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { sessionStorage: makeMockStorage() });
  });

  it("writes and reads back the list", () => {
    writeSeedFromTodayList(["a", "b", "c"]);
    const stored = (globalThis as unknown as { window: Window }).window.sessionStorage.getItem(SEED_FROM_TODAY_LIST_KEY);
    expect(JSON.parse(stored!)).toEqual(["a", "b", "c"]);
    expect(consumeSeedFromTodayList()).toEqual(["a", "b", "c"]);
  });

  it("clears the key on consume so a refresh starts empty", () => {
    writeSeedFromTodayList(["a"]);
    consumeSeedFromTodayList();
    const win = (globalThis as unknown as { window: Window }).window;
    expect(win.sessionStorage.getItem(SEED_FROM_TODAY_LIST_KEY)).toBeNull();
    expect(consumeSeedFromTodayList()).toEqual([]);
  });

  it("returns [] when nothing is queued", () => {
    expect(consumeSeedFromTodayList()).toEqual([]);
  });

  it("returns [] on malformed JSON instead of throwing", () => {
    const win = (globalThis as unknown as { window: Window }).window;
    win.sessionStorage.setItem(SEED_FROM_TODAY_LIST_KEY, "{not json");
    expect(consumeSeedFromTodayList()).toEqual([]);
  });

  it("filters non-string entries from corrupt payloads", () => {
    const win = (globalThis as unknown as { window: Window }).window;
    win.sessionStorage.setItem(SEED_FROM_TODAY_LIST_KEY, JSON.stringify(["ok", 42, null, "", "also-ok"]));
    expect(consumeSeedFromTodayList()).toEqual(["ok", "also-ok"]);
  });
});

describe("buildToMakeRows", () => {
  it("classifies status from stock vs threshold", () => {
    const rows = buildToMakeRows({
      products: [
        { id: "a", name: "A", lowStockThreshold: 50 },     // pieces 0 → out
        { id: "b", name: "B", lowStockThreshold: 50 },     // pieces 30 → low
        { id: "c", name: "C", lowStockThreshold: 50 },     // pieces 80 → healthy
        { id: "d", name: "D" },                            // no threshold → healthy
      ],
      stockByProduct: new Map([["b", 30], ["c", 80], ["d", 999]]),
    });
    const byId = Object.fromEntries(rows.map((r) => [r.productId, r.status]));
    expect(byId).toEqual({ a: "out", b: "low", c: "healthy", d: "healthy" });
  });

  it("sorts most-urgent first, then alphabetical within a bucket", () => {
    const rows = buildToMakeRows({
      products: [
        { id: "z", name: "Zucchini", lowStockThreshold: 10 }, // out
        { id: "a", name: "Almond", lowStockThreshold: 10 },   // out
        { id: "m", name: "Mango", lowStockThreshold: 50 },    // low (30)
        { id: "h", name: "Healthy", lowStockThreshold: 5 },   // healthy
      ],
      stockByProduct: new Map([["m", 30], ["h", 100]]),
    });
    expect(rows.map((r) => r.productId)).toEqual(["a", "z", "m", "h"]);
  });

  it("zero stock is 'out' even when no threshold is set", () => {
    // Threshold expresses "alert me below N", but pieces=0 is a concrete
    // problem regardless of whether a threshold has been configured.
    const rows = buildToMakeRows({
      products: [
        { id: "a", name: "A" },                          // no threshold, no stock
        { id: "b", name: "B", lowStockThreshold: 0 },    // threshold=0, no stock
      ],
      stockByProduct: new Map(),
    });
    expect(rows.find((r) => r.productId === "a")?.status).toBe("out");
    expect(rows.find((r) => r.productId === "b")?.status).toBe("out");
  });

  it("non-zero stock without a threshold stays healthy (no low signal possible)", () => {
    // Without a threshold we can't say "below N", so anything > 0 is healthy.
    const rows = buildToMakeRows({
      products: [{ id: "a", name: "A" }],
      stockByProduct: new Map([["a", 5]]),
    });
    expect(rows[0].status).toBe("healthy");
  });

  it("populates frozen field when frozenByProduct is provided; doesn't affect status", () => {
    // Frozen pieces are tracked as a reserve indicator but never change the
    // status — a product with 0 available and 50 frozen is still "out".
    const rows = buildToMakeRows({
      products: [
        { id: "a", name: "A", lowStockThreshold: 50 }, // 0 stock, 30 frozen → out
        { id: "b", name: "B", lowStockThreshold: 50 }, // 20 stock, 100 frozen → low
        { id: "c", name: "C", lowStockThreshold: 5 },  // 80 stock, 0 frozen → healthy (frozen omitted)
      ],
      stockByProduct: new Map([["b", 20], ["c", 80]]),
      frozenByProduct: new Map([["a", 30], ["b", 100]]),
    });
    const byId = Object.fromEntries(rows.map((r) => [r.productId, r]));
    expect(byId.a.status).toBe("out");
    expect(byId.a.frozen).toBe(30);
    expect(byId.b.status).toBe("low");
    expect(byId.b.frozen).toBe(100);
    expect(byId.c.status).toBe("healthy");
    expect(byId.c.frozen).toBe(0);
  });

  it("frozen defaults to 0 when frozenByProduct is omitted", () => {
    const rows = buildToMakeRows({
      products: [{ id: "a", name: "A", lowStockThreshold: 5 }],
      stockByProduct: new Map([["a", 10]]),
    });
    expect(rows[0].frozen).toBe(0);
  });

  it("excludes archived products", () => {
    const rows = buildToMakeRows({
      products: [
        { id: "a", name: "A", lowStockThreshold: 5 },
        { id: "b", name: "B", lowStockThreshold: 5, archived: true },
      ],
      stockByProduct: new Map(),
    });
    expect(rows.map((r) => r.productId)).toEqual(["a"]);
  });
});
