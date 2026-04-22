/**
 * Version utilities for the in-app "What's new" banner.
 *
 * App version flows in at build time via `NEXT_PUBLIC_APP_VERSION` (see
 * `next.config.ts`). It's the source of truth for the banner comparison and
 * for what gets written back to `UserPreferences.lastSeenVersion` on dismiss.
 */

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";

/**
 * Parse a semver-ish "X.Y.Z" string into a tuple. Extra suffixes (`-rc.1`, etc)
 * and missing segments are tolerated — anything non-numeric resolves to 0 so
 * comparisons stay total.
 */
export function parseVersion(v: string): [number, number, number] {
  const [core = ""] = v.split(/[-+]/, 1);
  const parts = core.split(".").map((n) => {
    const parsed = Number.parseInt(n, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** -1 if a < b, 1 if a > b, 0 if equal (on the major.minor.patch tuple). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const av = parseVersion(a);
  const bv = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (av[i] < bv[i]) return -1;
    if (av[i] > bv[i]) return 1;
  }
  return 0;
}

/**
 * Decide whether to show the "What's new" banner on this boot.
 *
 * - `loading`: preferences haven't resolved yet → don't render anything.
 * - `fresh-install`: no stored version AND no user data yet → silently seed
 *   `lastSeenVersion` so returning users on this device never see a banner
 *   for a release they pre-date. The caller does the seeding.
 * - `show`: stored version is older than current (or undefined with existing
 *   data — treated as a pre-banner user on an upgrade).
 * - `hide`: stored version is equal to (or ahead of) current.
 */
export type BannerDecision =
  | { kind: "loading" }
  | { kind: "fresh-install" }
  | { kind: "show"; from: string | null; to: string }
  | { kind: "hide" };

export function decideBanner(params: {
  currentVersion: string;
  lastSeenVersion: string | null | undefined;
  hasUserData: boolean | undefined;
}): BannerDecision {
  const { currentVersion, lastSeenVersion, hasUserData } = params;

  if (lastSeenVersion === undefined || hasUserData === undefined) {
    return { kind: "loading" };
  }

  if (lastSeenVersion === null) {
    if (!hasUserData) return { kind: "fresh-install" };
    return { kind: "show", from: null, to: currentVersion };
  }

  const cmp = compareVersions(lastSeenVersion, currentVersion);
  if (cmp < 0) return { kind: "show", from: lastSeenVersion, to: currentVersion };
  return { kind: "hide" };
}

export const CHANGELOG_URL = "https://github.com/choc-collab/app/blob/main/CHANGELOG.md";
