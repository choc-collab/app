import { describe, it, expect } from "vitest";
import { countFillingsPerIngredient } from "./ingredientUsage";
import type { Filling, FillingIngredient } from "@/types";

function makeFilling(id: string, overrides: Partial<Filling> = {}): Filling {
  return {
    id,
    name: `Filling ${id}`,
    category: "Ganaches (Emulsions)",
    source: "",
    description: "",
    allergens: [],
    instructions: "",
    ...overrides,
  };
}

function makeRow(fillingId: string, ingredientId: string): FillingIngredient {
  return { fillingId, ingredientId, amount: 100, unit: "g" };
}

describe("countFillingsPerIngredient", () => {
  it("returns an empty map when nothing is used", () => {
    expect(countFillingsPerIngredient([], [])).toEqual(new Map());
  });

  it("counts each filling that uses an ingredient", () => {
    const counts = countFillingsPerIngredient(
      [makeRow("f1", "cream"), makeRow("f2", "cream"), makeRow("f1", "dark")],
      [makeFilling("f1"), makeFilling("f2")],
    );
    expect(counts.get("cream")).toBe(2);
    expect(counts.get("dark")).toBe(1);
  });

  it("omits ingredients no filling uses", () => {
    const counts = countFillingsPerIngredient([makeRow("f1", "cream")], [makeFilling("f1")]);
    expect(counts.has("butter")).toBe(false);
    expect(counts.get("butter") ?? 0).toBe(0);
  });

  it("counts a filling once even when it lists the same ingredient on two rows", () => {
    const counts = countFillingsPerIngredient(
      [makeRow("f1", "cream"), makeRow("f1", "cream")],
      [makeFilling("f1")],
    );
    expect(counts.get("cream")).toBe(1);
  });

  it("ignores superseded filling versions, matching the delete guard", () => {
    const counts = countFillingsPerIngredient(
      [makeRow("v1", "cream"), makeRow("v2", "cream")],
      [makeFilling("v1", { supersededAt: new Date() }), makeFilling("v2")],
    );
    expect(counts.get("cream")).toBe(1);
  });

  it("still counts archived fillings — they keep their recipe", () => {
    const counts = countFillingsPerIngredient(
      [makeRow("f1", "cream")],
      [makeFilling("f1", { archived: true })],
    );
    expect(counts.get("cream")).toBe(1);
  });

  it("ignores rows pointing at a filling that no longer exists", () => {
    const counts = countFillingsPerIngredient([makeRow("gone", "cream")], []);
    expect(counts.has("cream")).toBe(false);
  });
});
