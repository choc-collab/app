/**
 * Stock pill row for pantry list items — same visual treatment as the /today
 * dashboard's To-Make list and the Stock page filling group headers.
 *
 *  - <ProductStockPills>: "{n} in stock" (neutral / warn / alert depending on
 *     threshold) + optional sky-blue "❄ {n}" frozen pill.
 *  - <FillingStockPills>: same shape but in grams. Fillings have no low-stock
 *     threshold, so the primary pill is binary (alert when zero, neutral
 *     otherwise).
 */

import { Snowflake } from "lucide-react";

function FrozenPill({ label, title }: { label: string; title: string }) {
  return (
    <span
      className="shrink-0 rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-1.5 py-0 text-[10px] font-semibold inline-flex items-center gap-0.5"
      title={title}
    >
      <Snowflake className="w-2.5 h-2.5" aria-hidden />
      {label}
    </span>
  );
}

export function ProductStockPills({
  pieces,
  frozen = 0,
  threshold,
}: {
  pieces: number;
  frozen?: number;
  threshold?: number;
}) {
  const status: "out" | "low" | "ok" =
    pieces <= 0 ? "out" : threshold != null && pieces < threshold ? "low" : "ok";

  const stockCls =
    status === "out"
      ? "border-status-alert-edge bg-status-alert-bg text-status-alert"
      : status === "low"
      ? "border-status-warn-edge bg-status-warn-bg text-status-warn"
      : "border-status-ok-edge bg-status-ok-bg text-status-ok";

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      <span
        className={`shrink-0 rounded-full border px-1.5 py-0 text-[10px] font-semibold tabular-nums inline-flex items-center gap-0.5 ${stockCls}`}
        title={`${pieces} in stock`}
      >
        {pieces} in stock
      </span>
      {frozen > 0 && (
        <FrozenPill
          label={String(frozen)}
          title={`${frozen} frozen — not counted toward in-stock`}
        />
      )}
    </span>
  );
}

export function FillingStockPills({
  availableG,
  frozenG = 0,
}: {
  availableG: number;
  frozenG?: number;
}) {
  // Fillings have no low-stock threshold, so we don't surface an "out" alert
  // pill — when there's no available stock we simply omit the in-stock chip.
  // Frozen stock still gets its snowflake adornment so the user can see that
  // pieces exist in the freezer even when the filling is otherwise depleted.
  if (availableG <= 0 && frozenG <= 0) return null;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {availableG > 0 && (
        <span
          className="shrink-0 rounded-full border border-status-ok-edge bg-status-ok-bg text-status-ok px-1.5 py-0 text-[10px] font-semibold tabular-nums inline-flex items-center gap-0.5"
          title={`${Math.round(availableG)}g in stock`}
        >
          {Math.round(availableG)}g in stock
        </span>
      )}
      {frozenG > 0 && (
        <FrozenPill
          label={`${Math.round(frozenG)}g`}
          title={`${Math.round(frozenG)}g frozen — not counted toward in-stock`}
        />
      )}
    </span>
  );
}
