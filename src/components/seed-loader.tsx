"use client";

import { useEffect } from "react";
import { seedIfNeeded } from "@/lib/seed";
import { db, isCloudConfigured } from "@/lib/db";
import { decideSeedGate } from "@/lib/seedGate";
import { ensureDefaultProductCategories, ensureDefaultDecorationCategories, ensureDefaultShellDesigns, ensureDefaultFillingCategories, ensureDefaultIngredientCategories } from "@/lib/hooks";

function runSeeders() {
  // Idempotent — each seeder only inserts the defaults missing from its table.
  // Runs on every app load so fresh users (who skip the v4 upgrade hook) still
  // get the seeded values.
  ensureDefaultProductCategories().catch((e) => console.error("ensureDefaultProductCategories failed:", e));
  ensureDefaultDecorationCategories().catch((e) => console.error("ensureDefaultDecorationCategories failed:", e));
  ensureDefaultShellDesigns().catch((e) => console.error("ensureDefaultShellDesigns failed:", e));
  ensureDefaultFillingCategories().catch((e) => console.error("ensureDefaultFillingCategories failed:", e));
  ensureDefaultIngredientCategories().catch((e) => console.error("ensureDefaultIngredientCategories failed:", e));
  seedIfNeeded();
}

export function SeedLoader() {
  useEffect(() => {
    if (!isCloudConfigured) {
      runSeeders();
      return;
    }

    // Every seeder works out what is missing by reading the LOCAL table, which on
    // a fresh browser profile stays empty until the first sync lands. Seeding
    // before then inserts a duplicate set and pushes it up (issue #171), so wait
    // for this account's own rows to arrive first. If they never do (offline,
    // sync error) this session just doesn't seed — the next one with a working
    // sync will, and an established browser already has its rows.
    let settled = false;
    const subscriptions: { unsubscribe(): void }[] = [];

    const stop = () => {
      settled = true;
      while (subscriptions.length) subscriptions.pop()?.unsubscribe();
    };

    const check = () => {
      if (settled) return;
      const verdict = decideSeedGate({
        isLoggedIn: Boolean(db.cloud.currentUser.value.isLoggedIn),
        initiallySynced: Boolean(db.cloud.persistedSyncState.value?.initiallySynced),
        phase: db.cloud.syncState.value.phase,
      });
      if (!verdict.ready) return;
      stop();
      runSeeders();
    };

    // BehaviorSubjects, so each emits synchronously on subscribe — the gate can
    // open (and stop()) before the last watch() call has returned.
    const watch = (observable: { subscribe(next: () => void): { unsubscribe(): void } }) => {
      const subscription = observable.subscribe(check);
      if (settled) subscription.unsubscribe();
      else subscriptions.push(subscription);
    };

    watch(db.cloud.currentUser);
    watch(db.cloud.persistedSyncState);
    watch(db.cloud.syncState);

    return stop;
  }, []);

  return null;
}
