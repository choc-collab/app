import { describe, it, expect } from "vitest";
import {
  formatLabelDate,
  formatNetWeight,
  effectivePiecesPerLabel,
  effectiveLabelWeightG,
  getFieldDefinition,
  FIELD_DEFINITIONS,
  FIELD_TYPES_BY_GROUP,
} from "./labelFields";
import type { LabelContext } from "@/types";

const SAMPLE_CONTEXT: LabelContext = {
  source: { kind: "production-batch", planId: "p1", planProductId: "pp1" },
  name: "Yuzu domes",
  perCavityWeightG: 10,
  totalCavityCount: 120,
  ingredients: [
    { name: "Sugar", allergens: [], amountG: 5 },
    { name: "Milk", allergens: ["milk"], amountG: 3 },
    { name: "Cocoa", allergens: [], amountG: 2 },
  ],
  allergens: ["milk"],
  mayContain: ["soybeans"],
  nutritionPer100g: { energyKj: 2280, energyKcal: 545, fat: 38, saturatedFat: 22, carbohydrate: 42, sugars: 38, protein: 6, salt: 0.1 },
  bestBefore: new Date("2026-05-21T10:00:00Z"),
  batchNumber: "B22",
  producedAt: new Date("2026-04-23T10:00:00Z"),
  origin: "Madagascar 70%",
  warnings: [],
};

// ── helpers ────────────────────────────────────────────────────────────────

describe("formatLabelDate", () => {
  const SAMPLE = new Date("2026-05-21T10:00:00Z");

  it("defaults to ISO YYYY-MM-DD when no pattern is supplied", () => {
    expect(formatLabelDate(SAMPLE)).toBe("2026-05-21");
  });

  it("substitutes the YYYY / YY / MM / M / DD / D tokens", () => {
    expect(formatLabelDate(SAMPLE, "YYYY-MM-DD")).toBe("2026-05-21");
    expect(formatLabelDate(SAMPLE, "DD/MM/YYYY")).toBe("21/05/2026");
    expect(formatLabelDate(SAMPLE, "MM/DD/YYYY")).toBe("05/21/2026");
    expect(formatLabelDate(SAMPLE, "DD.MM.YYYY")).toBe("21.05.2026");
    expect(formatLabelDate(SAMPLE, "DD-MM-YYYY")).toBe("21-05-2026");
  });

  it("supports the short 2-digit year and unpadded month/day tokens", () => {
    expect(formatLabelDate(SAMPLE, "DD MM YY")).toBe("21 05 26");
    expect(formatLabelDate(new Date("2026-01-05T10:00:00Z"), "D/M/YY")).toBe("5/1/26");
  });

  it("prints any non-token characters verbatim (custom separators are free-form)", () => {
    expect(formatLabelDate(SAMPLE, "YYYY.MM.DD")).toBe("2026.05.21");
    expect(formatLabelDate(SAMPLE, "DD~MM~YYYY")).toBe("21~05~2026");
    expect(formatLabelDate(SAMPLE, "YYYYMMDD")).toBe("20260521");
  });

  it("pads single-digit days and months for the 2-digit tokens", () => {
    expect(formatLabelDate(new Date("2026-01-05T10:00:00Z"), "DD/MM/YYYY")).toBe("05/01/2026");
    expect(formatLabelDate(new Date("2026-01-05T10:00:00Z"), "YYYY-MM-DD")).toBe("2026-01-05");
  });

  it("migrates the pre-pattern enum values transparently", () => {
    // Templates saved before the pattern rewrite carry these strings; the
    // formatter resolves them to the matching pattern.
    expect(formatLabelDate(SAMPLE, "iso")).toBe("2026-05-21");
    expect(formatLabelDate(SAMPLE, "dmy-slash")).toBe("21/05/2026");
    expect(formatLabelDate(SAMPLE, "mdy-slash")).toBe("05/21/2026");
    expect(formatLabelDate(SAMPLE, "dmy-dot")).toBe("21.05.2026");
    expect(formatLabelDate(SAMPLE, "dmy-dash")).toBe("21-05-2026");
  });

  it("returns an em-dash when the date is missing", () => {
    expect(formatLabelDate(null)).toBe("—");
    expect(formatLabelDate(undefined)).toBe("—");
    expect(formatLabelDate(null, "DD/MM/YYYY")).toBe("—");
  });
});

describe("formatNetWeight", () => {
  it("rounds to whole grams at or above 10g", () => {
    expect(formatNetWeight(89.7)).toBe("90g");
    expect(formatNetWeight(10)).toBe("10g");
  });
  it("keeps one decimal below 10g", () => {
    expect(formatNetWeight(4.5)).toBe("4.5g");
  });
  it("returns an em-dash for non-positive values", () => {
    expect(formatNetWeight(0)).toBe("—");
    expect(formatNetWeight(-5)).toBe("—");
  });
});

describe("effectivePiecesPerLabel", () => {
  it("defaults to 1 when omitted", () => {
    expect(effectivePiecesPerLabel({})).toBe(1);
    expect(effectivePiecesPerLabel(null)).toBe(1);
    expect(effectivePiecesPerLabel({ piecesPerLabel: undefined })).toBe(1);
  });
  it("uses the configured value when positive", () => {
    expect(effectivePiecesPerLabel({ piecesPerLabel: 9 })).toBe(9);
  });
  it("falls back to 1 for non-positive or NaN values", () => {
    expect(effectivePiecesPerLabel({ piecesPerLabel: 0 })).toBe(1);
    expect(effectivePiecesPerLabel({ piecesPerLabel: -3 })).toBe(1);
    expect(effectivePiecesPerLabel({ piecesPerLabel: NaN })).toBe(1);
  });
});

describe("effectiveLabelWeightG", () => {
  it("multiplies per-cavity weight by piecesPerLabel", () => {
    expect(effectiveLabelWeightG(SAMPLE_CONTEXT, { piecesPerLabel: 9 })).toBe(90);
    expect(effectiveLabelWeightG(SAMPLE_CONTEXT, {})).toBe(10);
  });
  it("returns 0 when context is null", () => {
    expect(effectiveLabelWeightG(null, { piecesPerLabel: 9 })).toBe(0);
  });
});

// ── definitions ────────────────────────────────────────────────────────────

describe("FIELD_DEFINITIONS / getFieldDefinition", () => {
  it("returns metadata for every label field type", () => {
    for (const def of Object.values(FIELD_DEFINITIONS)) {
      expect(def.label).toBeTruthy();
      expect(def.defaultW).toBeGreaterThan(0);
      expect(def.defaultH).toBeGreaterThan(0);
      expect(getFieldDefinition(def.type)).toBe(def);
    }
  });
  it("groups every field type into product / brand / custom", () => {
    const grouped = [
      ...FIELD_TYPES_BY_GROUP.product,
      ...FIELD_TYPES_BY_GROUP.brand,
      ...FIELD_TYPES_BY_GROUP.custom,
    ];
    expect(new Set(grouped).size).toBe(Object.keys(FIELD_DEFINITIONS).length);
  });
});
