# Choccy Chat — deployment runbook

Click-by-click guide to get the Choccy Chat directory live on
`choc-collab.org`. Total wall-clock time: ~30 min, mostly waiting for DNS.

## Prerequisites

- Cloudflare account that owns `choc-collab.org` (Pages already deployed).
- Zero Trust enabled on the account (free tier ≤50 users — sign up at
  `https://one.dash.cloudflare.com` if you haven't already).
- `wrangler` CLI: `npm install -g wrangler` then `wrangler login`.

---

## 1. Create the D1 database

From the repo root:

```bash
cd worker
wrangler d1 create choc-collab-friends
```

Wrangler prints a `database_id`. Paste it into [`worker/wrangler.toml`](./wrangler.toml)
under `[[d1_databases]]`, replacing `REPLACE_WITH_DATABASE_ID`.

Apply the schema (creates the `submissions` table):

```bash
npm run schema           # production database
npm run schema:local     # local wrangler dev database
```

## 2. Create the Turnstile site

1. Cloudflare dashboard → **Turnstile** (left nav, under **Application Services**).
2. Click **Add site**.
   - Site name: `choc-collab.org`
   - Hostnames: `choc-collab.org` (add `localhost` too if you want to
     test against `npm run dev`)
   - Widget mode: **Managed** (recommended)
3. Save. Cloudflare gives you a **site key** (public) and a **secret key**
   (private).

Paste the **site key** into your Pages project env var:

- Cloudflare dashboard → **Workers & Pages** → your Pages project →
  **Settings** → **Environment Variables** → **Production**:
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY = <site key>`

Paste the **secret key** into the Worker as a secret:

```bash
cd worker
wrangler secret put TURNSTILE_SECRET
# paste the secret key when prompted
```

## 3. Create the Cloudflare Access application (admin gate)

This protects `/admin/*` and the admin API endpoints with magic-link auth
limited to your email.

1. Zero Trust dashboard (`one.dash.cloudflare.com`) → **Access** →
   **Applications** → **Add an application** → **Self-hosted**.
2. Application configuration:
   - Name: `Choccy Chat admin`
   - Session duration: **24 hours** (your call)
   - Application domain — add **two** entries:
     - `choc-collab.org` path `/admin/*`
     - `choc-collab.org` path `/api/choccy-chat/admin/*`
3. **Identity providers**: enable **One-time PIN** (the simplest).
4. **Policies** → add policy `Owner only`:
   - Action: **Allow**
   - Rules: **Emails** → `lizi.vermaas@gmail.com`
5. Save.

After saving, copy two values from the application settings page:

- **AUD tag** (a long hex string under "Application audience tag"). Set it
  in [`worker/wrangler.toml`](./wrangler.toml) → `[vars] ACCESS_AUD`.
- **Team domain** (the `<your-team>.cloudflareaccess.com` host shown on
  the Access dashboard). Set it in `[vars] ACCESS_TEAM_DOMAIN`.

## 4. Deploy the Worker

```bash
cd worker
wrangler deploy
```

This:
- Creates the Worker named `choc-collab-choccy-chat`.
- Binds the `DB` D1 database.
- Mounts the Worker at `choc-collab.org/api/*` (per the `[[routes]]` block
  in `wrangler.toml`).
- Disables the `*.workers.dev` URL (defence-in-depth — admin endpoints
  are also Access-gated and JWT-verified inside the Worker).

If the `[[routes]]` mount fails because the zone isn't on this account,
move the `pattern` to a hostname that is, or use the dashboard:
**Workers & Pages** → the Worker → **Triggers** → **Add Custom Domain**.

## 5. Deploy the Pages site

The Pages site auto-deploys when you push to `main`. The new files added
by this work:

- `/choccy-chat`           — public map
- `/choccy-chat/join`      — submission form (Turnstile)
- `/choccy-chat/join/thanks` — post-submit confirmation
- `/choccy-chat/remove`    — self-removal flow (token in URL)
- `/admin/choccy-chat`     — admin queue (Access-gated)

Pages env vars required (set under Settings → Environment Variables →
Production, then trigger a redeploy):

| Variable | Example value |
| --- | --- |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | `0x4AAAAAAAxxxxxxxxxxxxx` |

`NEXT_PUBLIC_*` is inlined at build time, so you must redeploy Pages
after setting it.

## 6. Smoke test

1. Open `https://choc-collab.org/choccy-chat`. Map renders, your seed
   entry is visible. (Live data from the Worker replaces the build-time
   JSON.)
2. Open `/choccy-chat/join`. Turnstile widget appears, submit button is
   enabled. Submit a test entry.
3. Open `/admin/choccy-chat`. Cloudflare Access prompts for one-time PIN
   to your email. After auth, the test submission shows under
   **Pending**. Click **Approve** — it geocodes the city and flips to
   **Approved**.
4. Reload `/choccy-chat`. The approved entry shows on the map.
5. Visit `/choccy-chat/remove?token=<removal_token>` (look up the token
   in D1 with `wrangler d1 execute choc-collab-friends --command="SELECT
   id, removal_token FROM submissions"`) and confirm. Entry vanishes
   from the public list within a minute.

## 7. Day-to-day operations

- **Tail Worker logs**: `cd worker && npm run tail`
- **Read D1 directly**: `wrangler d1 execute choc-collab-friends --command="SELECT id, status, business_name, city FROM submissions ORDER BY created_at DESC LIMIT 20"`
- **Bulk approve** (if you have a backlog): `wrangler d1 execute choc-collab-friends --command="UPDATE submissions SET status='approved', approved_at=strftime('%s', 'now')*1000 WHERE id IN ('a','b','c')"`
- **Reset Turnstile rate-limit confusion**: just reload the join page;
  the widget self-resets after each failed submit.

## Troubleshooting

| Symptom | Most likely cause | Fix |
| --- | --- | --- |
| Submit button stays disabled on `/choccy-chat/join` | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` not set or Pages not redeployed | Set env var in Pages → trigger redeploy |
| Form submission → 400 "Failed challenge" | Turnstile secret key wrong or Turnstile site hostname mismatch | Re-run `wrangler secret put TURNSTILE_SECRET`; check site hostnames in Turnstile dashboard |
| Admin page → "Not signed in to Cloudflare Access" forever | Access application path pattern wrong | Edit Access application: paths must be `/admin/*` AND `/api/choccy-chat/admin/*` |
| Approve fails with "Geocode failed" | Nominatim couldn't resolve the city | Use the lat/lng inputs on the row to enter coordinates manually before approving |
| Map suddenly empty | Worker is down OR D1 has zero approved rows | Open browser devtools → Network → check `/api/choccy-chat/friends` response. If 5xx, `wrangler tail` for stack trace |
| Tile images broken (grey map) | CSP missing the CartoCDN domain | Verify `public/_headers` `img-src` includes `https://*.basemaps.cartocdn.com` |

## Adjusting the CSP for local dev

`next dev` runs without the `_headers` file applied, so the dev experience
is unrestricted. If you serve a production build locally with `next start`
or against the static export, the CSP applies — same restrictions as
production.
