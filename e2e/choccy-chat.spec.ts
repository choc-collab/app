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

  test("search filters list and map by name, city, or country", async ({ page }) => {
    await page.route("**/api/choccy-chat/friends", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              id: "alice",
              name: "Alice Cocoa Works",
              city: "Berlin",
              country: "Germany",
              lat: 52.52,
              lng: 13.405,
              instagram: null,
              website: null,
              blurb: null,
            },
            {
              id: "bob",
              name: "Bob's Bonbons",
              city: "Paris",
              country: "France",
              lat: 48.857,
              lng: 2.352,
              instagram: null,
              website: null,
              blurb: null,
            },
            {
              id: "carla",
              name: "Carla Chocolat",
              city: "Lyon",
              country: "France",
              lat: 45.764,
              lng: 4.835,
              instagram: null,
              website: null,
              blurb: null,
            },
          ],
        }),
      });
    });

    await page.goto("/choccy-chat");
    await expect(page.getByText("Alice Cocoa Works").first()).toBeVisible({ timeout: 5000 });

    const search = page.getByTestId("choccy-search");

    // Filter by country — France matches Bob and Carla, not Alice.
    await search.fill("france");
    await expect(page.getByTestId("choccy-search-summary")).toHaveText(/Showing 2 of 3/);
    await expect(page.getByText("Bob's Bonbons")).toBeVisible();
    await expect(page.getByText("Carla Chocolat")).toBeVisible();
    await expect(page.getByText("Alice Cocoa Works")).not.toBeVisible();
    // Map dropped Alice's pin.
    await expect(page.locator('[data-chocolatier-id="alice"]')).toHaveCount(0);
    await expect(page.locator('[data-chocolatier-id="bob"]')).toHaveCount(1);

    // Filter by city.
    await search.fill("berlin");
    await expect(page.getByTestId("choccy-search-summary")).toHaveText(/Showing 1 of 3/);
    await expect(page.getByText("Alice Cocoa Works")).toBeVisible();
    await expect(page.getByText("Bob's Bonbons")).not.toBeVisible();

    // Filter by name (case-insensitive).
    await search.fill("CARLA");
    await expect(page.getByTestId("choccy-search-summary")).toHaveText(/Showing 1 of 3/);
    await expect(page.getByText("Carla Chocolat")).toBeVisible();

    // No matches — empty state with a clear-search link in the card.
    await search.fill("nowhere");
    await expect(page.getByTestId("choccy-search-summary")).toHaveText(/No matches for "nowhere"/);
    await expect(page.getByText(/No chocolatiers match that search/i)).toBeVisible();

    // Clear via the inline ✕ button restores everyone.
    await page.getByTestId("choccy-search-clear").click();
    await expect(page.getByTestId("choccy-search-summary")).toHaveCount(0);
    await expect(page.getByText("Alice Cocoa Works")).toBeVisible();
    await expect(page.getByText("Bob's Bonbons")).toBeVisible();
    await expect(page.getByText("Carla Chocolat")).toBeVisible();
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

  test("country field is a datalist combobox with canonical names", async ({ page }) => {
    await page.goto("/choccy-chat/join");
    const countryInput = page.getByLabel(/^Country/i);
    await expect(countryInput).toHaveAttribute("list", "country-options");

    // Datalist exposes canonical names that the worker normaliser accepts.
    const datalist = page.locator("#country-options");
    await expect(datalist.locator('option[value="United Kingdom"]')).toHaveCount(1);
    await expect(datalist.locator('option[value="United States"]')).toHaveCount(1);
    await expect(datalist.locator('option[value="Netherlands"]')).toHaveCount(1);

    // The hint reassures users that variant spellings are normalised.
    await expect(page.getByText(/UK → United Kingdom/i)).toBeVisible();
  });

  test("Instagram hint covers handle, @handle, or full URL", async ({ page }) => {
    await page.goto("/choccy-chat/join");
    await expect(
      page.getByText(/Username, @handle, or full instagram\.com URL/i),
    ).toBeVisible();
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
  const baseEntry = {
    id: "pending-1",
    status: "pending" as const,
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
  };

  test("admin page renders queue from mocked API", async ({ page }) => {
    await page.route("**/api/choccy-chat/admin/list**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [baseEntry] }),
      });
    });
    await page.goto("/admin/choccy-chat");
    await expect(page.getByText("Pending Chocolatier")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("test@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Approve$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Reject$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Edit$/i })).toBeVisible();
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

  test("Edit drawer opens, saves diff to update endpoint, and refreshes row", async ({ page }) => {
    await page.route("**/api/choccy-chat/admin/list**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [baseEntry] }),
      });
    });
    let updateRequestBody: Record<string, unknown> | null = null;
    await page.route("**/api/choccy-chat/admin/update", async (route) => {
      updateRequestBody = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          entry: {
            ...baseEntry,
            country: "United Kingdom",
            instagram: "fixed.handle",
            lat: 51.5,
            lng: -0.12,
          },
        }),
      });
    });

    await page.goto("/admin/choccy-chat");
    await expect(page.getByText("Pending Chocolatier")).toBeVisible({ timeout: 5000 });

    await page.getByTestId("edit-pending-1").click();
    // Save button starts disabled because nothing's dirty.
    const saveBtn = page.getByTestId("save-pending-1");
    await expect(saveBtn).toBeDisabled();

    await page.getByLabel(/^Country$/i).fill("UK");
    await page.getByLabel(/Instagram handle/i).fill("https://instagram.com/fixed.handle/?utm=foo");
    await page.getByLabel(/^Latitude/i).fill("51.5");
    await page.getByLabel(/^Longitude/i).fill("-0.12");

    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    await expect(page.getByText(/Saved changes to Pending Chocolatier/i)).toBeVisible();
    // The row re-renders with the canonicalised values returned by the mock.
    await expect(page.getByText(/Berlin, United Kingdom/)).toBeVisible();

    // Diff payload was sent — only changed fields, with raw user input
    // (server normalises). business_name / city / etc. are NOT in the body.
    expect(updateRequestBody).not.toBeNull();
    expect(updateRequestBody).toMatchObject({
      id: "pending-1",
      country: "UK",
      instagram: "https://instagram.com/fixed.handle/?utm=foo",
      lat: "51.5",
      lng: "-0.12",
    });
    expect(updateRequestBody).not.toHaveProperty("business_name");
    expect(updateRequestBody).not.toHaveProperty("city");
  });

  test("Edit drawer surfaces server validation errors", async ({ page }) => {
    await page.route("**/api/choccy-chat/admin/list**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [baseEntry] }),
      });
    });
    await page.route("**/api/choccy-chat/admin/update", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Unrecognised country — please pick one from the list.",
        }),
      });
    });

    await page.goto("/admin/choccy-chat");
    await page.getByTestId("edit-pending-1").click();
    await page.getByLabel(/^Country$/i).fill("Atlantis");
    await page.getByTestId("save-pending-1").click();

    await expect(page.getByText(/Save failed:.*Unrecognised country/)).toBeVisible();
  });

  test("Approved rows show a 'live on map' notice in the edit drawer", async ({ page }) => {
    await page.route("**/api/choccy-chat/admin/list**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: [
            {
              ...baseEntry,
              id: "approved-1",
              status: "approved",
              lat: 52.52,
              lng: 13.405,
              approved_at: Date.now(),
              approved_by: "lizi.vermaas@gmail.com",
            },
          ],
        }),
      });
    });
    await page.goto("/admin/choccy-chat?status=approved");
    // The mock returns the entry on any list call, so the page loads fine.
    await expect(page.getByText("Pending Chocolatier")).toBeVisible({ timeout: 5000 });
    await page.getByTestId("edit-approved-1").click();
    await expect(
      page.getByText(/live on the public map — changes apply immediately/i),
    ).toBeVisible();
  });
});
