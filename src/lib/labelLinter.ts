/**
 * Label-template linter.
 *
 * A small, pure rule engine that runs on every change to a `LabelTemplate`
 * and surfaces issues in the editor's right rail. Two rule categories — both
 * mechanical, neither prescriptive about *what* must appear on a label:
 *
 *   1. **Brand-completion rules** — when a brand-group field is placed on
 *      the canvas, the user's `Brand` profile must carry the corresponding
 *      data, else the printed label shows a placeholder.
 *
 *   2. **Layout rules** — fields whose bounding box escapes the label
 *      rectangle would clip silently on print.
 *
 * The linter intentionally does not enforce regulatory frameworks. The user
 * decides what their labels need to say; the app surfaces only the issues
 * the user will see when they print (broken brand bindings, clipped fields).
 *
 * Pure: same input → same output. No DB, no React. The editor subscribes to
 * the template via the live query and re-runs the linter on every keystroke.
 */

import type { Brand, LabelField, LabelFieldType, LabelTemplate } from "@/types";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type LintCategory = "brand" | "layout";

export interface LintWarning {
  /** Stable id so the editor can suppress / dedupe / link warnings to fields. */
  code: string;
  category: LintCategory;
  message: string;
  /** Optional: the field that triggered the warning, when applicable. */
  fieldId?: string;
}

// ---------------------------------------------------------------------------
// Brand-completion rules
// ---------------------------------------------------------------------------

interface BrandCompletenessRule {
  code: string;
  /** Field types that trigger this rule when present on the template. */
  triggerTypes: ReadonlyArray<LabelFieldType>;
  message: string;
  /** Returns true when the brand profile satisfies the rule (no warning). */
  passes: (brand: Brand) => boolean;
}

const BRAND_RULES: BrandCompletenessRule[] = [
  {
    code: "brand.logo",
    triggerTypes: ["logo"],
    message: "Logo field placed but no brand logo uploaded — open Settings → Brand.",
    passes: (b) => Boolean(b.logo),
  },
  {
    code: "brand.company",
    triggerTypes: ["company"],
    message: "Company-info field placed but business name or address is empty — open Settings → Brand.",
    passes: (b) => Boolean((b.name ?? "").trim() && (b.address ?? "").trim()),
  },
  {
    code: "brand.contact",
    triggerTypes: ["contact"],
    message: "Contact field placed but no contact information is set — open Settings → Brand.",
    passes: (b) => Boolean((b.contact ?? "").trim()),
  },
  {
    code: "brand.socials",
    triggerTypes: ["socials"],
    message: "Socials field placed but no links are set — open Settings → Brand.",
    passes: (b) => (b.socials ?? []).some((s) => Boolean(s.url?.trim())),
  },
  {
    code: "brand.qr",
    triggerTypes: ["qr"],
    message: "QR field placed but no URL to encode — set the field's qrUrl prop or add a brand link.",
    passes: (b) => (b.socials ?? []).some((s) => Boolean(s.url?.trim())),
    // Note: a per-field `qrUrl` override also satisfies this rule. The check is
    // applied below in `lintBrand` so a single field with `props.qrUrl` doesn't
    // trip the warning even when the brand has no socials.
  },
];

// ---------------------------------------------------------------------------
// Layout rule — every field's bounding box must lie within the canvas
// ---------------------------------------------------------------------------

function lintLayout(template: LabelTemplate): LintWarning[] {
  const out: LintWarning[] = [];
  for (const f of template.fields) {
    const right = f.x + f.w;
    const bottom = f.y + f.h;
    const escapes = f.x < 0 || f.y < 0 || right > template.width || bottom > template.height;
    if (escapes) {
      out.push({
        code: "layout.outOfBounds",
        category: "layout",
        message: `Field extends past the label edge (${right.toFixed(1)}×${bottom.toFixed(1)}mm vs ${template.width}×${template.height}mm).`,
        fieldId: f.id,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lintBrand(template: LabelTemplate, brand: Brand): LintWarning[] {
  const out: LintWarning[] = [];
  for (const rule of BRAND_RULES) {
    const triggeringFields = template.fields.filter((f: LabelField) => rule.triggerTypes.includes(f.type));
    if (triggeringFields.length === 0) continue;
    // Special-case the QR rule: a per-field `qrUrl` override satisfies it on
    // its own, regardless of brand state.
    if (rule.code === "brand.qr") {
      const allSatisfiedLocally = triggeringFields.every((f) => Boolean(f.props?.qrUrl?.trim()));
      if (allSatisfiedLocally) continue;
    }
    if (rule.passes(brand)) continue;
    out.push({
      code: rule.code,
      category: "brand",
      message: rule.message,
      fieldId: triggeringFields[0]?.id,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/** Lint a template against the brand profile + layout invariants. Pure. */
export function lintTemplate(
  template: LabelTemplate,
  brand: Brand = {},
): LintWarning[] {
  return [
    ...lintBrand(template, brand),
    ...lintLayout(template),
  ];
}

/** Convenience: count by category. Useful for the editor's status badge. */
export function summariseLint(warnings: ReadonlyArray<LintWarning>): Record<LintCategory, number> {
  const out: Record<LintCategory, number> = { brand: 0, layout: 0 };
  for (const w of warnings) out[w.category] += 1;
  return out;
}
