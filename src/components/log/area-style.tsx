import type { LogArea } from "@/lib/dailyLog";

/** One ink colour per Log area, reused by the calendar markers, the list cards
 *  and the day page so an area reads the same everywhere. These are the
 *  section accents' *ink* tokens (the pastel backgrounds are too faint for an
 *  8 px dot on a white card). Applied via inline style so no Tailwind class
 *  needs generating per area. */
export const AREA_INK: Record<LogArea, string> = {
  workshop: "var(--accent-terracotta-ink)",
  shop: "var(--accent-cocoa-ink)",
  orders: "var(--accent-sage-ink)",
  lab: "var(--accent-lilac-ink)",
  pantry: "var(--accent-blue-ink)",
  schedule: "var(--accent-peach-ink)",
};

export function AreaDot({ area, className = "" }: { area: LogArea; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${className}`}
      style={{ backgroundColor: AREA_INK[area] }}
    />
  );
}
