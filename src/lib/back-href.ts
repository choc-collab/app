/**
 * Resolves the `?from=` query parameter used by the batch summary page's
 * "back" link.
 *
 * `from` is attacker-controlled, so it must never reach an href as-is. A
 * `startsWith("/")` check is NOT enough: browsers normalise backslashes in the
 * authority position, so `/\evil.com` becomes the protocol-relative
 * `//evil.com` and navigates off-site.
 *
 * Only two in-app routes ever link to the summary page, so rather than trying
 * to sanitise arbitrary input we match `from` against those two shapes and
 * rebuild the href from our own literals.
 */

export type BackTarget = { href: string; label: string };

// Ids are `crypto.randomUUID()` values; the charset here deliberately excludes
// anything with meaning in a URL ("/", "\", ":", "?", "#", "%").
const PRODUCT_HISTORY = /^\/products\/([A-Za-z0-9._~-]+)\?tab=history$/;

export function resolveBackHref(value: string | null | undefined): BackTarget | null {
  if (!value) return null;
  if (value === "/production") return { href: "/production", label: "Production" };
  const product = PRODUCT_HISTORY.exec(value);
  if (product) {
    return {
      href: `/products/${encodeURIComponent(product[1])}?tab=history`,
      label: "Back to product",
    };
  }
  return null;
}
