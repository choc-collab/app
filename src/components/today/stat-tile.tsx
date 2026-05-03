import Link from "next/link";

/** A dashboard tile rendering a label, large number, optional sub-line and
 *  optional secondary detail. When `href` is provided the whole tile is a
 *  link; otherwise it renders as a plain div. All four header tiles share
 *  one card style so the row reads as a cohesive whole — emphasis comes
 *  from the value itself, not from inverting the surface. */
export function StatTile({
  label,
  value,
  sub,
  detail,
  href,
  cta,
  empty,
}: {
  label: string;
  value: string | number;
  sub?: string;
  detail?: string;
  href?: string;
  cta?: string;
  /** When true, render in a "nothing to do" muted style — no CTA, dimmed text. */
  empty?: boolean;
}) {
  const inner = (
    <div className={`h-full flex flex-col gap-1.5 rounded-lg border border-border bg-card p-4 transition-shadow ${href ? "hover:shadow-sm" : ""} ${empty ? "opacity-60" : ""}`}>
      <span className="mono-label text-muted-foreground">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-display font-medium tabular-nums tracking-tight">
          {value}
        </span>
        {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      </div>
      {detail && (
        <span className="text-xs text-muted-foreground line-clamp-1 font-mono">{detail}</span>
      )}
      {cta && !empty && (
        <span className="mt-auto inline-flex self-start rounded-full border border-border px-3 py-1 text-xs text-foreground">
          {cta} →
        </span>
      )}
    </div>
  );

  if (href && !empty) {
    return (
      <Link href={href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded-lg">
        {inner}
      </Link>
    );
  }
  return inner;
}
