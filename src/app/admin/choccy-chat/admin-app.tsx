"use client";

import { useCallback, useEffect, useState } from "react";

const ADMIN_LIST = "/api/choccy-chat/admin/list";
const ADMIN_APPROVE = "/api/choccy-chat/admin/approve";
const ADMIN_REJECT = "/api/choccy-chat/admin/reject";

type Status = "pending" | "approved" | "rejected" | "all";

type AdminEntry = {
  id: string;
  status: "pending" | "approved" | "rejected";
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  instagram: string | null;
  website: string | null;
  blurb: string | null;
  contact_name: string;
  email: string;
  notes: string | null;
  created_at: number;
  approved_at: number | null;
  approved_by: string | null;
};

type Action = { id: string; kind: "approve" | "reject" } | null;
type Banner =
  | { kind: "info"; message: string }
  | { kind: "error"; message: string }
  | null;

export function AdminApp() {
  const [status, setStatus] = useState<Status>("pending");
  const [entries, setEntries] = useState<AdminEntry[] | null>(null);
  const [busy, setBusy] = useState<Action>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Per-row lat/lng overrides if Lizi wants to correct geocode before approve.
  const [overrides, setOverrides] = useState<
    Record<string, { lat: string; lng: string }>
  >({});

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    (async () => {
      try {
        const res = await fetch(`${ADMIN_LIST}?status=${status}`, {
          cache: "no-store",
        });
        if (res.status === 401 || res.status === 403) {
          setBanner({
            kind: "error",
            message:
              "Not signed in to Cloudflare Access. Reload to authenticate.",
          });
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { entries: AdminEntry[] };
        if (!cancelled) setEntries(body.entries);
      } catch (e) {
        if (!cancelled) {
          setBanner({
            kind: "error",
            message: `Failed to load: ${
              e instanceof Error ? e.message : String(e)
            }`,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  async function approve(entry: AdminEntry) {
    setBusy({ id: entry.id, kind: "approve" });
    setBanner(null);
    try {
      const ovr = overrides[entry.id];
      const body: Record<string, unknown> = { id: entry.id };
      if (ovr?.lat && ovr?.lng) {
        const lat = parseFloat(ovr.lat);
        const lng = parseFloat(ovr.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          body.lat = lat;
          body.lng = lng;
        }
      }
      const res = await fetch(ADMIN_APPROVE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      const ok = (await res.json()) as { lat: number; lng: number };
      setBanner({
        kind: "info",
        message: `Approved ${entry.name} at ${ok.lat.toFixed(4)}, ${ok.lng.toFixed(4)}.`,
      });
      refresh();
    } catch (e) {
      setBanner({
        kind: "error",
        message: `Approve failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function reject(entry: AdminEntry) {
    if (!window.confirm(`Reject "${entry.name}"? This is reversible by editing D1 directly.`)) {
      return;
    }
    setBusy({ id: entry.id, kind: "reject" });
    setBanner(null);
    try {
      const res = await fetch(ADMIN_REJECT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: entry.id }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errBody.error ?? `HTTP ${res.status}`);
      }
      setBanner({ kind: "info", message: `Rejected ${entry.name}.` });
      refresh();
    } catch (e) {
      setBanner({
        kind: "error",
        message: `Reject failed: ${
          e instanceof Error ? e.message : String(e)
        }`,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="mono-label text-muted-foreground mb-2">
            Choccy Chat · directory submissions
          </div>
          <h1
            className="text-3xl font-[450] tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Review queue
          </h1>
        </div>
        <Tabs value={status} onChange={setStatus} />
      </div>

      {banner && (
        <div
          role={banner.kind === "error" ? "alert" : "status"}
          className="mb-4 rounded-md border p-3 text-sm"
          style={
            banner.kind === "error"
              ? {
                  background: "var(--color-status-alert-bg)",
                  color: "var(--color-status-alert)",
                  borderColor: "var(--color-status-alert-edge)",
                }
              : {
                  background: "var(--color-status-ok-bg)",
                  color: "var(--color-status-ok)",
                  borderColor: "var(--color-status-ok-edge)",
                }
          }
        >
          {banner.message}
        </div>
      )}

      {entries === null ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Nothing to show in <strong>{status}</strong>.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="bg-card border border-border rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusPill status={e.status} />
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(e.created_at).toISOString().slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-lg font-[500] tracking-tight">{e.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {e.city}, {e.country}
                    {e.instagram && (
                      <>
                        {" · "}
                        <a
                          href={`https://instagram.com/${e.instagram}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          @{e.instagram}
                        </a>
                      </>
                    )}
                    {e.website && (
                      <>
                        {" · "}
                        <a
                          href={e.website}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2"
                        >
                          Website
                        </a>
                      </>
                    )}
                  </div>
                  {e.blurb && (
                    <p className="text-sm mt-2 text-foreground">{e.blurb}</p>
                  )}
                  {e.notes && (
                    <p
                      className="text-xs mt-2 italic text-muted-foreground"
                      style={{ borderLeft: "2px solid var(--color-border)", paddingLeft: 8 }}
                    >
                      Note: {e.notes}
                    </p>
                  )}
                  <div className="text-xs text-muted-foreground mt-2 font-mono">
                    {e.contact_name} · <a href={`mailto:${e.email}`} className="underline underline-offset-2">{e.email}</a>
                  </div>
                </div>

                {e.status === "pending" && (
                  <div className="flex flex-col items-end gap-2 min-w-[260px]">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        className="input text-xs font-mono"
                        placeholder="lat (auto)"
                        inputMode="decimal"
                        value={overrides[e.id]?.lat ?? ""}
                        onChange={(ev) =>
                          setOverrides((m) => ({
                            ...m,
                            [e.id]: {
                              lat: ev.target.value,
                              lng: m[e.id]?.lng ?? "",
                            },
                          }))
                        }
                      />
                      <input
                        className="input text-xs font-mono"
                        placeholder="lng (auto)"
                        inputMode="decimal"
                        value={overrides[e.id]?.lng ?? ""}
                        onChange={(ev) =>
                          setOverrides((m) => ({
                            ...m,
                            [e.id]: {
                              lat: m[e.id]?.lat ?? "",
                              lng: ev.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => reject(e)}
                        disabled={busy?.id === e.id}
                      >
                        {busy?.id === e.id && busy.kind === "reject"
                          ? "…"
                          : "Reject"}
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        style={{
                          background: "var(--accent-mint-bg)",
                          color: "var(--accent-mint-ink)",
                        }}
                        onClick={() => approve(e)}
                        disabled={busy?.id === e.id}
                      >
                        {busy?.id === e.id && busy.kind === "approve"
                          ? "Approving…"
                          : "Approve"}
                      </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground text-right max-w-[260px]">
                      Leave lat/lng blank to auto-geocode from city + country.
                    </p>
                  </div>
                )}

                {e.status === "approved" && (
                  <div className="text-right text-xs text-muted-foreground font-mono">
                    {e.lat.toFixed(4)}, {e.lng.toFixed(4)}
                    {e.approved_by && (
                      <div>by {e.approved_by}</div>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Tabs({
  value,
  onChange,
}: {
  value: Status;
  onChange: (s: Status) => void;
}) {
  const opts: { value: Status; label: string }[] = [
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "all", label: "All" },
  ];
  return (
    <div className="flex gap-1 text-sm">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-full transition-colors ${
            value === o.value
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ status }: { status: AdminEntry["status"] }) {
  const map: Record<AdminEntry["status"], { bg: string; ink: string }> = {
    pending: {
      bg: "var(--color-status-warn-bg)",
      ink: "var(--color-status-warn)",
    },
    approved: {
      bg: "var(--color-status-ok-bg)",
      ink: "var(--color-status-ok)",
    },
    rejected: {
      bg: "var(--color-status-alert-bg)",
      ink: "var(--color-status-alert)",
    },
  };
  const { bg, ink } = map[status];
  return (
    <span
      className="mono-label rounded-full px-2 py-0.5"
      style={{ background: bg, color: ink, fontSize: "0.65rem" }}
    >
      {status}
    </span>
  );
}
