// Pure merge logic for the Schedule feature — combines Orders, production
// PlanPhaseDates, and PrepTasks into one date-keyed item list. Kept out of
// the page/component so it's unit-testable the same way
// `productsNeededForUpcomingOrders`/`buildToMakeRows` are.

import type { Order, PlanPhaseDate, ProductionPlan, PrepTask, ProductionPhaseId } from "@/types";
import { PRODUCTION_PHASES, COATING_SPLIT_PHASES } from "@/types";
import { ordersByDate, eventDayOf, toISODate } from "@/lib/orders";

export type ScheduleItemType = "order" | "phase" | "task";

export interface ScheduleItem {
  /** ISO date this item occupies — one entry per day for a multi-day order. */
  date: string;
  type: ScheduleItemType;
  /** Unique across the whole list (includes the date, so a multi-day order
   *  gets a distinct React key per day it appears on). */
  id: string;
  /** The underlying Order/PlanPhaseDate/PrepTask id — what callers pass back
   *  to `togglePrepTaskDone`/`deletePrepTask`/etc. Absent for order items
   *  since nothing here mutates an order directly. */
  sourceId?: string;
  title: string;
  href?: string;
  /** phase/task only — drives strikethrough styling. */
  done?: boolean;
  /** e.g. "day 2 of 2" for a multi-day order. */
  subtitle?: string;
  /** phase items only — which batch, which step of it, and (for shell/cap)
   *  which chocolate type. Drives `collapsePhasesForCalendar`. */
  planId?: string;
  planName?: string;
  phase?: ProductionPhaseId;
  coating?: string;
}

const PHASE_INDEX = new Map(PRODUCTION_PHASES.map((p, i) => [p.id, i] as const));

/** Orders first (they're the reason a day matters), then production work in
 *  the order it actually happens (colour → shell → … → package), then tasks.
 *  Shared by the month grid, the week grid and the day agenda so all three
 *  order a day the same way. */
export function compareScheduleItems(a: ScheduleItem, b: ScheduleItem): number {
  // Finished work sinks to the bottom of the day, whatever it is — what's
  // left to do should be what you read first.
  if (!!a.done !== !!b.done) return a.done ? 1 : -1;
  const order: Record<ScheduleItemType, number> = { order: 0, phase: 1, task: 2 };
  if (a.type !== b.type) return order[a.type] - order[b.type];
  if (a.type === "phase" && a.phase && b.phase && a.phase !== b.phase) {
    return (PHASE_INDEX.get(a.phase) ?? 0) - (PHASE_INDEX.get(b.phase) ?? 0);
  }
  return a.title.localeCompare(b.title);
}

/**
 * Calendar chips are one per *task* per day, pooled across batches: if two
 * batches both need shelling on Tuesday that's a single "Shell · 2 batches"
 * chip, so a day reads as the work to be done rather than a wall of
 * batch names. Shell and cap stay split by chocolate type, since tempering
 * dark and milk are separate sessions.
 *
 * Only the calendar collapses — the day agenda keeps the individual items so
 * each batch's phase stays clickable and separately re-datable.
 */
export function collapsePhasesForCalendar(items: readonly ScheduleItem[]): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  const groups = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    if (item.type !== "phase" || !item.phase) { out.push(item); continue; }
    const key = `${item.date}::${item.phase}::${item.coating ?? ""}`;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  for (const group of groups.values()) {
    const first = group[0];
    const label = first.coating
      ? `${PHASE_LABEL[first.phase!]} · ${first.coating}`
      : PHASE_LABEL[first.phase!];
    out.push({
      ...first,
      id: `phase-${first.date}-${first.phase}-${first.coating ?? ""}`,
      // A collapsed chip covers several batches, so it no longer stands for a
      // single row: drop the source id, and only keep the deep link when it
      // does still point at exactly one batch.
      sourceId: undefined,
      title: `${label} · ${group.length} ${group.length === 1 ? "batch" : "batches"}`,
      subtitle: group.map((i) => i.planName ?? "Batch").join(", "),
      href: group.length === 1 ? first.href : "/production",
      // Only finished when every batch it stands for is finished.
      done: group.every((i) => i.done),
    });
  }
  return out;
}

const PHASE_LABEL = Object.fromEntries(
  PRODUCTION_PHASES.map((p) => [p.id, p.label]),
) as Record<ProductionPhaseId, string>;

/**
 * Shell and cap are scheduled per chocolate type, so a row for one of them
 * without a coating is a leftover from before that split — unreachable from
 * the plan page (which renders a field per current coating) and stale.
 * `ensurePlanPhaseDates` hands its date to the real coating rows and deletes
 * it the next time that plan is opened; until then, nothing should draw it.
 */
export function isSchedulablePhaseRow(row: Pick<PlanPhaseDate, "phase" | "coating">): boolean {
  return !COATING_SPLIT_PHASES.includes(row.phase) || row.coating != null;
}

export function buildScheduleItems(
  orders: readonly Order[],
  phaseDates: readonly PlanPhaseDate[],
  plans: readonly ProductionPlan[],
  tasks: readonly PrepTask[],
): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  const ordersByDay = ordersByDate([...orders]);
  for (const [date, dayOrders] of ordersByDay) {
    for (const o of dayOrders) {
      const dayOf = eventDayOf(o, date);
      items.push({
        date,
        type: "order",
        id: `order-${o.id}-${date}`,
        title: o.title,
        href: `/orders/${encodeURIComponent(o.id ?? "")}`,
        subtitle: dayOf && dayOf.total > 1 ? `day ${dayOf.day} of ${dayOf.total}` : undefined,
      });
    }
  }

  const planNameById = new Map(plans.map((p) => [p.id, p.name]));
  for (const pd of phaseDates) {
    if (!isSchedulablePhaseRow(pd)) continue;
    const planName = planNameById.get(pd.planId) ?? "Batch";
    const phaseLabel = pd.coating ? `${PHASE_LABEL[pd.phase]} · ${pd.coating}` : PHASE_LABEL[pd.phase];
    items.push({
      date: pd.scheduledDate,
      type: "phase",
      id: `phase-${pd.id ?? ""}`,
      sourceId: pd.id,
      title: `${planName} — ${phaseLabel}`,
      href: `/production/${encodeURIComponent(pd.planId)}?tab=${pd.phase}`,
      done: pd.done,
      planId: pd.planId,
      planName,
      phase: pd.phase,
      coating: pd.coating,
    });
  }

  for (const t of tasks) {
    items.push({
      date: t.scheduledDate,
      type: "task",
      id: `task-${t.id ?? ""}`,
      sourceId: t.id,
      title: t.title,
      href: t.orderId
        ? `/orders/${encodeURIComponent(t.orderId)}`
        : t.planId
          ? `/production/${encodeURIComponent(t.planId)}`
          : undefined,
      done: t.done,
    });
  }

  return items;
}

/** Ids of `planPhaseDates` rows that break the (planId, phase) uniqueness the
 *  table assumes — everything except the last row of each group, in the order
 *  given. Dexie hands rows back in primary-key order and the plan detail page
 *  builds `new Map(rows.map(...))`, which keeps the *last* entry per phase, so
 *  the last row is the one the UI has been showing and writing to; keeping it
 *  preserves any date the user actually edited. Used by the v22 migration to
 *  clean up rows the duplicate-seeding bug wrote. */
export function stalePhaseDateIds(
  rows: ReadonlyArray<{ id?: string; planId?: string; phase?: string; coating?: string }>,
): string[] {
  const keepByKey = new Map<string, string>();
  for (const row of rows) {
    if (!row?.id || !row.planId || !row.phase) continue;
    keepByKey.set(`${row.planId}::${row.phase}::${row.coating ?? ""}`, row.id);
  }
  const keep = new Set(keepByKey.values());
  // Only fully-formed rows are deletion candidates — a row missing a field
  // never entered the keep set, and deleting it would be data loss, not
  // deduplication.
  return rows
    .filter((row) => row.id && row.planId && row.phase && !keep.has(row.id))
    .map((row) => row.id!);
}

/** One schedulable slot of a plan's work. Shell and cap carry a coating. */
export interface PhaseSlotRef {
  phase: ProductionPhaseId;
  coating?: string;
}

export type CascadeResult =
  | { ok: true; laterUpdates: Array<{ id: string; scheduledDate: string }> }
  | { ok: false; conflict: PhaseSlotRef & { scheduledDate: string } };

const shiftISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + days));
};

const daysBetween = (fromISO: string, toISO: string): number => {
  const [y1, m1, d1] = fromISO.split("-").map(Number);
  const [y2, m2, d2] = toISO.split("-").map(Number);
  return Math.round(
    (new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime()) / 86_400_000,
  );
};

/**
 * A batch's phases run in sequence — you can't unmould before you've capped —
 * so moving one date drags everything downstream of it along by the same
 * number of days, keeping the gaps the chocolatier set up.
 *
 * Returns the updates to apply to *later* rows; the caller writes the moved
 * row itself. Refuses (`ok: false`) when the requested date falls before a
 * phase that has to happen first, naming the phase that blocks it.
 *
 * Coating variants of one phase (shell-dark, shell-milk) are siblings, not a
 * sequence: they neither constrain nor shift each other.
 */
export function cascadePhaseDateChange(
  rows: readonly PlanPhaseDate[],
  target: PhaseSlotRef,
  newDate: string,
): CascadeResult {
  const targetIndex = PHASE_INDEX.get(target.phase) ?? 0;

  // Blocked when any phase that must come first is already scheduled later.
  // Report the latest such phase — that's the binding constraint.
  let conflict: (PhaseSlotRef & { scheduledDate: string }) | undefined;
  for (const row of rows) {
    if ((PHASE_INDEX.get(row.phase) ?? 0) >= targetIndex) continue;
    if (row.scheduledDate <= newDate) continue;
    if (!conflict || row.scheduledDate > conflict.scheduledDate) {
      conflict = { phase: row.phase, coating: row.coating, scheduledDate: row.scheduledDate };
    }
  }
  if (conflict) return { ok: false, conflict };

  const current = rows.find(
    (r) => r.phase === target.phase && (r.coating ?? "") === (target.coating ?? ""),
  );
  // Nothing to measure a shift against (the slot had no date yet), so the
  // later phases stay where they are.
  if (!current) return { ok: true, laterUpdates: [] };

  const delta = daysBetween(current.scheduledDate, newDate);
  if (delta === 0) return { ok: true, laterUpdates: [] };

  const laterUpdates: Array<{ id: string; scheduledDate: string }> = [];
  for (const row of rows) {
    if (!row.id) continue;
    if ((PHASE_INDEX.get(row.phase) ?? 0) <= targetIndex) continue;
    laterUpdates.push({ id: row.id, scheduledDate: shiftISO(row.scheduledDate, delta) });
  }
  return { ok: true, laterUpdates };
}

/** The 7 ISO dates (Monday–Sunday) of the week containing `anchorISO` —
 *  same Monday-start convention as `monthGridDays` in lib/orders. */
export function weekDays(anchorISO: string): string[] {
  const [y, m, d] = anchorISO.split("-").map(Number);
  const anchor = new Date(y, m - 1, d);
  const backToMonday = (anchor.getDay() + 6) % 7;
  const monday = new Date(y, m - 1, d - backToMonday);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(toISODate(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)));
  }
  return days;
}
