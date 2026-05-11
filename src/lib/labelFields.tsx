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
  LabelDateFormat,
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
  /** Default font size in points. Used by the renderer when `props.size` is
   *  unset, and by the inspector to pre-fill / reset the size control.
   *  Omitted for fields without text (logo, qr, divider, image). */
  defaultSizePt?: number;
}

export const FIELD_DEFINITIONS: Record<LabelFieldType, FieldDefinition> = {
  // product / batch (auto)
  name:     { type: "name",     group: "product", label: "Product name",    defaultW: 50, defaultH: 8,  defaultSizePt: 22 },
  subtitle: { type: "subtitle", group: "product", label: "Subtitle / line", defaultW: 50, defaultH: 4,  defaultSizePt: 10 },
  weight:   { type: "weight",   group: "product", label: "Net weight",      defaultW: 14, defaultH: 4,  defaultSizePt: 10 },
  ingr:     { type: "ingr",     group: "product", label: "Ingredients",     defaultW: 50, defaultH: 14, defaultSizePt: 9 },
  aller:    { type: "aller",    group: "product", label: "Allergens",       defaultW: 28, defaultH: 8,  defaultSizePt: 9 },
  nutri:    { type: "nutri",    group: "product", label: "Nutrition table", defaultW: 32, defaultH: 12, defaultSizePt: 7 },
  bbe:      { type: "bbe",      group: "product", label: "Best-before",     defaultW: 22, defaultH: 4,  defaultSizePt: 9 },
  batch:    { type: "batch",    group: "product", label: "Batch number",    defaultW: 18, defaultH: 4,  defaultSizePt: 9 },
  prodate:  { type: "prodate",  group: "product", label: "Production date", defaultW: 22, defaultH: 4,  defaultSizePt: 9 },
  origin:   { type: "origin",   group: "product", label: "Origin / cocoa %",defaultW: 28, defaultH: 4,  defaultSizePt: 9 },
  // brand / business (auto)
  logo:     { type: "logo",     group: "brand",   label: "Logo",            defaultW: 14, defaultH: 14 },
  company:  { type: "company",  group: "brand",   label: "Company info",    defaultW: 50, defaultH: 6,  defaultSizePt: 7.5 },
  contact:  { type: "contact",  group: "brand",   label: "Contact",         defaultW: 40, defaultH: 4,  defaultSizePt: 7.5 },
  socials:  { type: "socials",  group: "brand",   label: "Links",           defaultW: 40, defaultH: 6,  defaultSizePt: 7 },
  qr:       { type: "qr",       group: "brand",   label: "QR code",         defaultW: 14, defaultH: 14 },
  // custom (manual)
  text:     { type: "text",     group: "custom",  label: "Free text",       defaultW: 30, defaultH: 4,  defaultSizePt: 9 },
  divider:  { type: "divider",  group: "custom",  label: "Divider line",    defaultW: 50, defaultH: 1 },
  image:    { type: "image",    group: "custom",  label: "Image",           defaultW: 18, defaultH: 18 },
};

/** Resolve the effective font size for a field — `props.size` when set,
 *  otherwise the field type's `defaultSizePt`, otherwise a 9pt fallback for
 *  any field that might somehow lack a default. Pure. */
export function effectiveFieldSizePt(type: LabelFieldType, propsSize: number | undefined): number {
  if (Number.isFinite(propsSize) && (propsSize as number) > 0) return propsSize as number;
  return FIELD_DEFINITIONS[type].defaultSizePt ?? 9;
}

// ---------------------------------------------------------------------------
// Pure helpers — exported so the linter and tests can reach them
// ---------------------------------------------------------------------------

/** Default date pattern (ISO 8601) when no `dateFormat` prop is set. */
export const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";

/** A handful of presets the inspector exposes as one-click chips. The user can
 *  type any pattern they like into the input — these are just shortcuts. */
export const DATE_FORMAT_PRESETS: ReadonlyArray<{ pattern: string; hint: string }> = [
  { pattern: "YYYY-MM-DD", hint: "ISO" },
  { pattern: "DD/MM/YYYY", hint: "EU" },
  { pattern: "MM/DD/YYYY", hint: "US" },
  { pattern: "DD.MM.YYYY", hint: "DE" },
  { pattern: "DD-MM-YYYY", hint: "NL" },
  { pattern: "DD MM YY",   hint: "short" },
];

/** Migration map for the pre-pattern enum values. Templates saved before the
 *  switch carry strings like "iso" / "dmy-slash" which aren't valid patterns
 *  on their own; transparently rewrite them so old templates keep working. */
const LEGACY_FORMAT_MIGRATION: Record<string, string> = {
  "iso":       "YYYY-MM-DD",
  "dmy-slash": "DD/MM/YYYY",
  "mdy-slash": "MM/DD/YYYY",
  "dmy-dot":   "DD.MM.YYYY",
  "dmy-dash":  "DD-MM-YYYY",
};

// Token alternation has the longer alternatives first so "YYYY" wins over
// "YY" at the same position (JS regex left-to-right alternation), and so on.
const TOKEN_RE = /YYYY|YY|MM|M|DD|D/g;

/**
 * Format a date by substituting `YYYY` / `YY` / `MM` / `M` / `DD` / `D`
 * tokens inside the supplied pattern. Anything else in the pattern is printed
 * verbatim, so the user can mix any separator they want.
 *
 * - No localised month names → SSR/CSR identical, language-neutral.
 * - Date components read in UTC so timezone drift doesn't bump the day
 *   between server-rendered and client-rendered output.
 * - Returns an em-dash when the date is missing.
 * - Old pre-pattern enum values ("iso", "dmy-slash", …) are migrated on the
 *   fly so templates saved before this change keep printing the right date.
 */
export function formatLabelDate(date: Date | null | undefined, format: LabelDateFormat = DEFAULT_DATE_FORMAT): string {
  if (!date) return "—";
  const pattern = LEGACY_FORMAT_MIGRATION[format] ?? format;
  const yyyy = String(date.getUTCFullYear()).padStart(4, "0");
  const yy   = yyyy.slice(-2);
  const m    = String(date.getUTCMonth() + 1);
  const mm   = m.padStart(2, "0");
  const d    = String(date.getUTCDate());
  const dd   = d.padStart(2, "0");
  return pattern.replace(TOKEN_RE, (token) => {
    switch (token) {
      case "YYYY": return yyyy;
      case "YY":   return yy;
      case "MM":   return mm;
      case "M":    return m;
      case "DD":   return dd;
      case "D":    return d;
      default:     return token;
    }
  });
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
    const size = effectiveFieldSizePt("name", p.size);
    return (
      <div style={{ fontSize: `${size}pt`, fontWeight: p.weight ?? 600, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
        {context?.name || PLACEHOLDER}
      </div>
    );
  },

  subtitle: ({ field }) => {
    // A styled free-text slot — typically used for a tagline or product
    // descriptor. No auto-derivation so the field stays language-neutral; the
    // user types whatever wording fits their market.
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("subtitle", p.size);
    return (
      <div style={{ fontSize: `${size}pt`, color: "#444", whiteSpace: "pre-line" }}>
        {p.text || PLACEHOLDER}
      </div>
    );
  },

  weight: ({ field, context, template }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("weight", p.size);
    return (
      <div style={{ fontSize: `${size}pt` }}>
        {formatNetWeight(effectiveLabelWeightG(context, template))}
      </div>
    );
  },

  ingr: ({ field, context }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("ingr", p.size);
    // No heading — add a free-text field above this one to label it in your
    // language (e.g. "Ingrediënten:", "Zutaten:", "Ingredients:").
    return (
      <div style={{ fontSize: `${size}pt`, lineHeight: 1.42, color: "#222" }}>
        {renderIngredientList(context?.ingredients ?? [], p.boldAllergens !== false)}
      </div>
    );
  },

  aller: ({ field, context }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("aller", p.size);
    const allergens = context?.allergens ?? [];
    const mayContain = context?.mayContain ?? [];
    // No prose — add free-text fields next to this one for "Contains:" /
    // "May contain:" labels in your language.
    return (
      <div style={{ fontSize: `${size}pt`, lineHeight: 1.42 }}>
        {allergens.length > 0
          ? <div><b>{allergens.map(allergenLabel).join(" · ")}</b></div>
          : <div style={{ color: "#888" }}>{PLACEHOLDER}</div>}
        {mayContain.length > 0 && (
          <div style={{ color: "#666", fontStyle: "italic" }}>
            {mayContain.map(allergenLabel).join(" · ")}
          </div>
        )}
      </div>
    );
  },

  nutri: ({ field, context, marketRegion }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("nutri", p.size);
    const n = context?.nutritionPer100g ?? {};
    const nutrients = getNutrientsByMarket(marketRegion ?? "EU");
    // No "Per 100g" prose — add a free-text field above to caption the table
    // in your language. Nutrient names themselves stay (they're structural to
    // the table) and will get a translation pass with the rest of the app.
    return (
      <div style={{ fontSize: `${size}pt`, lineHeight: 1.32, color: "#222" }}>
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
    const size = effectiveFieldSizePt("bbe", p.size);
    return (
      <div style={{ fontSize: `${size}pt` }}>
        {formatLabelDate(context?.bestBefore ?? null, p.dateFormat)}
      </div>
    );
  },

  batch: ({ field, context }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("batch", p.size);
    return (
      <div style={{ fontSize: `${size}pt` }}>
        {context?.batchNumber || PLACEHOLDER}
      </div>
    );
  },

  prodate: ({ field, context }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("prodate", p.size);
    return (
      <div style={{ fontSize: `${size}pt` }}>
        {formatLabelDate(context?.producedAt ?? null, p.dateFormat)}
      </div>
    );
  },

  origin: ({ field, context }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("origin", p.size);
    return <div style={{ fontSize: `${size}pt`, color: "#222" }}>{context?.origin || PLACEHOLDER}</div>;
  },

  // ────────────────────── brand / business ──────────────────────
  logo: ({ brand }) => {
    if (brand.logo) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={brand.logo} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />;
    }
    // Empty state: a neutral framed box. No English text.
    return (
      <div style={{
        border: "1px dashed #111", borderRadius: 2, width: "100%", height: "100%",
        background: "repeating-linear-gradient(45deg, #fafafa 0 4px, #f0f0f0 4px 8px)",
      }} />
    );
  },

  company: ({ field, brand }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("company", p.size);
    return (
      <div style={{ fontSize: `${size}pt`, lineHeight: 1.35, color: "#222", whiteSpace: "pre-line" }}>
        {brand.name && <div><b>{brand.name}</b></div>}
        {brand.address && <div>{brand.address}</div>}
        {!brand.name && !brand.address && <span style={{ color: "#888" }}>{PLACEHOLDER}</span>}
      </div>
    );
  },

  contact: ({ field, brand }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("contact", p.size);
    return (
      <div style={{ fontSize: `${size}pt`, color: "#444" }}>
        {brand.contact || PLACEHOLDER}
      </div>
    );
  },

  socials: ({ field, brand }) => {
    const p = field.props ?? {};
    const size = effectiveFieldSizePt("socials", p.size);
    const socials = brand.socials ?? [];
    if (socials.length === 0) return <div style={{ fontSize: `${size}pt`, color: "#888" }}>{PLACEHOLDER}</div>;
    return (
      <div style={{ fontSize: `${size}pt`, lineHeight: 1.4, color: "#222" }}>
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
    const size = effectiveFieldSizePt("text", p.size);
    return (
      <div style={{
        fontSize: `${size}pt`,
        fontStyle: p.italic ? "italic" : "normal",
        color: "#222",
        whiteSpace: "pre-line",
      }}>
        {p.text || PLACEHOLDER}
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
      return <img src={p.image} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />;
    }
    // Empty state: a neutral framed box. No English text.
    return (
      <div style={{
        width: "100%", height: "100%", border: "1px dashed #888",
        background: "repeating-linear-gradient(45deg, #fafafa 0 4px, #f0f0f0 4px 8px)",
      }} />
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
