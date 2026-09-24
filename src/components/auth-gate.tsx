"use client";

import { useEffect } from "react";
import { useObservable } from "dexie-react-hooks";
import { db, isCloudConfigured } from "@/lib/db";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const currentUser = useObservable(db.cloud.currentUser);

  // Dexie opens lazily, and `db.cloud.currentUser` only picks up a saved session
  // once that open runs the addon's ready hook. The seed loader used to be the
  // first thing to touch a table; now that it waits for sync, nothing else would
  // open the database and a signed-in returning user would sit on the sign-in
  // screen forever. With `requireAuth` this stays pending while signed out, which
  // is what it already did when the seed loader triggered it.
  useEffect(() => {
    if (!isCloudConfigured) return;
    db.open().catch((e) => console.error("db.open failed:", e));
  }, []);

  if (!isCloudConfigured) return <>{children}</>;
  if (currentUser === undefined) return null;
  if (currentUser.isLoggedIn) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-sm w-full space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-3xl text-primary" style={{ fontFamily: "var(--font-display)" }}>
            Choc-collab
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to sync your chocolate-making data across devices.
          </p>
        </div>
        <button
          onClick={() => db.cloud.login()}
          className="w-full rounded-full bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          Sign in to continue
        </button>
        <p className="text-xs text-muted-foreground">
          We&apos;ll email you a one-time code — no password needed.
        </p>
      </div>
    </div>
  );
}
