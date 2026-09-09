"use client";

/**
 * Log day page — `/log/2026-09-09`
 * ─────────────────────────────────
 * Main column: the day's notes first (autosaving, several per day) — writing is
 * the reason to open the page — then what the app recorded for the day
 * (derived, with links back to each batch / order / recipe). Sidebar: workshop
 * conditions and a per-area activity tally.
 * Previous / next arrows step through days; the URL is the day, so the back
 * button and links from elsewhere just work.
 */

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useSpaId } from "@/lib/use-spa-id";
import { useLogSources, useLogEntriesForDay } from "@/lib/hooks";
import {
  computeDayDigest,
  emptyDigest,
  formatLongDate,
  relativeDayLabel,
  shiftISODate,
  LOG_AREAS,
  LOG_AREA_LABEL,
} from "@/lib/dailyLog";
import { toISODate } from "@/lib/orders";
import { DigestList } from "@/components/log/digest-list";
import { LogNotes } from "@/components/log/log-notes";
import { ConditionsCard } from "@/components/log/conditions-card";
import { AreaDot } from "@/components/log/area-style";
import { SidebarCard } from "@/components/detail-sidebar";
import { DetailSkeleton } from "@/components/detail-states";

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export default function LogDayPage() {
  const raw = useSpaId("log");
  const date = raw && ISO_DAY.test(raw) ? raw : undefined;
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const sources = useLogSources();
  const notes = useLogEntriesForDay(date);
  const digest = useMemo(
    () => (date && sources ? computeDayDigest(date, sources) : emptyDigest(date ?? "")),
    [date, sources],
  );

  if (raw === undefined) return <DetailSkeleton cards={2} sidebar={2} label="Loading log" />;

  if (!date) {
    return (
      <div className="px-4 pt-6 pb-8">
        <Link href="/log" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Log
        </Link>
        <p className="text-sm text-muted-foreground">
          That isn&rsquo;t a day the log understands. Days look like <span className="font-mono">/log/2026-09-09</span>.
        </p>
      </div>
    );
  }

  const rel = relativeDayLabel(date, todayISO);
  const isFuture = date > todayISO;

  return (
    <div className="px-4 pt-6 pb-8">
      <Link href="/log" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Log
      </Link>

      <div className="flex items-start justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-display tracking-tight flex items-center gap-2 flex-wrap">
            {formatLongDate(date)}
            {rel && (
              <span className="rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[11px] font-medium align-middle">{rel}</span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            {isFuture
              ? "This day hasn't happened yet — the Log fills in as it does."
              : notes.length === 0 && digest.lines.length === 0
                ? "A quiet day, as far as the app knows. Write what it missed."
                : `${digest.lines.length} ${digest.lines.length === 1 ? "thing" : "things"} recorded · ${notes.length} ${notes.length === 1 ? "note" : "notes"}`}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Link href={`/log/${shiftISODate(date, -1)}`} aria-label="Previous day" className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          {date !== todayISO && (
            <Link href={`/log/${todayISO}`} className="btn-secondary px-3 py-1 text-xs">Today</Link>
          )}
          {date < todayISO && (
            <Link href={`/log/${shiftISODate(date, 1)}`} aria-label="Next day" className="p-1.5 rounded-full hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="space-y-4">
          <section className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-[13px] font-semibold">Notes</h2>
            </div>
            <div className="p-4">
              <LogNotes date={date} />
            </div>
          </section>
          <section className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-semibold">What happened</h2>
              <span className="text-[11px] text-muted-foreground">from your batches, shop, orders and pantry</span>
            </div>
            <div className="p-4">
              {sources === undefined ? (
                <p className="text-sm text-muted-foreground" aria-busy="true">Reading…</p>
              ) : (
                <DigestList digest={digest} />
              )}
            </div>
          </section>

        </div>

        <div className="space-y-4">
          <ConditionsCard key={date} date={date} />
          <SidebarCard title="Activity" meta={digest.lines.length || undefined} tinted>
            {digest.lines.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing recorded.</p>
            ) : (
              LOG_AREAS.filter((a) => digest.counts[a] > 0).map((a) => (
                <div key={a} className="flex items-center justify-between gap-2 text-xs py-0.5">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><AreaDot area={a} />{LOG_AREA_LABEL[a]}</span>
                  <span className="font-medium tabular-nums">{digest.counts[a]}</span>
                </div>
              ))
            )}
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}
