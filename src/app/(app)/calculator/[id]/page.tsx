"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useExperiment,
  useExperimentIngredients,
  saveExperiment,
  deleteExperiment,
  forkExperimentVersion,
  saveExperimentIngredient,
  deleteExperimentIngredient,
  useIngredients,
  saveIngredient,
  useFillingIngredients as useFillingIngs,
  saveFilling,
  saveFillingIngredient,
} from "@/lib/hooks";
import { calculateGanacheBalance, checkGanacheBalance, detectChocolateType } from "@/lib/ganacheBalance";
import type { Ingredient } from "@/types";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";
import { ChevronLeft, Trash2, Plus, AlertTriangle, CheckCircle, GripVertical, Info, PlayCircle } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DragEndEvent } from "@dnd-kit/core";

// --- Balance bar component ---
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

// --- Add ingredient inline form ---
function AddIngredientForm({
  onAdd,
}: {
  onAdd: (ingredientId: string, amount: number) => Promise<void>;
}) {
  const ingredients = useIngredients();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | "">("");
  const [amount, setAmount] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [open, setOpen] = useState(false);

  const trimmed = search.trim();
  const filtered = (trimmed
    ? ingredients.filter(
        (i) =>
          i.name.toLowerCase().includes(trimmed.toLowerCase()) ||
          (i.manufacturer ?? "").toLowerCase().includes(trimmed.toLowerCase())
      )
    : ingredients
  ).slice(0, 10);

  const exactMatch = trimmed
    ? ingredients.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())
    : false;
  const showCreate = !!trimmed && !selectedId && !exactMatch;
  const totalItems = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => { setHighlightedIndex(-1); }, [search]);

  function selectIngredient(ing: (typeof ingredients)[0]) {
    setSelectedId(ing.id!);
    setSearch(ing.manufacturer ? `${ing.name} (${ing.manufacturer})` : ing.name);
    setHighlightedIndex(-1);
  }

  async function handleCreateNew() {
    if (!trimmed) return;
    const id = await saveIngredient({
      name: trimmed,
      manufacturer: "",
      source: "",
      cost: 0,
      notes: "",
      cacaoFat: 0,
      sugar: 0,
      milkFat: 0,
      water: 0,
      solids: 0,
      otherFats: 0,
      allergens: [],
    });
    setSelectedId(id);
    setSearch(trimmed);
    setHighlightedIndex(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const showDropdown = !!trimmed && !selectedId && totalItems > 0;
    if (!showDropdown) {
      if (e.key === "Escape") { setOpen(false); reset(); }
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightedIndex((i) => Math.min(i + 1, totalItems - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightedIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      if (highlightedIndex < filtered.length) selectIngredient(filtered[highlightedIndex]);
      else handleCreateNew();
    } else if (e.key === "Escape") { setOpen(false); reset(); }
  }

  function reset() {
    setSearch("");
    setSelectedId("");
    setAmount("");
    setHighlightedIndex(-1);
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId || !amount) return;
    await onAdd(selectedId as string, parseFloat(amount) || 0);
    reset();
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-primary font-medium mt-1"
        title="Add ingredient (n)"
      >
        <Plus className="w-3.5 h-3.5" /> Add ingredient
      </button>
    );
  }

  return (
    <form onSubmit={handleAdd} className="mt-2 p-3 rounded-lg border border-border bg-muted/50 space-y-2">
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedId(""); }}
          onKeyDown={handleKeyDown}
          placeholder="Search ingredient…"
          autoFocus
          className="input w-full"
        />
        {trimmed && !selectedId && (filtered.length > 0 || showCreate) && (
          <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-card">
            {filtered.map((ing, idx) => (
              <li key={ing.id}>
                <button
                  type="button"
                  onClick={() => selectIngredient(ing)}
                  className={`w-full text-left px-2 py-1.5 text-sm transition-colors ${
                    idx === highlightedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  {ing.name}
                  {ing.manufacturer && <span className="text-muted-foreground"> ({ing.manufacturer})</span>}
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className={`w-full text-left px-2 py-1.5 text-sm border-t border-border transition-colors ${
                    highlightedIndex === filtered.length ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  + Create <span className="font-medium text-foreground">&ldquo;{trimmed}&rdquo;</span> as new ingredient
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {selectedId && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            step="0.1"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); reset(); } }}
            placeholder="Amount"
            required
            autoFocus
            className="input w-32"
          />
          <span className="text-sm text-muted-foreground">g</span>
          <button type="submit" disabled={!amount} className="btn-primary px-3 py-1.5 text-sm">Add</button>
          <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-xs text-muted-foreground">Cancel</button>
        </div>
      )}
      {!selectedId && (
        <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-xs text-muted-foreground">
          Cancel
        </button>
      )}
    </form>
  );
}

// --- Main page ---
export default function ExperimentPage() {
  const id = useSpaId("calculator");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const cloneFillingId = searchParams.get("clone") ?? null;

  const experiment = useExperiment(id);
  const experimentIngredients = useExperimentIngredients(id);
  const allIngredients = useIngredients();
  const sourceFillingIngredients = useFillingIngs(cloneFillingId ?? undefined);

  // Clone source filling ingredients on first load when ?clone= is present
  const [cloned, setCloned] = useState(false);
  useEffect(() => {
    if (!id || !cloneFillingId || cloned || sourceFillingIngredients.length === 0) return;
    setCloned(true);
    Promise.all(
      sourceFillingIngredients.map((li, idx) =>
        saveExperimentIngredient({
          experimentId: id,
          ingredientId: li.ingredientId,
          amount: li.amount,
          sortOrder: idx,
        })
      )
    );
  }, [cloneFillingId, cloned, sourceFillingIngredients, id]);

  // Ingredient map for fast lookup
  const ingredientMap = useMemo(
    () => new Map(allIngredients.map((i) => [i.id!, i])),
    [allIngredients]
  );

  // Navigation guard — delete incomplete record if user leaves ?new=1 without saving
  const handleConfirmLeave = useCallback(async () => {
    if (isNew && id) await deleteExperiment(id);
  }, [isNew, id]);  
  useNavigationGuard(isNew, isNew ? handleConfirmLeave : undefined);

  // Editing state
  const [editName, setEditName] = useState<string | undefined>(undefined);
  const [totalStr, setTotalStr] = useState<string | undefined>(undefined);
  const [showDelete, setShowDelete] = useState(false);
  const [showSaveAsFilling, setShowSaveAsFilling] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showDelete) setShowDelete(false);
      else if (showSaveAsFilling) setShowSaveAsFilling(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showDelete, showSaveAsFilling]);
  const [fillingSaved, setFillingSaved] = useState(false);
  const [savedFillingId, setSavedFillingId] = useState<string | null>(null);

  // Sync name from DB once loaded
  useEffect(() => {
    if (!experiment || !editName === false) return;
    if (editName === undefined) setEditName(experiment.name);
  }, [experiment, editName]);

  async function handleNameBlur() {
    if (!experiment || editName === undefined || editName === experiment.name) return;
    await saveExperiment({ ...experiment, name: editName || experiment.name });
  }

  async function handleAddIngredient(ingredientId: string, amount: number) {
    if (!id) return;
    const maxSort = experimentIngredients.reduce((m, ei) => Math.max(m, ei.sortOrder ?? 0), -1);
    await saveExperimentIngredient({ experimentId: id, ingredientId, amount, sortOrder: maxSort + 1 });
  }

  async function handleAmountBlur(ei: typeof experimentIngredients[0], newAmount: number) {
    if (newAmount === ei.amount) return;
    await saveExperimentIngredient({ ...ei, amount: newAmount });
  }

  async function handleDeleteIngredient(eiId: string) {
    await deleteExperimentIngredient(eiId);
  }

  async function handleTotalBlur(newTotalStr: string) {
    const newTotal = parseFloat(newTotalStr);
    setTotalStr(undefined);
    if (isNaN(newTotal) || newTotal <= 0 || totalWeight === 0 || Math.abs(newTotal - totalWeight) < 0.01) return;
    const scale = newTotal / totalWeight;
    await Promise.all(
      experimentIngredients.map((ei) =>
        saveExperimentIngredient({ ...ei, amount: Math.round(ei.amount * scale * 10) / 10 })
      )
    );
  }

  async function handleDelete() {
    if (!id) return;
    await deleteExperiment(id);
    router.replace("/calculator");
  }

  async function handleSaveAsFilling() {
    if (!experiment) return;
    const newFillingId = await saveFilling({
      name: experiment.name,
      category: "Ganaches (Emulsions)",
      source: "Product Lab",
      description: "",
      allergens: [],
      instructions: "",
      status: "to try",
      createdAt: new Date(),
    });
    await Promise.all(
      experimentIngredients.map((ei, idx) =>
        saveFillingIngredient({
          fillingId: newFillingId as string,
          ingredientId: ei.ingredientId,
          amount: ei.amount,
          unit: "g",
          sortOrder: idx,
        })
      )
    );
    await saveExperiment({ ...experiment, status: "promoted", promotedFillingId: newFillingId as string });
    setFillingSaved(true);
    setSavedFillingId(newFillingId as string);
    setShowSaveAsFilling(false);
  }

  // Drag-and-drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = experimentIngredients.findIndex((ei) => ei.id === active.id);
    const newIndex = experimentIngredients.findIndex((ei) => ei.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...experimentIngredients];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    await Promise.all(reordered.map((ei, idx) => saveExperimentIngredient({ ...ei, sortOrder: idx })));
  }

  // Balance calculation
  const balance = useMemo(
    () => calculateGanacheBalance(experimentIngredients, ingredientMap),
    [experimentIngredients, ingredientMap]
  );

  const detectedType = useMemo(
    () => detectChocolateType(experimentIngredients, ingredientMap),
    [experimentIngredients, ingredientMap]
  );

  const check = useMemo(
    () => balance ? checkGanacheBalance(balance, detectedType) : null,
    [balance, detectedType]
  );

  const totalWeight = balance?.totalWeight ?? 0;

  async function handleNewVersion() {
    if (!id) return;
    const newId = await forkExperimentVersion(id);
    router.push(`/calculator/${encodeURIComponent(newId)}?new=1`);
  }

  if (!id || !experiment) {
    return <div className="px-4 pt-6 text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="px-4 pt-6 pb-12">
      {/* Header row: back + primary actions */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <button
          onClick={() => router.push("/lab")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground shrink-0"
        >
          <ChevronLeft className="w-4 h-4" /> Product Lab
        </button>

        {experiment.status !== "promoted" && !fillingSaved && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/calculator/${encodeURIComponent(id)}/run`)}
              disabled={experimentIngredients.length === 0}
              className="flex items-center gap-1.5 btn-primary px-3 py-1.5 text-xs disabled:opacity-40"
            >
              <PlayCircle className="w-3.5 h-3.5" /> Make product
            </button>
            <button
              onClick={() => setShowSaveAsFilling(true)}
              disabled={experimentIngredients.length === 0}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-40"
            >
              Promote to filling
            </button>
          </div>
        )}

        {fillingSaved && (
          <div className="flex items-center gap-1.5 text-xs text-status-ok">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            Saved.{" "}
            <button
              onClick={() => router.push(`/fillings/${encodeURIComponent(savedFillingId ?? "")}`)}
              className="underline"
            >
              Open filling
            </button>
          </div>
        )}
      </div>

      {/* Promote to filling confirmation — inline, below header */}
      {showSaveAsFilling && (
        <div className="mb-4 p-3 rounded-lg border border-border bg-muted/40 space-y-2 text-sm">
          <p>
            Creates a new filling <strong>&ldquo;{experiment.name}&rdquo;</strong> in{" "}
            <strong>Ganaches (Emulsions)</strong> with all {experimentIngredients.length} ingredient
            {experimentIngredients.length !== 1 ? "s" : ""} copied.
          </p>
          <div className="flex gap-2">
            <button onClick={handleSaveAsFilling} className="btn-primary px-3 py-1.5 text-sm">
              Confirm promotion
            </button>
            <button onClick={() => setShowSaveAsFilling(false)} className="text-muted-foreground text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Name */}
      <input
        type="text"
        value={editName ?? experiment.name}
        onChange={(e) => setEditName(e.target.value)}
        onBlur={handleNameBlur}
        className="text-2xl font-display w-full bg-transparent border-none outline-none focus:ring-0 mb-1 placeholder:text-muted-foreground"
        placeholder="Experiment name"
      />

      {(experiment.version ?? 1) > 1 && (
        <p className="text-xs text-muted-foreground mb-1">Version {experiment.version}</p>
      )}

      {experiment.status === "to_improve" && (
        <div className="mb-4 flex items-center gap-2 text-sm text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-3 py-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-status-warn" />
          <span className="flex-1">Marked for improvement. Tweak the product, then create a new version.</span>
          <button onClick={handleNewVersion} className="text-xs font-medium text-primary hover:underline whitespace-nowrap">
            New version →
          </button>
        </div>
      )}

      {experiment.status === "promoted" && experiment.promotedFillingId && (
        <div className="mb-4 flex items-center gap-2 text-sm text-status-ok bg-status-ok-bg border border-status-ok-edge rounded-md px-3 py-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">Promoted to filling.</span>
          <button onClick={() => router.push(`/fillings/${encodeURIComponent(experiment.promotedFillingId!)}`)} className="text-xs underline">
            Open filling
          </button>
        </div>
      )}

      {isNew && (
        <p className="text-xs text-muted-foreground mb-4">Add your ingredients below to see the balance readout.</p>
      )}

      {/* Unified ingredient + composition table */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-primary mb-2">Ingredients</h2>
        {experimentIngredients.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-2">No ingredients yet.</p>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <table className="w-full text-xs border-collapse" style={{ minWidth: 540 }}>
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-1.5 w-6" />
                    <th className="pb-1.5 px-2 font-medium">Ingredient</th>
                    <th className="pb-1.5 px-2 font-medium text-right">g</th>
                    <th className="pb-1.5 px-2 font-medium text-right">%</th>
                    {COMP_FIELDS.map((f) => (
                      <th key={f.key} className="pb-1.5 px-2 font-medium text-right w-14" title={f.label}>
                        {f.short}
                      </th>
                    ))}
                    <th className="pb-1.5 w-8" />
                  </tr>
                </thead>
                <SortableContext items={experimentIngredients.map((ei) => ei.id!)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {experimentIngredients.map((ei) => {
                      const ing = ingredientMap.get(ei.ingredientId);
                      const pct = totalWeight > 0 ? (ei.amount / totalWeight) * 100 : 0;
                      const missingComposition = !ing || (
                        ing.cacaoFat === 0 && ing.sugar === 0 && ing.milkFat === 0 &&
                        ing.water === 0 && ing.solids === 0 && ing.otherFats === 0
                      );
                      return (
                        <ExperimentIngredientRow
                          key={ei.id}
                          ei={ei}
                          ingredient={ing}
                          ingredientId={ei.ingredientId}
                          ingredientName={ing ? (ing.manufacturer ? `${ing.name} (${ing.manufacturer})` : ing.name) : "Unknown"}
                          pct={pct}
                          missingComposition={missingComposition}
                          onAmountBlur={(amount) => handleAmountBlur(ei, amount)}
                          onDelete={() => handleDeleteIngredient(ei.id!)}
                        />
                      );
                    })}
                  </tbody>
                </SortableContext>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold">
                    <td />
                    <td className="pt-2 px-2 text-xs">Total</td>
                    <td className="pt-2 px-2">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={totalStr ?? totalWeight.toFixed(0)}
                        onChange={(e) => setTotalStr(e.target.value)}
                        onBlur={(e) => handleTotalBlur(e.target.value)}
                        className="w-24 rounded border border-border bg-card px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary tabular-nums font-normal"
                        aria-label="Total weight in grams"
                      />
                    </td>
                    <td className="pt-2 px-2 text-right tabular-nums">100%</td>
                    {COMP_FIELDS.map((f) => {
                      const total = experimentIngredients.reduce((sum, ei) => {
                        const ing = ingredientMap.get(ei.ingredientId);
                        return sum + (ei.amount / totalWeight) * ((ing?.[f.key] as number) ?? 0);
                      }, 0);
                      return (
                        <td key={f.key} className="pt-2 px-2 text-right tabular-nums">
                          {total > 0 ? total.toFixed(1) + "%" : "—"}
                        </td>
                      );
                    })}
                    <td />
                  </tr>
                </tfoot>
              </table>
            </DndContext>
          </div>
        )}
        <div className="mt-3">
          <AddIngredientForm onAdd={handleAddIngredient} />
        </div>
      </section>

      {/* Balance readout */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-primary mb-3">Balance</h2>
        {experimentIngredients.some((ei) => {
          const ing = ingredientMap.get(ei.ingredientId);
          return !ing || (ing.cacaoFat === 0 && ing.sugar === 0 && ing.milkFat === 0 && ing.water === 0 && ing.solids === 0 && ing.otherFats === 0);
        }) && (
          <div className="flex items-start gap-2 mb-3 text-xs text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-status-warn" />
            <span>One or more ingredients have no composition data — the balance below is incomplete. Tap the warning icon next to each ingredient to fill in its composition.</span>
          </div>
        )}
        {!balance ? (
          <p className="text-xs text-muted-foreground">Add ingredients to see the balance.</p>
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

      {/* Last batch feedback */}
      {(experiment.tasteFeedback || experiment.textureFeedback || experiment.batchNotes) && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-primary mb-2">Last batch feedback</h2>
          <div className="bg-muted/40 rounded-lg border border-border px-3 py-3 text-xs space-y-1">
            {experiment.tasteFeedback ? <p>Taste: {experiment.tasteFeedback}/5</p> : null}
            {experiment.textureFeedback ? <p>Texture/mouthfeel: {experiment.textureFeedback}/5</p> : null}
            {experiment.batchNotes && <p className="text-muted-foreground">{experiment.batchNotes}</p>}
          </div>
        </section>
      )}

      {/* Delete */}
      <section>
        {showDelete ? (
          <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2 text-sm">
            <p className="font-medium">Delete this experiment?</p>
            <p className="text-muted-foreground text-xs">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={handleDelete} className="text-destructive font-medium text-xs">Yes, delete</button>
              <button onClick={() => setShowDelete(false)} className="text-xs text-muted-foreground">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowDelete(true)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete experiment
          </button>
        )}
      </section>
    </div>
  );
}

const COMP_FIELDS: { key: keyof Ingredient; label: string; short: string }[] = [
  { key: "cacaoFat", label: "Cocoa fat", short: "CF" },
  { key: "sugar", label: "Sugars", short: "Sug" },
  { key: "milkFat", label: "Milk fat", short: "MF" },
  { key: "water", label: "Water", short: "H₂O" },
  { key: "solids", label: "Solids", short: "Sol" },
  { key: "otherFats", label: "Other fats", short: "Fat" },
  { key: "alcohol", label: "Alcohol", short: "Alc" },
];

// --- Ingredient row rendered as <tr> inside the unified composition table ---
function ExperimentIngredientRow({
  ei,
  ingredient,
  ingredientId,
  ingredientName,
  pct,
  missingComposition,
  onAmountBlur,
  onDelete,
}: {
  ei: { id?: string; amount: number };
  ingredient: Ingredient | undefined;
  ingredientId: string;
  ingredientName: string;
  pct: number;
  missingComposition: boolean;
  onAmountBlur: (amount: number) => void;
  onDelete: () => void;
}) {
  const [amountStr, setAmountStr] = useState<string | undefined>(undefined);
  const [pendingRemove, setPendingRemove] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ei.id! });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const batchFraction = pct / 100;

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`border-b border-border/40 ${isDragging ? "opacity-50 bg-muted" : ""}`}
      suppressHydrationWarning
    >
      <td className="py-1.5 pl-1 pr-0 w-6">
        <button
          className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground touch-none"
          aria-label="Drag to reorder"
          suppressHydrationWarning
          {...listeners}
          {...attributes}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      </td>
      <td className="py-1.5 px-2">
        <div className="flex items-center gap-1 min-w-[120px]">
          <Link
            href={`/ingredients/${encodeURIComponent(ingredientId)}`}
            className="text-sm truncate hover:text-primary hover:underline transition-colors"
          >
            {ingredientName}
          </Link>
          {missingComposition && (
            <Link
              href={`/ingredients/${encodeURIComponent(ingredientId)}`}
              title="No composition data — click to edit this ingredient"
              className="shrink-0 text-status-warn hover:text-status-warn transition-colors"
              aria-label="Missing composition data — edit ingredient"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </td>
      <td className="py-1.5 px-2 w-28">
        <input
          type="number"
          step="0.1"
          min="0"
          value={amountStr ?? ei.amount}
          onChange={(e) => setAmountStr(e.target.value)}
          onBlur={(e) => {
            const val = parseFloat(e.target.value);
            const clamped = isNaN(val) ? 0 : Math.max(0, val);
            onAmountBlur(clamped);
            setAmountStr(undefined);
          }}
          aria-label="Amount in grams"
          className="w-24 rounded border border-border bg-card px-2 py-0.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary tabular-nums"
        />
      </td>
      <td className="py-1.5 px-2 text-right text-xs text-muted-foreground tabular-nums w-12">
        {pct.toFixed(1)}%
      </td>
      {COMP_FIELDS.map((f) => {
        const contrib = batchFraction * ((ingredient?.[f.key] as number) ?? 0);
        return (
          <td
            key={f.key}
            className={`py-1.5 px-2 text-right text-xs tabular-nums w-14 ${contrib > 0 ? "" : "text-muted-foreground/30"}`}
          >
            {contrib > 0 ? contrib.toFixed(1) + "%" : "—"}
          </td>
        );
      })}
      <td className={`py-1.5 pl-1 pr-1 ${pendingRemove ? "w-auto" : "w-8"}`}>
        {pendingRemove ? (
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <span className="text-muted-foreground">Remove?</span>
            <button
              onClick={() => { onDelete(); setPendingRemove(false); }}
              className="text-red-600 font-medium hover:underline"
            >
              Yes
            </button>
            <button
              onClick={() => setPendingRemove(false)}
              className="text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setPendingRemove(true)}
            className="p-1 rounded hover:bg-muted transition-colors"
            aria-label="Remove ingredient"
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </td>
    </tr>
  );
}
