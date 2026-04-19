import Dexie from "dexie";

// Keep in sync with the highest version declared in db.ts. Dexie multiplies
// its declared version by 10 for the underlying IndexedDB integer, so the
// on-disk IDB version for Dexie v6 is 60. Compare in IDB-space so we don't
// fight rounding when the browser reports versions via databases().
const CURRENT_DEXIE_VERSION = 6;
const CURRENT_IDB_VERSION = CURRENT_DEXIE_VERSION * 10;
const DB_NAME = "ChocolatierDB";

const SNAPSHOT_METADATA_KEY = "choc-collab-last-upgrade-snapshot";

export interface UpgradeSnapshotDecision {
  shouldSnapshot: boolean;
  reason?:
    | "unsupported-browser"
    | "fresh-install"
    | "already-current"
    | "ssr";
}

export interface UpgradeSnapshotResult extends UpgradeSnapshotDecision {
  fromDexieVersion: number | null;
  toDexieVersion: number;
  snapshotted: boolean;
  // Set when we got as far as peeking but the peek produced no rows, so
  // there was nothing worth downloading.
  noData?: boolean;
  // Set when an unexpected error aborted the snapshot mid-flight — logged
  // for diagnostics but never surfaced to the user (best-effort).
  errored?: boolean;
}

export interface LastSnapshotMetadata {
  fromDexieVersion: number;
  toDexieVersion: number;
  savedAt: string;
  filename: string;
}

// --- Pure decision helpers (unit-testable) --------------------------------

export function decideUpgradeSnapshot(
  storedIdbVersion: number | null,
  targetIdbVersion: number,
): UpgradeSnapshotDecision {
  if (storedIdbVersion === null) return { shouldSnapshot: false, reason: "unsupported-browser" };
  if (storedIdbVersion === 0) return { shouldSnapshot: false, reason: "fresh-install" };
  if (storedIdbVersion >= targetIdbVersion) return { shouldSnapshot: false, reason: "already-current" };
  return { shouldSnapshot: true };
}

export function buildUpgradeSnapshotFilename(
  fromDexieVersion: number,
  toDexieVersion: number,
  now: Date = new Date(),
): string {
  const date = now.toISOString().slice(0, 10);
  return `choc-collab-snapshot-before-upgrade-v${fromDexieVersion}-to-v${toDexieVersion}-${date}.json`;
}

// --- Browser-only plumbing -------------------------------------------------

async function getStoredIdbVersion(): Promise<number | null> {
  if (typeof indexedDB === "undefined") return null;
  const idb = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string; version?: number }>> };
  if (typeof idb.databases !== "function") return null;
  try {
    const list = await idb.databases();
    const match = list.find((d) => d.name === DB_NAME);
    return typeof match?.version === "number" ? match.version : 0;
  } catch {
    return null;
  }
}

async function dumpExistingDb(): Promise<{ version: number; tables: Record<string, unknown[]> }> {
  // No .version() call → Dexie opens at the currently-stored version and
  // attaches to the object stores that already exist. Any other connection
  // trying to upgrade will block until we close this one (handled in the
  // finally), so the snapshot always observes pre-upgrade state.
  const peek = new Dexie(DB_NAME);
  peek.on("versionchange", () => { peek.close(); });
  try {
    await peek.open();
    const version = peek.verno;
    const tables: Record<string, unknown[]> = {};
    for (const t of peek.tables) {
      try {
        tables[t.name] = await t.toArray();
      } catch {
        tables[t.name] = [];
      }
    }
    return { version, tables };
  } finally {
    peek.close();
  }
}

function triggerDownload(payload: object, filename: string): void {
  if (typeof document === "undefined") return;
  const json = JSON.stringify(payload, (_k, v) => v ?? undefined);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function recordSnapshotMetadata(meta: LastSnapshotMetadata): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SNAPSHOT_METADATA_KEY, JSON.stringify(meta));
  } catch {
    // storage full / blocked — metadata is a nicety, never required.
  }
}

export function readLastSnapshotMetadata(): LastSnapshotMetadata | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(SNAPSHOT_METADATA_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LastSnapshotMetadata;
    if (typeof parsed?.savedAt !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function dismissLastSnapshotMetadata(): void {
  if (typeof localStorage === "undefined") return;
  try { localStorage.removeItem(SNAPSHOT_METADATA_KEY); } catch { /* ignore */ }
}

// --- Main entry point ------------------------------------------------------

export async function snapshotBeforeUpgrade(): Promise<UpgradeSnapshotResult> {
  const toDexieVersion = CURRENT_DEXIE_VERSION;
  if (typeof window === "undefined") {
    return { shouldSnapshot: false, reason: "ssr", fromDexieVersion: null, toDexieVersion, snapshotted: false };
  }

  const storedIdb = await getStoredIdbVersion();
  const decision = decideUpgradeSnapshot(storedIdb, CURRENT_IDB_VERSION);
  if (!decision.shouldSnapshot) {
    return {
      ...decision,
      fromDexieVersion: storedIdb != null ? storedIdb / 10 : null,
      toDexieVersion,
      snapshotted: false,
    };
  }

  const fromDexieVersion = (storedIdb as number) / 10;
  try {
    const { tables } = await dumpExistingDb();
    const hasRows = Object.values(tables).some((rows) => Array.isArray(rows) && rows.length > 0);
    if (!hasRows) {
      return { shouldSnapshot: true, fromDexieVersion, toDexieVersion, snapshotted: false, noData: true };
    }

    const savedAt = new Date();
    const filename = buildUpgradeSnapshotFilename(fromDexieVersion, toDexieVersion, savedAt);
    triggerDownload({
      format: "choc-collab-upgrade-snapshot",
      fromDexieVersion,
      toDexieVersion,
      exportedAt: savedAt.toISOString(),
      tables,
    }, filename);
    recordSnapshotMetadata({
      fromDexieVersion,
      toDexieVersion,
      savedAt: savedAt.toISOString(),
      filename,
    });
    return { shouldSnapshot: true, fromDexieVersion, toDexieVersion, snapshotted: true };
  } catch {
    return { shouldSnapshot: true, fromDexieVersion, toDexieVersion, snapshotted: false, errored: true };
  }
}
