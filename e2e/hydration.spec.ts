import { test, expect, type Page, type ConsoleMessage, type APIRequestContext } from "@playwright/test";

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

// Top-level (statically exported) routes. Each must serve its OWN static file:
// if a `_redirects` rule over-matches and hands back a `_spa` shell instead, the
// route-tree assertion catches it. Dynamic `[id]` routes are covered separately
// by DETAIL_ROUTES below.
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
  "/labels",
  "/labels/new",
  "/orders",
  "/log",
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

// ---------------------------------------------------------------------------
// Route-tree contract
// ---------------------------------------------------------------------------
// The static export embeds its route tree in a `__next_f.push` payload as an
// escaped JSON array. For out/orders/customers/_spa/index.html that is literally:
//
//     \"c\":[\"\",\"orders\",\"customers\",\"_spa\",\"\"]
//
// Asserting that EXACT chain — rather than "the segment appears somewhere in the
// HTML" — is what turns this into a routing contract: it pins down precisely which
// static file the edge handed back. It catches both failure modes:
//   - a static route shadowed by a `:id` catch-all
//     (/production/new served /production/_spa/)
//   - a nested detail route shadowed by its PARENT's catch-all
//     (/orders/customers/<id> served /orders/_spa/), which then feeds the literal
//     string "customers" to the order page as its id via useSpaId("orders")
const ESCAPED_QUOTE = '\\"';

function routeTreeMarker(segments: string[]): string {
  const cells = ["", ...segments, ""]
    .map((s) => `${ESCAPED_QUOTE}${s}${ESCAPED_QUOTE}`)
    .join(",");
  return `${ESCAPED_QUOTE}c${ESCAPED_QUOTE}:[${cells}]`;
}

/** Fetches `url` and asserts the served HTML is the static file for
 *  `expectedSegments`. Returns an error message, or null when it matches. */
async function checkServedShell(
  request: APIRequestContext,
  url: string,
  expectedSegments: string[],
): Promise<string | null> {
  const raw = await request.get(url).then((r) => r.text());
  const expected = routeTreeMarker(expectedSegments);
  if (raw.includes(expected)) return null;
  const actual = raw.match(/\\"c\\":\[[^\]]*\]/g) ?? [];
  return (
    `${url}\n` +
    `      expected route tree: ${expected}\n` +
    `      actually served:     ${actual.length > 0 ? actual.join(" | ") : "(none found)"}`
  );
}

async function assertServedShell(
  request: APIRequestContext,
  url: string,
  expectedSegments: string[],
): Promise<void> {
  const problem = await checkServedShell(request, url, expectedSegments);
  if (problem) {
    throw new Error(
      `Wrong static file served.\n    ${problem}\n\n` +
        `A _redirects rule is over-matching. Nested dynamic routes and literal ` +
        `sub-routes must be listed BEFORE their parent's catch-all in ` +
        `public/_redirects. See AGENT.md -> "Static-export hydration gotchas".`,
    );
  }
}

for (const route of ROUTES) {
  test(`hydrates without errors: ${route}`, async ({ page, request }) => {
    const errors = attachListeners(page);

    // Contract check on the RAW HTML — runs before the browser touches it.
    // Catches routing bugs where the server rewrites a static URL to a different
    // page (e.g. Cloudflare's _redirects catch-all eating /production/new and
    // returning the /production/_spa/ SPA shell). Those would still "hydrate"
    // without errors but serve the wrong page under the right URL.
    await assertServedShell(request, route, route.split("/").filter(Boolean));

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

// ---------------------------------------------------------------------------
// Dynamic detail routes
// ---------------------------------------------------------------------------
// Here the `_spa` placeholder shell IS the correct answer — what must hold is
// that the edge serves the shell belonging to the RIGHT parent. `SPA_PROBE_ID`
// deliberately matches no DB record: this asserts routing, not data.
const SPA_PROBE_ID = "k7x2m9-probe";

const DETAIL_ROUTES: { url: string; shell: string }[] = [
  // Nested dynamic routes — the fragile class. Each sits under another `[id]`
  // parent whose catch-all swallows it if the rules are ever reordered.
  { url: `/orders/customers/${SPA_PROBE_ID}`,             shell: "orders/customers/_spa" },
  { url: `/fillings/categories/${SPA_PROBE_ID}`,          shell: "fillings/categories/_spa" },
  { url: `/products/categories/${SPA_PROBE_ID}`,          shell: "products/categories/_spa" },
  { url: `/ingredients/categories/${SPA_PROBE_ID}`,       shell: "ingredients/categories/_spa" },
  { url: `/pantry/decoration/categories/${SPA_PROBE_ID}`, shell: "pantry/decoration/categories/_spa" },
  { url: `/pantry/decoration/designs/${SPA_PROBE_ID}`,    shell: "pantry/decoration/designs/_spa" },
  { url: `/shop/new/${SPA_PROBE_ID}`,                     shell: "shop/new/_spa" },
  // Child routes under a dynamic parent.
  { url: `/production/${SPA_PROBE_ID}/products`,          shell: "production/_spa/products" },
  { url: `/production/${SPA_PROBE_ID}/summary`,           shell: "production/_spa/summary" },
  { url: `/calculator/${SPA_PROBE_ID}/batch`,             shell: "calculator/_spa/batch" },
  { url: `/calculator/${SPA_PROBE_ID}/run`,               shell: "calculator/_spa/run" },
  // Plain dynamic routes — these are the parents that would do the swallowing,
  // so pin them too.
  { url: `/orders/${SPA_PROBE_ID}`,                       shell: "orders/_spa" },
  { url: `/production/${SPA_PROBE_ID}`,                   shell: "production/_spa" },
  { url: `/fillings/${SPA_PROBE_ID}`,                     shell: "fillings/_spa" },
  { url: `/products/${SPA_PROBE_ID}`,                     shell: "products/_spa" },
  { url: `/ingredients/${SPA_PROBE_ID}`,                  shell: "ingredients/_spa" },
  { url: `/moulds/${SPA_PROBE_ID}`,                       shell: "moulds/_spa" },
  { url: `/collections/${SPA_PROBE_ID}`,                  shell: "collections/_spa" },
  { url: `/labels/${SPA_PROBE_ID}`,                       shell: "labels/_spa" },
  { url: `/packaging/${SPA_PROBE_ID}`,                    shell: "packaging/_spa" },
  { url: `/pantry/decoration/${SPA_PROBE_ID}`,            shell: "pantry/decoration/_spa" },
  { url: `/log/2026-01-15`,                               shell: "log/_spa" },
  // NOTE: `/calculator/<id>` is deliberately absent. public/_redirects rewrites it
  // to /calculator/_spa/, but there is no calculator/[id]/page.tsx so that shell is
  // never built and the URL 404s — while /lab and /calculator/[id]/batch both
  // router.push() to it. Add the case here once that is fixed.
];

// One request-only test for the whole table: no browser needed, and reporting
// every mismatch at once beats failing on the first.
test("every dynamic route serves its own SPA shell", async ({ request }) => {
  const problems = (
    await Promise.all(
      DETAIL_ROUTES.map(({ url, shell }) =>
        checkServedShell(request, url, shell.split("/")),
      ),
    )
  ).filter((p): p is string => p !== null);

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} route(s) served the wrong static file:\n\n` +
        problems.map((p) => `  - ${p}`).join("\n\n") +
        `\n\nA _redirects rule is over-matching. Nested dynamic routes must be ` +
        `listed BEFORE their parent's catch-all in public/_redirects. ` +
        `See AGENT.md -> "Static-export hydration gotchas".`,
    );
  }
});

// Full hydration pass over the nested routes only — the class most likely to be
// mis-routed, and the one where a wrong shell hydrates "successfully" while
// showing the wrong page.
const NESTED_DETAIL_ROUTES = DETAIL_ROUTES.slice(0, 7);

for (const { url, shell } of NESTED_DETAIL_ROUTES) {
  test(`hydrates the correct shell without errors: ${url}`, async ({ page, request }) => {
    const errors = attachListeners(page);

    await assertServedShell(request, url, shell.split("/"));

    await page.goto(url, { waitUntil: "load" });
    await page.waitForTimeout(2000);

    const hydrationErrors = errors.filter(
      (e) => e.kind === "pageerror" || looksLikeHydrationError(e.text),
    );
    if (hydrationErrors.length > 0) {
      const report = hydrationErrors.map((e) => `  [${e.kind}] ${e.text}`).join("\n");
      throw new Error(`Hydration errors on ${url}:\n${report}`);
    }

    // No `<main>` content assertion here: SPA_PROBE_ID matches no record, and
    // several detail pages (orders/customers, production/[id], labels/[id]) have
    // no not-found branch, so they sit on a loading state indefinitely. That is a
    // UX gap, not a routing one, and belongs in the main e2e suite.
  });
}
