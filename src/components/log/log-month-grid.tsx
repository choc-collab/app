"use client";

import Link from "next/link";
import { PenLine } from "lucide-react";
import { MonthGridShell } from "@/components/month-grid-shell";
import { LOG_AREAS, LOG_AREA_LABEL, formatShortDate, type DayDigest } from "@/lib/dailyLog";
import { AreaDot } from "@/components/log/area-style";
import type { LogEntry } from "@/types";

/** Month calendar for the Log. Each day shows one marker per area that had
 *  activity (dot + count) and a pencil with the number of notes written; the
 *  whole cell opens that day's page. */
export function LogMonthGrid({
  year,
  month,
  todayISO,
  digests,
  entriesByDay,
  onPrev,
  onNext,
  onToday,
  onDayClick,
}: {
  year: number;
  month: number;
  todayISO: string;
  digests: ReadonlyMap<string, DayDigest>;
  entriesByDay: ReadonlyMap<string, LogEntry[]>;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDayClick: (iso: string) => void;
}) {
  return (
    <MonthGridShell
      year={year}
      month={month}
      todayISO={todayISO}
      onPrev={onPrev}
      onNext={onNext}
      onToday={onToday}
      onDayClick={(iso) => { if (iso <= todayISO) onDayClick(iso); }}
      renderDay={(iso) => {
        // The Log records what happened — no markers on days that haven't yet.
        if (iso > todayISO) return null;
        const digest = digests.get(iso);
        const notes = entriesByDay.get(iso)?.length ?? 0;
        const areas = digest ? LOG_AREAS.filter((a) => digest.counts[a] > 0) : [];
        if (areas.length === 0 && notes === 0) return null;
        const summary = [
          ...areas.map((a) => `${LOG_AREA_LABEL[a]} ${digest!.counts[a]}`),
          notes ? `${notes} note${notes === 1 ? "" : "s"}` : null,
        ].filter(Boolean).join(", ");
        return (
          <Link
            href={`/log/${iso}`}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Log for ${formatShortDate(iso)}: ${summary}`}
            title={summary}
            className="flex flex-wrap gap-x-1.5 gap-y-0.5 px-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
          >
            {areas.map((a) => (
              <span key={a} className="flex items-center gap-0.5 text-[10px] tabular-nums text-muted-foreground">
                <AreaDot area={a} />
                {digest!.counts[a]}
              </span>
            ))}
            {notes > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] tabular-nums text-foreground font-medium">
                <PenLine aria-hidden className="w-2.5 h-2.5" />
                {notes}
              </span>
            )}
          </Link>
        );
      }}
    />
  );
}
