import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  formatLabelDate,
  formatNetWeight,
  effectivePiecesPerLabel,
  effectiveLabelWeightG,
  renderIngredientList,
  renderField,
  getFieldDefinition,
  FIELD_DEFINITIONS,
  FIELD_TYPES_BY_GROUP,
} from "./labelFields";
import type { Brand, LabelContext, LabelField, LabelTemplate, MarketRegion } from "@/types";

const EMPTY_BRAND: Brand = {};
const EMPTY_TEMPLATE: Pick<LabelTemplate, "piecesPerLabel"> = {};

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
  mayContain: ["soy"],
  nutritionPer100g: { energyKj: 2280, energyKcal: 545, fat: 38, saturatedFat: 22, carbohydrate: 42, sugars: 38, protein: 6, salt: 0.1 },
  bestBefore: new Date("2026-05-21T10:00:00Z"),
  batchNumber: "B22",
  producedAt: new Date("2026-04-23T10:00:00Z"),
  origin: "Madagascar 70%",
  warnings: [],
};

function field(type: LabelField["type"], props?: LabelField["props"]): LabelField {
  return { id: "f1", type, x: 0, y: 0, w: 50, h: 8, props };
}

// ── helpers ────────────────────────────────────────────────────────────────

describe("formatLabelDate", () => {
  it("formats a date in en-GB short style", () => {
    expect(formatLabelDate(new Date("2026-05-21T10:00:00Z"))).toBe("21 May 2026");
  });
  it("returns an em-dash when the date is missing", () => {
    expect(formatLabelDate(null)).toBe("—");
    expect(formatLabelDate(undefined)).toBe("—");
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

describe("renderIngredientList", () => {
  it("returns an em-dash placeholder when the list is empty", () => {
    expect(renderIngredientList([], true)).toBe("—");
  });
  it("bolds ingredients that carry allergens when boldAllergens is true", () => {
    const html = renderToStaticMarkup(
      <>{renderIngredientList(SAMPLE_CONTEXT.ingredients, true)}</>,
    );
    expect(html).toContain("<b>Milk</b>");
    expect(html).toContain("Sugar");
    expect(html).not.toContain("<b>Sugar</b>");
  });
  it("never bolds when boldAllergens is false", () => {
    const html = renderToStaticMarkup(
      <>{renderIngredientList(SAMPLE_CONTEXT.ingredients, false)}</>,
    );
    expect(html).not.toContain("<b>");
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

// ── renderer smoke tests ───────────────────────────────────────────────────

function renderToHtml(f: LabelField, ctx: LabelContext | null = SAMPLE_CONTEXT, brand: Brand = EMPTY_BRAND, tpl = EMPTY_TEMPLATE, marketRegion: MarketRegion = "EU"): string {
  return renderToStaticMarkup(renderField({ field: f, context: ctx, brand, template: tpl, marketRegion }));
}

describe("renderField", () => {
  it("name renders the product name from context", () => {
    expect(renderToHtml(field("name"))).toContain("Yuzu domes");
  });

  it("subtitle composes pieces × weight using piecesPerLabel", () => {
    const html = renderToHtml(field("subtitle"), SAMPLE_CONTEXT, EMPTY_BRAND, { piecesPerLabel: 9 });
    expect(html).toContain("9 pieces");
    expect(html).toContain("90g");
  });

  it("subtitle with explicit text overrides the auto-derived line", () => {
    const html = renderToHtml(field("subtitle", { text: "Custom subtitle" }));
    expect(html).toContain("Custom subtitle");
    expect(html).not.toContain("pieces");
  });

  it("weight multiplies per-cavity weight by piecesPerLabel", () => {
    expect(renderToHtml(field("weight"), SAMPLE_CONTEXT, EMPTY_BRAND, { piecesPerLabel: 9 })).toContain("90g");
  });

  it("ingr renders the ingredients block with allergen emphasis on by default", () => {
    const html = renderToHtml(field("ingr"));
    expect(html).toContain("Ingredients");
    expect(html).toContain("<b>Milk</b>");
  });

  it("ingr without showLabel hides the heading", () => {
    expect(renderToHtml(field("ingr", { showLabel: false }))).not.toContain("Ingredients");
  });

  it("aller block renders allergen list and may-contain advisories", () => {
    const html = renderToHtml(field("aller"));
    expect(html).toMatch(/Milk/i);
    expect(html.toLowerCase()).toContain("may contain");
  });

  it("aller with no allergens shows 'None declared'", () => {
    const ctx: LabelContext = { ...SAMPLE_CONTEXT, allergens: [], mayContain: [] };
    expect(renderToHtml(field("aller"), ctx)).toContain("None declared");
  });

  it("nutri renders the per-100g block in EU/UK format with kJ + kcal + salt", () => {
    const html = renderToHtml(field("nutri"));
    expect(html).toContain("Per 100g");
    expect(html).toContain("Energy");
    expect(html).toContain("2280");
    expect(html).toContain("545");
    expect(html).toContain("Salt");
  });

  it("nutri swaps to FDA-style output when marketRegion is US", () => {
    const html = renderToHtml(field("nutri"), SAMPLE_CONTEXT, EMPTY_BRAND, EMPTY_TEMPLATE, "US");
    // FDA panel uses "Calories" (no kJ), and surfaces sodium / cholesterol /
    // vitamins instead of EU's "Salt" line.
    expect(html).toContain("Calories");
    expect(html).toContain("Sodium");
    expect(html).not.toContain("Salt");
  });

  it("bbe formats the best-before date", () => {
    expect(renderToHtml(field("bbe"))).toContain("21 May 2026");
  });

  it("batch shows the batch number", () => {
    expect(renderToHtml(field("batch"))).toContain("B22");
  });

  it("origin shows the shell origin string", () => {
    expect(renderToHtml(field("origin"))).toContain("Madagascar 70%");
  });

  it("logo with brand.logo unset shows the dashed placeholder", () => {
    expect(renderToHtml(field("logo"))).toContain("logo");
  });

  it("logo with brand.logo set renders an img element", () => {
    const brand: Brand = { logo: "data:image/png;base64,abc" };
    expect(renderToHtml(field("logo"), SAMPLE_CONTEXT, brand)).toContain("<img");
  });

  it("company shows brand name and address from the brand profile", () => {
    const brand: Brand = { name: "Atelier Choc", address: "Prinsengracht 12" };
    const html = renderToHtml(field("company"), SAMPLE_CONTEXT, brand);
    expect(html).toContain("Atelier Choc");
    expect(html).toContain("Prinsengracht 12");
  });

  it("contact shows brand.contact when set", () => {
    const brand: Brand = { contact: "atelierchoc.nl" };
    expect(renderToHtml(field("contact"), SAMPLE_CONTEXT, brand)).toContain("atelierchoc.nl");
  });

  it("socials renders each link", () => {
    const brand: Brand = { socials: [{ label: "Instagram", url: "@atelierchoc" }, { label: "Web", url: "atelierchoc.nl" }] };
    const html = renderToHtml(field("socials"), SAMPLE_CONTEXT, brand);
    expect(html).toContain("Instagram");
    expect(html).toContain("@atelierchoc");
    expect(html).toContain("atelierchoc.nl");
  });

  it("qr embeds the override URL into a data attribute", () => {
    const html = renderToHtml(field("qr", { qrUrl: "https://example.com" }));
    expect(html).toContain('data-qr-url="https://example.com"');
  });

  it("text renders the configured text body", () => {
    expect(renderToHtml(field("text", { text: "Store cool & dry." }))).toContain("Store cool &amp; dry.");
  });

  it("text falls back to a placeholder when empty", () => {
    expect(renderToHtml(field("text"))).toContain("Tap to edit text");
  });

  it("divider renders a single hairline rule", () => {
    expect(renderToHtml(field("divider"))).toContain("border-top:1px solid #111");
  });

  it("image with no source shows the dashed placeholder", () => {
    expect(renderToHtml(field("image"))).toContain("image");
  });

  it("image with a base64 source renders an img element", () => {
    expect(renderToHtml(field("image", { image: "data:image/png;base64,xyz" }))).toContain("<img");
  });

  it("renders gracefully when context is null (editor empty state)", () => {
    expect(renderToHtml(field("name"), null)).toContain("—");
    expect(renderToHtml(field("ingr"), null)).toContain("—");
    expect(renderToHtml(field("bbe"), null)).toContain("—");
  });
});
