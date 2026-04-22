import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

/**
 * Hydration smoke tests for the *production* build (static export output).
 *
 * These tests exist specifically to catch bugs that surface only when serving
 * the minified, pre-rendered HTML from `out/` — the artefact Cloudflare Pages
 * serves. `next dev` (Turbopack) does not static-export, so the main e2e suite
 * cannot see these. Example class of bug: a `<Suspense fallback={<JSX/>}>`
 * wrapping a `useSearchParams()` consumer, which React 19's production build
 * refuses to reconcile and throws as minified error #418 (seen on /production/new).
 *
 * Each route gets loaded from a clean page context, and the test fails if either:
 *   - an uncaught page error fires (page.on("pageerror"))
 *   - a console.error contains a React hydration error fingerprint
 *
 * Run separately from the main suite via `npm run test:e2e:prod`, which builds
 * first and then invokes playwright.prod.config.ts.
 */

// Top-level routes. Dynamic `[id]` routes are intentionally excluded — they
// require seeded data and the smoke test is about the *shell*. If a class of
// hydration bug only surfaces on a dynamic route, add that route here with a
// `beforeAll` that primes the required DB record.
const ROUTES = [
  "/",
  "/ingredients",
  "/products",
  "/fillings",
  "/moulds",
  "/production",
  "/production/new",
  "/stock",
  "/shopping",
  "/collections",
  "/settings",
] as const;

// React minifies error messages in production. The error text we want to detect
// contains these fingerprints regardless of the exact code.
const HYDRATION_FINGERPRINTS = [
  "Minified React error #418",
  "Minified React error #421", // suspense boundary received update while hydrating
  "Minified React error #422", // hydration error recovered
  "Minified React error #423", // suspense boundary error while hydrating
  "Minified React error #425", // text content mismatch
  "Hydration failed",
  "hydration mismatch",
];

function looksLikeHydrationError(text: string): boolean {
  return HYDRATION_FINGERPRINTS.some((f) => text.includes(f));
}

function attachListeners(page: Page) {
  const errors: { kind: "pageerror" | "console"; text: string }[] = [];
  page.on("pageerror", (err) => {
    errors.push({ kind: "pageerror", text: `${err.name}: ${err.message}` });
  });
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (looksLikeHydrationError(text)) {
      errors.push({ kind: "console", text });
    }
  });
  return errors;
}

for (const route of ROUTES) {
  test(`hydrates without errors: ${route}`, async ({ page }) => {
    const errors = attachListeners(page);

    await page.goto(route, { waitUntil: "load" });
    // Give React time to hydrate + Dexie's live queries time to resolve so the
    // Suspense boundary swaps its bailout for real content. 2s is empirically
    // enough; shorter waits risk catching nothing on slower CI machines.
    await page.waitForTimeout(2000);

    const hydrationErrors = errors.filter(
      (e) => e.kind === "pageerror" || looksLikeHydrationError(e.text),
    );

    if (hydrationErrors.length > 0) {
      const report = hydrationErrors
        .map((e) => `  [${e.kind}] ${e.text}`)
        .join("\n");
      throw new Error(
        `Hydration errors on ${route}:\n${report}\n\n` +
          `This usually means the pre-rendered HTML served by the static build does ` +
          `not match what React renders on the client. See e2e/hydration.spec.ts for ` +
          `guidance and AGENT.md → "Static-export hydration gotchas".`,
      );
    }

    // Sanity: the page's <main> should eventually have some content (not just the
    // Suspense fallback). For pages that bail out to CSR, hydration failure leaves
    // the fallback stuck — this assertion would then fail too.
    const mainText = await page.locator("main").innerText().catch(() => "");
    expect(mainText.length, `<main> has no content on ${route}`).toBeGreaterThan(0);
  });
}
