import { describe, it, expect } from "vitest";
import { deriveShopColor, resolveShopColor, hashedFallbackColor } from "./shopColor";
import type { ShellDesignStep } from "@/types";

const MATERIALS = new Map<string, string | undefined>([
  ["m-red", "#c24e64"],
  ["m-gold", "#e5a658"],
  ["m-white-no-color", undefined],
  ["m-blue-empty", "   "], // whitespace-only counts as no color
]);

function step(technique: string, materialIds: string[], applyAt?: ShellDesignStep["applyAt"]): ShellDesignStep {
  return { technique, materialIds, applyAt };
}

describe("deriveShopColor", () => {
  it("returns the explicit shopColor when set", () => {
    const color = deriveShopColor(
      { name: "X", shopColor: "#123456", shellDesign: [step("Airbrushing", ["m-gold"], "colour")] },
      MATERIALS,
    );
    expect(color).toBe("#123456");
  });

  it("returns undefined for a product with no shell design and no shopColor", () => {
    expect(deriveShopColor({ name: "Plain" }, MATERIALS)).toBeUndefined();
  });

  it("returns the first material color on a colour-phase step", () => {
    const color = deriveShopColor(
      { name: "X", shellDesign: [step("Airbrushing", ["m-gold", "m-red"], "colour")] },
      MATERIALS,
    );
    expect(color).toBe("#e5a658");
  });

  it("walks steps in declaration order", () => {
    const color = deriveShopColor(
      {
        name: "X",
        shellDesign: [
          step("Spin & Drip", ["m-red"], "colour"),
          step("Airbrushing", ["m-gold"], "colour"),
        ],
      },
      MATERIALS,
    );
    expect(color).toBe("#c24e64");
  });

  it("walks past materials with missing colors", () => {
    const color = deriveShopColor(
      {
        name: "X",
        shellDesign: [step("Airbrushing", ["m-white-no-color", "m-gold"], "colour")],
      },
      MATERIALS,
    );
    expect(color).toBe("#e5a658");
  });

  it("walks past materials with whitespace-only colors", () => {
    const color = deriveShopColor(
      {
        name: "X",
        shellDesign: [step("Brushing", ["m-blue-empty", "m-red"], "colour")],
      },
      MATERIALS,
    );
    expect(color).toBe("#c24e64");
  });

  it("skips non-colour-phase steps", () => {
    const color = deriveShopColor(
      {
        name: "X",
        shellDesign: [
          step("Transfer Sheet", ["m-gold"], "cap"),      // cap phase — skip
          step("Airbrushing", ["m-red"], "colour"),
        ],
      },
      MATERIALS,
    );
    expect(color).toBe("#c24e64");
  });

  it("treats the legacy 'on_mould' applyAt as colour phase", () => {
    // normalizeApplyAt maps on_mould → colour.
    const color = deriveShopColor(
      { name: "X", shellDesign: [step("Brushing", ["m-gold"], "on_mould")] },
      MATERIALS,
    );
    expect(color).toBe("#e5a658");
  });

  it("treats undefined applyAt as colour phase (legacy default)", () => {
    // normalizeApplyAt treats undefined as "colour" for back-compat.
    const color = deriveShopColor(
      { name: "X", shellDesign: [{ technique: "Airbrushing", materialIds: ["m-red"] }] },
      MATERIALS,
    );
    expect(color).toBe("#c24e64");
  });

  it("returns undefined when colour-phase materials have no colors", () => {
    const color = deriveShopColor(
      { name: "X", shellDesign: [step("Airbrushing", ["m-white-no-color"], "colour")] },
      MATERIALS,
    );
    expect(color).toBeUndefined();
  });

  it("returns undefined when only non-colour-phase steps exist", () => {
    const color = deriveShopColor(
      { name: "X", shellDesign: [step("Transfer Sheet", ["m-gold"], "cap")] },
      MATERIALS,
    );
    expect(color).toBeUndefined();
  });

  it("shopColor wins even when the design would also resolve", () => {
    const color = deriveShopColor(
      { name: "X", shopColor: "#abcdef", shellDesign: [step("Airbrushing", ["m-red"], "colour")] },
      MATERIALS,
    );
    expect(color).toBe("#abcdef");
  });
});

describe("resolveShopColor", () => {
  it("returns the explicit pick when set", () => {
    expect(resolveShopColor({ name: "A", shopColor: "#111111" }, MATERIALS)).toBe("#111111");
  });

  it("returns the derived colour when design yields one", () => {
    expect(
      resolveShopColor(
        { name: "A", shellDesign: [step("Airbrushing", ["m-gold"], "colour")] },
        MATERIALS,
      ),
    ).toBe("#e5a658");
  });

  it("falls back to the name-hash colour otherwise", () => {
    const c = resolveShopColor({ name: "A" }, MATERIALS);
    expect(c).toBe(hashedFallbackColor("A"));
  });

  it("is deterministic for the same product name", () => {
    const a1 = hashedFallbackColor("Praliné Noisette");
    const a2 = hashedFallbackColor("Praliné Noisette");
    expect(a1).toBe(a2);
  });

  it("returns visually distinct colours for different names", () => {
    // Not a strict collision test — just a smoke check that two common
    // chocolatier names don't hash to the same colour.
    expect(hashedFallbackColor("Dark Ganache")).not.toBe(
      hashedFallbackColor("Milk Truffle"),
    );
  });
});
