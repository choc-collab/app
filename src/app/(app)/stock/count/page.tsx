"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Search, Snowflake, ClipboardList, AlertTriangle, Check, Undo2 } from "lucide-react";
import { useStocktakeRows, applyStocktake, type StocktakeProductRow } from "@/lib/hooks";
import { planStocktake, isStocktakeEmpty, type StocktakeRowInput } from "@/lib/stocktake";
import { STOCK_COUNT_INTERVAL_DAYS } from "@/lib/stockAudit";

const DAY_MS = 24 * 60 * 60 * 1000;

/** "3 days ago" / "today" for a last-counted timestamp. */
function countedAgo(ts: number | undefined, now: number): string {
  if (!ts) return "never counted";
  const days = Math.floor((now - ts) / DAY_MS);
  if (days <= 0) return "counted today";
  if (days === 1) return "counted yesterday";
  return `counted ${days} days ago`;
}

export default function StocktakePage() {
  const data = useStocktakeRows();
  const router = useRouter();

  /** productId → raw input string. Absent = never touched, "" = blank (skip). */
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  /** True once the tally panel has lifted off the page and is pinned to the
   *  viewport. Drives the shadow, so the panel reads as flat while it sits in
   *  the document and raised once it's floating over the list. */
  const [pinned, setPinned] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => data?.rows ?? [], [data]);

  // The recorded total is the starting point for every field: a stocktake is
  // mostly confirmation, so the fast path is "scan the list, fix the two that
  // moved". Clearing a field is how you say "didn't count this one".
  function valueFor(row: StocktakeProductRow): string {
    const held = entries[row.productId];
    return held === undefined ? String(row.currentTotal) : held;
  }

  function setValue(productId: string, next: string) {
    setEntries((prev) => ({ ...prev, [productId]: next }));
    setReviewing(false);
  }

  function bump(row: StocktakeProductRow, delta: number) {
    const current = parseInt(valueFor(row), 10);
    const base = Number.isFinite(current) ? current : row.currentTotal;
    setValue(row.productId, String(Math.max(0, base + delta)));
  }

  const inputs: StocktakeRowInput[] = useMemo(
    () =>
      rows.map((row) => {
        const raw = entries[row.productId];
        const text = raw === undefined ? String(row.currentTotal) : raw.trim();
        const parsed = text === "" ? null : Number(text);
        return {
          productId: row.productId,
          productName: row.productName,
          currentTotal: row.currentTotal,
          entered: parsed === null || !Number.isFinite(parsed) ? null : parsed,
          batches: row.batches,
        };
      }),
    [rows, entries],
  );

  const plan = useMemo(() => planStocktake(inputs), [inputs]);
  const nothingToSave = isStocktakeEmpty(plan);
  const progressPct = rows.length === 0
    ? 0
    : Math.round((plan.countedProductIds.length / rows.length) * 100);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.productName.toLowerCase().includes(q));
  }, [rows, search]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPinned(!entry.isIntersecting),
      { threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rows.length]);

  async function handleSave() {
    setSaving(true);
    setSaveError("");
    try {
      // Confirmed rows go in with `null` — stamped as counted, batches untouched.
      const changedById = new Map(plan.changed.map((c) => [c.productId, c.to] as const));
      await applyStocktake(
        plan.countedProductIds.map((productId) => ({
          productId,
          newTotal: changedById.has(productId) ? changedById.get(productId)! : null,
        })),
      );
      router.push("/stock");
    } catch (err) {
      setSaving(false);
      setSaveError(err instanceof Error ? err.message : "Could not save the stocktake.");
    }
  }

  if (data === undefined) {
    return (
      <div>
        <BackLink />
        <Header />
        <p className="px-4 text-sm text-muted-foreground">Loading stock…</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div>
        <BackLink />
        <Header />
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">
          Nothing on the shelf to count. Completed production batches show up here.
        </p>
      </div>
    );
  }

  // eslint-disable-next-line react-hooks/purity -- "counted N days ago" is a render-time snapshot
  const now = Date.now();

  return (
    <div className="pb-16">
      <BackLink />
      <Header />

      {/* Sentinel: goes out of view exactly as the tally panel starts to pin,
          which is how the panel knows to lift off the page. */}
      <div ref={sentinelRef} aria-hidden className="h-px" />

      {/* The tally. Pinned to the top of the viewport rather than parked in a
          footer: on a short shelf a bottom bar sits hundreds of pixels below
          the last row and reads as page chrome, and on a long one you can't
          see what your pass adds up to without scrolling to the end. Here the
          numbers sit where the work is and stay there. */}
      <div className="sticky top-0 z-30 bg-background px-4 py-2">
        <div
          role="region"
          aria-label="Stocktake tally"
          className={`relative overflow-hidden rounded-lg bg-card transition-shadow duration-200 ${
            pinned ? "border border-foreground/25 shadow-lg" : "border border-border shadow-sm"
          }`}
        >
          {/* Progress rule — fills as you work through the shelf. */}
          <div className="absolute inset-x-0 top-0 h-1 bg-muted">
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div className="px-4 pt-5 pb-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-4">
            <div className="flex items-end">
              <Readout label="Included" value={`${plan.countedProductIds.length}/${rows.length}`} />
              <Readout label="Changed" value={String(plan.changed.length)} />
              <Readout
                label="Net"
                value={`${plan.netDelta > 0 ? "+" : ""}${plan.netDelta}`}
                tone={plan.netDelta < 0 ? "down" : plan.netDelta > 0 ? "up" : undefined}
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              {reviewing && (
                <button
                  type="button"
                  onClick={() => setReviewing(false)}
                  className="btn-secondary !py-2 flex-1 sm:flex-none"
                >
                  Back
                </button>
              )}
              {reviewing ? (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-sm px-5 py-2 font-medium transition-opacity hover:opacity-90 disabled:opacity-40 flex-1 sm:flex-none"
                >
                  <Check aria-hidden className="w-4 h-4" />
                  {saving ? "Saving…" : `Save — mark ${plan.countedProductIds.length} counted`}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setReviewing(true)}
                  disabled={nothingToSave}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary text-primary-foreground text-sm px-5 py-2 font-medium transition-opacity hover:opacity-90 disabled:opacity-40 flex-1 sm:flex-none"
                >
                  <ClipboardList aria-hidden className="w-4 h-4" /> Review &amp; save
                </button>
              )}
            </div>
          </div>

          <div className="px-4 pb-3 -mt-1 text-xs text-muted-foreground">
            {nothingToSave
              ? "Nothing counted yet — every field is blank."
              : [
                  plan.confirmed.length > 0 && `${plan.confirmed.length} unchanged`,
                  plan.skipped.length > 0 && `${plan.skipped.length} not counted`,
                ]
                  .filter(Boolean)
                  .join(" · ") || "Every product on the shelf has a new count"}
          </div>

          {reviewing && plan.goneBatches.length > 0 && (
            <div
              role="status"
              className="border-t border-status-warn-edge bg-status-warn-bg px-4 py-2.5 text-xs"
            >
              <p className="flex items-start gap-1.5 text-foreground">
                <AlertTriangle aria-hidden className="w-3.5 h-3.5 shrink-0 mt-px text-status-warn" />
                <span>
                  This will empty{" "}
                  {plan.goneBatches.length === 1 ? "1 batch" : `${plan.goneBatches.length} batches`} and mark{" "}
                  {plan.goneBatches.length === 1 ? "it" : "them"} as gone:{" "}
                  {plan.goneBatches.map((g, i) => (
                    <span key={`${g.productId}-${g.batchNumber}-${i}`}>
                      {i > 0 && ", "}
                      <span className="font-mono">{g.batchNumber}</span>{" "}
                      <span className="text-muted-foreground">({g.productName})</span>
                    </span>
                  ))}
                  .
                </span>
              </p>
            </div>
          )}

          {saveError && (
            <p className="border-t border-border px-4 py-2 text-xs text-status-alert" role="alert">
              {saveError}
            </p>
          )}
        </div>
      </div>

      <div className="px-4 pt-1 space-y-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex-1 relative min-w-[12rem]">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Jump to a product…"
              aria-label="Filter products"
              className="input !pl-9"
            />
          </div>
          <button
            type="button"
            onClick={() => { setEntries({}); setReviewing(false); }}
            className="btn-secondary !px-3 !py-1.5 text-xs"
            title="Put every field back to the recorded total"
          >
            <Undo2 aria-hidden className="w-3.5 h-3.5" /> Reset fields
          </button>
          <button
            type="button"
            onClick={() => {
              setEntries(Object.fromEntries(rows.map((r) => [r.productId, ""])));
              setReviewing(false);
            }}
            className="btn-secondary !px-3 !py-1.5 text-xs"
            title="Empty every field, then fill in only what you count"
          >
            Clear all
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Every field starts at the recorded total. Change the ones that moved, and
          clear any product you didn&apos;t get to — blank means &ldquo;not counted&rdquo;.
        </p>

        {/* Rows */}
        <ul className="space-y-2">
          {visibleRows.map((row) => {
            const raw = valueFor(row);
            const skipped = raw.trim() === "";
            const parsed = Number(raw);
            const valid = !skipped && Number.isFinite(parsed) && parsed >= 0;
            const delta = valid ? Math.round(parsed) - row.currentTotal : 0;
            const belowThreshold =
              valid && row.lowStockThreshold != null && Math.round(parsed) < row.lowStockThreshold;

            return (
              <li
                key={row.productId}
                className={`rounded-lg border bg-card px-3 py-2.5 ${
                  skipped ? "border-dashed border-border opacity-70" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                      {row.productName}
                      {row.frozenTotal > 0 && (
                        <span
                          className="shrink-0 rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-1.5 py-0 text-[10px] font-semibold inline-flex items-center gap-0.5"
                          title="In the freezer — not part of a shelf count"
                        >
                          <Snowflake className="w-2.5 h-2.5" />
                          {row.frozenTotal}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                      Recorded {row.currentTotal} pcs
                      {row.batches.length > 1 && ` · ${row.batches.length} batches`}
                      {row.lowStockThreshold != null && ` · threshold ${row.lowStockThreshold}`}
                      {` · ${countedAgo(row.stockCountedAt, now)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => bump(row, -1)}
                      aria-label={`One fewer ${row.productName}`}
                      className="w-7 h-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={raw}
                      onChange={(e) => setValue(row.productId, e.target.value)}
                      aria-label={`Counted pieces of ${row.productName}`}
                      className="input !w-20 text-center h-8 !py-0 tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => bump(row, 1)}
                      aria-label={`One more ${row.productName}`}
                      className="w-7 h-8 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>

                {(skipped || delta !== 0 || belowThreshold) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                    {skipped && <span className="text-muted-foreground">Not counted — left as is</span>}
                    {delta !== 0 && (
                      <span className={`tabular-nums font-medium ${delta < 0 ? "text-status-alert" : "text-status-ok"}`}>
                        {delta > 0 ? "+" : ""}{delta} pcs
                      </span>
                    )}
                    {belowThreshold && (
                      <span className="text-status-warn">Below the low-stock threshold</span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {visibleRows.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No products match &ldquo;{search}&rdquo;.</p>
        )}

        {data.frozenOnly.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-start gap-1.5 pt-1">
            <Snowflake aria-hidden className="w-3.5 h-3.5 shrink-0 mt-px text-sky-600" />
            <span>
              {data.frozenOnly.length === 1 ? "1 product is" : `${data.frozenOnly.length} products are`} entirely
              in the freezer and can&apos;t be shelf-counted:{" "}
              {data.frozenOnly.map((f) => f.productName).join(", ")}.
            </span>
          </p>
        )}
      </div>

    </div>
  );
}

/** One figure in the tally: a large tabular numeral over a mono caption.
 *  Cells are separated by a hairline rather than boxed, so the three read as
 *  one instrument rather than three cards. */
function Readout({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  const toneCls =
    tone === "down" ? "text-status-alert" : tone === "up" ? "text-status-ok" : "text-foreground";
  return (
    // A labelled group so the figure is announced with its caption ("Changed,
    // 2") rather than as a bare number floating next to a word.
    <div
      role="group"
      aria-label={label}
      className="pl-4 pr-4 first:pl-0 last:pr-0 border-l border-border first:border-l-0"
    >
      <p className={`text-2xl sm:text-3xl font-display font-medium tabular-nums tracking-tight leading-none transition-colors ${toneCls}`}>
        {value}
      </p>
      <p aria-hidden className="mono-label text-muted-foreground mt-2">{label}</p>
    </div>
  );
}

function BackLink() {
  return (
    <div className="px-4 pt-6 pb-2">
      <Link href="/stock" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Stock
      </Link>
    </div>
  );
}

function Header() {
  return (
    <div className="px-4 pb-4">
      <h1 className="text-2xl font-display tracking-tight">Stocktake</h1>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
        Count everything on the shelf in one pass — recommended every {STOCK_COUNT_INTERVAL_DAYS} days.
      </p>
    </div>
  );
}
