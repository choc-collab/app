import { describe, it, expect } from "vitest";
import { shelfLifeBucket } from "./shelfLifeBuckets";

describe("shelfLifeBucket", () => {
  it("buckets by weeks boundaries", () => {
    expect(shelfLifeBucket(1)).toBe("short");
    expect(shelfLifeBucket(4)).toBe("short");
    expect(shelfLifeBucket(4.5)).toBe("medium");
    expect(shelfLifeBucket(12)).toBe("medium");
    expect(shelfLifeBucket(12.1)).toBe("long");
    expect(shelfLifeBucket(26)).toBe("long");
  });

  it("treats missing/empty/invalid as 'none'", () => {
    expect(shelfLifeBucket(undefined)).toBe("none");
    expect(shelfLifeBucket(null)).toBe("none");
    expect(shelfLifeBucket("")).toBe("none");
    expect(shelfLifeBucket(0)).toBe("none");
    expect(shelfLifeBucket(-2)).toBe("none");
    expect(shelfLifeBucket(NaN)).toBe("none");
    expect(shelfLifeBucket("nope")).toBe("none");
  });

  it("accepts weeks as string (Product.shelfLifeWeeks)", () => {
    expect(shelfLifeBucket("3")).toBe("short");
    expect(shelfLifeBucket("8")).toBe("medium");
    expect(shelfLifeBucket("20")).toBe("long");
  });
});
