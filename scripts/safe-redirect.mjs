/**
 * Same-origin guard for redirect targets emitted by `serve-static.mjs`.
 *
 * Redirect targets embed captures taken straight from the request URL, so a
 * `_redirects` rule using `:name`/`*` could be coaxed into emitting an off-site
 * Location header. Checking for a leading "/" is NOT sufficient: `//evil.com`,
 * `/\evil.com` (browsers normalise the backslash into the authority position)
 * and `https://evil.com` all resolve to an external host.
 *
 * Resolve against a fixed base and keep the target only if it stayed
 * same-origin, then return the path portion alone.
 */

export const REDIRECT_BASE = "http://localhost";

/** @returns {string | null} a same-origin path, or null if the target escapes the origin. */
export function sameOriginTarget(target) {
  let url;
  try {
    url = new URL(target, REDIRECT_BASE);
  } catch {
    return null;
  }
  if (url.origin !== REDIRECT_BASE) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
