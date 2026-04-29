import { describe, it, expect } from "vitest";
import { normalizeWebsite } from "./utils";

describe("normalizeWebsite", () => {
  it("returns null for empty input", () => {
    expect(normalizeWebsite(null)).toBeNull();
    expect(normalizeWebsite(undefined)).toBeNull();
    expect(normalizeWebsite("")).toBeNull();
    expect(normalizeWebsite("   ")).toBeNull();
  });

  it("preserves URLs that already have a protocol", () => {
    expect(normalizeWebsite("https://example.com")).toBe("https://example.com");
    expect(normalizeWebsite("http://example.com")).toBe("http://example.com");
    expect(normalizeWebsite("HTTPS://EXAMPLE.COM")).toBe("HTTPS://EXAMPLE.COM");
  });

  it("prepends https:// to bare hostnames", () => {
    expect(normalizeWebsite("choc-collab.org")).toBe("https://choc-collab.org");
    expect(normalizeWebsite("www.example.com")).toBe("https://www.example.com");
    expect(normalizeWebsite("example.com/path")).toBe("https://example.com/path");
  });

  it("trims whitespace", () => {
    expect(normalizeWebsite("  choc-collab.org  ")).toBe("https://choc-collab.org");
    expect(normalizeWebsite("\nhttps://x.com\t")).toBe("https://x.com");
  });
});
