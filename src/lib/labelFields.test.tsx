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
  mayContain: ["soybeans"],
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

  it("subtitle is a styled free-text slot — renders the user's text without auto-derivation", () => {
    const html = renderToHtml(field("subtitle", { text: "Custom subtitle" }));
    expect(html).toContain("Custom subtitle");
    // No English auto-derived prose like "pieces".
    expect(html).not.toContain("pieces");
  });

  it("subtitle without text renders an em-dash placeholder (no English prose)", () => {
    expect(renderToHtml(field("subtitle"))).toContain("—");
  });

  it("weight multiplies per-cavity weight by piecesPerLabel", () => {
    expect(renderToHtml(field("weight"), SAMPLE_CONTEXT, EMPTY_BRAND, { piecesPerLabel: 9 })).toContain("90g");
  });

  it("ingr renders the ingredients list without an English heading", () => {
    const html = renderToHtml(field("ingr"));
    expect(html).toContain("<b>Milk</b>"); // allergens still bolded
    expect(html).toContain("Sugar");
    expect(html).not.toContain("Ingredients");
  });

  it("aller renders the allergen list without any 'Allergens' / 'May contain' prose", () => {
    const html = renderToHtml(field("aller"));
    expect(html).toMatch(/Milk/i);
    expect(html.toLowerCase()).not.toContain("may contain");
    expect(html).not.toContain("Allergens");
    expect(html).not.toContain("None declared");
    // The may-contain entry still appears, just without a prefix.
    expect(html).toContain("Soybeans");
  });

  it("aller with no allergens shows an em-dash placeholder (no English prose)", () => {
    const ctx: LabelContext = { ...SAMPLE_CONTEXT, allergens: [], mayContain: [] };
    const html = renderToHtml(field("aller"), ctx);
    expect(html).toContain("—");
    expect(html).not.toContain("None declared");
  });

  it("nutri renders the per-100g table in EU/UK format without a 'Per 100g' heading", () => {
    const html = renderToHtml(field("nutri"));
    expect(html).not.toContain("Per 100g");
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

  it("bbe renders the best-before date in ISO form without a 'BBE' prefix", () => {
    const html = renderToHtml(field("bbe"));
    expect(html).toContain("2026-05-21");
    expect(html).not.toContain("BBE");
  });

  it("bbe honours a per-field dateFormat pattern", () => {
    expect(renderToHtml(field("bbe", { dateFormat: "DD/MM/YYYY" }))).toContain("21/05/2026");
    expect(renderToHtml(field("bbe", { dateFormat: "MM/DD/YYYY" }))).toContain("05/21/2026");
    expect(renderToHtml(field("bbe", { dateFormat: "DD.MM.YY" }))).toContain("21.05.26");
    expect(renderToHtml(field("bbe", { dateFormat: "DD MM YY" }))).toContain("21 05 26");
  });

  it("batch shows the batch number without a 'Batch' prefix", () => {
    const html = renderToHtml(field("batch"));
    expect(html).toContain("B22");
    expect(html).not.toContain("Batch");
  });

  it("prodate renders the production date in ISO form without a 'Made' prefix", () => {
    const html = renderToHtml(field("prodate"));
    expect(html).toContain("2026-04-23");
    expect(html).not.toMatch(/\bMade\b/);
  });

  it("origin shows the shell origin string", () => {
    expect(renderToHtml(field("origin"))).toContain("Madagascar 70%");
  });

  it("logo with brand.logo unset renders a neutral placeholder (no English text)", () => {
    const html = renderToHtml(field("logo"));
    expect(html.toLowerCase()).not.toContain(">logo<");
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

  it("text falls back to an em-dash placeholder when empty (no English prose)", () => {
    const html = renderToHtml(field("text"));
    expect(html).toContain("—");
    expect(html).not.toContain("Tap to edit text");
  });

  it("divider renders a single hairline rule", () => {
    expect(renderToHtml(field("divider"))).toContain("border-top:1px solid #111");
  });

  it("image with no source renders a neutral placeholder (no English text)", () => {
    const html = renderToHtml(field("image"));
    expect(html.toLowerCase()).not.toContain(">image<");
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
