import { describe, expect, it } from "vitest";
import { normalizeInstagramHandle } from "./instagram";

describe("normalizeInstagramHandle", () => {
  it("returns a bare handle unchanged", () => {
    expect(normalizeInstagramHandle("l.artisan.chocolates")).toBe(
      "l.artisan.chocolates",
    );
  });

  it("strips a leading @", () => {
    expect(normalizeInstagramHandle("@l.artisan.chocolates")).toBe(
      "l.artisan.chocolates",
    );
    expect(normalizeInstagramHandle("@@user")).toBe("user");
  });

  it("strips full instagram URLs", () => {
    expect(
      normalizeInstagramHandle("https://www.instagram.com/l.artisan.chocolates/"),
    ).toBe("l.artisan.chocolates");
    expect(normalizeInstagramHandle("http://instagram.com/foo")).toBe("foo");
    expect(normalizeInstagramHandle("instagram.com/foo")).toBe("foo");
    expect(normalizeInstagramHandle("https://m.instagram.com/foo")).toBe("foo");
  });

  it("drops query strings, fragments, and extra path segments", () => {
    expect(
      normalizeInstagramHandle("https://instagram.com/foo/?utm=bar"),
    ).toBe("foo");
    expect(normalizeInstagramHandle("instagram.com/foo#anchor")).toBe("foo");
    expect(normalizeInstagramHandle("instagram.com/foo/reels")).toBe("foo");
  });

  it("trims whitespace and angle brackets", () => {
    expect(normalizeInstagramHandle("  @user  ")).toBe("user");
    expect(normalizeInstagramHandle("<https://instagram.com/foo>")).toBe("foo");
  });

  it("returns null for empty or non-handle-shaped input", () => {
    expect(normalizeInstagramHandle("")).toBeNull();
    expect(normalizeInstagramHandle("   ")).toBeNull();
    expect(normalizeInstagramHandle("not a handle!")).toBeNull();
    expect(normalizeInstagramHandle("space inside")).toBeNull();
    expect(normalizeInstagramHandle(undefined)).toBeNull();
    expect(normalizeInstagramHandle(null)).toBeNull();
    expect(normalizeInstagramHandle(42)).toBeNull();
  });
});
