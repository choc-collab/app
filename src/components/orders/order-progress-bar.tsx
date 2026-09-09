"use client";

import { formatPieces, progressSegments, type OrderProgress } from "@/lib/orders";

/**
 * Two-segment progress bar for an order's production: pieces already made
 * (allocated from done batches) fill solid; pieces spoken for by batches still
 * in progress fill in the in-production amber behind them. The same colours the
 * status badges use, so "green = exists, amber = underway" reads consistently.
 *
 * Used at two sizes: `compact` inside a table row (thin track, "made / needed"
 * beside it) and full inside the detail sidebar (taller track, label above).
 */
export function OrderProgressBar({
  progress,
  compact = false,
}: {
  progress: OrderProgress;
  compact?: boolean;
}) {
  const { made, planned, needed } = progress;
  const { madePct, plannedPct } = progressSegments(progress);
  const remaining = Math.max(0, needed - made);
  const complete = needed > 0 && made >= needed;

  const summary = [
    `${formatPieces(made)} made`,
    planned > 0 ? `${formatPieces(planned)} in production` : null,
    `${formatPieces(remaining)} to go`,
  ].filter(Boolean).join(" · ");

  const track = (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={needed}
      aria-valuenow={Math.min(made, needed)}
      aria-valuetext={summary}
      title={summary}
      className={`flex w-full overflow-hidden rounded-full bg-muted ${compact ? "h-1.5" : "h-2.5"}`}
    >
      <div className="h-full bg-success transition-[width]" style={{ width: `${madePct}%` }} />
      <div className="h-full bg-warning/70 transition-[width]" style={{ width: `${plannedPct}%` }} />
    </div>
  );

  if (compact) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-[48px]">{track}</div>
        <span className={`text-xs tabular-nums shrink-0 ${complete ? "text-success font-medium" : "text-muted-foreground"}`}>
          {formatPieces(made)}<span className="text-muted-foreground/70"> / {formatPieces(needed)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={complete ? "text-success font-medium" : "font-medium"}>
          {formatPieces(made)} <span className="text-muted-foreground font-normal">of {formatPieces(needed)} made</span>
        </span>
        {planned > 0 && (
          <span className="text-warning tabular-nums">+{formatPieces(planned)} in production</span>
        )}
      </div>
      {track}
    </div>
  );
}
