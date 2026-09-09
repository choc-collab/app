"use client";

import Link from "next/link";
import { LOG_AREAS, LOG_AREA_LABEL, type DayDigest, type DigestLine } from "@/lib/dailyLog";
import { AreaDot } from "@/components/log/area-style";

/** The automatic half of a day's log: every line the app derived for the day,
 *  grouped under its area (Workshop, Shop, Orders, Lab, Pantry). Lines that
 *  came from a specific record link back to it. */
export function DigestList({ digest, emptyMessage = "The app has nothing recorded for this day." }: {
  digest: DayDigest;
  emptyMessage?: string;
}) {
  if (digest.lines.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="space-y-3" data-testid="digest-list">
      {LOG_AREAS.map((area) => {
        const lines = digest.lines.filter((l) => l.area === area);
        if (lines.length === 0) return null;
        return (
          <section key={area} aria-label={LOG_AREA_LABEL[area]}>
            <h3 className="mono-label text-muted-foreground flex items-center gap-1.5 mb-1">
              <AreaDot area={area} />
              {LOG_AREA_LABEL[area]}
            </h3>
            <ul className="space-y-0.5">
              {lines.map((l) => (
                <li key={l.key}>
                  <DigestRow line={l} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function DigestRow({ line }: { line: DigestLine }) {
  const body = (
    <>
      <span className="text-sm font-medium">{line.text}</span>
      {line.detail && <span className="text-xs text-muted-foreground ml-2">{line.detail}</span>}
    </>
  );
  if (line.href) {
    return (
      <Link
        href={line.href}
        className="block -mx-1 px-1 py-0.5 rounded hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
      >
        {body}
      </Link>
    );
  }
  return <div className="py-0.5">{body}</div>;
}

/** Compact variant for list cards and the Today tile: the first `max` lines
 *  each prefixed with its area dot, no grouping. */
export function DigestPreview({ digest, max = 4 }: { digest: DayDigest; max?: number }) {
  const visible = digest.lines.slice(0, max);
  const rest = digest.lines.length - visible.length;
  if (visible.length === 0) return null;
  return (
    <ul className="space-y-0.5">
      {visible.map((l) => (
        <li key={l.key} className="flex items-baseline gap-1.5 text-xs min-w-0">
          <AreaDot area={l.area} className="translate-y-[-1px]" />
          <span className="truncate">
            <span className="text-foreground">{l.text}</span>
            {l.detail && <span className="text-muted-foreground"> · {l.detail}</span>}
          </span>
        </li>
      ))}
      {rest > 0 && <li className="text-xs text-muted-foreground pl-3">+{rest} more</li>}
    </ul>
  );
}
