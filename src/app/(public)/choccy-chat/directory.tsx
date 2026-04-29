"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Chocolatier } from "./types";
import { normalizeWebsite } from "./utils";
import { WorldMap } from "./world-map";

const FRIENDS_ENDPOINT = "/api/choccy-chat/friends";

type Props = { initialEntries: Chocolatier[] };

export function Directory({ initialEntries }: Props) {
  const [entries, setEntries] = useState<Chocolatier[]>(initialEntries);
  const [query, setQuery] = useState("");

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

  const total = entries.length;
  const countries = new Set(entries.map((e) => e.country)).size;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.city.toLowerCase().includes(q) ||
        e.country.toLowerCase().includes(q),
    );
  }, [entries, query]);

  const filteredCount = filtered.length;
  const isFiltering = query.trim().length > 0;

  return (
    <>
      <div className="mono-label text-muted-foreground mb-4">
        Friends of Choccy Chat · {total} maker{total === 1 ? "" : "s"} ·{" "}
        {countries} countr{countries === 1 ? "y" : "ies"}
      </div>

      <section className="pb-4">
        <label htmlFor="choccy-search" className="sr-only">
          Search by name, city, or country
        </label>
        <div className="relative">
          <input
            id="choccy-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city, or country…"
            className="input pr-10"
            data-testid="choccy-search"
            autoComplete="off"
          />
          {isFiltering && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              data-testid="choccy-search-clear"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-sm px-2 py-1"
            >
              ✕
            </button>
          )}
        </div>
        {isFiltering && (
          <div
            className="mono-label text-muted-foreground mt-2"
            aria-live="polite"
            data-testid="choccy-search-summary"
          >
            {filteredCount === 0
              ? `No matches for "${query.trim()}"`
              : `Showing ${filteredCount} of ${total}`}
          </div>
        )}
      </section>

      <section className="pb-10">
        <div className="rounded-lg border border-border overflow-hidden">
          <WorldMap chocolatiers={filtered} />
        </div>
      </section>

      <section className="pb-12">
        <div className="mono-label text-muted-foreground mb-4">
          {isFiltering ? "Matching the search" : "Everyone on the map"}
        </div>
        {filteredCount === 0 ? (
          isFiltering ? <NoMatchesState onClear={() => setQuery("")} /> : <EmptyState />
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((c) => (
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
                  {(() => {
                    const url = normalizeWebsite(c.website);
                    return url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-foreground underline underline-offset-2 hover:opacity-80"
                      >
                        Website
                      </a>
                    ) : null;
                  })()}
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

function NoMatchesState({ onClear }: { onClear: () => void }) {
  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center">
      <p className="text-muted-foreground">
        No chocolatiers match that search.{" "}
        <button
          type="button"
          onClick={onClear}
          className="text-foreground underline underline-offset-2"
        >
          Clear search
        </button>
        .
      </p>
    </div>
  );
}
