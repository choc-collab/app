import { describe, it, expect } from "vitest";
import { lintTemplate, summariseLint } from "./labelLinter";
import type { Brand, LabelField, LabelFieldType, LabelTemplate } from "@/types";

let nextId = 0;
function field(type: LabelFieldType, overrides: Partial<LabelField> = {}): LabelField {
  nextId += 1;
  return { id: `f${nextId}`, type, x: 0, y: 0, w: 50, h: 8, ...overrides };
}

function template(overrides: Partial<LabelTemplate> = {}): LabelTemplate {
  return {
    id: "t1",
    name: "Test",
    width: 89,
    height: 36,
    fields: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ── brand-completion rules ────────────────────────────────────────────────

describe("lintTemplate — brand completeness", () => {
  it("does not warn when no brand-group fields are placed", () => {
    const fields = [field("name"), field("ingr"), field("text")];
    const warns = lintTemplate(template({ fields }));
    expect(warns.filter((w) => w.category === "brand")).toHaveLength(0);
  });

  it("warns when the company field is placed but business name/address is empty", () => {
    const fields = [field("company")];
    const warns = lintTemplate(template({ fields }), {});
    expect(warns.find((w) => w.code === "brand.company")).toBeTruthy();
  });

  it("does not warn when the brand profile fills the placed field", () => {
    const brand: Brand = { name: "Atelier Choc", address: "Prinsengracht 12" };
    const fields = [field("company")];
    const warns = lintTemplate(template({ fields }), brand);
    expect(warns.find((w) => w.code === "brand.company")).toBeUndefined();
  });

  it("warns when logo is placed but no brand logo is uploaded", () => {
    const warns = lintTemplate(template({ fields: [field("logo")] }));
    expect(warns.find((w) => w.code === "brand.logo")).toBeTruthy();
  });

  it("warns when contact is placed but brand.contact is empty", () => {
    const warns = lintTemplate(template({ fields: [field("contact")] }));
    expect(warns.find((w) => w.code === "brand.contact")).toBeTruthy();
  });

  it("warns when socials is placed but no links are configured", () => {
    const warns = lintTemplate(template({ fields: [field("socials")] }));
    expect(warns.find((w) => w.code === "brand.socials")).toBeTruthy();
  });

  it("does not warn on QR when the field has its own qrUrl override", () => {
    const fields = [field("qr", { props: { qrUrl: "https://example.com" } })];
    const warns = lintTemplate(template({ fields }));
    expect(warns.find((w) => w.code === "brand.qr")).toBeUndefined();
  });

  it("warns on QR when neither a per-field override nor a brand link is set", () => {
    const warns = lintTemplate(template({ fields: [field("qr")] }));
    expect(warns.find((w) => w.code === "brand.qr")).toBeTruthy();
  });
});

// ── layout rules ─────────────────────────────────────────────────────────

describe("lintTemplate — layout", () => {
  it("warns when a field's bounding box exceeds the canvas", () => {
    const fields = [field("text", { x: 80, y: 30, w: 50, h: 20 })]; // overflows 89×36
    const warns = lintTemplate(template({ fields }));
    const layout = warns.filter((w) => w.category === "layout");
    expect(layout).toHaveLength(1);
    expect(layout[0].code).toBe("layout.outOfBounds");
    expect(layout[0].fieldId).toBeDefined();
  });

  it("warns when a field has a negative coordinate", () => {
    const fields = [field("text", { x: -2, y: 0 })];
    const warns = lintTemplate(template({ fields }));
    expect(warns.some((w) => w.category === "layout")).toBe(true);
  });

  it("does not flag fields that fit inside the canvas", () => {
    const fields = [field("text", { x: 4, y: 4, w: 40, h: 4 })];
    const warns = lintTemplate(template({ fields }));
    expect(warns.filter((w) => w.category === "layout")).toHaveLength(0);
  });
});

// ── linter is non-prescriptive ─────────────────────────────────────────────

describe("lintTemplate — non-prescriptive", () => {
  it("emits no warnings for an empty template (no opinion on what must appear)", () => {
    const warns = lintTemplate(template({ fields: [] }));
    expect(warns).toHaveLength(0);
  });

  it("emits no warnings for a minimal product label without any 'mandatory' particulars", () => {
    // Only a name and a free-text field; no ingredients, nutrition, BBE, etc.
    // The linter does not impose regulatory requirements.
    const fields = [field("name"), field("text")];
    const warns = lintTemplate(template({ fields }));
    expect(warns).toHaveLength(0);
  });
});

// ── summariseLint ─────────────────────────────────────────────────────────

describe("summariseLint", () => {
  it("counts warnings by category", () => {
    const fields = [field("logo"), field("text", { x: -1, y: 0 })];
    const warns = lintTemplate(template({ fields }));
    const summary = summariseLint(warns);
    expect(summary.brand).toBeGreaterThan(0);
    expect(summary.layout).toBeGreaterThan(0);
  });
});
