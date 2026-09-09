"use client";

/**
 * Sidebar card vocabulary shared by the pantry detail pages.
 *
 * Three card kinds, and the reader is meant to tell them apart at a glance:
 *   Properties — white, editable key/value rows, each autosaving itself.
 *   Derived    — tinted `bg-muted/50`, so it reads as something the app computed
 *                rather than something you can change.
 *   Stock      — white, but action-bearing rather than field-bearing.
 *
 * Extracted from the shipped Fillings detail page, which established the
 * pattern inline.
 */

/** A sidebar card. `tinted` switches to the Derived treatment. */
export function SidebarCard({
  title,
  tinted = false,
  children,
  className = "",
}: {
  title: string;
  tinted?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border p-3.5 ${tinted ? "bg-muted/50" : "bg-card"} ${className}`}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

/** An editable row: label left, control right, highlighted on hover so it reads
 *  as interactive without carrying a visible input chrome. */
export function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/60 transition-colors">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      {children}
    </div>
  );
}

/** A read-only label/value line, for Derived cards. */
export function DerivedRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** Borderless right-aligned control styling, so a live input sits in a property
 *  row looking like the value it holds. Focus still lands via the global
 *  focus-visible rules in `globals.css`. */
export const PROPERTY_INPUT_CLASS =
  "text-sm font-medium bg-transparent text-right border-0 focus:outline-none max-w-[65%] placeholder:font-normal placeholder:text-muted-foreground/50";

/** Same, sized for a short number sitting next to a unit suffix. */
export const PROPERTY_NUMBER_CLASS =
  "text-sm font-medium bg-transparent text-right border-0 focus:outline-none placeholder:font-normal placeholder:text-muted-foreground/50";
