import { describe, it, expect } from "vitest";
import { resolveBackHref } from "./back-href";

describe("resolveBackHref", () => {
  it("accepts the production list route", () => {
    expect(resolveBackHref("/production")).toEqual({ href: "/production", label: "Production" });
  });

  it("accepts a product history route and preserves the id", () => {
    const id = "0f9c1a2b-3d4e-5f60-8a9b-1c2d3e4f5a6b";
    expect(resolveBackHref(`/products/${id}?tab=history`)).toEqual({
      href: `/products/${id}?tab=history`,
      label: "Back to product",
    });
  });

  it.each([null, undefined, ""])("returns null for %s", (value) => {
    expect(resolveBackHref(value)).toBeNull();
  });

  // Open-redirect regression: every one of these must be rejected outright.
  it.each([
    ["protocol-relative", "//evil.com"],
    ["backslash authority", "/\\evil.com"],
    ["backslash then slash", "/\\/evil.com"],
    ["absolute https", "https://evil.com"],
    ["absolute http", "http://evil.com/production"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["traversal in id", "/products/../../evil?tab=history"],
    ["slash in id", "/products/a/b?tab=history"],
    ["encoded slash breakout", "/products/a%2f..%2fevil?tab=history"],
    ["unknown internal route", "/settings"],
    ["prefix lookalike", "/production-evil"],
    ["suffix on known route", "/production/../admin"],
    ["missing tab param", "/products/abc"],
    ["extra query", "/products/abc?tab=history&next=//evil.com"],
  ])("rejects %s", (_label, value) => {
    expect(resolveBackHref(value)).toBeNull();
  });

  it("never returns an href that leaves the origin", () => {
    const probes = ["/production", "/products/abc?tab=history", "//evil.com", "/\\evil.com"];
    for (const probe of probes) {
      const result = resolveBackHref(probe);
      if (!result) continue;
      expect(new URL(result.href, "https://app.example").origin).toBe("https://app.example");
    }
  });
});
