import { test, expect } from "./fixtures";

// Why this test exists:
//
// The app is a static export (`output: "export"` in next.config.ts) deployed
// to Cloudflare Pages. User-generated entity IDs don't exist at build time,
// so each `[id]` route is built with a single `_spa` placeholder param, and
// `public/_redirects` rewrites any real ID to that placeholder HTML.
//
// Consequence: on fresh navigation to a detail URL (direct load, reload,
// shared link), the RSC payload embedded in the served HTML has
// `params.id = "_spa"`. If a detail page reads `use(params)` it gets the
// placeholder forever and the page is stuck on "Loading" because
// `useXxx("_spa")` never finds a record. Detail pages must instead read
// the real id via `useSpaId(...)` (see `src/lib/use-spa-id.ts`), which
// pulls from `window.location.pathname` after mount.
//
// These tests simulate the Cloudflare rewrite via Playwright's
// `page.route()` — the browser URL bar stays on the real id while the
// document request is served from the `_spa` route, exactly what CF does
// on a fresh load. If any detail page regresses to `use(params)` the
// entity name never appears and the test fails.

async function createAndReload(
  page: Parameters<Parameters<typeof test>[1]>[0]["page"],
  listPath: string,
  spaPath: string,
  addButtonName: string | RegExp,
  inputLabel: string | RegExp,
  entityName: string,
) {
  await page.goto(listPath);
  await page.getByRole("button", { name: addButtonName }).click();
  await page.getByRole("textbox", { name: inputLabel }).fill(entityName);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`^.*${listPath}[^/]+`));

  const detailPath = new URL(page.url()).pathname;
  const realId = detailPath.split("/").filter(Boolean).pop()!;
  expect(realId).toBeTruthy();
  expect(realId).not.toBe("_spa");

  // Route only the document request for this detail page — CSS/JS/RSC
  // chunks keep hitting their real URLs.
  await page.route("**/*", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.resourceType() === "document" && url.pathname.startsWith(detailPath)) {
      url.pathname = spaPath;
      await route.continue({ url: url.toString() });
    } else {
      await route.continue();
    }
  });

  await page.reload();
  expect(new URL(page.url()).pathname).toMatch(new RegExp(`${realId}/?$`));
  return realId;
}

test.describe("Fresh-load detail pages (simulated Cloudflare _spa rewrite)", () => {
  test("filling detail loads from real id, not '_spa' placeholder", async ({ page }) => {
    test.setTimeout(60000);
    await createAndReload(
      page,
      "/fillings/",
      "/fillings/_spa/",
      "Add filling",
      "Filling name",
      "Fresh Load Filling",
    );
    await expect(page.getByText("Fresh Load Filling").first()).toBeVisible({ timeout: 15000 });
  });

  test("product detail loads from real id, not '_spa' placeholder", async ({ page }) => {
    test.setTimeout(60000);
    await createAndReload(
      page,
      "/products/",
      "/products/_spa/",
      "Add new product",
      "Product name",
      "Fresh Load Product",
    );
    await expect(page.getByText("Fresh Load Product").first()).toBeVisible({ timeout: 15000 });
  });

  test("ingredient detail loads from real id, not '_spa' placeholder", async ({ page }) => {
    test.setTimeout(60000);
    await createAndReload(
      page,
      "/ingredients/",
      "/ingredients/_spa/",
      "Add ingredient",
      "Ingredient name",
      "Fresh Load Ingredient",
    );
    await expect(page.getByText("Fresh Load Ingredient").first()).toBeVisible({ timeout: 15000 });
  });
});
