import { describe, expect, it } from "vitest";
import { buildUpgradeSnapshotFilename, decideUpgradeSnapshot } from "./upgrade-snapshot";

// Dexie stores its declared version times ten in IndexedDB. The decision
// helper works in IDB space so it never has to care about Dexie's ×10 scheme
// round-tripping through the browser's databases() API.
const TARGET_IDB = 60; // matches Dexie v6

describe("decideUpgradeSnapshot", () => {
  it("skips when the browser does not expose stored versions (Safari <16.4)", () => {
    expect(decideUpgradeSnapshot(null, TARGET_IDB)).toEqual({
      shouldSnapshot: false,
      reason: "unsupported-browser",
    });
  });

  it("skips a brand-new install — nothing to protect", () => {
    expect(decideUpgradeSnapshot(0, TARGET_IDB)).toEqual({
      shouldSnapshot: false,
      reason: "fresh-install",
    });
  });

  it("skips when the stored version already matches the target", () => {
    expect(decideUpgradeSnapshot(60, TARGET_IDB)).toEqual({
      shouldSnapshot: false,
      reason: "already-current",
    });
  });

  it("skips when the stored version is somehow ahead (downgrade / dev branch)", () => {
    // Running an older bundle against a DB upgraded by a newer bundle is not
    // something we should snapshot — the data is already past our target
    // schema and re-opening at a lower version would fail anyway.
    expect(decideUpgradeSnapshot(70, TARGET_IDB)).toEqual({
      shouldSnapshot: false,
      reason: "already-current",
    });
  });

  it("triggers a snapshot when stored version is one Dexie step behind", () => {
    expect(decideUpgradeSnapshot(50, TARGET_IDB)).toEqual({ shouldSnapshot: true });
  });

  it("triggers a snapshot when stored version is many Dexie steps behind", () => {
    expect(decideUpgradeSnapshot(10, TARGET_IDB)).toEqual({ shouldSnapshot: true });
  });
});

describe("buildUpgradeSnapshotFilename", () => {
  it("embeds both versions and an ISO date for recoverability", () => {
    // Feed a fixed date so the test is deterministic regardless of when it runs.
    const name = buildUpgradeSnapshotFilename(5, 6, new Date("2026-04-19T10:20:30Z"));
    expect(name).toBe("choc-collab-snapshot-before-upgrade-v5-to-v6-2026-04-19.json");
  });

  it("handles multi-step upgrades in the name", () => {
    const name = buildUpgradeSnapshotFilename(2, 6, new Date("2026-01-01T00:00:00Z"));
    expect(name).toBe("choc-collab-snapshot-before-upgrade-v2-to-v6-2026-01-01.json");
  });

  it("defaults to the current date when one is not passed", () => {
    const name = buildUpgradeSnapshotFilename(5, 6);
    // We can't pin the clock here — just assert the shape is right.
    expect(name).toMatch(/^choc-collab-snapshot-before-upgrade-v5-to-v6-\d{4}-\d{2}-\d{2}\.json$/);
  });
});
