import { describe, it, expect } from "vitest";
import {
  ancestorFillingIds,
  buildChildMap,
  buildParentMap,
  flattenFillingToIngredients,
  reachableIngredientIds,
  wouldCreateCycle,
} from "./fillingComponents";
import type { FillingComponent, FillingIngredient } from "@/types";

function comp(fillingId: string, childFillingId: string, amount = 100): FillingComponent {
  return { fillingId, childFillingId, amount, unit: "g", sortOrder: 0 };
}

function li(fillingId: string, ingredientId: string, amount: number): FillingIngredient {
  return { fillingId, ingredientId, amount, unit: "g", sortOrder: 0 };
}

function indexBy<T extends { fillingId: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const arr = m.get(r.fillingId);
    if (arr) arr.push(r);
    else m.set(r.fillingId, [r]);
  }
  return m;
}

/** Roll up flattener output by ingredientId (most callers want totals). */
function rollUp(rows: Array<{ ingredientId: string; amount: number }>): Map<string, number> {
  const m = new Map<string, number>();
  for (const { ingredientId, amount } of rows) {
    m.set(ingredientId, (m.get(ingredientId) ?? 0) + amount);
  }
  return m;
}

describe("wouldCreateCycle", () => {
  it("rejects self-reference", () => {
    const map = buildChildMap([]);
    expect(wouldCreateCycle(map, "a", "a")).toBe(true);
  });

  it("allows a fresh edge in an empty graph", () => {
    const map = buildChildMap([]);
    expect(wouldCreateCycle(map, "host", "child")).toBe(false);
  });

  it("rejects 2-hop loop (candidate already contains the host)", () => {
    // candidate(b) → a, so adding a → b would close the loop
    const map = buildChildMap([comp("b", "a")]);
    expect(wouldCreateCycle(map, "a", "b")).toBe(true);
  });

  it("rejects 3-hop loop", () => {
    // c → b → a; adding a → c would close a → c → b → a
    const map = buildChildMap([comp("b", "a"), comp("c", "b")]);
    expect(wouldCreateCycle(map, "a", "c")).toBe(true);
  });

  it("allows a sibling edge that does not close a loop", () => {
    // a contains b. Adding a → c (where c is unrelated) is fine.
    const map = buildChildMap([comp("a", "b")]);
    expect(wouldCreateCycle(map, "a", "c")).toBe(false);
  });

  it("allows a diamond (shared descendant, not a cycle)", () => {
    // a → b, a → c, b → d, c → d. Adding b → e (e unrelated) is fine.
    const map = buildChildMap([
      comp("a", "b"),
      comp("a", "c"),
      comp("b", "d"),
      comp("c", "d"),
    ]);
    expect(wouldCreateCycle(map, "b", "e")).toBe(false);
  });

  it("terminates on a pre-existing cycle in the data", () => {
    // Pathological: data already has b → c → b. Asking about an unrelated
    // edge should still return a definite answer in finite time.
    const map = buildChildMap([comp("b", "c"), comp("c", "b")]);
    expect(wouldCreateCycle(map, "a", "z")).toBe(false);
  });
});

describe("flattenFillingToIngredients", () => {
  it("returns a flat filling's own ingredients unchanged", () => {
    const lis = indexBy([li("a", "ing1", 10), li("a", "ing2", 5)]);
    const components = indexBy<FillingComponent>([]);
    const out = rollUp(flattenFillingToIngredients("a", lis, components));
    expect(out.get("ing1")).toBe(10);
    expect(out.get("ing2")).toBe(5);
    expect(out.size).toBe(2);
  });

  it("scales nested ingredients by host's portion of the child", () => {
    // Child b: 200g sugar + 800g butter → 1000g total.
    // Host a: 100g of b (fraction 100/1000 = 0.1) + 50g of its own ing.
    const lis = indexBy([
      li("a", "own", 50),
      li("b", "sugar", 200),
      li("b", "butter", 800),
    ]);
    const components = indexBy([comp("a", "b", 100)]);
    const out = rollUp(flattenFillingToIngredients("a", lis, components));
    expect(out.get("own")).toBe(50);
    expect(out.get("sugar")).toBeCloseTo(20, 6); // 200 * 0.1
    expect(out.get("butter")).toBeCloseTo(80, 6); // 800 * 0.1
  });

  it("composes scales through a 3-level chain (a → b → c)", () => {
    // c: 100g of leafX → total 100g
    // b: 50g of c → fraction 50/100 = 0.5 → contributes 50g leafX to b
    //    b also has 50g of leafY → b totals 100g
    // a: 10g of b → fraction 10/100 = 0.1
    //   → leafX in a: 50 * 0.1 = 5
    //   → leafY in a: 50 * 0.1 = 5
    const lis = indexBy([li("c", "leafX", 100), li("b", "leafY", 50)]);
    const components = indexBy([comp("a", "b", 10), comp("b", "c", 50)]);
    const out = rollUp(flattenFillingToIngredients("a", lis, components));
    expect(out.get("leafX")).toBeCloseTo(5, 6);
    expect(out.get("leafY")).toBeCloseTo(5, 6);
  });

  it("treats a child with no rows as zero contribution (no NaN)", () => {
    const lis = indexBy([li("a", "own", 10)]);
    const components = indexBy([comp("a", "empty", 100)]);
    const out = rollUp(flattenFillingToIngredients("a", lis, components));
    expect(out.get("own")).toBe(10);
    // Empty child should not produce any rows or NaN amounts.
    for (const [, v] of out) expect(Number.isFinite(v)).toBe(true);
    expect(out.size).toBe(1);
  });

  it("survives a malformed cycle in the data", () => {
    // b → c → b — never possible via save, but the runtime must terminate.
    const lis = indexBy([li("b", "x", 50), li("c", "y", 50)]);
    const components = indexBy([comp("a", "b", 100), comp("b", "c", 100), comp("c", "b", 100)]);
    const out = rollUp(flattenFillingToIngredients("a", lis, components));
    // Just check that the call returned in finite time and produced finite numbers.
    for (const [, v] of out) expect(Number.isFinite(v)).toBe(true);
  });
});

describe("reachableIngredientIds", () => {
  it("collects ids across every nesting level", () => {
    const lis = indexBy([li("a", "x", 1), li("b", "y", 1), li("c", "z", 1)]);
    const components = indexBy([comp("a", "b"), comp("b", "c")]);
    const ids = reachableIngredientIds("a", lis, components);
    expect(ids).toEqual(new Set(["x", "y", "z"]));
  });

  it("terminates on a malformed cycle", () => {
    const lis = indexBy([li("a", "x", 1), li("b", "y", 1)]);
    const components = indexBy([comp("a", "b"), comp("b", "a")]);
    const ids = reachableIngredientIds("a", lis, components);
    expect(ids).toEqual(new Set(["x", "y"]));
  });
});

describe("ancestorFillingIds", () => {
  it("includes the leaf and every direct/indirect host", () => {
    // a → b → c
    const map = buildParentMap([comp("a", "b"), comp("b", "c")]);
    expect(ancestorFillingIds(map, "c")).toEqual(new Set(["c", "b", "a"]));
    expect(ancestorFillingIds(map, "b")).toEqual(new Set(["b", "a"]));
    expect(ancestorFillingIds(map, "a")).toEqual(new Set(["a"]));
  });

  it("handles a leaf with multiple hosts (diamond)", () => {
    const map = buildParentMap([
      comp("a", "leaf"),
      comp("b", "leaf"),
      comp("root", "a"),
      comp("root", "b"),
    ]);
    expect(ancestorFillingIds(map, "leaf")).toEqual(new Set(["leaf", "a", "b", "root"]));
  });
});
