import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decideSeedGate, type CloudReadiness } from "./seedGate";

const SYNCED: CloudReadiness = { isLoggedIn: true, initiallySynced: true, phase: "in-sync" };

describe("decideSeedGate", () => {
  it("opens once the account's own rows are known to be here", () => {
    expect(decideSeedGate(SYNCED)).toEqual({ ready: true });
  });

  it("stays shut before login — the local tables are nobody's yet", () => {
    expect(decideSeedGate({ ...SYNCED, isLoggedIn: false })).toEqual({
      ready: false,
      reason: "signed-out",
    });
  });

  it("stays shut on a fresh profile whose first sync has not landed", () => {
    // The case behind issue #171: logged in, IndexedDB still empty, so every
    // default looks missing and a second full set would be inserted.
    expect(decideSeedGate({ ...SYNCED, initiallySynced: false })).toEqual({
      ready: false,
      reason: "initial-sync-pending",
    });
  });

  it.each(["initial", "not-in-sync", "pushing", "pulling", "error", "offline"] as const)(
    "stays shut while the client is %s — a partial table reads as a missing one",
    (phase) => {
      // Uneven duplicate counts (some categories copied 5×, others 3×) are the
      // signature of seeding against a half-downloaded table.
      expect(decideSeedGate({ ...SYNCED, phase })).toEqual({
        ready: false,
        reason: "sync-in-flight",
      });
    },
  );

  it("reports the earliest unmet condition, so a signed-out client is never blamed on sync", () => {
    expect(decideSeedGate({ isLoggedIn: false, initiallySynced: false, phase: "offline" })).toEqual({
      ready: false,
      reason: "signed-out",
    });
  });
});

/**
 * Tripwires for the two wiring steps this fix depends on. Neither is reachable
 * from the e2e suite, which runs local-only (no NEXT_PUBLIC_DEXIE_CLOUD_URL), so
 * removing either would go unnoticed until it hit a real cloud deployment.
 */
const SRC_ROOT = join(import.meta.dirname, "..");

describe("seed gate wiring", () => {
  it("the seed loader still routes cloud seeding through the gate", () => {
    const src = readFileSync(join(SRC_ROOT, "components", "seed-loader.tsx"), "utf8");
    expect(
      src.includes("decideSeedGate"),
      [
        "seed-loader.tsx no longer consults decideSeedGate.",
        "Seeding on mount reads a local table that has not synced yet, so every",
        "fresh browser profile inserts another full set of default categories and",
        "shell designs and pushes them to the cloud (issue #171).",
      ].join("\n"),
    ).toBe(true);
  });

  it("the auth gate still opens the database itself", () => {
    const src = readFileSync(join(SRC_ROOT, "components", "auth-gate.tsx"), "utf8");
    expect(
      /db\.open\(\)/.test(src),
      [
        "auth-gate.tsx no longer calls db.open().",
        "Dexie opens lazily and db.cloud.currentUser only reflects a saved session",
        "once the open runs the addon's ready hook. Now that seeding waits for sync,",
        "nothing else opens the database — returning users get 'Sign in to continue'",
        "on every load.",
      ].join("\n"),
    ).toBe(true);
  });
});
