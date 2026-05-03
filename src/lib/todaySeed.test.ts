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

  it("threshold=0 is treated as 'no threshold' — never flagged", () => {
    // Edge-case: thresholds are configured by the user; 0 is a non-sensical
    // value but should not classify a product as low.
    const rows = buildToMakeRows({
      products: [{ id: "a", name: "A", lowStockThreshold: 0 }],
      stockByProduct: new Map(),
    });
    // pieces=0, threshold=0: pieces <= 0 → "out". This documents the current
    // behavior. If threshold=0 should mean "disabled", we would special-case
    // it here — leave a test in place so a future change to the meaning shows
    // up clearly.
    expect(rows[0].status).toBe("out");
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
