import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Lint-style unit tests for known hydration anti-patterns in the app directory.
 *
 * These guard against bugs that only surface in the production (static-export +
 * minified) build — the main e2e suite runs against `next dev` which skips
 * static export entirely. The hydration smoke spec (e2e/hydration.spec.ts) is
 * the real safety net; these tests are a cheap first gate that fail fast in
 * `npm test` without needing a full build+serve.
 *
 * Add a new test here when you identify a pattern that caused a hydration bug,
 * so the next person who reaches for it gets a concrete error instead of a
 * minified React error #418 on production.
 */

const APP_ROOT = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...walk(abs));
    } else if (
      // Only scan shipped source; skip our own test file so its regex literal
      // doesn't get flagged as an offender.
      (abs.endsWith(".tsx") || abs.endsWith(".ts")) &&
      !abs.endsWith(".test.tsx") &&
      !abs.endsWith(".test.ts")
    ) {
      out.push(abs);
    }
  }
  return out;
}

const APP_FILES = walk(join(APP_ROOT, "app"));

describe("app hydration anti-patterns", () => {
  it("no <Suspense> in an app page uses a non-null JSX fallback", () => {
    // Why: a JSX Suspense fallback on a page that uses useSearchParams (all our
    // list pages do) pre-renders into the BAILOUT_TO_CLIENT_SIDE_RENDERING
    // marker of the static-export HTML. React 19's production build refuses to
    // reconcile that content on hydration and throws error #418, leaving the
    // page stuck on "Loading…" forever. Every other page in this app uses
    // `<Suspense fallback={null}>`. See /production/new bug fix.
    const offenders: string[] = [];
    for (const file of APP_FILES) {
      const src = readFileSync(file, "utf8");
      // Match the opening of a Suspense with a JSX fallback: `fallback={<`.
      // Accepts any whitespace between tokens. Does NOT match `fallback={null}`
      // or `fallback={undefined}` or `fallback={someVar}`.
      if (/<Suspense\s[^>]*fallback=\{\s*</.test(src)) {
        offenders.push(file.slice(APP_ROOT.length + 1));
      }
    }
    expect(
      offenders,
      [
        "Found <Suspense fallback={<JSX/>}> in app pages — this breaks hydration",
        "on the static-export build served by Cloudflare Pages. Use",
        "`<Suspense fallback={null}>` instead (the pattern used everywhere else).",
        "",
        "Offending files:",
        ...offenders.map((f) => `  ${f}`),
      ].join("\n"),
    ).toEqual([]);
  });
});
