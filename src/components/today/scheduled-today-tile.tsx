"use client";

import Link from "next/link";
import { useMemo } from "react";
import { usePlanPhaseDatesInRange, usePrepTasksInRange, useProductionPlans, togglePrepTaskDone } from "@/lib/hooks";
import { buildScheduleItems } from "@/lib/schedule";
import { SCHEDULE_TYPE_LABEL } from "@/components/schedule/schedule-style";
import { toISODate } from "@/lib/orders";

const MAX_ROWS = 3;

/** Compact mini-board for today's scheduled production phases and prep
 *  tasks — the Schedule-feature counterpart to `UpcomingOrdersTile` (which
 *  already covers orders, so this deliberately doesn't repeat those). */
export function ScheduledTodayTile() {
  const todayISO = useMemo(() => toISODate(new Date()), []);
  const phaseDates = usePlanPhaseDatesInRange(todayISO, todayISO);
  const tasks = usePrepTasksInRange(todayISO, todayISO);
  const plans = useProductionPlans();

  const items = useMemo(
    () => buildScheduleItems([], phaseDates, plans, tasks),
    [phaseDates, plans, tasks],
  );

  const empty = items.length === 0;
  const visible = items.slice(0, MAX_ROWS);
  const remaining = items.length - visible.length;

  return (
    <div className={`h-full flex flex-col gap-2 rounded-lg border border-border bg-card p-4 ${empty ? "opacity-60" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono-label text-muted-foreground">Scheduled today</span>
        {!empty && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">{items.length}</span>
        )}
      </div>

      {empty ? (
        <Link href="/schedule" className="mt-auto self-start text-xs text-muted-foreground hover:text-foreground">
          Nothing scheduled — plan ahead →
        </Link>
      ) : (
        <>
          <ul className="flex flex-col">
            {visible.map((item) => (
              <li key={item.id} className="-mx-1 py-1 flex items-center gap-1.5 px-1 min-w-0">
                {item.type === "task" && (
                  <input
                    type="checkbox"
                    checked={!!item.done}
                    onChange={() => item.sourceId && togglePrepTaskDone(item.sourceId, !item.done)}
                    className="shrink-0"
                    aria-label={`Mark "${item.title}" done`}
                  />
                )}
                <Link
                  href={item.href ?? "/schedule"}
                  title={`${item.title} · ${SCHEDULE_TYPE_LABEL[item.type]}`}
                  className={`flex-1 min-w-0 text-sm font-medium truncate hover:underline ${item.done ? "line-through text-muted-foreground" : ""}`}
                >
                  {item.title}
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/schedule" className="mt-auto text-xs text-muted-foreground hover:text-foreground self-start">
            {remaining > 0 ? `${remaining} more on the schedule →` : "Full schedule →"}
          </Link>
        </>
      )}
    </div>
  );
}
