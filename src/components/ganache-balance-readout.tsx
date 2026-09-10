import { Fragment } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { GanacheBalance, BalanceCheck, IncompleteIngredient } from "@/lib/ganacheBalance";
import type { AwEstimate, ShelfLifeWindow } from "@/lib/ganacheAw";

type Status = "ok" | "low" | "high" | "na";

function BalanceBar({
  label,
  value,
  min,
  max,
  status,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  status: Status;
}) {
  if (status === "na") {
    return (
      <div className="flex items-center gap-3">
        <span className="w-28 text-xs text-muted-foreground shrink-0">{label}</span>
        <span className="text-xs text-muted-foreground">N/A (white ganache)</span>
      </div>
    );
  }

  const clampedPct = Math.min(Math.max(value, 0), 50); // display cap at 50%
  const barWidth = `${(clampedPct / 50) * 100}%`;

  const color =
    status === "ok" ? "bg-status-ok" :
    "bg-accent";

  return (
    <div className="flex items-center gap-3">
      <span className="w-28 text-xs text-muted-foreground shrink-0">{label}</span>
      <div className="flex-1 relative h-4 bg-muted rounded-full overflow-hidden">
        {/* target range band — subtle warm tint showing the acceptable zone */}
        <div
          className="absolute top-0 bottom-0 bg-status-ok-bg"
          style={{
            left: `${(min / 50) * 100}%`,
            width: `${((max - min) / 50) * 100}%`,
          }}
        />
        {/* value bar */}
        <div
          className={`absolute top-0 bottom-0 rounded-full transition-all duration-300 ${color}`}
          style={{ width: barWidth, minWidth: value > 0 ? "2px" : "0" }}
        />
      </div>
      <span className={`w-12 text-xs text-right tabular-nums font-medium shrink-0 ${
        status === "ok" ? "text-status-ok" : "text-accent"
      }`}>
        {value.toFixed(1)}%
      </span>
      <span className="w-16 text-xs text-muted-foreground shrink-0 hidden sm:block">
        {min}–{max}%
      </span>
    </div>
  );
}

// --- Water activity bar component ---
//
// Maps Aw values onto a 0.50–1.00 horizontal scale, with coloured background
// segments showing the four shelf-life bands. A tick marks the central
// estimate, and a translucent overlay shows the ±tolerance range.
function awToPct(aw: number): number {
  return Math.max(0, Math.min(100, ((aw - 0.5) / 0.5) * 100));
}

function AwBar({ estimate }: { estimate: AwEstimate }) {
  const centralPct = awToPct(estimate.value);
  const loPct = awToPct(estimate.lo);
  const hiPct = awToPct(estimate.hi);
  const rangePct = Math.max(0.5, hiPct - loPct);
  const tolerance = (estimate.hi - estimate.lo) / 2;

  return (
    <div className="space-y-1">
      {/* Bar row */}
      <div className="flex items-center gap-3">
        <span className="w-28 text-xs text-muted-foreground shrink-0">Water activity</span>
        <div className="flex-1 relative h-4 bg-muted rounded-full overflow-hidden">
          {/* Shelf-life band backgrounds.
              0.50–0.60 very_long · 0.60–0.70 long · 0.70–0.85 medium · 0.85–1.00 short */}
          <div className="absolute top-0 bottom-0 bg-primary/15"     style={{ left:  "0%", width: "20%" }} />
          <div className="absolute top-0 bottom-0 bg-status-ok-bg"   style={{ left: "20%", width: "20%" }} />
          <div className="absolute top-0 bottom-0 bg-stone-200/70"   style={{ left: "40%", width: "30%" }} />
          <div className="absolute top-0 bottom-0 bg-status-warn-bg" style={{ left: "70%", width: "30%" }} />
          {/* ±tolerance overlay */}
          <div
            className="absolute top-0 bottom-0 bg-foreground/15"
            style={{ left: `${loPct}%`, width: `${rangePct}%` }}
          />
          {/* central-value tick */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-foreground"
            style={{ left: `calc(${centralPct}% - 1px)` }}
          />
        </div>
        <span className="w-20 text-xs text-right tabular-nums font-medium shrink-0 text-foreground">
          {estimate.value.toFixed(2)} ± {tolerance.toFixed(2)}
        </span>
      </div>

      {/* Tick-label row — mirrors the bar row's flex slots so ticks align */}
      <div className="flex items-start gap-3">
        <span className="w-28 shrink-0" aria-hidden />
        <div className="flex-1 relative h-3 text-[10px] text-muted-foreground">
          <span className="absolute" style={{ left:  "0%", transform: "translateX(-50%)" }}>0.50</span>
          <span className="absolute" style={{ left: "20%", transform: "translateX(-50%)" }}>0.60</span>
          <span className="absolute" style={{ left: "40%", transform: "translateX(-50%)" }}>0.70</span>
          <span className="absolute" style={{ left: "70%", transform: "translateX(-50%)" }}>0.85</span>
          <span className="absolute" style={{ right: "0%" }}>1.00</span>
        </div>
        <span className="w-20 shrink-0" aria-hidden />
      </div>
    </div>
  );
}

/**
 * Balance + shelf-life readout shared between the Lab calculator (experiment
 * ingredients) and the Fillings detail page (committed filling ingredients) —
 * both feed the same {@link GanacheBalance}/{@link BalanceCheck}/{@link AwEstimate}
 * shapes in, just computed from different source rows.
 */
export function GanacheBalanceReadout({
  balance,
  check,
  awEstimate,
  shelfLife,
  incompleteIngredients,
  emptyMessage = "Add ingredients to see the balance.",
}: {
  balance: GanacheBalance | null;
  check: BalanceCheck | null;
  awEstimate: AwEstimate | null;
  shelfLife: ShelfLifeWindow | null;
  incompleteIngredients: IncompleteIngredient[];
  emptyMessage?: string;
}) {
  return (
    <>
      {/* Balance readout */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-primary mb-3">Balance</h2>
        {incompleteIngredients.length > 0 && (
          <div className="flex items-start gap-2 mb-3 text-xs text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-status-warn" />
            {/* Named and linked rather than counted: this readout can render on
                a screen that shows no ingredient rows of its own (the filling
                Composition tab), so pointing at the rows wouldn't help. */}
            <span>
              No composition data for{" "}
              {incompleteIngredients.map((ing, i) => (
                <Fragment key={ing.ingredientId}>
                  {i > 0 && (i === incompleteIngredients.length - 1 ? " and " : ", ")}
                  <Link
                    href={`/ingredients/${encodeURIComponent(ing.ingredientId)}`}
                    className="font-medium underline underline-offset-2 hover:no-underline"
                  >
                    {ing.name ?? "an archived or deleted ingredient"}
                  </Link>
                </Fragment>
              ))}
              {" "}— the balance below is incomplete. Open{" "}
              {incompleteIngredients.length === 1 ? "it" : "each"} to fill in the composition.
            </span>
          </div>
        )}
        {!balance ? (
          <p className="text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          <div className="space-y-2">
            <BalanceBar
              label="Water"
              value={balance.water}
              min={check!.water.min}
              max={check!.water.max}
              status={check!.water.status}
            />
            <BalanceBar
              label="Total sugars"
              value={balance.sugar}
              min={check!.sugar.min}
              max={check!.sugar.max}
              status={check!.sugar.status}
            />
            <BalanceBar
              label="Cocoa butter"
              value={balance.cacaoFat}
              min={check!.cacaoFat.min}
              max={check!.cacaoFat.max}
              status={check!.cacaoFat.status}
            />
            <BalanceBar
              label="Milk fat"
              value={balance.milkFat}
              min={check!.milkFat.min}
              max={check!.milkFat.max}
              status={check!.milkFat.status}
            />
            <BalanceBar
              label="Other fats"
              value={balance.otherFats}
              min={check!.otherFats.min}
              max={check!.otherFats.max}
              status={check!.otherFats.status}
            />
            <BalanceBar
              label="Cocoa solids"
              value={balance.solids}
              min={check!.solids.min}
              max={check!.solids.max}
              status={check!.solids.status}
            />
            {balance.alcohol > 0 && (
              <div className="flex items-center gap-3 pt-1">
                <span className="w-28 text-xs text-muted-foreground shrink-0">Alcohol</span>
                <span className="text-xs font-medium tabular-nums text-stone-600">{balance.alcohol.toFixed(1)}%</span>
                <span className="text-xs text-muted-foreground">informational — see notes below</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Shaded bands show the target range. Polyols (sorbitol, invert sugar) count toward sugar %.
            </p>
          </div>
        )}
      </section>

      {/* Shelf-life estimate (water activity heuristic) */}
      {balance && awEstimate && shelfLife && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-primary mb-3">Shelf life</h2>
          <AwBar estimate={awEstimate} />
          <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
            <span className="text-muted-foreground">Estimated shelf life:</span>
            <span className={`px-2 py-0.5 rounded-full font-medium ${
              shelfLife.band === "short"     ? "bg-status-warn-bg text-status-warn" :
              shelfLife.band === "medium"    ? "bg-stone-200 text-stone-700" :
              shelfLife.band === "long"      ? "bg-status-ok-bg text-status-ok" :
                                                "bg-primary/10 text-primary"
            }`}>
              {shelfLife.label}
            </span>
            <span className="text-muted-foreground/70 tabular-nums">
              (refrigerated, properly packaged)
            </span>
          </div>
          {awEstimate.confidence === "low" && awEstimate.caveats.length > 0 && (
            <div className="mt-3 flex items-start gap-2 text-xs text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium">Low-confidence estimate</p>
                <ul className="list-disc pl-4 space-y-0.5 text-stone-700">
                  {awEstimate.caveats.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              </div>
            </div>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Heuristic only. Real water activity requires a calibrated Aw meter — always test small batches before scaling, and store cool.
          </p>
        </section>
      )}

      {/* Notes */}
      {check && check.warnings.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-primary mb-2 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-muted-foreground" /> Notes
          </h2>
          <ul className="space-y-2">
            {check.warnings.map((w, i) => (
              <li key={i} className="text-xs text-stone-600 bg-stone-50 border border-stone-200 rounded-md px-3 py-2">
                {w}
              </li>
            ))}
          </ul>
        </section>
      )}

      {check && check.warnings.length === 0 && balance && (
        <div className="mb-6 flex items-center gap-2 text-sm text-status-ok bg-status-ok-bg border border-status-ok-edge rounded-md px-3 py-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          All components within target range.
        </div>
      )}
    </>
  );
}
