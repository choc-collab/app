"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { useProductsList, useProductStockMap } from "@/lib/hooks";
import { buildToMakeRows, writeSeedFromTodayList, type ToMakeRow } from "@/lib/todaySeed";

type View = "low" | "all";

/** Two-state list of products that need a fresh batch. The "Low stock"
 *  view shows out-of-stock + below-threshold products with reorder-point
 *  context; "All" shows healthy ones too with a quiet pill. Selected rows
 *  feed into the production-plan wizard via session-storage hand-off. */
export function ToMakeList() {
  const products = useProductsList();
  const stockByProduct = useProductStockMap();
  const router = useRouter();

  const allRows = useMemo(
    () => buildToMakeRows({ products, stockByProduct }),
    [products, stockByProduct],
  );
  const lowRows = useMemo(
    () => allRows.filter((r) => r.status !== "healthy"),
    [allRows],
  );

  const [view, setView] = useState<View>("low");
  const [selected, setSelected] = useState<Set<string>>(new Set<string>());

  const visible = view === "low" ? lowRows : allRows;
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.productId));
  const selectedCount = selected.size;

  function toggleRow(productId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of visible) next.delete(r.productId);
      } else {
        for (const r of visible) next.add(r.productId);
      }
      return next;
    });
  }

  function startProductionPlan() {
    if (selectedCount === 0) return;
    writeSeedFromTodayList(Array.from(selected));
    router.push("/production/new?mode=full");
  }

  if (allRows.length === 0) {
    return (
      <section className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2">
        <span className="mono-label text-muted-foreground">To make</span>
        <h2 className="text-lg font-display tracking-tight">No products yet</h2>
        <p className="text-sm text-muted-foreground">
          Add products in the Pantry to start tracking what to make.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <span className="mono-label text-muted-foreground">To make</span>
          <h2 className="text-lg font-display tracking-tight mt-1">Tick what to produce</h2>
        </div>
        <div role="tablist" aria-label="View" className="inline-flex border border-border rounded-md overflow-hidden text-xs">
          <ViewTab label="Low stock" active={view === "low"} onClick={() => setView("low")} count={lowRows.length} />
          <ViewTab label="All" active={view === "all"} onClick={() => setView("all")} count={allRows.length} />
        </div>
      </header>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {view === "low" ? "All products at or above their reorder point." : "No products to show."}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3 px-2 py-1.5 border-b border-dashed border-border text-xs text-muted-foreground">
            <button
              type="button"
              onClick={toggleAll}
              className="flex items-center gap-2 hover:text-foreground transition-colors"
            >
              <CheckBox checked={allVisibleSelected} />
              <span className="mono-label">{allVisibleSelected ? "Clear all" : "Select all"}</span>
            </button>
            <span className="ml-auto tabular-nums">{visible.length} shown</span>
          </div>

          <ul className="flex flex-col gap-1.5">
            {visible.map((row) => (
              <Row
                key={row.productId}
                row={row}
                checked={selected.has(row.productId)}
                onToggle={() => toggleRow(row.productId)}
              />
            ))}
          </ul>
        </>
      )}

      <CtaBar
        selectedCount={selectedCount}
        disabled={selectedCount === 0}
        onClick={startProductionPlan}
      />
    </section>
  );
}

function ViewTab({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1.5 transition-colors ${
        active
          ? "bg-foreground text-background"
          : "bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {label} <span className="font-mono opacity-70">· {count}</span>
    </button>
  );
}

function Row({ row, checked, onToggle }: { row: ToMakeRow; checked: boolean; onToggle: () => void }) {
  const urgent = row.status === "out" || row.status === "low";
  const stockText = `${row.pieces} ${row.pieces === 1 ? "pc" : "pcs"}`;
  const subtext =
    row.status === "out"
      ? row.threshold != null ? "out of stock" : "no stock — never produced"
      : row.status === "low" && row.threshold != null
      ? `below reorder point (${row.threshold})`
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={checked}
        className={`w-full flex items-stretch gap-3 px-3 py-2 rounded-md border text-left transition-colors ${
          checked
            ? "border-foreground bg-muted"
            : "border-border bg-card hover:bg-muted/40"
        }`}
      >
        <CheckBox checked={checked} />
        <span
          aria-hidden
          className={`w-1 self-stretch rounded-sm ${urgent ? "bg-foreground" : "bg-border"}`}
        />
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm font-medium">{row.name}</span>
            <span className="text-xs font-mono text-muted-foreground">· {stockText}</span>
            {row.status === "healthy" && (
              <span className="text-[10px] uppercase tracking-wider rounded-full border border-border px-1.5 py-px text-muted-foreground">
                healthy
              </span>
            )}
          </span>
          {subtext && (
            <span className="block text-xs text-muted-foreground mt-0.5">{subtext}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`w-4 h-4 shrink-0 rounded-sm border flex items-center justify-center mt-0.5 ${
        checked
          ? "bg-foreground border-foreground text-background"
          : "border-foreground bg-card"
      }`}
    >
      {checked && <Check className="w-3 h-3" strokeWidth={3} />}
    </span>
  );
}

function CtaBar({
  selectedCount,
  disabled,
  onClick,
}: {
  selectedCount: number;
  disabled: boolean;
  onClick: () => void;
}) {
  const tone = disabled
    ? "border-border bg-muted/40 text-muted-foreground"
    : "border-foreground bg-foreground text-background";
  const ctaTone = disabled
    ? "border-border text-muted-foreground"
    : "bg-background text-foreground";
  const label = disabled
    ? "Tick rows above to plan production"
    : "Build production plan from selection";
  const labelKicker = disabled ? "Nothing selected" : `${selectedCount} selected`;

  return (
    <div className={`mt-2 rounded-md border ${tone} flex items-center gap-3 px-3 py-2.5`}>
      <div className="flex-1 min-w-0">
        <span className={`mono-label block ${disabled ? "" : "opacity-70"}`}>{labelKicker}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${ctaTone} ${disabled ? "" : "hover:opacity-90"} transition-opacity`}
      >
        <Plus className="w-3.5 h-3.5" />
        Production plan →
      </button>
    </div>
  );
}
