/**
 * Instagram handle normaliser. Submitters paste all kinds of values into the
 * "Instagram handle" field — full URLs, leading @s, trailing slashes, query
 * strings, m.instagram.com links. We always store the bare handle so the rest
 * of the app can construct a clean instagram.com/<handle> link.
 *
 * Returns null for empty / un-recoverable input so the caller can decide
 * whether to drop the field.
 *
 * Mirror at worker/src/normalize.ts — keep in sync.
 */

const IG_URL_RE =
  /^(https?:\/\/)?(www\.|m\.)?instagram\.com\//i;

/** Allow letters, numbers, dot, underscore — the actual rule is similar but
 *  we're permissive: this is a "did the user enter something handle-shaped?"
 *  check, not a full validator. */
const HANDLE_CHARS_RE = /^[A-Za-z0-9._]+$/;

export function normalizeInstagramHandle(
  input: unknown,
): string | null {
  if (typeof input !== "string") return null;
  let v = input.trim();
  if (!v) return null;

  // Strip surrounding angle brackets (people sometimes paste <link>).
  v = v.replace(/^[<\s]+|[>\s]+$/g, "");

  // Strip URL form: https://www.instagram.com/handle/?foo=bar  →  handle
  v = v.replace(IG_URL_RE, "");

  // Drop query strings / fragments and any trailing path bits.
  const queryIdx = v.search(/[?#]/);
  if (queryIdx >= 0) v = v.slice(0, queryIdx);

  // First path segment only — e.g. "handle/reels" → "handle".
  v = v.split("/")[0];

  // Strip leading @ (or repeated @@).
  v = v.replace(/^@+/, "");

  // Trim again in case the strips introduced edge whitespace.
  v = v.trim();

  if (!v) return null;
  if (!HANDLE_CHARS_RE.test(v)) return null;
  return v;
}
