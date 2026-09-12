import type { ScheduleItemType } from "@/lib/schedule";

/** One ink colour per Schedule item type, reused by the calendar chips, the
 *  filter panel and the day-agenda panel so a type reads the same everywhere.
 *  Reuses the same accent families the Log calendar already applies to
 *  "orders" (sage) and "workshop" (terracotta) — see `components/log/area-style.tsx` —
 *  so the two calendars feel like one system. Applied via inline style so no
 *  Tailwind class needs generating per type. */
export const SCHEDULE_TYPE_INK: Record<ScheduleItemType, string> = {
  order: "var(--accent-sage-ink)",
  phase: "var(--accent-terracotta-ink)",
  task: "var(--accent-blue-ink)",
};

export const SCHEDULE_TYPE_BG: Record<ScheduleItemType, string> = {
  order: "var(--accent-sage-bg)",
  phase: "var(--accent-terracotta-bg)",
  task: "var(--accent-blue-bg)",
};

export const SCHEDULE_TYPE_LABEL: Record<ScheduleItemType, string> = {
  order: "Orders",
  phase: "Production",
  task: "Tasks",
};
