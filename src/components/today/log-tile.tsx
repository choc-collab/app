"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useLogEntriesForDay, useLogSources } from "@/lib/hooks";
import { computeDayDigest, emptyDigest } from "@/lib/dailyLog";
import { toISODate } from "@/lib/orders";
import { DigestPreview } from "@/components/log/digest-list";
import { AddNoteBox } from "@/components/log/log-notes";

/**
 * Today's log, on the dashboard: what the app has recorded so far today on
 * the left, a quick note box on the right. Writing a note never requires
 * leaving the page — low friction is what makes a journal stick.
 */
export function LogTile() {
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const sources = useLogSources();
  const notes = useLogEntriesForDay(todayISO);
  const digest = useMemo(
    () => (sources ? computeDayDigest(todayISO, sources) : emptyDigest(todayISO)),
    [sources, todayISO],
  );
  const noteLabel = notes.length === 0 ? null : `${notes.length} ${notes.length === 1 ? "note" : "notes"}`;

  return (
    <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3" data-testid="log-tile">
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono-label text-muted-foreground">Today&rsquo;s log</span>
        {noteLabel && <span className="text-xs font-mono text-muted-foreground tabular-nums">{noteLabel}</span>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="min-w-0">
          {digest.lines.length > 0 ? (
            <DigestPreview digest={digest} max={4} />
          ) : (
            <p className="text-xs text-muted-foreground">
              Nothing recorded yet today. Batches, sales and orders show up here as you work.
            </p>
          )}
          <Link
            href={`/log/${todayISO}`}
            className="inline-block mt-3 text-xs text-muted-foreground hover:text-foreground"
          >
            Open today&rsquo;s log →
          </Link>
        </div>
        <AddNoteBox date={todayISO} compact placeholder="Jot something down about today…" />
      </div>
    </div>
  );
}
