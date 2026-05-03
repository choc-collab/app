import Link from "next/link";

/** A dashboard tile rendering a label, large number, optional sub-line and
 *  optional secondary detail. When `href` is provided the whole tile is a
 *  link; otherwise it renders as a plain div. The dark variant inverts the
 *  surface to signal "this is the primary thing to act on" — used for the
 *  Shopping tile per the wireframe. */
export function StatTile({
  label,
  value,
  sub,
  detail,
  href,
  cta,
  dark,
  empty,
}: {
  label: string;
  value: string | number;
  sub?: string;
  detail?: string;
  href?: string;
  cta?: string;
  dark?: boolean;
  /** When true, render in a "nothing to do" muted style — no CTA, dimmed text. */
  empty?: boolean;
}) {
  const surface = dark
    ? "bg-foreground text-background border-foreground"
    : "bg-card text-foreground border-border";
  const labelCls = dark ? "text-background/60" : "text-muted-foreground";
  const subCls = dark ? "text-background/70" : "text-muted-foreground";
  const detailCls = dark ? "text-background/60" : "text-muted-foreground";
  const ctaCls = dark
    ? "bg-background text-foreground"
    : "border border-border text-foreground";

  const inner = (
    <div className={`flex flex-col gap-1.5 rounded-lg border ${surface} p-4 transition-shadow ${href ? "hover:shadow-sm" : ""} ${empty ? "opacity-60" : ""}`}>
      <span className={`mono-label ${labelCls}`}>{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-display font-medium tabular-nums tracking-tight">
          {value}
        </span>
        {sub && <span className={`text-xs ${subCls}`}>{sub}</span>}
      </div>
      {detail && (
        <span className={`text-xs ${detailCls} line-clamp-1 font-mono`}>{detail}</span>
      )}
      {cta && !empty && (
        <span className={`mt-auto inline-flex self-start rounded-full px-3 py-1 text-xs ${ctaCls}`}>
          {cta} →
        </span>
      )}
    </div>
  );

  if (href && !empty) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded-lg">
        {inner}
      </Link>
    );
  }
  return inner;
}
