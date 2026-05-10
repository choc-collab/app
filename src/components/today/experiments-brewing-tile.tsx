import { Beaker } from "lucide-react";

/** Placeholder tile reserving space for the Lab feature. Once the Lab
 *  ships (ganache formulation sandbox, ingredient balance checker, promote
 *  experiments to fillings) this becomes a live count of in-progress
 *  experiments — same shape as the In progress tile. Until then it sits
 *  in the row dashed + dimmed so the layout doesn't reflow when Lab
 *  lands. */
export function ExperimentsBrewingTile() {
  return (
    <div className="h-full flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card p-4 opacity-60">
      <div className="flex items-center gap-2">
        <Beaker className="w-3.5 h-3.5 text-muted-foreground" aria-hidden />
        <span className="mono-label text-muted-foreground">Experiments brewing</span>
      </div>
      <span className="mt-auto self-start text-[10px] uppercase tracking-wider text-muted-foreground">
        Coming soon
      </span>
    </div>
  );
}
