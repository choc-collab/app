"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const REMOVE_ENDPOINT = "/api/choccy-chat/remove";

type State =
  | { kind: "idle" }
  | { kind: "no-token" }
  | { kind: "submitting" }
  | { kind: "done" }
  | { kind: "error"; message: string };

export function RemovalForm() {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token");
    if (!t) {
      setState({ kind: "no-token" });
      return;
    }
    setToken(t);
  }, []);

  async function onConfirm() {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch(`${REMOVE_ENDPOINT}?token=${encodeURIComponent(token)}`, {
        method: "POST",
      });
      if (res.ok) {
        setState({ kind: "done" });
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState({
        kind: "error",
        message:
          body.error ?? `Removal failed (${res.status}). Please email lizi.vermaas@gmail.com.`,
      });
    } catch (e) {
      setState({
        kind: "error",
        message: `Network error: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  if (state.kind === "no-token") {
    return (
      <div className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
        This page needs a removal token. Use the link in your approval email.
        If you don&apos;t have it, email{" "}
        <a
          href="mailto:lizi.vermaas@gmail.com"
          className="text-foreground underline underline-offset-2"
        >
          lizi.vermaas@gmail.com
        </a>
        .
      </div>
    );
  }

  if (state.kind === "done") {
    return (
      <div
        className="rounded-lg border p-5"
        style={{
          background: "var(--color-status-ok-bg)",
          color: "var(--color-status-ok)",
          borderColor: "var(--color-status-ok-edge)",
        }}
      >
        <strong className="font-semibold">Removed.</strong> Your entry will
        disappear from the map within a few minutes.{" "}
        <Link
          href="/choccy-chat"
          className="underline underline-offset-2"
          style={{ color: "var(--color-status-ok)" }}
        >
          Back to the map
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.kind === "error" && (
        <div
          role="alert"
          className="rounded-md border p-3 text-sm"
          style={{
            background: "var(--color-status-alert-bg)",
            color: "var(--color-status-alert)",
            borderColor: "var(--color-status-alert-edge)",
          }}
        >
          {state.message}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onConfirm}
          className="btn-primary"
          style={{
            background: "var(--color-status-alert-bg)",
            color: "var(--color-status-alert)",
          }}
          disabled={state.kind === "submitting"}
        >
          {state.kind === "submitting" ? "Removing…" : "Yes, remove me"}
        </button>
        <Link href="/choccy-chat" className="btn-secondary">
          Cancel
        </Link>
      </div>
    </div>
  );
}
