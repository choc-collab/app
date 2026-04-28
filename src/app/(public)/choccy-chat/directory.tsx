"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Chocolatier } from "./types";
import { WorldMap } from "./world-map";

const FRIENDS_ENDPOINT = "/api/choccy-chat/friends";

type Props = { initialEntries: Chocolatier[] };

export function Directory({ initialEntries }: Props) {
  const [entries, setEntries] = useState<Chocolatier[]>(initialEntries);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(FRIENDS_ENDPOINT, { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { entries?: Chocolatier[] };
        if (!cancelled && Array.isArray(body.entries)) {
          // Re-sort to match the build-time order (country, then city).
          const sorted = body.entries.slice().sort(
            (a, b) =>
              a.country.localeCompare(b.country) || a.city.localeCompare(b.city),
          );
          setEntries(sorted);
        }
      } catch {
        // Network error — keep showing the static fallback.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const count = entries.length;
  const countries = new Set(entries.map((e) => e.country)).size;

  return (
    <>
      <div className="mono-label text-muted-foreground mb-4">
        Friends of Choccy Chat · {count} maker{count === 1 ? "" : "s"} ·{" "}
        {countries} countr{countries === 1 ? "y" : "ies"}
      </div>

      <section className="pb-10">
        <div className="rounded-lg border border-border overflow-hidden">
          <WorldMap chocolatiers={entries} />
        </div>
      </section>

      <section className="pb-12">
        <div className="mono-label text-muted-foreground mb-4">Everyone on the map</div>
        {count === 0 ? (
          <EmptyState />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {entries.map((c) => (
              <li
                key={c.id}
                className="bg-card border border-border rounded-lg p-4"
              >
                <div
                  className="mono-label mb-1"
                  style={{ color: "var(--accent-cocoa-ink)" }}
                >
                  {c.city}, {c.country}
                </div>
                <div
                  className="text-base font-[500] tracking-tight mb-1"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {c.name}
                </div>
                {c.blurb && (
                  <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                    {c.blurb}
                  </p>
                )}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {c.instagram && (
                    <a
                      href={`https://instagram.com/${c.instagram}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-2 hover:opacity-80"
                    >
                      @{c.instagram}
                    </a>
                  )}
                  {c.website && (
                    <a
                      href={c.website}
                      target="_blank"
                      rel="noreferrer"
                      className="text-foreground underline underline-offset-2 hover:opacity-80"
                    >
                      Website
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function EmptyState() {
  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center">
      <p className="text-muted-foreground">
        No one on the map yet — be the first.{" "}
        <Link href="/choccy-chat/join" className="text-foreground underline underline-offset-2">
          Add yourself
        </Link>
        .
      </p>
    </div>
  );
}
