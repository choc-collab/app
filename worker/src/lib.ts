/**
 * Small utilities: JSON responses, CORS, Turnstile verification, hashing,
 * Cloudflare Access JWT verification.
 */
import type { Env } from "./types";

export function json(data: unknown, init: ResponseInit = {}, env?: Env): Response {
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders(env),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

export function corsHeaders(env?: Env): Record<string, string> {
  // Same-origin in production (Worker on choc-collab.org), but cors needed
  // for `wrangler dev` against a local Next dev server.
  return {
    "access-control-allow-origin": env?.ALLOWED_ORIGIN ?? "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, cf-access-jwt-assertion",
    "access-control-max-age": "86400",
  };
}

/** Verify a Cloudflare Turnstile token from the form post. */
export async function verifyTurnstile(
  token: string,
  remoteIp: string,
  secret: string,
): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", token);
  if (remoteIp) body.append("remoteip", remoteIp);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!res.ok) return false;
  const j = (await res.json()) as { success?: boolean };
  return j.success === true;
}

/** SHA-256 hex digest — used for IP hashing, removal tokens, etc. */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Cryptographically random token (URL-safe). */
export function randomToken(bytes = 24): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return [...arr]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/* ─── Cloudflare Access JWT verification ───────────────────────────────
   Even though Cloudflare Access protects the /api/admin/* path at the
   network edge, we double-check the JWT inside the Worker so that a
   misconfigured route or workers.dev bypass cannot expose admin actions.

   Verifies signature against the team's JWKS, checks exp/iat/aud, and
   returns the verified email claim — or null if anything is off.
   ──────────────────────────────────────────────────────────────────── */
type Jwks = { keys: Array<{ kid: string; n: string; e: string; alg?: string; kty: string; use?: string }> };

let cachedJwks: { keys: Jwks["keys"]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000; // 1h

async function fetchJwks(teamDomain: string): Promise<Jwks["keys"]> {
  if (cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_TTL_MS) {
    return cachedJwks.keys;
  }
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const j = (await res.json()) as Jwks;
  cachedJwks = { keys: j.keys, fetchedAt: Date.now() };
  return j.keys;
}

function b64urlToUint8(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(b64url.length / 4) * 4,
    "=",
  );
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlToString(b64url: string): string {
  return new TextDecoder().decode(b64urlToUint8(b64url));
}

export type AccessIdentity = { email: string; sub: string };

export async function verifyAccessJwt(
  jwt: string,
  env: Env,
): Promise<AccessIdentity | null> {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(b64urlToString(headerB64)) as {
      kid: string;
      alg: string;
    };
    if (header.alg !== "RS256") return null;

    const keys = await fetchJwks(env.ACCESS_TEAM_DOMAIN);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const cryptoKey = await crypto.subtle.importKey(
      "jwk",
      { ...jwk, alg: "RS256", ext: true } as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
    const signature = b64urlToUint8(signatureB64);
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      signature as BufferSource,
      data as BufferSource,
    );
    if (!ok) return null;

    const payload = JSON.parse(b64urlToString(payloadB64)) as {
      email?: string;
      sub?: string;
      aud?: string | string[];
      exp?: number;
      iat?: number;
      iss?: string;
    };

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (payload.iat && payload.iat > now + 60) return null; // leeway

    const expectedAud = env.ACCESS_AUD;
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud ?? ""];
    if (!aud.includes(expectedAud)) return null;

    if (!payload.email || !payload.sub) return null;
    return { email: payload.email, sub: payload.sub };
  } catch {
    return null;
  }
}

export function isAllowedAdmin(identity: AccessIdentity, env: Env): boolean {
  const allowed = env.ALLOWED_ADMIN_EMAILS.split(",").map((s) =>
    s.trim().toLowerCase(),
  );
  return allowed.includes(identity.email.toLowerCase());
}

/** Sanitise a string field — trim, collapse whitespace, length cap. */
export function clean(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

export function cleanRequired(
  value: unknown,
  max: number,
  field: string,
): { value: string } | { error: string } {
  const v = clean(value, max);
  if (!v) return { error: `Missing required field: ${field}` };
  return { value: v };
}
