import type { SyncState } from "dexie-cloud-addon";

/** Snapshot of the three `db.cloud` observables the seed gate reads. */
export interface CloudReadiness {
  isLoggedIn: boolean;
  /** `persistedSyncState.initiallySynced` — the first full download has landed. */
  initiallySynced: boolean;
  phase: SyncState["phase"];
}

export type SeedGateVerdict =
  | { ready: true }
  | { ready: false; reason: "signed-out" | "initial-sync-pending" | "sync-in-flight" };

/** Decide whether the local tables can be trusted to show what this account
 *  already owns — the precondition for seeding defaults by name.
 *
 *  All three conditions are load-bearing. A logged-in user whose first sync has
 *  not finished still has an empty IndexedDB, and a client mid-pull has only
 *  part of it; seeding against either state reads "no default categories here"
 *  and inserts a second full set with fresh ids, which then syncs up alongside
 *  the real rows — one extra copy per fresh browser profile (issue #171). */
export function decideSeedGate(state: CloudReadiness): SeedGateVerdict {
  if (!state.isLoggedIn) return { ready: false, reason: "signed-out" };
  if (!state.initiallySynced) return { ready: false, reason: "initial-sync-pending" };
  if (state.phase !== "in-sync") return { ready: false, reason: "sync-in-flight" };
  return { ready: true };
}
