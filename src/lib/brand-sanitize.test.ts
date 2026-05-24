import { describe, expect, it } from "vitest";
import { sanitizeBrand } from "./brand-sanitize";

describe("sanitizeBrand", () => {
  it("returns an empty brand with no repair flag when input is null/undefined", () => {
    expect(sanitizeBrand(undefined)).toEqual({ brand: {}, repaired: false });
    expect(sanitizeBrand(null)).toEqual({ brand: {}, repaired: false });
  });

  it("flags a repair when the whole brand value is a primitive", () => {
    expect(sanitizeBrand("not an object")).toEqual({ brand: {}, repaired: true });
    expect(sanitizeBrand(42)).toEqual({ brand: {}, repaired: true });
  });

  it("passes through a well-formed brand untouched", () => {
    const input = {
      name: "Atelier Choc",
      address: "Prinsengracht 12\n1015 DK Amsterdam",
      contact: "hi [at] atelierchoc.nl",
      logo: "data:image/png;base64,iVBORw0KGgo",
      vatNumber: "NL123456789B01",
      socials: [{ label: "Instagram", url: "@atelierchoc" }],
    };
    expect(sanitizeBrand(input)).toEqual({ brand: input, repaired: false });
  });

  it("preserves empty strings (treated as user-cleared, not corrupt)", () => {
    const input = { name: "", address: "", contact: "", logo: "", vatNumber: "" };
    expect(sanitizeBrand(input)).toEqual({ brand: input, repaired: false });
  });

  it("coerces a non-string logo to undefined and flags repair — the [object Object] regression", () => {
    const { brand, repaired } = sanitizeBrand({
      name: "Atelier Choc",
      // A bare object with no BlobRef markers — the shape an older build
      // could land when it accidentally stored a Blob or arbitrary object.
      logo: { junk: true },
    });
    expect(brand.logo).toBeUndefined();
    expect(brand.name).toBe("Atelier Choc");
    expect(repaired).toBe(true);
  });

  it("coerces every non-string scalar field independently", () => {
    const { brand, repaired } = sanitizeBrand({
      name: { x: 1 },
      address: [1, 2],
      contact: 42,
      logo: true,
      vatNumber: null,
    });
    expect(brand).toEqual({});
    expect(repaired).toBe(true);
  });

  it("treats a Dexie Cloud BlobRef on logo as transient — hides it but does NOT flag repair", () => {
    // Mid-sync state: Dexie Cloud has offloaded the long data URL to blob
    // storage and the IndexedDB row temporarily holds a BlobRef in place of
    // the string. The blobResolveMiddleware will restore the string shortly,
    // so we must not trigger a self-heal write here — doing so would
    // overwrite the cloud row's logo before the blob ever resolves.
    const { brand, repaired } = sanitizeBrand({
      name: "Atelier Choc",
      logo: { _bt: "string", ref: "1:abc123", size: 482910 },
    });
    expect(brand.logo).toBeUndefined();
    expect(brand.name).toBe("Atelier Choc");
    expect(repaired).toBe(false);
  });

  it("treats a serialized TSONRef on logo as transient — hides it but does NOT flag repair", () => {
    // The post-IndexedDB-rehydrate shape ({ type, ref, size }) — same
    // transient state, different on-disk encoding.
    const { brand, repaired } = sanitizeBrand({
      logo: { type: "string", ref: "1:abc123", size: 482910 },
    });
    expect(brand.logo).toBeUndefined();
    expect(repaired).toBe(false);
  });

  it("normalises socials whose label or url is the wrong type", () => {
    const { brand, repaired } = sanitizeBrand({
      socials: [
        { label: "Instagram", url: "@a" },           // ok
        { label: 42, url: "@b" },                     // label broken
        { label: "Site", url: { href: "x.com" } },    // url broken
        "not an object",                              // entry broken
      ],
    });
    expect(brand.socials).toEqual([
      { label: "Instagram", url: "@a" },
      { label: "", url: "@b" },
      { label: "Site", url: "" },
    ]);
    expect(repaired).toBe(true);
  });

  it("flags repair when socials is not an array at all", () => {
    const { brand, repaired } = sanitizeBrand({ socials: "Instagram" });
    expect(brand.socials).toBeUndefined();
    expect(repaired).toBe(true);
  });
});
