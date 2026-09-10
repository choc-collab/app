import { describe, it, expect } from "vitest";
import { sameOriginTarget } from "./safe-redirect.mjs";

describe("sameOriginTarget", () => {
  it.each([
    ["plain path", "/today", "/today"],
    ["nested path", "/production/_spa/index.txt", "/production/_spa/index.txt"],
    ["trailing slash", "/production/_spa/", "/production/_spa/"],
    ["query preserved", "/a/b?q=1", "/a/b?q=1"],
    ["hash preserved", "/a/b#frag", "/a/b#frag"],
  ])("passes through %s", (_label, input, expected) => {
    expect(sameOriginTarget(input)).toBe(expected);
  });

  // Open-redirect regression: a `_redirects` splat must not be able to send
  // the Location header off-site.
  it.each([
    ["protocol-relative", "//evil.com"],
    ["protocol-relative with path", "//evil.com/x"],
    ["backslash authority", "/\\evil.com"],
    ["backslash then slash", "/\\/evil.com"],
    ["absolute https", "https://evil.com/x"],
    ["absolute http", "http://evil.com"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["userinfo trick", "https://localhost@evil.com/"],
    ["different port", "http://localhost:9999/x"],
  ])("rejects %s", (_label, input) => {
    expect(sameOriginTarget(input)).toBeNull();
  });

  it("never yields a target that resolves off-origin", () => {
    const probes = ["/today", "//evil.com", "/\\evil.com", "https://evil.com/x", "/a?q=1"];
    for (const probe of probes) {
      const out = sameOriginTarget(probe);
      if (out === null) continue;
      expect(new URL(out, "http://localhost").origin).toBe("http://localhost");
    }
  });
});
