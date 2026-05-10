/**
 * Pure renderers for every label field type.
 *
 * Each renderer is a stateless function of `(LabelContext, Brand, props,
 * piecesPerLabel) -> ReactElement`. They are deliberately:
 *   - pure (no DB / no React hooks / no `Date.now()` / no `Math.random()`),
 *     so the same template renders identically in the editor canvas,
 *     `window.print()` output, and a future server-side PDF generator;
 *   - styled inline (no Tailwind classes), so `@media print` doesn't trip on
 *     missing global stylesheets and printers reproduce the editor's pixel
 *     positioning at exact mm sizes;
 *   - locale-stable (en-GB date format) so SSR/CSR renders match per the
 *     hydration guidelines in AGENT.md.
 *
 * Field types are grouped by binding source:
 *   - `product` : auto-bound to `LabelContext`
 *   - `brand`   : auto-bound to the user's `Brand` profile
 *   - `custom`  : template-local content (free text, divider, image)
 *
 * The registries `FIELD_DEFINITIONS` and `FIELD_RENDERERS` are the single
 * sources of truth. Adding a new field type is one entry in each.
 */

import * as React from "react";
import type {
  Brand,
  LabelContext,
  LabelContextIngredient,
  LabelField,
  LabelFieldProps,
  LabelFieldType,
  LabelTemplate,
  MarketRegion,
} from "@/types";
import { allergenLabel } from "@/types";
import { getNutrientsByMarket } from "@/lib/nutrition";

// ---------------------------------------------------------------------------
// Definitions — group + default size + display label per field type
// ---------------------------------------------------------------------------

export type LabelFieldGroup = "product" | "brand" | "custom";

export interface FieldDefinition {
  type: LabelFieldType;
  group: LabelFieldGroup;
  /** Display name shown in the editor's left rail and inspector. */
  label: string;
  /** Default width in millimetres when the field is dropped onto the canvas. */
  defaultW: number;
  /** Default height in millimetres when the field is dropped onto the canvas. */
  defaultH: number;
}

export const FIELD_DEFINITIONS: Record<LabelFieldType, FieldDefinition> = {
  // product / batch (auto)
  name:     { type: "name",     group: "product", label: "Product name",    defaultW: 50, defaultH: 8 },
  subtitle: { type: "subtitle", group: "product", label: "Subtitle / line", defaultW: 50, defaultH: 4 },
  weight:   { type: "weight",   group: "product", label: "Net weight",      defaultW: 14, defaultH: 4 },
  ingr:     { type: "ingr",     group: "product", label: "Ingredients",     defaultW: 50, defaultH: 14 },
  aller:    { type: "aller",    group: "product", label: "Allergens",       defaultW: 28, defaultH: 8 },
  nutri:    { type: "nutri",    group: "product", label: "Nutrition table", defaultW: 32, defaultH: 12 },
  bbe:      { type: "bbe",      group: "product", label: "Best-before",     defaultW: 22, defaultH: 4 },
  batch:    { type: "batch",    group: "product", label: "Batch number",    defaultW: 18, defaultH: 4 },
  prodate:  { type: "prodate",  group: "product", label: "Production date", defaultW: 22, defaultH: 4 },
  origin:   { type: "origin",   group: "product", label: "Origin / cocoa %",defaultW: 28, defaultH: 4 },
  // brand / business (auto)
  logo:     { type: "logo",     group: "brand",   label: "Logo",            defaultW: 14, defaultH: 14 },
  company:  { type: "company",  group: "brand",   label: "Company info",    defaultW: 50, defaultH: 6 },
  contact:  { type: "contact",  group: "brand",   label: "Contact",         defaultW: 40, defaultH: 4 },
  socials:  { type: "socials",  group: "brand",   label: "Links",           defaultW: 40, defaultH: 6 },
  qr:       { type: "qr",       group: "brand",   label: "QR code",         defaultW: 14, defaultH: 14 },
  // custom (manual)
  text:     { type: "text",     group: "custom",  label: "Free text",       defaultW: 30, defaultH: 4 },
  divider:  { type: "divider",  group: "custom",  label: "Divider line",    defaultW: 50, defaultH: 1 },
  image:    { type: "image",    group: "custom",  label: "Image",           defaultW: 18, defaultH: 18 },
};

// ---------------------------------------------------------------------------
// Pure helpers — exported so the linter and tests can reach them
// ---------------------------------------------------------------------------

/** Format a date in en-GB short style (e.g. "21 May 2026"). Locale is fixed
 *  so SSR and CSR produce identical strings — required by the hydration
 *  contract documented in AGENT.md. */
export function formatLabelDate(date: Date | null | undefined): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Returns the effective pieces-per-label for a template. Defaults to 1 when
 *  the template hasn't set the override. */
export function effectivePiecesPerLabel(template: Pick<LabelTemplate, "piecesPerLabel"> | null | undefined): number {
  const n = template?.piecesPerLabel;
  return Number.isFinite(n) && (n as number) > 0 ? (n as number) : 1;
}

/** Net weight of one label, in grams. */
export function effectiveLabelWeightG(context: LabelContext | null, template: Pick<LabelTemplate, "piecesPerLabel"> | null | undefined): number {
  if (!context) return 0;
  return Math.round(context.perCavityWeightG * effectivePiecesPerLabel(template) * 10) / 10;
}

/** Format the net weight as printed on a label (e.g. "90g"). Falls back to
 *  an em-dash when the weight is unknown. */
export function formatNetWeight(grams: number): string {
  if (!Number.isFinite(grams) || grams <= 0) return "—";
  // Whole grams above 10g, one decimal otherwise.
  return grams >= 10 ? `${Math.round(grams)}g` : `${grams.toFixed(1)}g`;
}

/** Render the ingredient list as inline JSX, bolding ingredients that carry
 *  any allergen when `boldAllergens` is true. Names are joined with ", ". */
export function renderIngredientList(
  ingredients: ReadonlyArray<LabelContextIngredient>,
  boldAllergens: boolean,
): React.ReactNode {
  if (ingredients.length === 0) return "—";
  return ingredients.map((ing, i) => (
    <React.Fragment key={i}>
      {i > 0 && ", "}
      {boldAllergens && ing.allergens.length > 0 ? <b>{ing.name}</b> : ing.name}
    </React.Fragment>
  ));
}

// ---------------------------------------------------------------------------
// Style fragments
// ---------------------------------------------------------------------------

const HEADING_STYLE: React.CSSProperties = {
  fontFamily: "ui-monospace, Menlo, monospace",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#666",
  marginBottom: 1,
};

function headingStyle(baseSize: number): React.CSSProperties {
  return { ...HEADING_STYLE, fontSize: `${baseSize * 0.78}pt` };
}

// ---------------------------------------------------------------------------
// Renderer registry
// ---------------------------------------------------------------------------

export interface RenderFieldInput {
  field: LabelField;
  context: LabelContext | null;
  brand: Brand;
  template: Pick<LabelTemplate, "piecesPerLabel"> | null;
  /** User's target market from `userPreferences.marketRegion`. Drives the
   *  market-aware fields (today only `nutri` — different markets render
   *  different nutrient sets, e.g. EU shows kJ+kcal+salt, US shows
   *  Calories+sodium+vitamins). When omitted (e.g. older callers), defaults
   *  to "EU" inside the renderers that read it. */
  marketRegion?: MarketRegion;
}

export type FieldRenderer = (input: RenderFieldInput) => React.ReactElement;

/** Stable placeholder when a product/batch field is rendered without a
 *  resolved `LabelContext`. Used by the editor's empty state. */
const PLACEHOLDER = "—";

const RENDERERS: Record<LabelFieldType, FieldRenderer> = {
  // ────────────────────── product / batch ──────────────────────
  name: ({ field, context }) => {
    const p = field.props ?? {};
    return (
      <div style={{ fontSize: `${p.size ?? 22}pt`, fontWeight: p.weight ?? 600, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
        {context?.name || PLACEHOLDER}
      </div>
    );
  },

  subtitle: ({ field, context, template }) => {
    const p = field.props ?? {};
    if (p.text) {
      return <div style={{ fontSize: `${p.size ?? 10}pt`, color: "#444" }}>{p.text}</div>;
    }
    const pieces = effectivePiecesPerLabel(template);
    const weightG = effectiveLabelWeightG(context, template);
    const parts: string[] = [];
    if (pieces > 1) parts.push(`${pieces} pieces`);
    if (weightG > 0) parts.push(formatNetWeight(weightG));
    return <div style={{ fontSize: `${p.size ?? 10}pt`, color: "#444" }}>{parts.length > 0 ? parts.join(" · ") : PLACEHOLDER}</div>;
  },

  weight: ({ field, context, template }) => {
    const p = field.props ?? {};
    return (
      <div style={{ fontSize: `${p.size ?? 10}pt` }}>
        {formatNetWeight(effectiveLabelWeightG(context, template))}
      </div>
    );
  },

  ingr: ({ field, context }) => {
    const p = field.props ?? {};
    const size = p.size ?? 9;
    return (
      <div style={{ fontSize: `${size}pt`, lineHeight: 1.42, color: "#222" }}>
        {p.showLabel !== false && <div style={headingStyle(size)}>Ingredients</div>}
        {renderIngredientList(context?.ingredients ?? [], p.boldAllergens !== false)}
      </div>
    );
  },

  aller: ({ field, context }) => {
    const p = field.props ?? {};
    const size = p.size ?? 9;
    const allergens = context?.allergens ?? [];
    const mayContain = context?.mayContain ?? [];
    return (
      <div style={{ fontSize: `${size}pt`, lineHeight: 1.42 }}>
        {p.showLabel !== false && <div style={headingStyle(size)}>Allergens</div>}
        {allergens.length > 0
          ? <div><b>{allergens.map(allergenLabel).join(" · ")}</b></div>
          : <div style={{ color: "#666" }}>None declared.</div>}
        {mayContain.length > 0 && (
          <div style={{ color: "#666" }}>
            May contain {mayContain.map((id) => allergenLabel(id).toLowerCase()).join(", ")}.
          </div>
        )}
      </div>
    );
  },

  nutri: ({ field, context, marketRegion }) => {
    const p = field.props ?? {};
    const size = p.size ?? 7;
    const n = context?.nutritionPer100g ?? {};
    const nutrients = getNutrientsByMarket(marketRegion ?? "EU");
    return (
      <div style={{ fontSize: `${size}pt`, lineHeight: 1.32, color: "#222" }}>
        <div style={{ fontWeight: 600 }}>Per 100g</div>
        {nutrients.map((nut) => {
          const val = n[nut.key];
          return (
            <div key={nut.key} style={{ paddingLeft: nut.indent * 6 }}>
              {nut.label} {val == null ? PLACEHOLDER : `${val}${nut.unit}`}
            </div>
          );
        })}
      </div>
    );
  },

  bbe: ({ field, context }) => {
    const p = field.props ?? {};
    return (
      <div style={{ fontSize: `${p.size ?? 9}pt` }}>
        <b>BBE</b> {formatLabelDate(context?.bestBefore ?? null)}
      </div>
    );
  },

  batch: ({ field, context }) => {
    const p = field.props ?? {};
    return (
      <div style={{ fontSize: `${p.size ?? 9}pt` }}>
        <b>Batch</b> {context?.batchNumber || PLACEHOLDER}
      </div>
    );
  },

  prodate: ({ field, context }) => {
    const p = field.props ?? {};
    return (
      <div style={{ fontSize: `${p.size ?? 9}pt` }}>
        Made {formatLabelDate(context?.producedAt ?? null)}
      </div>
    );
  },

  origin: ({ field, context }) => {
    const p = field.props ?? {};
    return <div style={{ fontSize: `${p.size ?? 9}pt`, color: "#222" }}>{context?.origin || PLACEHOLDER}</div>;
  },

  // ────────────────────── brand / business ──────────────────────
  logo: ({ brand }) => {
    if (brand.logo) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={brand.logo} alt="Brand logo" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />;
    }
    return (
      <div style={{
        border: "1px dashed #111", borderRadius: 2, width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "ui-monospace, Menlo, monospace", fontSize: "30%",
        color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", background: "#fafafa",
      }}>
        logo
      </div>
    );
  },

  company: ({ field, brand }) => {
    const p = field.props ?? {};
    return (
      <div style={{ fontSize: `${p.size ?? 7.5}pt`, lineHeight: 1.35, color: "#222", whiteSpace: "pre-line" }}>
        {brand.name && <div><b>{brand.name}</b></div>}
        {brand.address && <div>{brand.address}</div>}
        {!brand.name && !brand.address && <span style={{ color: "#888" }}>{PLACEHOLDER}</span>}
      </div>
    );
  },

  contact: ({ field, brand }) => {
    const p = field.props ?? {};
    return (
      <div style={{ fontSize: `${p.size ?? 7.5}pt`, color: "#444" }}>
        {brand.contact || PLACEHOLDER}
      </div>
    );
  },

  socials: ({ field, brand }) => {
    const p = field.props ?? {};
    const socials = brand.socials ?? [];
    if (socials.length === 0) return <div style={{ fontSize: `${p.size ?? 7}pt`, color: "#888" }}>{PLACEHOLDER}</div>;
    return (
      <div style={{ fontSize: `${p.size ?? 7}pt`, lineHeight: 1.4, color: "#222" }}>
        {socials.map((s, i) => (
          <div key={i}>
            <span style={{ color: "#666", marginRight: 4 }}>{s.label}</span>
            {s.url}
          </div>
        ))}
      </div>
    );
  },

  qr: ({ field, brand }) => {
    const p = field.props ?? {};
    const url = p.qrUrl || brand.socials?.[0]?.url || "";
    // Real QR generation is deferred — the editor and print preview show a
    // checkered placeholder so positioning + sizing can be designed today.
    // The placeholder still encodes its intent: a `data-qr-url` attribute lets
    // the upcoming print pipeline swap in a real <canvas>-rendered QR without
    // changing layouts.
    return (
      <div
        data-qr-url={url}
        style={{
          width: "100%", height: "100%", border: "1px solid #111",
          backgroundImage: "repeating-linear-gradient(0deg, #111 0 2px, #fff 2px 4px), repeating-linear-gradient(90deg, #111 0 2px, #fff 2px 4px)",
          backgroundBlendMode: "multiply",
        }}
      />
    );
  },

  // ────────────────────── custom ──────────────────────
  text: ({ field }) => {
    const p = field.props ?? {};
    return (
      <div style={{
        fontSize: `${p.size ?? 9}pt`,
        fontStyle: p.italic ? "italic" : "normal",
        color: "#222",
        whiteSpace: "pre-line",
      }}>
        {p.text || "Tap to edit text"}
      </div>
    );
  },

  divider: () => (
    <div style={{ borderTop: "1px solid #111", width: "100%", height: 0 }} />
  ),

  image: ({ field }) => {
    const p = field.props ?? {};
    if (p.image) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={p.image} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />;
    }
    return (
      <div style={{
        width: "100%", height: "100%", background: "#fafafa", border: "1px dashed #888",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "30%", color: "#888",
        fontFamily: "ui-monospace, Menlo, monospace", textTransform: "uppercase", letterSpacing: "0.1em",
      }}>
        image
      </div>
    );
  },
};

/** Render a single field. Use directly or via the `<RenderedLabel>` helper. */
export function renderField(input: RenderFieldInput): React.ReactElement {
  return RENDERERS[input.field.type](input);
}

/** Look up a field's metadata (group, label, defaults). */
export function getFieldDefinition(type: LabelFieldType): FieldDefinition {
  return FIELD_DEFINITIONS[type];
}

/** All field types grouped for the editor's left rail. */
export const FIELD_TYPES_BY_GROUP: Record<LabelFieldGroup, LabelFieldType[]> = {
  product: (Object.values(FIELD_DEFINITIONS).filter((d) => d.group === "product").map((d) => d.type)),
  brand:   (Object.values(FIELD_DEFINITIONS).filter((d) => d.group === "brand").map((d) => d.type)),
  custom:  (Object.values(FIELD_DEFINITIONS).filter((d) => d.group === "custom").map((d) => d.type)),
};

/** Re-export `LabelFieldProps` for renderer-adjacent callers. */
export type { LabelFieldProps };
