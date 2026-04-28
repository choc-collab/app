/**
 * Defensive URL normaliser — prepends `https://` if a submitter forgot the
 * protocol. Returns null for empty/invalid input so callers can decide
 * whether to render the link.
 */
export function normalizeWebsite(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Bare hostnames like "choc-collab.org" or "www.example.com/path".
  // Don't try to validate further — browsers will balk at malformed URLs
  // and the user can re-submit.
  return `https://${trimmed}`;
}
