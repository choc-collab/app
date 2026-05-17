import { describe, expect, it } from "vitest";
import { computeDownscaleTarget, IMAGE_MAX_DIMENSION } from "./image-downscale";

describe("computeDownscaleTarget", () => {
  it("returns null when the longest edge is already at or below the cap", () => {
    expect(computeDownscaleTarget(800, 600, 1500)).toBeNull();
    expect(computeDownscaleTarget(1500, 1200, 1500)).toBeNull();
    expect(computeDownscaleTarget(1200, 1500, 1500)).toBeNull();
  });

  it("scales a landscape image down to fit the cap on its width", () => {
    expect(computeDownscaleTarget(3000, 2000, 1500)).toEqual({ width: 1500, height: 1000 });
  });

  it("scales a portrait image down to fit the cap on its height", () => {
    expect(computeDownscaleTarget(2000, 4000, 1500)).toEqual({ width: 750, height: 1500 });
  });

  it("scales a square image to a square at the cap", () => {
    expect(computeDownscaleTarget(4096, 4096, 1500)).toEqual({ width: 1500, height: 1500 });
  });

  it("rounds resulting dimensions to integers", () => {
    // 2997 * (1500/2997) = 1500 exactly; 1999 * (1500/2997) = 1000.5 → 1001 (banker's-style "round half to even" not used by Math.round; uses "round half away from zero" → 1001)
    const r = computeDownscaleTarget(2997, 1999, 1500);
    expect(r).not.toBeNull();
    expect(Number.isInteger(r!.width)).toBe(true);
    expect(Number.isInteger(r!.height)).toBe(true);
    expect(r!.width).toBe(1500);
    expect(r!.height).toBe(1001);
  });

  it("defaults to IMAGE_MAX_DIMENSION when no cap is supplied", () => {
    const r = computeDownscaleTarget(IMAGE_MAX_DIMENSION * 4, IMAGE_MAX_DIMENSION * 2);
    expect(r).toEqual({ width: IMAGE_MAX_DIMENSION, height: IMAGE_MAX_DIMENSION / 2 });
  });

  it("respects a custom cap (e.g. tighter limit for tiny thumbnails)", () => {
    expect(computeDownscaleTarget(800, 600, 200)).toEqual({ width: 200, height: 150 });
  });

  it("returns null for non-finite or non-positive inputs", () => {
    expect(computeDownscaleTarget(0, 100, 1500)).toBeNull();
    expect(computeDownscaleTarget(100, 0, 1500)).toBeNull();
    expect(computeDownscaleTarget(-1, 100, 1500)).toBeNull();
    expect(computeDownscaleTarget(NaN, 100, 1500)).toBeNull();
    expect(computeDownscaleTarget(Infinity, 100, 1500)).toBeNull();
    expect(computeDownscaleTarget(100, 100, 0)).toBeNull();
    expect(computeDownscaleTarget(100, 100, -10)).toBeNull();
  });
});
