"use client";

/**
 * Schedule page — the one calendar surface for the workshop.
 * ────────────────────────────────────────────────────────────
 * Overlays three kinds of dated items: Orders/events (existing
 * eventDate/endDate), production plan phase dates ("Shell on Tuesday"), and
 * free-form prep tasks (box assembly, label printing, etc.). A filter panel
 * toggles which of the three show, and a Month/Week/Day toggle controls how
 * much of the calendar is visible at once — Month and Week show items on a
 * grid, Day is just the agenda panel at full width. Clicking a day (in
 * Month/Week) selects it in the agenda panel, where its items list (with
 * done-toggles for tasks) and a quick-add form for scheduling a new task.
 *
 * Orders and phase dates aren't created fresh here — orders are captured on
 * /orders, phase dates default to today and get moved on the production plan
 * detail page — only prep tasks are.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { FilterPanel, FilterChipGroup } from "@/components/pantry";
import { CalendarNavHeader } from "@/components/calendar-nav-header";
import { ScheduleMonthGrid } from "@/components/schedule/schedule-month-grid";
import { ScheduleWeekGrid } from "@/components/schedule/schedule-week-grid";
import { SCHEDULE_TYPE_INK, SCHEDULE_TYPE_LABEL } from "@/components/schedule/schedule-style";
import {
  buildScheduleItems, weekDays, collapsePhasesForCalendar, compareScheduleItems,
  type ScheduleItemType,
} from "@/lib/schedule";
import {
  useOrders, useProductionPlans, usePlanPhaseDatesInRange, usePrepTasksInRange,
  savePrepTask, togglePrepTaskDone, deletePrepTask,
} from "@/lib/hooks";
import { monthGridDays, shiftMonth, toISODate, orderEndDate, formatEventDates } from "@/lib/orders";
import { formatLongDate, formatShortDate } from "@/lib/dailyLog";
import { usePersistedFilters } from "@/lib/use-persisted-filters";

const ALL_TYPES: ScheduleItemType[] = ["order", "phase", "task"];
type ScheduleView = "month" | "week" | "day";
const VIEWS: { id: ScheduleView; label: string }[] = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "day", label: "Day" },
];

function shiftISODate(iso: string, deltaDays: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + deltaDays));
}

function firstOfMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export default function SchedulePage() {
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const [f, setF] = usePersistedFilters("schedule", { types: ALL_TYPES, view: "month" as ScheduleView });
  // The period Month/Week view is currently showing — kept separate from
  // `selectedDate` so paging months doesn't fight with whatever day is
  // selected in the agenda panel (see the `switchView` handler below).
  const [anchorISO, setAnchorISO] = useState(todayISO);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskLink, setNewTaskLink] = useState(""); // "" | `order:${id}` | `plan:${id}`
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const [anchorYear, anchorMonthIdx] = useMemo(() => {
    const [y, m] = anchorISO.split("-").map(Number);
    return [y, m - 1];
  }, [anchorISO]);
  const week = useMemo(() => weekDays(anchorISO), [anchorISO]);

  const { rangeStart, rangeEnd } = useMemo(() => {
    if (f.view === "month") {
      const d = monthGridDays(anchorYear, anchorMonthIdx);
      return { rangeStart: d[0], rangeEnd: d[d.length - 1] };
    }
    if (f.view === "week") return { rangeStart: week[0], rangeEnd: week[6] };
    return { rangeStart: selectedDate, rangeEnd: selectedDate };
  }, [f.view, anchorYear, anchorMonthIdx, week, selectedDate]);

  const orders = useOrders();
  const plans = useProductionPlans();
  const phaseDates = usePlanPhaseDatesInRange(rangeStart, rangeEnd);
  const tasks = usePrepTasksInRange(rangeStart, rangeEnd);

  const items = useMemo(
    () => buildScheduleItems(orders, phaseDates, plans, tasks),
    [orders, phaseDates, plans, tasks],
  );
  const selectedTypes = useMemo(() => new Set(f.types), [f.types]);
  const visibleItems = useMemo(
    () => items.filter((i) => selectedTypes.has(i.type)),
    [items, selectedTypes],
  );

  const visibleOrderCount = useMemo(
    () => orders.filter((o) => o.eventDate <= rangeEnd && orderEndDate(o) >= rangeStart).length,
    [orders, rangeStart, rangeEnd],
  );
  const typeCounts: Record<ScheduleItemType, number> = {
    order: visibleOrderCount,
    phase: phaseDates.length,
    task: tasks.length,
  };

  function toggleType(v: string) {
    const t = v as ScheduleItemType;
    const next = new Set(f.types);
    if (next.has(t)) next.delete(t); else next.add(t);
    setF("types", Array.from(next) as ScheduleItemType[]);
  }

  /** Switching into Month/Week brings the displayed period to wherever the
   *  agenda panel currently is, so Day → Week/Month doesn't jump away from
   *  the day you were just looking at. */
  function switchView(view: ScheduleView) {
    if (view !== "day" && f.view === "day") setAnchorISO(selectedDate);
    setF("view", view);
  }

  function goPrev() {
    if (f.view === "month") { const s = shiftMonth(anchorYear, anchorMonthIdx, -1); setAnchorISO(firstOfMonth(s.year, s.month)); }
    else if (f.view === "week") setAnchorISO(shiftISODate(anchorISO, -7));
    else setSelectedDate((d) => shiftISODate(d, -1));
  }
  function goNext() {
    if (f.view === "month") { const s = shiftMonth(anchorYear, anchorMonthIdx, 1); setAnchorISO(firstOfMonth(s.year, s.month)); }
    else if (f.view === "week") setAnchorISO(shiftISODate(anchorISO, 7));
    else setSelectedDate((d) => shiftISODate(d, 1));
  }
  function goToday() {
    if (f.view === "day") setSelectedDate(todayISO);
    else setAnchorISO(todayISO);
  }

  // The calendar shows one chip per task per day, pooled across batches; the
  // agenda keeps every batch's phase as its own row so each stays clickable.
  const calendarItems = useMemo(() => collapsePhasesForCalendar(visibleItems), [visibleItems]);

  const selectedItems = useMemo(
    () => visibleItems.filter((i) => i.date === selectedDate).sort(compareScheduleItems),
    [visibleItems, selectedDate],
  );

  // Locale-free formatters (see lib/dailyLog) — `toLocaleDateString` resolves
  // differently in Node and the browser, which trips a hydration mismatch on
  // a prerendered page.
  const selectedDateLabel = formatLongDate(selectedDate);
  const selectedDateShort = formatShortDate(selectedDate);

  const weekLabel = useMemo(
    () => formatEventDates({ eventDate: week[0], endDate: week[6] }),
    [week],
  );

  async function handleAddTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const [kind, id] = newTaskLink.split(":");
    await savePrepTask({
      title: newTaskTitle.trim(),
      scheduledDate: selectedDate,
      orderId: kind === "order" ? id : undefined,
      planId: kind === "plan" ? id : undefined,
    });
    setNewTaskTitle("");
    setNewTaskLink("");
  }

  const agendaPanel = (
    <div className="rounded-lg border border-border bg-card p-3 space-y-3 md:sticky md:top-4">
      {f.view === "day" ? (
        <CalendarNavHeader label={selectedDateLabel} onPrev={goPrev} onNext={goNext} onToday={goToday} prevLabel="Previous day" nextLabel="Next day" />
      ) : (
        <div>
          <h2 className="font-display text-base">{selectedDateLabel}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selectedItems.length} item{selectedItems.length === 1 ? "" : "s"} scheduled
          </p>
        </div>
      )}

      {selectedItems.length > 0 && (
        <ul className="space-y-2">
          {selectedItems.map((item) => (
            <li key={item.id} className="flex items-start gap-2 rounded-md border border-border p-2">
              {item.type === "task" ? (
                <input
                  type="checkbox"
                  checked={!!item.done}
                  onChange={() => item.sourceId && togglePrepTaskDone(item.sourceId, !item.done)}
                  className="mt-0.5 shrink-0"
                  aria-label={`Mark "${item.title}" done`}
                />
              ) : (
                <span
                  className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.done ? "bg-muted-foreground/40" : ""}`}
                  style={item.done ? undefined : { backgroundColor: SCHEDULE_TYPE_INK[item.type] }}
                  aria-hidden
                />
              )}
              <div className="min-w-0 flex-1">
                {item.href ? (
                  <Link href={item.href} className={`text-sm font-medium hover:underline ${item.done ? "line-through text-muted-foreground" : ""}`}>
                    {item.title}
                  </Link>
                ) : (
                  <span className={`text-sm font-medium ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.title}</span>
                )}
                <p className="mono-label text-muted-foreground mt-0.5">
                  {SCHEDULE_TYPE_LABEL[item.type]}{item.subtitle ? ` · ${item.subtitle}` : ""}
                </p>
              </div>
              {item.type === "task" && (
                pendingRemoveId === item.id ? (
                  <div className="flex items-center gap-1 shrink-0 text-xs">
                    <span className="text-muted-foreground">Remove?</span>
                    <button
                      type="button"
                      onClick={() => { if (item.sourceId) deletePrepTask(item.sourceId); setPendingRemoveId(null); }}
                      className="text-status-alert font-medium"
                    >
                      Yes
                    </button>
                    <button type="button" onClick={() => setPendingRemoveId(null)} className="text-muted-foreground">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPendingRemoveId(item.id)}
                    className="shrink-0 p-1 text-muted-foreground hover:text-status-alert transition-colors"
                    aria-label={`Remove "${item.title}"`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAddTask} className="border-t border-border pt-3 space-y-2">
        <div className="flex gap-1.5">
          <input
            className="input flex-1 text-sm"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder={`Add a task for ${selectedDateShort}…`}
            aria-label="New task title"
          />
          {(orders.length > 0 || plans.length > 0) && (
            <select
              className="input !w-32 text-sm"
              value={newTaskLink}
              onChange={(e) => setNewTaskLink(e.target.value)}
              aria-label="Link task to"
            >
              <option value="">Link to…</option>
              {orders.filter((o) => o.id).map((o) => (
                <option key={o.id} value={`order:${o.id}`}>{o.title}</option>
              ))}
              {plans.filter((p) => p.id).map((p) => (
                <option key={p.id} value={`plan:${p.id}`}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        <button type="submit" className="btn-secondary w-full justify-center" disabled={!newTaskTitle.trim()}>
          Add task
        </button>
      </form>
    </div>
  );

  return (
    <div>
      <PageHeader title="Schedule" description="Orders, production work, and prep tasks on one calendar" />

      <div className="px-4 space-y-3 pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <FilterPanel
            activeFilterCount={ALL_TYPES.length - f.types.length}
            onClearAll={() => setF("types", ALL_TYPES)}
          >
            <FilterChipGroup
              label="Show"
              multi
              selected={selectedTypes}
              onToggle={toggleType}
              options={ALL_TYPES.map((t) => ({ value: t, label: `${SCHEDULE_TYPE_LABEL[t]} (${typeCounts[t]})` }))}
            />
          </FilterPanel>

          <div className="inline-flex rounded-full border border-border bg-card p-0.5" role="group" aria-label="Schedule view">
            {VIEWS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => switchView(id)}
                aria-pressed={f.view === id}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  f.view === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {f.view === "day" ? (
          agendaPanel
        ) : (
          <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] items-start">
            <div className="rounded-lg border border-border bg-card p-3">
              {f.view === "month" ? (
                <ScheduleMonthGrid
                  year={anchorYear}
                  month={anchorMonthIdx}
                  items={calendarItems}
                  todayISO={todayISO}
                  onPrev={goPrev}
                  onNext={goNext}
                  onToday={goToday}
                  onDayClick={setSelectedDate}
                />
              ) : (
                <ScheduleWeekGrid
                  days={week}
                  label={weekLabel}
                  items={calendarItems}
                  todayISO={todayISO}
                  selectedDate={selectedDate}
                  onPrev={goPrev}
                  onNext={goNext}
                  onToday={goToday}
                  onDayClick={setSelectedDate}
                />
              )}
            </div>
            {agendaPanel}
          </div>
        )}
      </div>
    </div>
  );
}
