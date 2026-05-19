/**
 * Side-by-side comparison of two versions of a ganache experiment.
 *
 * Mirrors the existing calculator visual register: white cards, hairline
 * borders, mono-label signposts, pill geometry. Diff coloring uses the
 * existing status palette — sage `status-ok` for additions, muted red
 * `destructive` for reductions, `muted-foreground` for unchanged.
 *
 * Receives the experiment chain (sorted oldest → newest) and looks up
 * ingredients + balance per version internally so it stays decoupled
 * from the editor page.
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { ArrowLeftRight } from "lucide-react";
import { useExperimentIngredients } from "@/lib/hooks";
import { calculateGanacheBalance } from "@/lib/ganacheBalance";
import { estimateAw, shelfLifeFromEstimate, type AwEstimate, type ShelfLifeBand } from "@/lib/ganacheAw";
import {
  diffExperimentIngredients,
  summariseIngredientDiff,
  compositionShift,
  type IngredientDiffRow,
  type ComponentKey,
} from "@/lib/ganacheDiff";
import type { Experiment, Ingredient } from "@/types";

interface Props {
  chain: Experiment[];
  ingredientMap: Map<string, Ingredient>;
}

export function VersionComparison({ chain, ingredientMap }: Props) {
  // Default: oldest (v1) on the left, newest on the right.
  const oldest = chain[0]?.id;
  const newest = chain[chain.length - 1]?.id;
  const [aId, setAId] = useState<string | undefined>(oldest);
  const [bId, setBId] = useState<string | undefined>(newest);

  // Keep selection valid if the chain shifts (e.g. a new version is forked).
  useEffect(() => {
    if (!chain.find((e) => e.id === aId)) setAId(oldest);
    if (!chain.find((e) => e.id === bId)) setBId(newest);
  }, [chain, aId, bId, oldest, newest]);

  const versionA = chain.find((e) => e.id === aId);
  const versionB = chain.find((e) => e.id === bId);

  const ingredientsA = useExperimentIngredients(aId);
  const ingredientsB = useExperimentIngredients(bId);

  const balanceA = useMemo(
    () => calculateGanacheBalance(ingredientsA, ingredientMap),
    [ingredientsA, ingredientMap]
  );
  const balanceB = useMemo(
    () => calculateGanacheBalance(ingredientsB, ingredientMap),
    [ingredientsB, ingredientMap]
  );
  const awA = useMemo(() => (balanceA ? estimateAw(balanceA) : null), [balanceA]);
  const awB = useMemo(() => (balanceB ? estimateAw(balanceB) : null), [balanceB]);

  const diffRows = useMemo(
    () => diffExperimentIngredients(ingredientsA, ingredientsB, ingredientMap),
    [ingredientsA, ingredientsB, ingredientMap]
  );
  const shift = useMemo(() => compositionShift(balanceA, balanceB), [balanceA, balanceB]);
  const summary = useMemo(() => summariseIngredientDiff(diffRows), [diffRows]);

  function swap() {
    setAId(bId);
    setBId(aId);
  }

  return (
    <div className="space-y-6">
      <VersionStrip
        chain={chain}
        aId={aId}
        bId={bId}
        onPickA={setAId}
        onPickB={setBId}
        onSwap={swap}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <VersionPanel
          side="A"
          experiment={versionA}
          ingredients={ingredientsA}
          balance={balanceA}
          aw={awA}
          ingredientMap={ingredientMap}
          diffRows={diffRows}
        />
        <VersionPanel
          side="B"
          experiment={versionB}
          ingredients={ingredientsB}
          balance={balanceB}
          aw={awB}
          ingredientMap={ingredientMap}
          diffRows={diffRows}
        />
      </div>

      {shift && versionA && versionB && (
        <section>
          <h2 className="text-sm font-semibold text-primary mb-2">
            Composition shift
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              v{versionA.version ?? 1} → v{versionB.version ?? 1}
            </span>
          </h2>
          <CompositionShiftCard shift={shift} />
        </section>
      )}

      {versionA && versionB && versionA.id !== versionB.id && (
        <DiffHeadline
          summary={summary}
          aVersion={versionA.version ?? 1}
          bVersion={versionB.version ?? 1}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Version strip — click a chip to set it as A (left) or B (right).
// ─────────────────────────────────────────────────────────────────────────

function VersionStrip({
  chain, aId, bId, onPickA, onPickB, onSwap,
}: {
  chain: Experiment[];
  aId?: string;
  bId?: string;
  onPickA: (id: string) => void;
  onPickB: (id: string) => void;
  onSwap: () => void;
}) {
  function handlePick(id: string) {
    // Cycle: if it's already A → make it B (move B aside); if B → unset; otherwise A.
    if (id === aId)      onPickB(id);
    else if (id === bId) onPickA(id);
    else                 onPickA(id);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chain.map((exp) => {
        const id = exp.id!;
        const isA = id === aId;
        const isB = id === bId;
        const state = isA ? "A" : isB ? "B" : "off";
        return (
          <button
            key={id}
            type="button"
            onClick={() => handlePick(id)}
            className={`inline-flex flex-col items-start gap-0.5 px-3.5 py-1.5 rounded-full border text-xs leading-tight transition-colors min-w-[88px] ${
              state === "A"
                ? "bg-foreground text-background border-foreground"
                : state === "B"
                ? "bg-status-ok-bg text-status-ok border-status-ok-edge"
                : "bg-card text-foreground border-border hover:border-foreground"
            }`}
            aria-pressed={state !== "off"}
            title={state === "A" ? "Selected as A (baseline)" : state === "B" ? "Selected as B (compare)" : "Click to select"}
          >
            <span className="font-medium text-[13px]">v{exp.version ?? 1}</span>
            <span className={`text-[10px] ${
              state === "A" ? "text-background/70" : state === "B" ? "text-status-ok/70" : "text-muted-foreground"
            }`}>
              {formatShortDate(exp.createdAt)}{exp.supersededAt ? "" : " · current"}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onSwap}
        className="ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        title="Swap A and B"
      >
        <ArrowLeftRight className="w-3.5 h-3.5" /> Swap
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// One version panel — metrics + ingredients + tasting note.
// ─────────────────────────────────────────────────────────────────────────

function VersionPanel({
  side, experiment, ingredients, balance, aw, ingredientMap, diffRows,
}: {
  side: "A" | "B";
  experiment: Experiment | undefined;
  ingredients: ReturnType<typeof useExperimentIngredients>;
  balance: ReturnType<typeof calculateGanacheBalance>;
  aw: AwEstimate | null;
  ingredientMap: Map<string, Ingredient>;
  diffRows: IngredientDiffRow[];
}) {
  if (!experiment) {
    return <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">No version selected.</div>;
  }

  const ringClass =
    side === "B"
      ? "border-status-ok-edge ring-1 ring-status-ok-edge/30"
      : "border-border";

  const tagClass =
    side === "B"
      ? "bg-status-ok-bg text-status-ok"
      : "bg-muted text-muted-foreground";

  // The ingredient table shows rows in diffRows order. For side A we show
  // amountA + pctA; for side B we show amountB and a Δ-from-A column.
  // Rows where the side has 0g are rendered as a dim placeholder so the
  // two tables stay row-aligned.
  return (
    <article className={`rounded-xl border ${ringClass} bg-card p-5 flex flex-col gap-4`}>
      <header className="flex items-baseline justify-between gap-2 pb-3 border-b border-border/60">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-medium tracking-tight">v{experiment.version ?? 1}</span>
          <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${tagClass}`}>
            {side === "A" ? "A · baseline" : experiment.supersededAt ? "B · compare" : "B · current"}
          </span>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatLongDate(experiment.createdAt)}
        </span>
      </header>

      <Metrics experiment={experiment} balance={balance} aw={aw} />

      <IngredientDiffTable
        diffRows={diffRows}
        side={side}
        ingredientMap={ingredientMap}
      />

      <TastingNote experiment={experiment} />
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function Metrics({
  experiment, balance, aw,
}: {
  experiment: Experiment;
  balance: ReturnType<typeof calculateGanacheBalance>;
  aw: AwEstimate | null;
}) {
  const shelfLife = aw ? shelfLifeFromEstimate(aw) : null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-border/60 pb-3">
      <Metric label="Taste"   value={<Stars n={experiment.tasteFeedback}   />} />
      <Metric label="Texture" value={<Stars n={experiment.textureFeedback} />} />
      <Metric
        label="Water activity"
        value={aw ? <span className="inline-flex items-center gap-1.5"><span className="tabular-nums">{aw.value.toFixed(2)}</span>{shelfLife && <ShelfPill band={shelfLife.band} />}</span> : <Dim />}
      />
      <Metric
        label="Total"
        value={balance ? <span><span className="tabular-nums">{balance.totalWeight.toFixed(0)}</span> <span className="text-muted-foreground text-xs">g</span></span> : <Dim />}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="pr-3 [&+&]:border-l [&+&]:border-border/60 [&+&]:pl-3">
      <div className="mono-label mb-1">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function Stars({ n }: { n?: number }) {
  if (!n) return <Dim />;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex gap-[3px]">
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`w-2.5 h-2.5 rounded-full ${i <= n ? "bg-foreground" : "border border-border"}`}
          />
        ))}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">{n} / 5</span>
    </span>
  );
}

function Dim() {
  return <span className="italic text-muted-foreground text-sm">awaiting</span>;
}

function ShelfPill({ band }: { band: ShelfLifeBand }) {
  const cls =
    band === "short"     ? "bg-status-alert-bg text-status-alert border-status-alert-edge"
    : band === "medium"  ? "bg-status-warn-bg  text-status-warn  border-status-warn-edge"
    : band === "long"    ? "bg-status-ok-bg    text-status-ok    border-status-ok-edge"
    : /* very_long */      "bg-muted text-foreground border-border";
  const label =
    band === "short" ? "short" : band === "medium" ? "medium" : band === "long" ? "long" : "stable";
  return (
    <span className={`inline-block px-1.5 py-px rounded-full border text-[9.5px] uppercase tracking-widest font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function IngredientDiffTable({
  diffRows, side, ingredientMap,
}: {
  diffRows: IngredientDiffRow[];
  side: "A" | "B";
  ingredientMap: Map<string, Ingredient>;
}) {
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead>
        <tr>
          <th className="text-left mono-label py-1 border-b border-border">Ingredient</th>
          <th className="text-right mono-label py-1 border-b border-border w-20">Grams</th>
          <th className="text-right mono-label py-1 border-b border-border w-24">
            {side === "A" ? "% of batch" : "Δ from A"}
          </th>
        </tr>
      </thead>
      <tbody>
        {diffRows.map((row) => {
          const ing = ingredientMap.get(row.ingredientId);
          const displayName = ing
            ? (ing.manufacturer ? `${ing.name} (${ing.manufacturer})` : ing.name)
            : row.name;

          // What this side displays for this row:
          const sideAmount = side === "A" ? row.amountA : row.amountB;
          const sideAbsent = sideAmount <= 0.001;

          // marker dot at the start of the name communicates the diff status
          // but only from B's perspective (B is the "after"). On side A we
          // show muted markers for "this row is going to change" hints.
          const marker = markerFor(row.status, side);

          return (
            <tr key={row.ingredientId} className="border-b border-border/40 last:border-0">
              <td className="py-1.5 align-middle">
                <span className={`inline-block w-2 h-2 rounded-full mr-2 align-middle ${marker.cls}`} />
                <span
                  className={
                    sideAbsent
                      ? "italic text-muted-foreground/60"
                      : row.status === "removed" && side === "A"
                      ? "line-through decoration-border decoration-1 text-muted-foreground"
                      : "text-foreground"
                  }
                >
                  {displayName}
                </span>
              </td>
              <td className={`py-1.5 text-right tabular-nums ${sideAbsent ? "text-muted-foreground/50" : ""}`}>
                {sideAbsent ? "—" : sideAmount.toFixed(0)}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {side === "A" ? (
                  <span className={sideAbsent ? "text-muted-foreground/50" : "text-muted-foreground"}>
                    {sideAbsent ? "—" : `${row.pctA.toFixed(1)} %`}
                  </span>
                ) : (
                  <DeltaCell row={row} />
                )}
              </td>
            </tr>
          );
        })}
        {diffRows.length === 0 && (
          <tr><td colSpan={3} className="py-3 text-center text-muted-foreground text-xs italic">No ingredients yet.</td></tr>
        )}
      </tbody>
    </table>
  );
}

function markerFor(status: IngredientDiffRow["status"], side: "A" | "B") {
  // On side A: leave the marker invisible for unchanged rows; show muted
  // hints for "this row is about to disappear" (removed) so the eye links
  // to side B's diff annotation.
  if (side === "A") {
    if (status === "removed") return { cls: "bg-destructive/70" };
    return { cls: "bg-transparent" };
  }
  // Side B — full strength colours.
  switch (status) {
    case "added":     return { cls: "bg-status-ok" };
    case "increased": return { cls: "bg-status-ok/40 ring-1 ring-status-ok" };
    case "decreased": return { cls: "bg-destructive/40 ring-1 ring-destructive" };
    case "removed":   return { cls: "bg-destructive" };
    default:          return { cls: "bg-transparent" };
  }
}

function DeltaCell({ row }: { row: IngredientDiffRow }) {
  if (row.status === "added")     return <span className="text-status-ok font-medium">new</span>;
  if (row.status === "removed")   return <span className="text-destructive font-medium">removed</span>;
  if (row.status === "unchanged") return <span className="text-muted-foreground">—</span>;
  const sign = row.delta > 0 ? "+" : "−";
  const cls = row.delta > 0 ? "text-status-ok" : "text-destructive";
  return <span className={cls}>{sign}{Math.abs(row.delta).toFixed(0)}</span>;
}

// ─────────────────────────────────────────────────────────────────────────

function TastingNote({ experiment }: { experiment: Experiment }) {
  const hasFeedback = experiment.batchNotes || experiment.tasteFeedback || experiment.textureFeedback;
  if (!hasFeedback) {
    return (
      <div className="mt-auto rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground italic">
        No tasting note recorded for this version.
      </div>
    );
  }
  return (
    <div className="mt-auto rounded-md bg-muted/60 border border-border/60 p-3">
      <div className="flex items-baseline justify-between mb-1">
        <span className="mono-label">Tasting note</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {formatShortDate(experiment.updatedAt)}
        </span>
      </div>
      {experiment.batchNotes && (
        <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
          {experiment.batchNotes}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Composition shift card — five bars, each showing old vs new with delta.
// ─────────────────────────────────────────────────────────────────────────

const SHIFT_ROWS: { key: ComponentKey; label: string }[] = [
  { key: "water",     label: "Water" },
  { key: "sugar",     label: "Sugar" },
  { key: "cacaoFat",  label: "Cocoa fat" },
  { key: "milkFat",   label: "Milk fat" },
  { key: "otherFats", label: "Other fats" },
  { key: "solids",    label: "Cocoa solids" },
];

function CompositionShiftCard({ shift }: { shift: NonNullable<ReturnType<typeof compositionShift>> }) {
  // Display cap at 50% to match the existing BalanceBar visual scale.
  const scale = (v: number) => Math.min(50, Math.max(0, v)) / 50;
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-1.5">
      {SHIFT_ROWS.map(({ key, label }) => {
        const s = shift[key];
        // Hide rows that are both zero on both sides (e.g. otherFats often 0).
        if (s.a < 0.05 && s.b < 0.05) return null;
        const deltaCls =
          Math.abs(s.delta) < 0.05 ? "text-muted-foreground"
            : s.delta > 0          ? "text-status-ok"
            :                         "text-destructive";
        const sign = s.delta > 0 ? "+" : s.delta < 0 ? "−" : "";
        const filledCls = s.delta > 0 ? "bg-status-ok" : s.delta < 0 ? "bg-destructive" : "bg-foreground";
        return (
          <div key={key} className="grid grid-cols-[96px_1fr_auto] items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
            <span className="text-xs text-foreground">{label}</span>
            <div className="relative h-2 bg-muted rounded-full overflow-hidden">
              {/* baseline (A) — light grey */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-border rounded-full"
                style={{ width: `${scale(s.a) * 100}%` }}
              />
              {/* new (B) — colour by direction */}
              <div
                className={`absolute top-0 bottom-0 left-0 ${filledCls} rounded-full`}
                style={{ width: `${scale(s.b) * 100}%`, opacity: 0.9 }}
              />
            </div>
            <span className="text-[12px] tabular-nums whitespace-nowrap">
              <span className="text-muted-foreground">{s.a.toFixed(1)} %</span>
              <span className="text-muted-foreground/60 mx-1.5">→</span>
              <span className="text-foreground font-medium">{s.b.toFixed(1)} %</span>
              <span className={`ml-3 inline-block min-w-[44px] text-right ${deltaCls}`}>
                {Math.abs(s.delta) < 0.05 ? "—" : `${sign}${Math.abs(s.delta).toFixed(1)}`}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────

function DiffHeadline({
  summary, aVersion, bVersion,
}: {
  summary: ReturnType<typeof summariseIngredientDiff>;
  aVersion: number;
  bVersion: number;
}) {
  const { addedCount, removedCount, changedCount, netGramsDelta } = summary;
  if (addedCount === 0 && removedCount === 0 && changedCount === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        v{aVersion} and v{bVersion} have identical ingredients.
      </div>
    );
  }
  const parts: string[] = [];
  if (addedCount > 0)   parts.push(`${addedCount} new ingredient${addedCount === 1 ? "" : "s"}`);
  if (removedCount > 0) parts.push(`${removedCount} removed`);
  if (changedCount > 0) parts.push(`${changedCount} re-weighted`);

  const totalDir = netGramsDelta > 0 ? "heavier" : netGramsDelta < 0 ? "lighter" : "the same weight";

  return (
    <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
      <span className="text-foreground font-medium">v{bVersion}</span>{" "}
      vs v{aVersion}: {parts.join(" · ")}. Total batch is{" "}
      <span className="text-foreground">{Math.abs(netGramsDelta).toFixed(0)} g {totalDir}</span>.
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Date helpers

function formatShortDate(d?: Date | string): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function formatLongDate(d?: Date | string): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
