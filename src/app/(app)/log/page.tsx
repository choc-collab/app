"use client";

/**
 * Log — the daily journal
 * ───────────────────────
 * One table row per day, newest first, grouped by month (or a month calendar
 * — toggle, persisted). Each day pairs two things:
 *   • what the app already knows happened — derived live from batches, sales,
 *     orders, recipes, purchases (`computeDigestIndex`, never stored), and
 *   • what the chocolatier wrote down, plus the workshop conditions.
 * Clicking a day opens `/log/[date]`, where notes are written and edited.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ListCalendarToggle, type ListCalendarView } from "@/components/list-calendar-toggle";
import { ListToolbar, FilterPanel, FilterChipGroup, EmptyState, CollapseControls } from "@/components/pantry";
import { LogMonthGrid } from "@/components/log/log-month-grid";
import { LogTable } from "@/components/log/log-table";
import { useLogEntries, useLogDays, useLogSources } from "@/lib/hooks";
import {
  computeDigestIndex,
  entriesByDate,
  logDaysForList,
  groupLogDaysByMonth,
  type LogPeriod,
} from "@/lib/dailyLog";
import { toISODate, shiftMonth } from "@/lib/orders";
import { useNShortcut } from "@/lib/use-n-shortcut";
import { usePersistedFilters } from "@/lib/use-persisted-filters";

export default function LogPage() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("log", {
    view: "list" as ListCalendarView,
    search: "",
    showFilters: false,
    period: "all" as LogPeriod,
    notesOnly: false,
    collapsedGroups: [] as string[],
  });
  const sources = useLogSources();
  const entries = useLogEntries();
  const days = useLogDays();
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const [cal, setCal] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  // "n" opens today's page — the fastest way to start writing.
  useNShortcut(() => router.push(`/log/${todayISO}`), false);

  const digests = useMemo(() => computeDigestIndex(sources ?? {}), [sources]);
  const byDay = useMemo(() => entriesByDate(entries), [entries]);

  const list = useMemo(
    () => logDaysForList(digests, entries, days, { todayISO, period: f.period, notesOnly: f.notesOnly, search: f.search }),
    [digests, entries, days, todayISO, f.period, f.notesOnly, f.search],
  );
  const groups = useMemo(() => groupLogDaysByMonth(list), [list]);
  const collapsed = useMemo(() => new Set(f.collapsedGroups), [f.collapsedGroups]);
  function toggleGroup(key: string) {
    const next = new Set(collapsed);
    if (next.has(key)) next.delete(key); else next.add(key);
    setF("collapsedGroups", Array.from(next));
  }

  const activeFilterCount = (f.period !== "all" ? 1 : 0) + (f.notesOnly ? 1 : 0);
  const hasAnything = digests.size > 0 || entries.length > 0 || days.length > 0;

  return (
    <div>
      <PageHeader title="Log" description="What you made, sold and learned — day by day" />
      <div className="px-4 space-y-3 pb-6">
        <div className="flex justify-end">
          <ListCalendarToggle
            value={f.view}
            onChange={(v) => setF("view", v)}
            ariaLabel="Log view"
            listTitle="List view — days grouped by month"
            calendarTitle="Calendar view — activity markers on a month grid"
          />
        </div>

        <ListToolbar
          search={f.search}
          onSearchChange={(v) => setF("search", v)}
          searchPlaceholder="Search notes and activity…"
          searchAriaLabel="Search log"
          onAdd={() => router.push(`/log/${todayISO}`)}
          addAriaLabel="Write a note for today"
          addTitle="Write a note for today (n)"
          showFilters
          filterPanelOpen={f.showFilters}
          onToggleFilters={() => setF("showFilters", !f.showFilters)}
          activeFilterCount={activeFilterCount}
        />

        {f.showFilters && (
          <FilterPanel
            activeFilterCount={activeFilterCount}
            onClearAll={() => { setF("period", "all"); setF("notesOnly", false); }}
          >
            <FilterChipGroup
              label="Period"
              options={[
                { value: "30d", label: "Last 30 days" },
                { value: "90d", label: "Last 90 days" },
                { value: "12mo", label: "Last 12 months" },
                { value: "all", label: "All time" },
              ]}
              value={f.period}
              defaultValue="all"
              onChange={(v) => setF("period", v as LogPeriod)}
            />
            <FilterChipGroup
              label="Days"
              options={[
                { value: "all", label: "Every day with activity" },
                { value: "notes", label: "Days with notes" },
              ]}
              value={f.notesOnly ? "notes" : "all"}
              defaultValue="all"
              onChange={(v) => setF("notesOnly", v === "notes")}
            />
          </FilterPanel>
        )}

        {sources === undefined ? (
          <p className="text-sm text-muted-foreground py-8 text-center" aria-busy="true">Reading your log…</p>
        ) : f.view === "calendar" ? (
          <LogMonthGrid
            year={cal.year}
            month={cal.month}
            todayISO={todayISO}
            digests={digests}
            entriesByDay={byDay}
            onPrev={() => setCal((c) => shiftMonth(c.year, c.month, -1))}
            onNext={() => setCal((c) => shiftMonth(c.year, c.month, 1))}
            onToday={() => {
              const now = new Date();
              setCal({ year: now.getFullYear(), month: now.getMonth() });
            }}
            onDayClick={(iso) => router.push(`/log/${iso}`)}
          />
        ) : (
          <>
            {list.length === 0 && (
              <EmptyState
                hasData={hasAnything}
                emptyMessage="Nothing logged yet. Your first batch, sale or note will appear here — tap + to write today's."
                filteredMessage="No days match your search or filters."
              />
            )}
            {groups.length > 0 && (
              <>
                <CollapseControls
                  onCollapseAll={() => setF("collapsedGroups", groups.map((g) => g.key))}
                  onExpandAll={() => setF("collapsedGroups", [])}
                />
                <LogTable
                  groups={groups}
                  todayISO={todayISO}
                  collapsed={collapsed}
                  onToggleGroup={toggleGroup}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
