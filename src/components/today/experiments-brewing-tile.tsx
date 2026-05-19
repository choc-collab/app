"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Play, AlertTriangle } from "lucide-react";
import { useExperiments } from "@/lib/hooks";
import type { Experiment } from "@/types";

const MAX_ROWS = 3;

/** Compact mini-board for experiments still in flight (not yet promoted to a
 *  filling). Mirrors the In-progress tile: list of names linking to each
 *  experiment's calculator page, with a Play action on the right to jump
 *  straight into "Make product". Long lists truncate with a "N more in the
 *  lab →" link.
 *
 *  `useExperiments()` already filters out superseded versions, so each
 *  lineage shows once — as its current head. We additionally drop anything
 *  the user has already promoted. */
export function ExperimentsBrewingTile() {
  const experiments = useExperiments();

  const brewing = useMemo(
    () => experiments
      .filter((e) => e.status !== "promoted")
      .sort(sortBrewing),
    [experiments],
  );

  const empty = brewing.length === 0;
  const visible = brewing.slice(0, MAX_ROWS);
  const remaining = brewing.length - visible.length;

  return (
    <div className={`h-full flex flex-col gap-2 rounded-lg border border-border bg-card p-4 ${empty ? "opacity-60" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono-label text-muted-foreground">Experiments brewing</span>
        {!empty && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {brewing.length}
          </span>
        )}
      </div>

      {empty ? (
        <Link href="/lab" className="mt-auto self-start text-xs text-muted-foreground hover:text-foreground">
          Nothing brewing — open the Lab →
        </Link>
      ) : (
        <>
          <ul className="flex flex-col">
            {visible.map((exp) => (
              <li key={exp.id} className="flex items-center gap-1 -mx-1 py-1">
                <Link
                  href={`/calculator/${exp.id}`}
                  className="flex-1 min-w-0 px-1 text-sm font-medium truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded flex items-baseline gap-1.5"
                  title={experimentTooltip(exp)}
                >
                  <span className="truncate">{exp.name}</span>
                  {(exp.version ?? 1) > 1 && (
                    <span className="text-[10px] tabular-nums text-muted-foreground font-normal shrink-0">
                      v{exp.version}
                    </span>
                  )}
                  {exp.status === "to_improve" && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[10px] uppercase tracking-wider text-status-warn font-normal shrink-0"
                      title="Marked for improvement — fork a new version"
                    >
                      <AlertTriangle className="w-2.5 h-2.5" aria-hidden />
                      needs work
                    </span>
                  )}
                </Link>
                <Link
                  href={`/calculator/${exp.id}/run`}
                  aria-label={`Make a batch of ${exp.name}`}
                  title="Make product"
                  className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
                >
                  <Play className="w-4 h-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          {remaining > 0 && (
            <Link
              href="/lab"
              className="mt-auto text-xs text-muted-foreground hover:text-foreground self-start"
            >
              {remaining} more in the lab →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/** Sort order: experiments marked "needs work" surface first (they want a
 *  decision), then most-recently-updated. */
function sortBrewing(a: Experiment, b: Experiment): number {
  const sa = a.status === "to_improve" ? 0 : 1;
  const sb = b.status === "to_improve" ? 0 : 1;
  if (sa !== sb) return sa - sb;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

/** Plain-text fallback for the link's title attribute — gives touch / long-
 *  press users the same context the hover state would. */
function experimentTooltip(exp: Experiment): string {
  const parts: string[] = [exp.name];
  if (exp.ganacheType) parts.push(`${cap(exp.ganacheType)} chocolate`);
  if ((exp.version ?? 1) > 1) parts.push(`v${exp.version}`);
  if (exp.status === "to_improve") parts.push("needs work");
  return parts.join(" · ");
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
