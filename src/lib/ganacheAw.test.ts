import { describe, it, expect } from "vitest";
import { estimateAw, shelfLifeFromAw, shelfLifeFromEstimate } from "./ganacheAw";
import type { GanacheBalance } from "./ganacheBalance";

function makeBalance(overrides: Partial<GanacheBalance>): GanacheBalance {
  return {
    totalWeight: 500,
    water: 22,
    sugar: 32,
    cacaoFat: 17,
    milkFat: 17,
    otherFats: 0,
    solids: 10,
    alcohol: 0,
    ...overrides,
  };
}

describe("estimateAw", () => {
  it("returns a value in (0.5, 1.0] for a normal balanced ganache", () => {
    const est = estimateAw(makeBalance({}));
    expect(est.value).toBeGreaterThan(0.5);
    expect(est.value).toBeLessThanOrEqual(1.0);
    expect(est.lo).toBeLessThanOrEqual(est.value);
    expect(est.hi).toBeGreaterThanOrEqual(est.value);
  });

  it("decreases when sugar increases (more solute lowers Aw)", () => {
    const low  = estimateAw(makeBalance({ sugar: 20 }));
    const high = estimateAw(makeBalance({ sugar: 35 }));
    expect(high.value).toBeLessThan(low.value);
  });

  it("decreases when water decreases (less solvent raises solute fraction)", () => {
    const wet = estimateAw(makeBalance({ water: 30, sugar: 25 }));
    const dry = estimateAw(makeBalance({ water: 15, sugar: 25 }));
    expect(dry.value).toBeLessThan(wet.value);
  });

  it("decreases when alcohol increases", () => {
    const sober = estimateAw(makeBalance({ alcohol: 0 }));
    const tipsy = estimateAw(makeBalance({ alcohol: 5 }));
    const drunk = estimateAw(makeBalance({ alcohol: 10 }));
    expect(tipsy.value).toBeLessThan(sober.value);
    expect(drunk.value).toBeLessThan(tipsy.value);
  });

  it("flags low confidence when sugar exceeds 38%", () => {
    const est = estimateAw(makeBalance({ sugar: 42 }));
    expect(est.confidence).toBe("low");
    expect(est.caveats.some((c) => c.includes("sorbitol") || c.includes("polyol") || c.includes("High total sugar"))).toBe(true);
  });

  it("flags low confidence when water is below 12%", () => {
    const est = estimateAw(makeBalance({ water: 8 }));
    expect(est.confidence).toBe("low");
    expect(est.caveats.some((c) => c.toLowerCase().includes("low water"))).toBe(true);
  });

  it("flags low confidence when alcohol exceeds 8%", () => {
    const est = estimateAw(makeBalance({ alcohol: 12 }));
    expect(est.confidence).toBe("low");
    expect(est.caveats.some((c) => c.toLowerCase().includes("alcohol"))).toBe(true);
  });

  it("widens the tolerance band when multiple caveats apply", () => {
    const normal = estimateAw(makeBalance({}));
    const compounded = estimateAw(makeBalance({ sugar: 45, water: 8, alcohol: 12 }));
    expect(compounded.hi - compounded.lo).toBeGreaterThan(normal.hi - normal.lo);
  });

  it("returns degenerate output when both water and sugar are zero", () => {
    const est = estimateAw(makeBalance({ water: 0, sugar: 0, solids: 0, alcohol: 0 }));
    expect(est.confidence).toBe("low");
    expect(est.caveats.length).toBeGreaterThan(0);
  });

  it("clamps the value into [0.5, 1.0]", () => {
    // Extreme solute load to push the unclamped value below 0.5.
    const est = estimateAw(makeBalance({ water: 1, sugar: 80, solids: 10 }));
    expect(est.value).toBeGreaterThanOrEqual(0.5);
    expect(est.value).toBeLessThanOrEqual(1.0);
  });
});

describe("shelfLifeFromAw", () => {
  it("maps Aw > 0.85 to a short shelf-life band", () => {
    expect(shelfLifeFromAw(0.90).band).toBe("short");
    expect(shelfLifeFromAw(0.86).band).toBe("short");
  });

  it("maps 0.70 < Aw <= 0.85 to medium", () => {
    expect(shelfLifeFromAw(0.85).band).toBe("medium");
    expect(shelfLifeFromAw(0.75).band).toBe("medium");
    expect(shelfLifeFromAw(0.71).band).toBe("medium");
  });

  it("maps 0.60 < Aw <= 0.70 to long", () => {
    expect(shelfLifeFromAw(0.70).band).toBe("long");
    expect(shelfLifeFromAw(0.65).band).toBe("long");
    expect(shelfLifeFromAw(0.61).band).toBe("long");
  });

  it("maps Aw <= 0.60 to very_long", () => {
    expect(shelfLifeFromAw(0.60).band).toBe("very_long");
    expect(shelfLifeFromAw(0.40).band).toBe("very_long");
  });

  it("attaches plausible day windows to every band", () => {
    for (const aw of [0.95, 0.80, 0.65, 0.55]) {
      const w = shelfLifeFromAw(aw);
      expect(w.daysMin).toBeGreaterThanOrEqual(0);
      expect(w.daysMax).toBeGreaterThan(w.daysMin);
      expect(w.label.length).toBeGreaterThan(0);
    }
  });
});

describe("shelfLifeFromEstimate", () => {
  it("uses the upper bound of the Aw range — conservative (shorter shelf life)", () => {
    // A central estimate of 0.84 with ±0.04 tolerance crosses the 0.85 boundary.
    // Using hi (0.88) → short. Using value (0.84) → medium.
    const est = { value: 0.84, lo: 0.80, hi: 0.88, confidence: "medium" as const, caveats: [] };
    expect(shelfLifeFromEstimate(est).band).toBe("short");
  });
});
