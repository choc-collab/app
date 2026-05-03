import { describe, expect, it } from "vitest";
import { COUNTRIES, COUNTRY_NAMES, normalizeCountryInput } from "./countries";

describe("normalizeCountryInput", () => {
  it("returns canonical name unchanged", () => {
    expect(normalizeCountryInput("Netherlands")).toBe("Netherlands");
    expect(normalizeCountryInput("Belgium")).toBe("Belgium");
  });

  it("normalises common UK aliases to United Kingdom", () => {
    for (const variant of ["UK", "uk", "GB", "gb", "United Kingdom", "united kingdom", "Great Britain", "England"]) {
      expect(normalizeCountryInput(variant)).toBe("United Kingdom");
    }
  });

  it("normalises common US aliases to United States", () => {
    for (const variant of ["US", "us", "USA", "United States", "United States of America", "u.s.a."]) {
      expect(normalizeCountryInput(variant)).toBe("United States");
    }
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeCountryInput("  france  ")).toBe("France");
    expect(normalizeCountryInput("FR")).toBe("France");
    expect(normalizeCountryInput("the   netherlands")).toBe("Netherlands");
  });

  it("returns null for unrecognised input", () => {
    expect(normalizeCountryInput("Atlantis")).toBeNull();
    expect(normalizeCountryInput("")).toBeNull();
    expect(normalizeCountryInput("   ")).toBeNull();
    expect(normalizeCountryInput(undefined)).toBeNull();
    expect(normalizeCountryInput(null)).toBeNull();
    expect(normalizeCountryInput(42)).toBeNull();
  });

  it("each country has a unique 2-letter code", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(/^[A-Z]{2}$/);
  });

  it("COUNTRY_NAMES exposes the canonical names in declaration order", () => {
    expect(COUNTRY_NAMES.length).toBe(COUNTRIES.length);
    expect(COUNTRY_NAMES[0]).toBe(COUNTRIES[0].name);
  });
});
