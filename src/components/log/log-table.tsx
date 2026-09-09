"use client";

import { PenLine } from "lucide-react";
import { PantryTableHeader, PantryTableGroupHeader, PantryTableRow, GroupHeader, type PantryTableColumn } from "@/components/pantry";
import { AreaDot } from "@/components/log/area-style";
import {
  LOG_AREAS,
  digestHeadline,
  formatConditions,
  formatShortDate,
  relativeDayLabel,
  type LogDaySummary,
  type LogMonthGroup,
} from "@/lib/dailyLog";

/**
 * Aligned table of log days, grouped by month — the same chrome as the Orders
 * and pantry tables (`PantryTableHeader` / `PantryTableGroupHeader` /
 * `PantryTableRow`), so a day reads like any other row in the app: one click
 * to its page, nothing editable inline. Columns: the day, what happened (area
 * dots + headline), the notes (count + first line) and the workshop conditions.
 */

const LOG_GRID = "128px minmax(220px,1.6fr) minmax(200px,1.2fr) 118px 20px";
const LOG_COLUMNS: PantryTableColumn[] = [
  { key: "day", label: "Day" },
  { key: "activity", label: "What happened" },
  { key: "notes", label: "Notes" },
  { key: "conditions", label: "Conditions" },
];

export function LogTable({
  groups,
  todayISO,
  collapsed,
  onToggleGroup,
  ariaLabel = "Log",
}: {
  groups: LogMonthGroup[];
  todayISO: string;
  collapsed: ReadonlySet<string>;
  onToggleGroup: (key: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="table" aria-label={ariaLabel} className="rounded-lg border border-border bg-card overflow-hidden overflow-x-auto">
      <PantryTableHeader columns={LOG_COLUMNS} gridTemplateColumns={LOG_GRID} />
      {groups.map((group) => {
        const isCollapsed = collapsed.has(group.key);
        return (
          <div key={group.key}>
            <PantryTableGroupHeader>
              <GroupHeader
                label={group.label}
                count={group.days.length}
                isCollapsed={isCollapsed}
                onToggle={() => onToggleGroup(group.key)}
              />
            </PantryTableGroupHeader>
            {!isCollapsed && group.days.map((d) => <DayRow key={d.date} day={d} todayISO={todayISO} />)}
          </div>
        );
      })}
    </div>
  );
}

function DayRow({ day, todayISO }: { day: LogDaySummary; todayISO: string }) {
  const rel = relativeDayLabel(day.date, todayISO);
  const areas = LOG_AREAS.filter((a) => day.digest.counts[a] > 0);
  const headline = digestHeadline(day.digest, 3);
  const conditions = formatConditions(day.day);
  const firstNote = day.entries[0]?.body.split("\n")[0] ?? "";
  const noteCount = day.entries.length;

  return (
    <PantryTableRow href={`/log/${day.date}`} gridTemplateColumns={LOG_GRID}>
      <div className="min-w-0">
        <h3 className="font-medium text-sm whitespace-nowrap">{formatShortDate(day.date)}</h3>
        {rel && (
          <span className="inline-block mt-0.5 rounded-full bg-accent text-accent-foreground px-2 py-0.5 text-[10px] font-medium">{rel}</span>
        )}
      </div>
      <div className="min-w-0 flex items-center gap-2">
        {areas.length > 0 && (
          <span className="flex items-center gap-0.5 shrink-0" aria-hidden>
            {areas.map((a) => <AreaDot key={a} area={a} />)}
          </span>
        )}
        {headline ? (
          <span className="text-xs truncate" title={day.digest.lines.map((l) => l.text).join(" · ")}>{headline}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <div className="min-w-0 flex items-center gap-2">
        {noteCount > 0 ? (
          <>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground tabular-nums shrink-0 whitespace-nowrap">
              <PenLine aria-hidden className="w-3 h-3" />
              {noteCount} {noteCount === 1 ? "note" : "notes"}
            </span>
            <span className="text-xs truncate" title={day.entries[0]?.body}>{firstNote}</span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <span className="text-xs tabular-nums whitespace-nowrap">
        {conditions ?? <span className="text-muted-foreground">—</span>}
      </span>
    </PantryTableRow>
  );
}
