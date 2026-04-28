import { test, expect } from "./fixtures";

test.describe("Choccy Chat directory — public page", () => {
  test("renders map page with seed entry, attribution, and disclaimer", async ({ page }) => {
    await page.goto("/choccy-chat");

    await expect(
      page.getByRole("heading", { name: /Choccy Chat,\s+on a map\./i }),
    ).toBeVisible();

    await expect(page.getByRole("link", { name: /James Parsons \(SoSaSe Chocolat\)/i })).toBeVisible();
    await expect(page.getByText(/Made by a fan, not affiliated with James/i)).toBeVisible();

    const mapContainer = page.getByTestId("chocolatier-map");
    await expect(mapContainer).toHaveAttribute("data-ready", "1", { timeout: 10000 });
    await expect(page.locator(".leaflet-container")).toBeVisible();

    // Seed entry shows in the list below the map (static fallback wins
    // here because the Worker is not running under `next dev`).
    await expect(page.getByText("L'Artisan Chocolates").first()).toBeVisible();
    await expect(page.getByText(/Frederiksoord, Netherlands/i).first()).toBeVisible();
  });

  test("live data from Worker replaces the static fallback", async ({ page }) => {
    // Mock the Worker endpoint with a different name to prove the page
    // re-renders from the live response.
    await page.route("**/api/choccy-chat/friends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              id: "live-test",
              name: "Live Test Chocolatier",
              city: "Stockholm",
              country: "Sweden",
              lat: 59.3293,
              lng: 18.0686,
              instagram: "live.test",
              website: null,
              blurb: null,
            },
          ],
        }),
      });
    });
    await page.goto("/choccy-chat");
    await expect(page.getByText("Live Test Chocolatier").first()).toBeVisible({ timeout: 5000 });
    // Static fallback (Lizi) is no longer shown — the live list replaced it.
    await expect(page.getByText("L'Artisan Chocolates")).not.toBeVisible();
  });

  test("clicking a pin reveals popup with social link", async ({ page }) => {
    await page.goto("/choccy-chat");
    await expect(page.getByTestId("chocolatier-map")).toHaveAttribute("data-ready", "1", { timeout: 10000 });

    const pin = page.locator('[data-chocolatier-id="lartisan-chocolates"]');
    await expect(pin).toBeVisible();
    await pin.click();

    const popup = page.locator(".leaflet-popup");
    await expect(popup).toBeVisible();
    await expect(popup.getByText("L'Artisan Chocolates")).toBeVisible();

    const igLink = popup.getByRole("link", { name: "@l.artisan.chocolates" });
    await expect(igLink).toHaveAttribute("href", "https://instagram.com/l.artisan.chocolates");
    await expect(igLink).toHaveAttribute("target", "_blank");
  });

  test("public nav does NOT advertise Choccy Chat from the landing page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /^Choccy Chat$/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Chocolatiers$/i })).toHaveCount(0);
  });
});

test.describe("Choccy Chat directory — join form", () => {
  test("CTA on the map page links to the join form", async ({ page }) => {
    await page.goto("/choccy-chat");
    await page.getByRole("link", { name: /Put your workshop on the map/i }).click();
    await expect(page).toHaveURL(/\/choccy-chat\/join\/?$/);
    await expect(page.getByRole("heading", { name: /Add yourself to the map\./i })).toBeVisible();
  });

  test("form lists all required fields and a consent checkbox", async ({ page }) => {
    await page.goto("/choccy-chat/join");

    await expect(page.getByLabel(/Workshop or business name/i)).toBeVisible();
    await expect(page.getByLabel(/^City/i)).toBeVisible();
    await expect(page.getByLabel(/^Country/i)).toBeVisible();
    await expect(page.getByLabel(/Your name/i)).toBeVisible();
    await expect(page.getByLabel(/^Email/i)).toBeVisible();
    await expect(page.getByLabel(/I agree/i)).toBeVisible();

    const honeypot = page.locator('input[name="_gotcha"]');
    await expect(honeypot).toBeHidden();
  });

  test("submit button is disabled and warning shows when Turnstile is not configured", async ({ page }) => {
    // No NEXT_PUBLIC_TURNSTILE_SITE_KEY in the dev env — should warn + disable.
    await page.goto("/choccy-chat/join");
    await expect(page.getByText(/Form not yet configured/i)).toBeVisible();
    const submit = page.getByRole("button", { name: /Send for review/i });
    await expect(submit).toBeDisabled();
  });
});

test.describe("Choccy Chat directory — self-removal", () => {
  test("shows guidance when no token is in the URL", async ({ page }) => {
    await page.goto("/choccy-chat/remove");
    await expect(page.getByText(/This page needs a removal token/i)).toBeVisible();
  });

  test("happy path: confirm and POST with token", async ({ page }) => {
    await page.route("**/api/choccy-chat/remove**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });
    await page.goto("/choccy-chat/remove?token=demo-token");
    await page.getByRole("button", { name: /Yes, remove me/i }).click();
    await expect(page.getByText(/Removed\./i)).toBeVisible();
  });
});

test.describe("Choccy Chat — admin", () => {
  test("admin page renders queue from mocked API", async ({ page }) => {
    await page.route("**/api/choccy-chat/admin/list**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              id: "pending-1",
              status: "pending",
              name: "Pending Chocolatier",
              city: "Berlin",
              country: "Germany",
              lat: 0,
              lng: 0,
              instagram: "pending.choc",
              website: null,
              blurb: "A test entry.",
              contact_name: "Test Person",
              email: "test@example.com",
              notes: null,
              created_at: Date.now(),
              approved_at: null,
              approved_by: null,
            },
          ],
        }),
      });
    });
    await page.goto("/admin/choccy-chat");
    await expect(page.getByText("Pending Chocolatier")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("test@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Reject$/i })).toBeVisible();
  });

  test("admin page surfaces auth error from API", async ({ page }) => {
    await page.route("**/api/choccy-chat/admin/list**", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Unauthorized" }),
      });
    });
    await page.goto("/admin/choccy-chat");
    await expect(page.getByText(/Not signed in to Cloudflare Access/i)).toBeVisible({
      timeout: 5000,
    });
  });
});
