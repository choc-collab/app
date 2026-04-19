"use client";

import { useObservable } from "dexie-react-hooks";
import { db, isCloudConfigured } from "@/lib/db";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const currentUser = useObservable(db.cloud.currentUser);

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
