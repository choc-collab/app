import {
  clean,
  cleanRequired,
  isAllowedAdmin,
  json,
  randomToken,
  sha256Hex,
  verifyAccessJwt,
  verifyTurnstile,
} from "./lib";
import type {
  Env,
  FriendPublic,
  SubmissionAdmin,
  SubmissionRow,
} from "./types";

/* ─── Public: form submission ───────────────────────────────────────── */
export async function handleSubmit(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 }, env);
  }

  let payload: Record<string, unknown> = {};
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      payload = (await req.json()) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 }, env);
    }
  } else {
    const fd = await req.formData();
    fd.forEach((v, k) => {
      payload[k] = v;
    });
  }

  // Honeypot — bots fill the _gotcha field; humans never see it.
  if (typeof payload._gotcha === "string" && payload._gotcha.trim() !== "") {
    return json({ ok: true }, { status: 200 }, env); // silent accept
  }

  // Turnstile
  const turnstileToken =
    (payload["cf-turnstile-response"] as string) ??
    (payload.turnstile as string) ??
    "";
  const remoteIp = req.headers.get("cf-connecting-ip") ?? "";
  const turnstileOk = await verifyTurnstile(
    turnstileToken,
    remoteIp,
    env.TURNSTILE_SECRET,
  );
  if (!turnstileOk) {
    return json(
      { error: "Failed challenge — please reload and try again." },
      { status: 400 },
      env,
    );
  }

  const businessName = cleanRequired(payload.business_name, 120, "business_name");
  if ("error" in businessName) return json(businessName, { status: 400 }, env);
  const city = cleanRequired(payload.city, 80, "city");
  if ("error" in city) return json(city, { status: 400 }, env);
  const country = cleanRequired(payload.country, 80, "country");
  if ("error" in country) return json(country, { status: 400 }, env);
  const contactName = cleanRequired(payload.contact_name, 120, "contact_name");
  if ("error" in contactName) return json(contactName, { status: 400 }, env);
  const email = cleanRequired(payload.email, 200, "email");
  if ("error" in email) return json(email, { status: 400 }, env);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    return json({ error: "Invalid email" }, { status: 400 }, env);
  }

  // Optional public fields
  const instagramRaw = clean(payload.instagram, 60);
  const instagram = instagramRaw ? instagramRaw.replace(/^@+/, "") : null;
  const website = clean(payload.website, 250);
  if (website && !/^https?:\/\//i.test(website)) {
    return json(
      { error: "Website must start with http:// or https://" },
      { status: 400 },
      env,
    );
  }
  const blurb = clean(payload.blurb, 200);
  const notes = clean(payload.notes, 1000);

  if (!payload.consent) {
    return json({ error: "Consent required" }, { status: 400 }, env);
  }

  const id = randomToken(8);
  const ipHash = remoteIp ? await sha256Hex(remoteIp) : null;
  const userAgent = req.headers.get("user-agent")?.slice(0, 250) ?? null;
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO submissions (
       id, status, business_name, city, country,
       instagram, website, blurb,
       contact_name, email, notes,
       created_at, removal_token, ip_hash, user_agent
     ) VALUES (?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      businessName.value,
      city.value,
      country.value,
      instagram,
      website,
      blurb,
      contactName.value,
      email.value,
      notes,
      now,
      randomToken(24),
      ipHash,
      userAgent,
    )
    .run();

  return json({ ok: true, id }, { status: 201 }, env);
}

/* ─── Public: read approved entries ──────────────────────────────────── */
export async function handleFriends(
  _req: Request,
  env: Env,
): Promise<Response> {
  const { results } = await env.DB.prepare(
    `SELECT id, business_name, city, country, lat, lng, instagram, website, blurb
       FROM submissions
      WHERE status = 'approved' AND lat IS NOT NULL AND lng IS NOT NULL
      ORDER BY country, city`,
  ).all<{
    id: string;
    business_name: string;
    city: string;
    country: string;
    lat: number;
    lng: number;
    instagram: string | null;
    website: string | null;
    blurb: string | null;
  }>();

  const entries: FriendPublic[] = results.map((r) => ({
    id: r.id,
    name: r.business_name,
    city: r.city,
    country: r.country,
    lat: r.lat,
    lng: r.lng,
    instagram: r.instagram,
    website: r.website,
    blurb: r.blurb,
  }));

  return json(
    { entries },
    {
      status: 200,
      headers: {
        "cache-control": "public, max-age=60, s-maxage=300",
      },
    },
    env,
  );
}

/* ─── Self-removal ────────────────────────────────────────────────────── */
export async function handleSelfRemove(
  req: Request,
  env: Env,
): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 }, env);
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return json({ error: "Missing token" }, { status: 400 }, env);

  const result = await env.DB.prepare(
    `UPDATE submissions SET status = 'rejected', rejected_at = ? WHERE removal_token = ? AND status != 'rejected'`,
  )
    .bind(Date.now(), token)
    .run();

  if (result.meta.changes === 0) {
    return json(
      { error: "Token not found or already removed" },
      { status: 404 },
      env,
    );
  }
  return json({ ok: true }, { status: 200 }, env);
}

/* ─── Admin: list / approve / reject ─────────────────────────────────── */
async function requireAdmin(
  req: Request,
  env: Env,
): Promise<{ email: string } | Response> {
  const jwt = req.headers.get("cf-access-jwt-assertion");
  if (!jwt) {
    return json({ error: "Unauthorized" }, { status: 401 }, env);
  }
  const identity = await verifyAccessJwt(jwt, env);
  if (!identity || !isAllowedAdmin(identity, env)) {
    return json({ error: "Forbidden" }, { status: 403 }, env);
  }
  return { email: identity.email };
}

export async function handleAdminList(
  req: Request,
  env: Env,
): Promise<Response> {
  const auth = await requireAdmin(req, env);
  if (auth instanceof Response) return auth;

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "pending";
  if (!["pending", "approved", "rejected", "all"].includes(status)) {
    return json({ error: "Invalid status filter" }, { status: 400 }, env);
  }

  const stmt = status === "all"
    ? env.DB.prepare(
        `SELECT * FROM submissions ORDER BY created_at DESC LIMIT 500`,
      )
    : env.DB.prepare(
        `SELECT * FROM submissions WHERE status = ? ORDER BY created_at DESC LIMIT 500`,
      ).bind(status);

  const { results } = await stmt.all<SubmissionRow>();
  const entries: SubmissionAdmin[] = results.map((r) => ({
    id: r.id,
    status: r.status,
    name: r.business_name,
    city: r.city,
    country: r.country,
    lat: r.lat ?? 0,
    lng: r.lng ?? 0,
    instagram: r.instagram,
    website: r.website,
    blurb: r.blurb,
    contact_name: r.contact_name,
    email: r.email,
    notes: r.notes,
    created_at: r.created_at,
    approved_at: r.approved_at,
    approved_by: r.approved_by,
  }));
  return json({ entries }, { status: 200 }, env);
}

export async function handleAdminApprove(
  req: Request,
  env: Env,
): Promise<Response> {
  const auth = await requireAdmin(req, env);
  if (auth instanceof Response) return auth;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 }, env);
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    lat?: number;
    lng?: number;
  };
  if (!body.id) return json({ error: "Missing id" }, { status: 400 }, env);

  let { lat, lng } = body;
  // If lat/lng not supplied, try Nominatim geocode from city/country.
  if (lat === undefined || lng === undefined) {
    const row = await env.DB.prepare(
      `SELECT city, country FROM submissions WHERE id = ?`,
    )
      .bind(body.id)
      .first<{ city: string; country: string }>();
    if (!row) return json({ error: "Not found" }, { status: 404 }, env);
    const geo = await geocodeNominatim(row.city, row.country);
    if (!geo) {
      return json(
        { error: "Geocode failed — supply lat/lng manually" },
        { status: 422 },
        env,
      );
    }
    lat = geo.lat;
    lng = geo.lng;
  }

  await env.DB.prepare(
    `UPDATE submissions
        SET status = 'approved',
            approved_at = ?,
            approved_by = ?,
            lat = ?,
            lng = ?
      WHERE id = ?`,
  )
    .bind(Date.now(), auth.email, lat, lng, body.id)
    .run();

  return json({ ok: true, lat, lng }, { status: 200 }, env);
}

export async function handleAdminReject(
  req: Request,
  env: Env,
): Promise<Response> {
  const auth = await requireAdmin(req, env);
  if (auth instanceof Response) return auth;

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 }, env);
  }
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return json({ error: "Missing id" }, { status: 400 }, env);

  await env.DB.prepare(
    `UPDATE submissions SET status = 'rejected', rejected_at = ? WHERE id = ?`,
  )
    .bind(Date.now(), body.id)
    .run();
  return json({ ok: true }, { status: 200 }, env);
}

/* ─── Geocoding via Nominatim (OpenStreetMap) ────────────────────────── */
async function geocodeNominatim(
  city: string,
  country: string,
): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    city,
    country,
    format: "jsonv2",
    limit: "1",
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        "user-agent": "choc-collab-choccy-chat/1.0 (https://choc-collab.org)",
      },
    },
  );
  if (!res.ok) return null;
  const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (!arr.length) return null;
  const lat = parseFloat(arr[0].lat);
  const lng = parseFloat(arr[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}
