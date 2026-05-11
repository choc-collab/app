import { describe, it, expect } from "vitest";
import type { Brand, LabelContext, LabelTemplate } from "@/types";
import { heuristicMeasurer, renderTemplateSvg, wrapLines } from "@/lib/labelSvg";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BLANK_BRAND: Brand = {};

const FULL_BRAND: Brand = {
  name: "Atelier Choc",
  address: "Rue du Cacao 12\n1000 Brussels",
  contact: "hello@atelier.example",
  socials: [
    { label: "web", url: "atelier.example" },
    { label: "ig",  url: "@atelierchoc" },
  ],
  logo: "data:image/png;base64,AAA",
};

const CTX: LabelContext = {
  source: { kind: "production-batch", planId: "p1", planProductId: "pp1" },
  name: "Yuzu Praline",
  perCavityWeightG: 10,
  totalCavityCount: 24,
  ingredients: [
    { name: "milk chocolate", allergens: ["milk", "soybeans"], amountG: 6 },
    { name: "yuzu juice",     allergens: [],                   amountG: 2 },
    { name: "cream",          allergens: ["milk"],             amountG: 2 },
  ],
  allergens: ["milk", "soybeans"],
  mayContain: ["nuts"],
  nutritionPer100g: { energyKj: 2100, energyKcal: 504, fat: 32, saturatedFat: 19, carbohydrate: 48, sugars: 45, protein: 6, salt: 0.1 },
  bestBefore: new Date("2026-12-15T00:00:00.000Z"),
  batchNumber: "B-1042",
  producedAt: new Date("2026-05-11T00:00:00.000Z"),
  origin: "Madagascar 70%",
  warnings: [],
};

function tpl(fields: LabelTemplate["fields"]): LabelTemplate {
  return {
    id: "t1",
    name: "test",
    width: 50,
    height: 40,
    fields,
    createdAt: new Date("2026-05-11"),
    updatedAt: new Date("2026-05-11"),
  };
}

const baseOpts = { measure: heuristicMeasurer, marketRegion: "EU" as const };

// ---------------------------------------------------------------------------
// Structural / general
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — structure", () => {
  it("emits a self-contained <svg> with xmlns + viewBox matching the template", () => {
    const svg = renderTemplateSvg(tpl([]), CTX, FULL_BRAND, baseOpts);
    expect(svg).toMatch(/<svg /);
    expect(svg).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toMatch(/viewBox="0 0 50 40"/);
    expect(svg).toMatch(/width="50mm"/);
    expect(svg).toMatch(/height="40mm"/);
    expect(svg).toMatch(/<\/svg>$/);
  });

  it("paints a white background rect so the printed sticker isn't transparent", () => {
    const svg = renderTemplateSvg(tpl([]), CTX, FULL_BRAND, baseOpts);
    expect(svg).toMatch(/<rect x="0" y="0" width="50" height="40" fill="#ffffff" \/>/);
  });

  it('switches the root width/height to 100% when sizing="fill"', () => {
    const svg = renderTemplateSvg(tpl([]), CTX, FULL_BRAND, { ...baseOpts, sizing: "fill" });
    expect(svg).toMatch(/width="100%" height="100%"/);
    expect(svg).not.toMatch(/width="50mm"/);
  });

  it("wraps each field in a <g transform=translate(x,y)> with its data-field-id and data-field-type", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "F1", type: "batch", x: 3, y: 7, w: 10, h: 4 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/<g transform="translate\(3,7\)" data-field-id="F1" data-field-type="batch">/);
  });
});

// ---------------------------------------------------------------------------
// Simple single-line text fields
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — text-only renderers", () => {
  it("name renders the context name with the default 600 weight when it fits on one line", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "name", x: 0, y: 0, w: 80, h: 8 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">Yuzu Praline</text>");
    expect(svg).toMatch(/font-weight="600"/);
  });

  it("name wraps to multiple lines when the box is narrower than the rendered text", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "name", x: 0, y: 0, w: 18, h: 14 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">Yuzu</text>");
    expect(svg).toContain(">Praline</text>");
  });

  it("name shows the em-dash placeholder when context is null", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "name", x: 0, y: 0, w: 80, h: 8 }]),
      null,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">—</text>");
  });

  it("batch / prodate / bbe / origin emit a single <text>", () => {
    const svg = renderTemplateSvg(
      tpl([
        { id: "a", type: "batch",   x: 0, y: 0,  w: 18, h: 4 },
        { id: "b", type: "prodate", x: 0, y: 5,  w: 22, h: 4, props: { dateFormat: "DD/MM/YYYY" } },
        { id: "c", type: "bbe",     x: 0, y: 10, w: 22, h: 4, props: { dateFormat: "YYYY-MM-DD" } },
        { id: "d", type: "origin",  x: 0, y: 15, w: 28, h: 4 },
      ]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">B-1042</text>");
    expect(svg).toContain(">11/05/2026</text>");
    expect(svg).toContain(">2026-12-15</text>");
    expect(svg).toContain(">Madagascar 70%</text>");
  });

  it("weight multiplies perCavityWeightG by piecesPerLabel", () => {
    const template: LabelTemplate = {
      ...tpl([{ id: "f", type: "weight", x: 0, y: 0, w: 14, h: 4 }]),
      piecesPerLabel: 9,
    };
    const svg = renderTemplateSvg(template, CTX, FULL_BRAND, baseOpts);
    // 10g × 9 = 90g
    expect(svg).toContain(">90g</text>");
  });

  it("weight falls back to em-dash when context is missing", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "weight", x: 0, y: 0, w: 14, h: 4 }]),
      null,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">—</text>");
  });
});

// ---------------------------------------------------------------------------
// Allergens block
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — allergens", () => {
  it("renders allergens bold on the first line, may-contain italic+muted on the second", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "aller", x: 0, y: 0, w: 50, h: 8 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/font-weight="700"[^>]*>Milk · Soybeans</);
    expect(svg).toMatch(/font-style="italic"[^>]*fill="#666666"[^>]*>Tree nuts<|fill="#666666"[^>]*font-style="italic"[^>]*>Tree nuts</);
  });

  it("wraps the allergen declaration when the box is narrower than the rendered text", () => {
    const ctx: LabelContext = {
      ...CTX,
      allergens: ["milk", "soybeans", "peanuts", "treenuts", "eggs", "wheat"],
      mayContain: [],
    };
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "aller", x: 0, y: 0, w: 22, h: 12 }]),
      ctx,
      FULL_BRAND,
      baseOpts,
    );
    // Multiple <text> nodes mean the declaration broke across lines (rather
    // than overflowing the field box as a single long string).
    const textNodes = svg.match(/<text /g) ?? [];
    expect(textNodes.length).toBeGreaterThan(1);
  });

  it("shows the placeholder when there are no allergens, no may-contain row", () => {
    const ctx = { ...CTX, allergens: [], mayContain: [] };
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "aller", x: 0, y: 0, w: 50, h: 8 }]),
      ctx,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">—</text>");
    expect(svg).not.toContain("font-style=\"italic\"");
  });
});

// ---------------------------------------------------------------------------
// Ingredient list — bold tokens + wrapping
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — ingredients", () => {
  it("bolds ingredient names that carry an allergen", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "ingr", x: 0, y: 0, w: 50, h: 14 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(`<tspan font-weight="700">milk chocolate</tspan>`);
    expect(svg).toContain(`<tspan font-weight="700">cream</tspan>`);
    // Non-allergen ingredient stays plain (not wrapped in tspan)
    expect(svg).toMatch(/, yuzu juice,|>yuzu juice,/);
  });

  it("respects the boldAllergens=false override", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "ingr", x: 0, y: 0, w: 50, h: 14, props: { boldAllergens: false } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).not.toContain(`<tspan font-weight="700">milk chocolate</tspan>`);
  });

  it("falls back to em-dash when there are no ingredients", () => {
    const ctx = { ...CTX, ingredients: [] };
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "ingr", x: 0, y: 0, w: 50, h: 14 }]),
      ctx,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">—</text>");
  });
});

// ---------------------------------------------------------------------------
// Nutrition table
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — nutrition table", () => {
  it("renders one <text> row per nutrient, EU set by default", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "nutri", x: 0, y: 0, w: 32, h: 14 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">Energy 2100kJ</text>");
    expect(svg).toContain(">Energy 504kcal</text>");
    expect(svg).toContain(">Fat 32g</text>");
    expect(svg).toContain(">of which saturates 19g</text>");
    expect(svg).toContain(">Salt 0.1g</text>");
  });

  it("swaps to FDA-style output when marketRegion is US", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "nutri", x: 0, y: 0, w: 32, h: 14 }]),
      CTX,
      FULL_BRAND,
      { measure: heuristicMeasurer, marketRegion: "US" },
    );
    // FDA panel uses "Calories" (no kJ) and surfaces sodium/cholesterol/vitamins
    // instead of EU's "Salt" line.
    expect(svg).toContain("Calories");
    expect(svg).toContain("Sodium");
    expect(svg).not.toContain(">Salt ");
  });

  it("renders em-dash for missing nutrient values", () => {
    const ctx = { ...CTX, nutritionPer100g: { energyKj: 2100 } };
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "nutri", x: 0, y: 0, w: 32, h: 14 }]),
      ctx,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">Energy 2100kJ</text>");
    expect(svg).toContain(">Fat —</text>");
    expect(svg).toContain(">Salt —</text>");
  });
});

// ---------------------------------------------------------------------------
// Brand block
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — brand", () => {
  it("logo emits an <image href> when the brand has a logo data URL", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "logo", x: 0, y: 0, w: 14, h: 14 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(`href="data:image/png;base64,AAA"`);
  });

  it("logo emits a dashed placeholder rect when brand.logo is unset", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "logo", x: 0, y: 0, w: 14, h: 14 }]),
      CTX,
      BLANK_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/stroke-dasharray="0\.6 0\.4"/);
  });

  it("company renders the brand name bold then address lines", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "company", x: 0, y: 0, w: 50, h: 8 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/font-weight="700"[^>]*>Atelier Choc</);
    expect(svg).toContain(">Rue du Cacao 12</text>");
    expect(svg).toContain(">1000 Brussels</text>");
  });

  it("contact renders the contact string", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "contact", x: 0, y: 0, w: 40, h: 4 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">hello@atelier.example</text>");
  });

  it("qr embeds the override URL into a data-qr-url attribute on the placeholder group", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "qr", x: 0, y: 0, w: 14, h: 14, props: { qrUrl: "https://example.com" } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(`data-qr-url="https://example.com"`);
  });

  it("qr falls back to the brand's first social URL when no override is set", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "qr", x: 0, y: 0, w: 14, h: 14 }]),
      CTX,
      FULL_BRAND, // socials[0].url === "atelier.example"
      baseOpts,
    );
    expect(svg).toContain(`data-qr-url="atelier.example"`);
  });

  it("socials renders one row per link with muted label + body url", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "socials", x: 0, y: 0, w: 40, h: 6 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">web </text>");
    expect(svg).toContain(">atelier.example</text>");
    expect(svg).toContain(">ig </text>");
    expect(svg).toContain(">@atelierchoc</text>");
  });
});

// ---------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — custom", () => {
  it("free text renders its content, splitting on \\n", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "text", x: 0, y: 0, w: 30, h: 8, props: { text: "Store cool\nDry place" } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(">Store cool</text>");
    expect(svg).toContain(">Dry place</text>");
  });

  it("free text emits italic when props.italic is set", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "text", x: 0, y: 0, w: 30, h: 4, props: { text: "Handmade", italic: true } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/font-style="italic"[^>]*>Handmade</);
  });

  it("divider emits a horizontal line at the field's vertical centre", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "divider", x: 0, y: 0, w: 50, h: 1 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/<line x1="0" y1="0\.5" x2="50" y2="0\.5"/);
  });

  it("image emits a placeholder rect when no image is set", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "image", x: 0, y: 0, w: 18, h: 18 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/stroke-dasharray="0\.6 0\.4"/);
  });

  it("image emits an <image href> when props.image is set", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "image", x: 0, y: 0, w: 18, h: 18, props: { image: "data:image/png;base64,BBB" } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(`href="data:image/png;base64,BBB"`);
  });
});

// ---------------------------------------------------------------------------
// Bold / italic — user-controlled emphasis on every text-bearing field
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — font selection", () => {
  it("emits the resolved font-family stack when props.font references a known id", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "batch", x: 0, y: 0, w: 18, h: 4, props: { font: "georgia" } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain(`Georgia`);
    expect(svg).toMatch(/font-family="[^"]*Georgia/);
  });

  it("falls back to the system default when props.font is unset", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "batch", x: 0, y: 0, w: 18, h: 4 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    // Default stack starts with -apple-system
    expect(svg).toMatch(/font-family="-apple-system/);
  });

  it("falls back to the system default when props.font is an unknown id", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "batch", x: 0, y: 0, w: 18, h: 4, props: { font: "comic-sans-gone-wild" } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/font-family="-apple-system/);
  });

  it("applies the chosen font to the ingredient-list base style and tspans inherit it", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "i", type: "ingr", x: 0, y: 0, w: 50, h: 14, props: { font: "courier" } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    // The base <text> element carries the Courier stack; the inner bold
    // allergen tspan doesn't repeat font-family (it inherits from <text>).
    expect(svg).toMatch(/<text[^>]*font-family="[^"]*Courier[^"]*"/);
    expect(svg).toContain(`<tspan font-weight="700">milk chocolate</tspan>`);
  });
});

describe("renderTemplateSvg — bold / italic toggles", () => {
  it("respects props.bold across text fields (batch, bbe, weight, origin, text)", () => {
    const svg = renderTemplateSvg(
      tpl([
        { id: "b", type: "batch",   x: 0, y: 0,  w: 18, h: 4, props: { bold: true } },
        { id: "d", type: "bbe",     x: 0, y: 5,  w: 22, h: 4, props: { bold: true } },
        { id: "w", type: "weight",  x: 0, y: 10, w: 14, h: 4, props: { bold: true } },
        { id: "o", type: "origin",  x: 0, y: 15, w: 28, h: 4, props: { bold: true } },
        { id: "t", type: "text",    x: 0, y: 20, w: 30, h: 4, props: { bold: true, text: "Handmade" } },
      ]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    // Each of the five should have font-weight="700" on its <text> element
    const matches = svg.match(/font-weight="700"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  it("respects props.italic across text fields (batch, bbe, origin, contact)", () => {
    const svg = renderTemplateSvg(
      tpl([
        { id: "b", type: "batch",   x: 0, y: 0,  w: 18, h: 4, props: { italic: true } },
        { id: "d", type: "bbe",     x: 0, y: 5,  w: 22, h: 4, props: { italic: true } },
        { id: "o", type: "origin",  x: 0, y: 10, w: 28, h: 4, props: { italic: true } },
        { id: "c", type: "contact", x: 0, y: 15, w: 40, h: 4, props: { italic: true } },
      ]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    const matches = svg.match(/font-style="italic"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it("default-weight fields stay at 400 when bold is unset", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "b", type: "batch", x: 0, y: 0, w: 18, h: 4 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    // 400 is the default and not emitted explicitly — absence is the assertion.
    expect(svg).not.toMatch(/font-weight="\d+"/);
  });

  it("aller stays bold even when props.bold is unset (regulatory natural default)", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "a", type: "aller", x: 0, y: 0, w: 28, h: 8 }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toMatch(/font-weight="700"[^>]*>Milk · Soybeans</);
  });

  it("ingr renders allergen tspans bold while the surrounding text honours props.bold", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "i", type: "ingr", x: 0, y: 0, w: 50, h: 14, props: { bold: true } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    // The base <text> weight is 700 (user toggle)…
    expect(svg).toMatch(/<text[^>]*font-weight="700"[^>]*>.*milk chocolate/);
    // …and the inner allergen tspan is still wrapped (it stays 700 anyway).
    expect(svg).toContain(`<tspan font-weight="700">milk chocolate</tspan>`);
  });
});

// ---------------------------------------------------------------------------
// Null-context handling — the editor's empty state before a source is picked
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — null context (empty editor state)", () => {
  it("auto-derived product fields fall back to em-dash placeholders", () => {
    const svg = renderTemplateSvg(
      tpl([
        { id: "n", type: "name",    x: 0,  y: 0,  w: 50, h: 8 },
        { id: "i", type: "ingr",    x: 0,  y: 9,  w: 50, h: 14 },
        { id: "b", type: "bbe",     x: 0,  y: 24, w: 22, h: 4 },
        { id: "a", type: "aller",   x: 25, y: 24, w: 25, h: 8 },
        { id: "o", type: "origin",  x: 0,  y: 30, w: 50, h: 4 },
      ]),
      null,
      FULL_BRAND,
      baseOpts,
    );
    // Count em-dashes — each null-context field should produce one.
    const dashCount = (svg.match(/—/g) ?? []).length;
    expect(dashCount).toBeGreaterThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// Wrap helper
// ---------------------------------------------------------------------------

describe("wrapLines", () => {
  it("returns one line when the text fits in the width", () => {
    expect(wrapLines("Hi there", 50, 4, 400, heuristicMeasurer)).toEqual(["Hi there"]);
  });

  it("respects explicit newlines independent of width", () => {
    const lines = wrapLines("Top\nBottom", 50, 4, 400, heuristicMeasurer);
    expect(lines).toEqual(["Top", "Bottom"]);
  });

  it("wraps at the last fitting word boundary", () => {
    // With heuristicMeasurer: char width = fontMm × 0.55.
    // fontMm = 2, so each char is ~1.1mm. 10mm wide ≈ 9 chars per line.
    const lines = wrapLines("alpha beta gamma delta", 10, 2, 400, heuristicMeasurer);
    expect(lines.length).toBeGreaterThan(1);
    // No mid-word splits
    for (const l of lines) expect(l).not.toMatch(/^.{1,3}$/);
  });

  it("returns [] for an empty string", () => {
    expect(wrapLines("", 50, 4, 400, heuristicMeasurer)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// XML escaping — guards against injection through user input
// ---------------------------------------------------------------------------

describe("renderTemplateSvg — escaping", () => {
  it("escapes XML special chars in field text", () => {
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "text", x: 0, y: 0, w: 30, h: 4, props: { text: "<b>not & html</b>" } }]),
      CTX,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain("&lt;b&gt;not &amp; html&lt;/b&gt;");
    expect(svg).not.toContain("<b>not & html</b>");
  });

  it("escapes XML special chars in ingredient names", () => {
    const ctx: LabelContext = {
      ...CTX,
      ingredients: [{ name: "cocoa <70%>", allergens: [], amountG: 5 }],
    };
    const svg = renderTemplateSvg(
      tpl([{ id: "f", type: "ingr", x: 0, y: 0, w: 50, h: 14 }]),
      ctx,
      FULL_BRAND,
      baseOpts,
    );
    expect(svg).toContain("cocoa &lt;70%&gt;");
  });
});
