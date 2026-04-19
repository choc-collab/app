import { describe, it, expect } from "vitest";
import { colorToCSS, COLOR_CSS } from "./colors";

describe("colorToCSS", () => {
  it("returns exact match from custom map", () => {
    // "gold" in CSS is #FFD700 but chocolatier gold is darker
    expect(colorToCSS("gold")).toBe("#d4a017");
    expect(colorToCSS("black")).toBe("#1c1917");
    expect(colorToCSS("copper")).toBe("#b87333");
  });

  it("is case-insensitive", () => {
    expect(colorToCSS("Gold")).toBe("#d4a017");
    expect(colorToCSS("GOLD")).toBe("#d4a017");
    expect(colorToCSS("Black")).toBe("#1c1917");
  });

  it("trims leading/trailing whitespace", () => {
    expect(colorToCSS("  gold  ")).toBe("#d4a017");
    expect(colorToCSS(" black")).toBe("#1c1917");
  });

  it("returns partial match when input contains a known color name", () => {
    // "pure gold" — no COLOR_CSS key appears before "gold" in iteration order
    expect(colorToCSS("pure gold")).toBe(COLOR_CSS["gold"]);
    // "dark gold" — same
    expect(colorToCSS("dark gold")).toBe(COLOR_CSS["gold"]);
  });

  it("returns a valid CSS named color as-is when not in custom map", () => {
    // "lime" and "aqua" are valid CSS named colors not in the custom map
    expect(colorToCSS("lime")).toBe("lime");
    expect(colorToCSS("aqua")).toBe("aqua");
  });

  it("extracts a CSS named color from a multi-word name", () => {
    // "bright aqua" — "aqua" is a CSS named color; neither word hits the custom map
    expect(colorToCSS("bright aqua")).toBe("aqua");
  });

  it("returns the neutral gray fallback for completely unknown colors", () => {
    expect(colorToCSS("xyzzy")).toBe("#9ca3af");
    // "cerulean-mist" contains no substring that matches any custom or CSS named color
    expect(colorToCSS("cerulean-mist")).toBe("#9ca3af");
  });

  it("returns fallback for empty string", () => {
    expect(colorToCSS("")).toBe("#9ca3af");
  });

  it("all entries in COLOR_CSS are resolvable via colorToCSS", () => {
    for (const name of Object.keys(COLOR_CSS)) {
      expect(colorToCSS(name)).toBe(COLOR_CSS[name]);
    }
  });
});
