import { describe, it, expect } from "vitest";
import {
  validateCategoryRange,
  categoryAllowsZeroShell,
  categoryAllowsFullShell,
  clampShellPercentToCategory,
  formatCategoryRange,
} from "./productCategories";

describe("validateCategoryRange", () => {
  it("accepts a sane bonbon-style range", () => {
    expect(validateCategoryRange({ shellPercentMin: 15, shellPercentMax: 50, defaultShellPercent: 30 })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("accepts a bar-style 0–100 range", () => {
    expect(validateCategoryRange({ shellPercentMin: 0, shellPercentMax: 100, defaultShellPercent: 50 })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("accepts a degenerate single-point range (min === max === default)", () => {
    expect(validateCategoryRange({ shellPercentMin: 30, shellPercentMax: 30, defaultShellPercent: 30 })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it("rejects min < 0", () => {
    const r = validateCategoryRange({ shellPercentMin: -5, shellPercentMax: 50, defaultShellPercent: 30 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Minimum shell % must be between 0 and 100");
  });

  it("rejects max > 100", () => {
    const r = validateCategoryRange({ shellPercentMin: 0, shellPercentMax: 110, defaultShellPercent: 30 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Maximum shell % must be between 0 and 100");
  });

  it("rejects default outside [0, 100]", () => {
    const r = validateCategoryRange({ shellPercentMin: 0, shellPercentMax: 100, defaultShellPercent: 150 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Default shell % must be between 0 and 100");
  });

  it("rejects min > max", () => {
    const r = validateCategoryRange({ shellPercentMin: 60, shellPercentMax: 30, defaultShellPercent: 40 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Minimum shell % cannot be greater than maximum");
  });

  it("rejects default below min", () => {
    const r = validateCategoryRange({ shellPercentMin: 20, shellPercentMax: 50, defaultShellPercent: 10 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Default shell % must lie within the min–max range");
  });

  it("rejects default above max", () => {
    const r = validateCategoryRange({ shellPercentMin: 20, shellPercentMax: 50, defaultShellPercent: 90 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Default shell % must lie within the min–max range");
  });

  it("collects multiple errors at once", () => {
    const r = validateCategoryRange({ shellPercentMin: -10, shellPercentMax: 200, defaultShellPercent: 999 });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects NaN values", () => {
    const r = validateCategoryRange({ shellPercentMin: NaN, shellPercentMax: 50, defaultShellPercent: 30 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain("Minimum shell % must be between 0 and 100");
  });
});

describe("categoryAllowsZeroShell", () => {
  it("returns true when min is exactly 0", () => {
    expect(categoryAllowsZeroShell({ shellPercentMin: 0 })).toBe(true);
  });

  it("returns false when min is positive", () => {
    expect(categoryAllowsZeroShell({ shellPercentMin: 15 })).toBe(false);
    expect(categoryAllowsZeroShell({ shellPercentMin: 1 })).toBe(false);
  });
});

describe("categoryAllowsFullShell", () => {
  it("returns true when max is exactly 100", () => {
    expect(categoryAllowsFullShell({ shellPercentMax: 100 })).toBe(true);
  });

  it("returns false when max is below 100", () => {
    expect(categoryAllowsFullShell({ shellPercentMax: 50 })).toBe(false);
    expect(categoryAllowsFullShell({ shellPercentMax: 99 })).toBe(false);
  });
});

describe("clampShellPercentToCategory", () => {
  const cat = { shellPercentMin: 15, shellPercentMax: 50 };

  it("returns the value unchanged when in range", () => {
    expect(clampShellPercentToCategory(30, cat)).toBe(30);
    expect(clampShellPercentToCategory(15, cat)).toBe(15);
    expect(clampShellPercentToCategory(50, cat)).toBe(50);
  });

  it("clamps below-min values up to min", () => {
    expect(clampShellPercentToCategory(5, cat)).toBe(15);
    expect(clampShellPercentToCategory(-100, cat)).toBe(15);
  });

  it("clamps above-max values down to max", () => {
    expect(clampShellPercentToCategory(80, cat)).toBe(50);
    expect(clampShellPercentToCategory(1000, cat)).toBe(50);
  });

  it("returns min for NaN", () => {
    expect(clampShellPercentToCategory(NaN, cat)).toBe(15);
  });

  it("works with a 0–100 bar range", () => {
    const bar = { shellPercentMin: 0, shellPercentMax: 100 };
    expect(clampShellPercentToCategory(50, bar)).toBe(50);
    expect(clampShellPercentToCategory(0, bar)).toBe(0);
    expect(clampShellPercentToCategory(100, bar)).toBe(100);
  });
});

describe("formatCategoryRange", () => {
  it("formats a typical bonbon range", () => {
    expect(formatCategoryRange({ shellPercentMin: 15, shellPercentMax: 50 })).toBe("15%–50%");
  });

  it("formats a 0–100 bar range", () => {
    expect(formatCategoryRange({ shellPercentMin: 0, shellPercentMax: 100 })).toBe("0%–100%");
  });

  it("formats a degenerate single-point range", () => {
    expect(formatCategoryRange({ shellPercentMin: 30, shellPercentMax: 30 })).toBe("30%–30%");
  });
});
