"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useFilling, useFillingIngredients, useFillingComponents, useFillings, useIngredients,
  saveFilling, updateFillingFields, deleteFilling, deleteFillingWithCleanup,
  archiveFillingWithCleanup, unarchiveFilling, cascadeAllergensFromFilling, useFillingUsage,
  reorderFillingIngredients, useFillingVersionHistory, forkFillingVersion,
  getFillingForkImpact, getFillingDeleteImpact, hasProductBeenProduced, hasFillingBeenProduced,
  getFillingArchiveImpact, useProductsList, saveProduct, addFillingToProduct, duplicateFilling,
  useAllFillingStatuses, useCurrencySymbol,
} from "@/lib/hooks";
import { db } from "@/lib/db";
import { useSpaId } from "@/lib/use-spa-id";
import type { FillingArchiveImpact, FillingDeleteImpact } from "@/lib/hooks";
import { computeFillingRecipeCost } from "@/lib/fillingCost";
import { SortableFillingIngredientRow } from "@/components/sortable-filling-ingredient-row";
import { AddFillingIngredient } from "@/components/add-filling-ingredient";
import { AddFillingComponent } from "@/components/add-filling-component";
import { NestedFillingList } from "@/components/nested-filling-list";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { DragEndEvent, SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import { CategoryPicker } from "@/components/category-picker";
import { ArrowLeft, Trash2, Lock, LockOpen, GitBranch, Plus, Search, Copy, ArchiveRestore, Archive } from "lucide-react";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { DuplicatedToast } from "@/components/duplicated-toast";
import { StepListEditor } from "@/components/step-list-editor";
import type { Ingredient, Product, Filling, FillingIngredient } from "@/types";
import { DEFAULT_FILLING_STATUSES, allergenLabel } from "@/types";

function toGrams(amount: number, unit: string): number | null {
  if (unit === "g" || unit === "ml") return amount;
  if (unit === "kg" || unit === "L") return amount * 1000;
  return null;
}

function fmtG(n: number): string {
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export default function FillingDetailPage() {
  const fillingId = useSpaId("fillings");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isForked = searchParams.get("forked") === "1";
  const [isDuplicate] = useState(() => searchParams.get("duplicate") === "1");
  const filling = useFilling(fillingId);
  const fillingIngredients = useFillingIngredients(fillingId);
  const allIngredients = useIngredients();
  const products = useFillingUsage(fillingId);
  const versionHistory = useFillingVersionHistory(fillingId);
  const existingStatuses = useAllFillingStatuses();
  const statusSuggestions = [...new Set([...DEFAULT_FILLING_STATUSES, ...existingStatuses])].sort();

  const [activeTab, setActiveTab] = useState<"ingredients" | "history">("ingredients");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unlocked, setUnlocked] = useState(isForked);

  // Fork state
  const [showForkPanel, setShowForkPanel] = useState(false);
  const [forkNotes, setForkNotes] = useState("");
  const [forkImpact, setForkImpact] = useState<Product[] | null>(null);
  // Host fillings that nest the current filling. Forking does NOT touch
  // their component edges — listed for context so the user knows what stays
  // on the old version.
  const [forkNestedHosts, setForkNestedHosts] = useState<Filling[]>([]);
  const [forking, setForking] = useState(false);

  // Duplicate state
  const [duplicating, setDuplicating] = useState(false);

  // Delete / Archive state
  const [fillingProduced, setFillingProduced] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState<FillingDeleteImpact | null>(null);
  const [deletableProducts, setDeletableProducts] = useState<Product[]>([]);
  const [archivableProducts, setArchivableProducts] = useState<Product[]>([]);
  const [removeOrphanedProducts, setRemoveOrphanedProducts] = useState(true);
  const [showArchivePanel, setShowArchivePanel] = useState(false);
  const [archiveImpact, setArchiveImpact] = useState<FillingArchiveImpact | null>(null);
  const [archiveSoleProducts, setArchiveSoleProducts] = useState(true);
  const [removeFromMultiProducts, setRemoveFromMultiProducts] = useState(true);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Loading vs. not-found — `useFilling`'s live query returns `undefined` both
  // while pending and when the row genuinely doesn't exist, so a one-shot
  // direct read resolves which one it actually is.
  const [status, setStatus] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!fillingId) return;
    let cancelled = false;
    db.fillings.get(fillingId).then((f) => {
      if (!cancelled) setStatus(f ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [fillingId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showForkPanel) { setShowForkPanel(false); setForkNotes(""); setForkImpact(null); setForkNestedHosts([]); }
      else if (showArchivePanel) { setShowArchivePanel(false); setArchiveImpact(null); }
      else if (confirmDelete) { setConfirmDelete(false); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showForkPanel, showArchivePanel, confirmDelete]);

  // Check production status on load to determine Archive vs Delete
  useEffect(() => {
    if (filling?.id && !filling.archived) {
      hasFillingBeenProduced(filling.id).then(setFillingProduced);
    }
  }, [filling?.id, filling?.archived]);

  const ingredientMap = new Map<string, Ingredient>();
  for (const ing of allIngredients) {
    if (ing.id != null) ingredientMap.set(ing.id, ing);
  }

  // Subscribe at the top level so the recipe total here can include nested
  // filling components alongside this filling's own ingredients. The
  // `NestedFillingSection` further down also uses `useFillingComponents`;
  // useLiveQuery dedupes the underlying subscription so this is cheap.
  const ownComponents = useFillingComponents(fillingId);

  // Recipe total = own ingredient grams + nested filling component grams.
  // Components carry their unit too (always "g" today, but the same toGrams
  // helper handles future units the way ingredients do). Nested components
  // are part of the recipe for cook-loss math and per-ingredient % display.
  const ownIngredientGrams = fillingIngredients.reduce((sum, li) => {
    const g = toGrams(li.amount, li.unit);
    return g != null ? sum + g : sum;
  }, 0);
  const nestedComponentGrams = ownComponents.reduce((sum, c) => {
    const g = toGrams(c.amount, c.unit);
    return g != null ? sum + g : sum;
  }, 0);
  const totalGrams = ownIngredientGrams + nestedComponentGrams;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleIngredientChanged = useCallback(() => {
    // Cascade so any host that nests this filling refreshes its cached
    // allergens too (Phase 2). The cascade walks the parent edges from
    // `fillingId` upward and refreshes each host's `Filling.allergens`.
    if (fillingId) cascadeAllergensFromFilling(fillingId);
  }, [fillingId]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fillingIngredients.findIndex((li) => li.id === active.id);
    const newIndex = fillingIngredients.findIndex((li) => li.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...fillingIngredients];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    await reorderFillingIngredients(reordered);
  }

  async function handleOpenForkPanel() {
    if (!fillingId) return;
    const { products, nestedInsideFillings } = await getFillingForkImpact(fillingId);
    setForkImpact(products);
    setForkNestedHosts(nestedInsideFillings);
    setForkNotes("");
    setShowForkPanel(true);
    setConfirmDelete(false);
  }

  async function handleFork() {
    if (!fillingId) return;
    setForking(true);
    try {
      const newId = await forkFillingVersion(fillingId, forkNotes);
      router.replace(`/fillings/${encodeURIComponent(newId)}?forked=1`);
    } finally {
      setForking(false);
    }
  }

  if (!fillingId || status === "loading" || (status === "found" && !filling)) {
    return <FillingDetailSkeleton />;
  }
  if (status === "not-found" || !filling) {
    return <FillingNotFound />;
  }

  const versionLabel = filling.version != null ? `v${filling.version}` : null;
  // Show history tab only if this filling is part of a version chain
  const hasVersionHistory = versionHistory.length > 1 || filling.rootId != null;
  const locked = filling.status === "confirmed" && !unlocked;

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <button
          onClick={() => router.push("/fillings")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="px-4 pb-4">
        <DuplicatedToast active={isDuplicate} />

        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <InlineNameEditor
                name={filling.name}
                onSave={async (n) => { await saveFilling({ ...filling, name: n }); }}
                className="text-xl font-bold"
                initialEditing={isDuplicate}
              />
              {versionLabel && (
                <span className="text-xs font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  {versionLabel}
                </span>
              )}
              {filling.archived && (
                <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1">
                  <Archive className="w-3 h-3" /> Archived
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {filling.category || "Uncategorised"}
              {totalGrams > 0 && ` · ${fmtG(totalGrams)}g recipe`}
              {` · used in ${products.length} ${products.length === 1 ? "product" : "products"}`}
            </p>
          </div>
          {!filling.supersededAt && !showForkPanel && (
            <button
              onClick={handleOpenForkPanel}
              className="btn-primary px-3.5 py-1.5 text-sm inline-flex items-center gap-1.5 shrink-0"
              title="Create a new version of this filling, archiving the current one"
            >
              <GitBranch aria-hidden="true" className="w-4 h-4" /> Create new version
            </button>
          )}
        </div>

        {showForkPanel && (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3 mt-3">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium">Create new version of &ldquo;{filling.name}&rdquo;</p>
            </div>
            <div>
              <label className="label">What changed? (optional)</label>
              <input
                type="text"
                value={forkNotes}
                onChange={(e) => setForkNotes(e.target.value)}
                placeholder="e.g. switched to Valrhona Caraïbe 66%"
                className="input"
                autoFocus
              />
            </div>
            {forkImpact !== null && (
              forkImpact.length > 0 ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-1.5">
                    The following {forkImpact.length === 1 ? "product" : `${forkImpact.length} products`} will be updated to use the new version:
                  </p>
                  <ul className="space-y-1">
                    {forkImpact.map((r) => (
                      <li key={r.id} className="text-xs font-medium flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                        {r.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">This filling isn&rsquo;t used in any products yet — only the filling record will be versioned.</p>
              )
            )}
            {forkNestedHosts.length > 0 && (
              <div className="rounded-md bg-muted/50 px-3 py-2 text-xs space-y-1" data-testid="fork-nested-hosts-notice">
                <p className="font-medium">
                  Nested in {forkNestedHosts.length === 1 ? "1 filling" : `${forkNestedHosts.length} fillings`} — these will keep using the old version:
                </p>
                <ul className="space-y-0.5 pl-3">
                  {forkNestedHosts.map((f) => (
                    <li key={f.id} className="list-disc">{f.name}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  Edit{" "}
                  {forkNestedHosts.length === 1 ? "that filling" : "those fillings"}
                  {" "}separately if you want to swap in the new version.
                </p>
              </div>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleFork}
                disabled={forking}
                className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {forking ? "Creating…" : "Create new version"}
              </button>
              <button
                onClick={() => { setShowForkPanel(false); setForkImpact(null); setForkNotes(""); setForkNestedHosts([]); }}
                className="btn-secondary px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* Main column */}
        <div className="min-w-0">
          {hasVersionHistory && (
            <div className="flex border-b border-border mb-4">
              {(["ingredients", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
                    activeTab === tab
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "ingredients" ? "Recipe" : "History"}
                </button>
              ))}
            </div>
          )}

          {activeTab === "history" && hasVersionHistory ? (
            <FillingVersionHistoryTab versions={versionHistory} currentId={fillingId} />
          ) : (
            <div className="space-y-4">
              <IngredientsCard
                fillingId={fillingId}
                filling={filling}
                fillingIngredients={fillingIngredients}
                ingredientMap={ingredientMap}
                totalGrams={totalGrams}
                locked={locked}
                unlocked={unlocked}
                onToggleLock={setUnlocked}
                onIngredientChanged={handleIngredientChanged}
                sensors={sensors}
                onDragEnd={handleDragEnd}
              />
              <MethodCard filling={filling} />
              <NotesCard key={filling.id} filling={filling} />
            </div>
          )}

          {/* Destructive actions */}
          <div className="mt-6 pt-4 border-t border-border space-y-3">
            <button
              onClick={async () => {
                setDuplicating(true);
                try {
                  const newId = await duplicateFilling(fillingId);
                  router.push(`/fillings/${encodeURIComponent(newId)}?new=1&duplicate=1`);
                } finally {
                  setDuplicating(false);
                }
              }}
              disabled={duplicating}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Copy className="w-4 h-4" /> {duplicating ? "Duplicating…" : "Duplicate filling"}
            </button>

            {filling.archived ? (
              <button
                onClick={async () => { await unarchiveFilling(fillingId); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArchiveRestore className="w-4 h-4" /> Unarchive filling
              </button>
            ) : showArchivePanel && archiveImpact ? (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium">Archive &ldquo;{filling.name}&rdquo;</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  This filling has been used in production and cannot be deleted. Archiving will hide it from lists but preserve it for production history.
                </p>

                {/* Block archive while this filling is nested inside others.
                    We don't cascade-remove component edges silently — that would
                    be a surprising side-effect, so the user has to clear the
                    edges manually first. */}
                {archiveImpact.nestedInsideFillings.length > 0 && (
                  <div
                    className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive space-y-1"
                    data-testid="archive-blocked-nested"
                    role="alert"
                  >
                    <p className="font-medium">
                      Can&rsquo;t archive — nested inside{" "}
                      {archiveImpact.nestedInsideFillings.length === 1 ? "another filling" : "other fillings"}.
                    </p>
                    <ul className="space-y-0.5 pl-3">
                      {archiveImpact.nestedInsideFillings.map((f) => (
                        <li key={f.id} className="list-disc">{f.name}</li>
                      ))}
                    </ul>
                    <p className="text-[11px] opacity-80">
                      Remove this filling as a nested component on{" "}
                      {archiveImpact.nestedInsideFillings.length === 1 ? "that filling" : "those fillings"} first.
                    </p>
                  </div>
                )}

                {archiveError && (
                  <p className="text-xs text-destructive" role="alert">{archiveError}</p>
                )}

                {archiveImpact.soleFillingProducts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {archiveImpact.soleFillingProducts.length === 1
                        ? `"${archiveImpact.soleFillingProducts[0].name}" uses only this filling and will have no filling.`
                        : `${archiveImpact.soleFillingProducts.length} products use only this filling and will have no filling:`}
                    </p>
                    {archiveImpact.soleFillingProducts.length > 1 && (
                      <ul className="space-y-1">
                        {archiveImpact.soleFillingProducts.map((r) => (
                          <li key={r.id} className="text-xs font-medium flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-warning shrink-0" />
                            {r.name}
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={archiveSoleProducts}
                        onChange={(e) => setArchiveSoleProducts(e.target.checked)}
                        className="rounded border-border"
                      />
                      Archive {archiveImpact.soleFillingProducts.length === 1 ? "this product" : "these products"} too
                    </label>
                  </div>
                )}

                {archiveImpact.multiFillingProducts.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      {archiveImpact.multiFillingProducts.length === 1
                        ? `"${archiveImpact.multiFillingProducts[0].name}" has other fillings — this filling can be removed and fill percentages redistributed.`
                        : `${archiveImpact.multiFillingProducts.length} products have other fillings — this filling can be removed and fill percentages redistributed:`}
                    </p>
                    {archiveImpact.multiFillingProducts.length > 1 && (
                      <ul className="space-y-1">
                        {archiveImpact.multiFillingProducts.map((r) => (
                          <li key={r.id} className="text-xs font-medium flex items-center gap-1.5">
                            <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                            {r.name}
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={removeFromMultiProducts}
                        onChange={(e) => setRemoveFromMultiProducts(e.target.checked)}
                        className="rounded border-border"
                      />
                      Remove from {archiveImpact.multiFillingProducts.length === 1 ? "this product" : "these products"} and redistribute fill %
                    </label>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={async () => {
                      setArchiving(true);
                      setArchiveError(null);
                      try {
                        await archiveFillingWithCleanup(fillingId, {
                          archiveSoleProducts,
                          removeFromMultiProducts,
                        });
                        router.replace("/fillings");
                      } catch (err) {
                        setArchiveError(err instanceof Error ? err.message : "Archive failed");
                      } finally {
                        setArchiving(false);
                      }
                    }}
                    disabled={archiving || archiveImpact.nestedInsideFillings.length > 0}
                    className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                  >
                    {archiving ? "Archiving…" : "Archive filling"}
                  </button>
                  <button
                    onClick={() => { setShowArchivePanel(false); setArchiveImpact(null); setArchiveSoleProducts(true); setRemoveFromMultiProducts(true); setArchiveError(null); }}
                    className="btn-secondary px-4 py-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : fillingProduced && (
              <button
                onClick={async () => {
                  const impact = await getFillingArchiveImpact(fillingId);
                  setArchiveImpact(impact);
                  setArchiveSoleProducts(true);
                  setRemoveFromMultiProducts(true);
                  setShowArchivePanel(true);
                  setConfirmDelete(false);
                  setShowForkPanel(false);
                }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Archive className="w-4 h-4" /> Archive filling
              </button>
            )}

            {!filling.archived && !fillingProduced && (
              confirmDelete ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-destructive">Delete this filling?</p>
                  <p className="text-xs text-muted-foreground">This will permanently remove the filling and all its ingredient data. This cannot be undone.</p>

                  {/* Multi-filling products — fill % will be redistributed */}
                  {deleteImpact && deleteImpact.multiFillingProducts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">
                        {deleteImpact.multiFillingProducts.length === 1
                          ? `"${deleteImpact.multiFillingProducts[0].name}" also uses this filling — it will be removed and fill percentages redistributed across the remaining fillings.`
                          : `${deleteImpact.multiFillingProducts.length} products also use this filling — it will be removed and fill percentages redistributed:`}
                      </p>
                      {deleteImpact.multiFillingProducts.length > 1 && (
                        <ul className="space-y-1">
                          {deleteImpact.multiFillingProducts.map((r) => (
                            <li key={r.id} className="text-xs font-medium flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-primary shrink-0" />
                              {r.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Sole-filling products that have been produced — will be archived */}
                  {archivableProducts.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">
                        {archivableProducts.length === 1
                          ? `"${archivableProducts[0].name}" has been used in production and will be archived (not deleted).`
                          : `${archivableProducts.length} products have been used in production and will be archived:`}
                      </p>
                      {archivableProducts.length > 1 && (
                        <ul className="space-y-1">
                          {archivableProducts.map((r) => (
                            <li key={r.id} className="text-xs font-medium flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-warning shrink-0" />
                              {r.name}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Sole-filling products that have NOT been produced — can be deleted */}
                  {deletableProducts.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {deletableProducts.length === 1
                          ? `"${deletableProducts[0].name}" has no other fillings and has never been produced.`
                          : `${deletableProducts.length} products have no other fillings and have never been produced:`}
                      </p>
                      {deletableProducts.length > 1 && (
                        <ul className="space-y-1">
                          {deletableProducts.map((r) => (
                            <li key={r.id} className="text-xs font-medium flex items-center gap-1.5">
                              <span className="w-1 h-1 rounded-full bg-destructive shrink-0" />
                              {r.name}
                            </li>
                          ))}
                        </ul>
                      )}
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={removeOrphanedProducts}
                          onChange={(e) => setRemoveOrphanedProducts(e.target.checked)}
                          className="rounded border-border"
                        />
                        Also delete {deletableProducts.length === 1 ? "this product" : "these products"}
                      </label>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await deleteFillingWithCleanup(fillingId, {
                          removeOrphanedProducts,
                          archivableProductIds: archivableProducts.map((r) => r.id!),
                        });
                        router.replace("/fillings");
                      }}
                      className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
                    >
                      Yes, delete filling
                    </button>
                    <button
                      onClick={() => { setConfirmDelete(false); setDeleteImpact(null); setDeletableProducts([]); setArchivableProducts([]); setRemoveOrphanedProducts(true); }}
                      className="btn-secondary px-4 py-2"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={async () => {
                    const impact = await getFillingDeleteImpact(fillingId);
                    setDeleteImpact(impact);
                    const deletable: Product[] = [];
                    const archivable: Product[] = [];
                    for (const r of impact.soleFillingProducts) {
                      if (await hasProductBeenProduced(r.id!)) {
                        archivable.push(r);
                      } else {
                        deletable.push(r);
                      }
                    }
                    setDeletableProducts(deletable);
                    setArchivableProducts(archivable);
                    setRemoveOrphanedProducts(true);
                    setConfirmDelete(true);
                    setShowForkPanel(false);
                  }}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete filling
                </button>
              )
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:sticky lg:top-4 space-y-4">
          <PropertiesCard key={filling.id} fillingId={fillingId} filling={filling} statusSuggestions={statusSuggestions} />
          <DerivedCard
            filling={filling}
            totalGrams={totalGrams}
            fillingIngredients={fillingIngredients}
            ingredientMap={ingredientMap}
            hasNestedComponents={ownComponents.length > 0}
          />
          <div className="rounded-lg border border-border bg-card p-3.5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Used in</h3>
            <FillingProductSection fillingId={fillingId} products={products} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Ingredients card (main column) ─────────────────────────────────────────

function IngredientsCard({
  fillingId,
  filling,
  fillingIngredients,
  ingredientMap,
  totalGrams,
  locked,
  unlocked,
  onToggleLock,
  onIngredientChanged,
  sensors,
  onDragEnd,
}: {
  fillingId: string;
  filling: Filling;
  fillingIngredients: FillingIngredient[];
  ingredientMap: Map<string, Ingredient>;
  totalGrams: number;
  locked: boolean;
  unlocked: boolean;
  onToggleLock: (next: boolean) => void;
  onIngredientChanged: () => void;
  sensors: SensorDescriptor<SensorOptions>[];
  onDragEnd: (event: DragEndEvent) => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Ingredients</h2>
      </div>

      <div className="p-4 space-y-3">
        {filling.status === "confirmed" && (
          <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${unlocked ? "bg-warning-muted text-warning border border-warning/30" : "bg-muted text-muted-foreground"}`}>
            {unlocked ? (
              <>
                <span className="flex items-center gap-1.5"><LockOpen aria-hidden="true" className="w-3.5 h-3.5" /> Unlocked — be careful editing a confirmed filling</span>
                <button onClick={() => onToggleLock(false)} className="font-medium underline underline-offset-2 ml-3 shrink-0">Lock</button>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1.5"><Lock aria-hidden="true" className="w-3.5 h-3.5" /> Ingredients locked (confirmed)</span>
                <button onClick={() => onToggleLock(true)} className="font-medium underline underline-offset-2 ml-3 shrink-0">Unlock</button>
              </>
            )}
          </div>
        )}

        {fillingIngredients.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={fillingIngredients.map((li) => li.id!)} strategy={verticalListSortingStrategy}>
              <div className="divide-y divide-border rounded-lg border border-border px-3">
                {fillingIngredients.map((li) => {
                  const g = toGrams(li.amount, li.unit);
                  const pct = totalGrams > 0 && g != null ? (g / totalGrams) * 100 : undefined;
                  return (
                    <SortableFillingIngredientRow
                      key={li.id}
                      li={li}
                      ingredient={ingredientMap.get(li.ingredientId)}
                      pct={pct}
                      onChanged={onIngredientChanged}
                      readonly={locked}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <p className="text-xs text-muted-foreground">No ingredients added yet.</p>
        )}

        {!locked && (
          <AddFillingIngredient fillingId={fillingId} onAdded={onIngredientChanged} />
        )}

        <NestedFillingSection fillingId={fillingId} locked={locked} totalGrams={totalGrams} />
      </div>

      {totalGrams > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-t border-border text-xs">
          <span className="font-medium">Total</span>
          <div className="text-right">
            <div className="tabular-nums">
              {fmtG(totalGrams)}g{filling.measuredYieldG != null && " raw"}
            </div>
            {filling.measuredYieldG != null && (() => {
              const loss = totalGrams - filling.measuredYieldG;
              const pct = (loss / totalGrams) * 100;
              return (
                <div className="text-muted-foreground tabular-nums">
                  → {filling.measuredYieldG}g cooked
                  {loss > 0 && <span className="text-warning"> · −{fmtG(loss)}g ({pct.toFixed(1)}%)</span>}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function NestedFillingSection({
  fillingId,
  locked,
  totalGrams,
}: {
  fillingId: string;
  locked: boolean;
  totalGrams: number;
}) {
  const components = useFillingComponents(fillingId);
  const allFillings = useFillings(/* includeArchived */ true);
  // Reads "all" fillings (including archived) so a row whose child got
  // archived after being linked still resolves to a name. The picker
  // (AddFillingComponent) filters archived fillings out of its list.
  const fillingsById = new Map(allFillings.filter((f) => f.id != null).map((f) => [f.id!, f]));
  const existingChildIds = components.map((c) => c.childFillingId);

  // Collapse to nothing when there's no list and it's locked — keeps the
  // card clean for fillings that don't use this feature at all.
  if (components.length === 0 && locked) return null;

  return (
    <div className="pt-1">
      <h3 className="text-xs font-medium text-muted-foreground mb-2">
        Nested fillings ({components.length})
      </h3>
      <NestedFillingList
        components={components}
        fillingsById={fillingsById}
        editable={!locked}
        totalGrams={totalGrams}
      />
      {!locked && (
        <AddFillingComponent
          fillingId={fillingId}
          existingChildIds={existingChildIds}
        />
      )}
    </div>
  );
}

// ─── Method card (main column) ──────────────────────────────────────────────

function MethodCard({ filling }: { filling: Filling }) {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Method</h2>
      </div>
      <div className="p-4">
        <StepListEditor
          value={filling.instructions}
          onChange={(next) => { updateFillingFields(filling.id!, { instructions: next }); }}
          placeholder="Describe this step…"
        />
      </div>
    </div>
  );
}

// ─── Notes card (main column) ───────────────────────────────────────────────

function NotesCard({ filling }: { filling: Filling }) {
  // Keyed by `filling.id` at the call site, so this only remounts (resetting
  // local state) when navigating to a genuinely different filling — not on
  // every autosave-triggered re-render of the same record.
  const [value, setValue] = useState(filling.description ?? "");
  const lastSavedRef = useRef(filling.description ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    if (next === lastSavedRef.current) return;
    lastSavedRef.current = next;
    updateFillingFields(filling.id!, { description: next });
  }

  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => commit(next), 600);
  }

  function handleBlur() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    commit(value);
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold">Notes</h2>
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        placeholder="Tasting notes, substitutions, what to try next time…"
        rows={4}
        className="w-full resize-y border-0 bg-transparent px-4 py-3 text-sm focus:outline-none placeholder:text-muted-foreground/50"
      />
    </div>
  );
}

// ─── Sidebar: Properties card ───────────────────────────────────────────────

function PropertiesCard({
  fillingId,
  filling,
  statusSuggestions,
}: {
  fillingId: string;
  filling: Filling;
  statusSuggestions: string[];
}) {
  // Keyed by `filling.id` at the call site, so this only remounts (resetting
  // local state) when navigating to a genuinely different filling — not on
  // every autosave-triggered re-render of the same record.
  const [status, setStatus] = useState(filling.status ?? "");
  const [shelfLifeWeeks, setShelfLifeWeeks] = useState(filling.shelfLifeWeeks != null ? String(filling.shelfLifeWeeks) : "");
  const [measuredYieldG, setMeasuredYieldG] = useState(filling.measuredYieldG != null ? String(filling.measuredYieldG) : "");

  function commitStatus() {
    const trimmed = status.trim();
    if (trimmed === (filling.status ?? "")) return;
    updateFillingFields(fillingId, { status: trimmed || undefined });
  }

  function commitShelfLife() {
    const parsed = parseFloat(shelfLifeWeeks);
    const next = !isNaN(parsed) && parsed > 0 ? parsed : undefined;
    if (next === filling.shelfLifeWeeks) return;
    updateFillingFields(fillingId, { shelfLifeWeeks: next });
  }

  function commitYield() {
    const parsed = parseFloat(measuredYieldG);
    const next = !isNaN(parsed) && parsed > 0 ? parsed : undefined;
    if (next === filling.measuredYieldG) return;
    updateFillingFields(fillingId, { measuredYieldG: next });
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">Properties</h3>
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/60 transition-colors">
          <span className="text-xs text-muted-foreground shrink-0">Category</span>
          <CategoryPicker
            category={filling.category}
            onCategoryChange={(cat) => updateFillingFields(fillingId, { category: cat })}
            hideLabel
            selectClassName="text-sm font-medium bg-transparent text-right border-0 focus:outline-none max-w-[65%]"
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/60 transition-colors">
          <span className="text-xs text-muted-foreground shrink-0">Status</span>
          <input
            type="text"
            list="filling-status-list"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            onBlur={commitStatus}
            placeholder="e.g. testing"
            className="text-sm font-medium bg-transparent text-right border-0 focus:outline-none max-w-[65%] placeholder:font-normal placeholder:text-muted-foreground/50"
          />
          {statusSuggestions.length > 0 && (
            <datalist id="filling-status-list">
              {statusSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/60 transition-colors">
          <span className="text-xs text-muted-foreground shrink-0">Shelf life</span>
          <div className="flex items-baseline gap-1">
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={shelfLifeWeeks}
              onChange={(e) => setShelfLifeWeeks(e.target.value)}
              onBlur={commitShelfLife}
              placeholder="—"
              className="w-12 text-sm font-medium bg-transparent text-right border-0 focus:outline-none"
            />
            <span className="text-xs text-muted-foreground">weeks</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-muted/60 transition-colors">
          <span className="text-xs text-muted-foreground shrink-0">Measured yield</span>
          <div className="flex items-baseline gap-1">
            <input
              type="number"
              min="0"
              step="1"
              value={measuredYieldG}
              onChange={(e) => setMeasuredYieldG(e.target.value)}
              onBlur={commitYield}
              placeholder="—"
              className="w-14 text-sm font-medium bg-transparent text-right border-0 focus:outline-none"
            />
            <span className="text-xs text-muted-foreground">g</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar: Derived card ───────────────────────────────────────────────────

function DerivedCard({
  filling,
  totalGrams,
  fillingIngredients,
  ingredientMap,
  hasNestedComponents,
}: {
  filling: Filling;
  totalGrams: number;
  fillingIngredients: FillingIngredient[];
  ingredientMap: Map<string, Ingredient>;
  hasNestedComponents: boolean;
}) {
  const currencySymbol = useCurrencySymbol();
  // Nested-filling cost rollup isn't implemented yet — showing a partial total
  // from only the direct ingredients would be misleading, so we don't.
  const recipeCost = hasNestedComponents ? null : computeFillingRecipeCost(fillingIngredients, ingredientMap);
  const costPerKg = recipeCost && totalGrams > 0 ? (recipeCost.totalCost / totalGrams) * 1000 : null;

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3.5 space-y-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Derived</h3>

      {filling.allergens.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Allergens</p>
          <div className="flex flex-wrap gap-1">
            {filling.allergens.map((a) => (
              <span
                key={a}
                className="rounded-full border border-amber-300 bg-amber-50 text-amber-800 px-2 py-0.5 text-[11px]"
              >
                {allergenLabel(a)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Recipe weight</span>
        <span className="font-medium tabular-nums">
          {totalGrams > 0 ? `${fmtG(totalGrams)}g` : "—"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">Cost per kg</span>
        <span className="font-medium tabular-nums">
          {costPerKg != null ? `${currencySymbol}${costPerKg.toFixed(2)}` : "—"}
        </span>
      </div>
      {recipeCost && recipeCost.missingIngredientNames.length > 0 && (
        <p className="text-[11px] text-status-warn bg-status-warn-bg rounded-md px-2 py-1">
          Missing pricing for {recipeCost.missingIngredientNames.join(", ")} — cost is incomplete.
        </p>
      )}
      {hasNestedComponents && (
        <p className="text-[11px] text-muted-foreground/80">
          Cost isn&rsquo;t shown — this recipe nests other fillings, which aren&rsquo;t costed yet.
        </p>
      )}
    </div>
  );
}

// ─── Sidebar: Used-in / add-to-product section ──────────────────────────────

function FillingProductSection({ fillingId, products }: { fillingId: string; products: Product[] }) {
  const router = useRouter();
  const allProducts = useProductsList();
  const [action, setAction] = useState<"none" | "create" | "add">("none");
  const [newProductName, setNewProductName] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const usedIds = new Set(products.map((b) => b.id));
  const filteredProducts = allProducts.filter(
    (r) => r.id != null && !usedIds.has(r.id) && (!productSearch || r.name.toLowerCase().includes(productSearch.toLowerCase()))
  );

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!newProductName.trim() || adding) return;
    setAdding(true);
    try {
      const productId = await saveProduct({ name: newProductName.trim() });
      await addFillingToProduct(productId as string, fillingId);
      router.push(`/products/${encodeURIComponent(productId as string)}?new=1`);
    } finally {
      setAdding(false);
    }
  }

  async function handleAddToProduct(productId: string) {
    if (adding) return;
    setAdding(true);
    try {
      await addFillingToProduct(productId, fillingId);
      setAction("none");
      setProductSearch("");
    } finally {
      setAdding(false);
    }
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && action !== "none") {
        setAction("none");
        setNewProductName("");
        setProductSearch("");
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [action]);

  return (
    <div>
      <UsedInPanel
        singular="product"
        plural="products"
        items={products.map((product) => ({
          id: product.id ?? "",
          name: product.name,
          href: `/products/${encodeURIComponent(product.id ?? "")}`,
          photo: product.photo,
        }))}
        className={products.length > 0 ? "mb-3" : ""}
      />

      {action === "none" && (
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() => setAction("create")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New product with this filling
          </button>
          {allProducts.length > 0 && (
            <button
              onClick={() => setAction("add")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add to existing product
            </button>
          )}
        </div>
      )}

      {action === "create" && (
        <form onSubmit={handleCreateProduct} className="rounded-lg border border-border bg-card p-3 space-y-2">
          <input
            type="text"
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            placeholder="Product name…"
            aria-label="New product name"
            required
            autoFocus
            className="input"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={!newProductName.trim() || adding} className="btn-primary flex-1 py-2 text-sm disabled:opacity-50">
              {adding ? "Creating…" : "Create product"}
            </button>
            <button type="button" onClick={() => { setAction("none"); setNewProductName(""); }} className="btn-secondary px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      {action === "add" && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Search products…"
              aria-label="Search products"
              autoFocus
              className="input !pl-8 text-sm"
            />
          </div>
          {filteredProducts.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto divide-y divide-border">
              {filteredProducts.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => handleAddToProduct(r.id!)}
                    disabled={adding}
                    className="w-full text-left px-2 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    <div className="w-6 h-6 rounded bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-xs font-medium">
                      {r.name.charAt(0)}
                    </div>
                    <span className="truncate">{r.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground py-2">
              {productSearch ? "No matching products." : "No products available."}
            </p>
          )}
          <button onClick={() => { setAction("none"); setProductSearch(""); }} className="btn-secondary w-full py-1.5 text-sm">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── History tab ─────────────────────────────────────────────────────────────

function FillingVersionHistoryTab({ versions, currentId }: { versions: Filling[]; currentId: string }) {
  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No version history yet.</p>;
  }

  // Show newest first
  const sorted = [...versions].sort((a, b) => (b.version ?? 1) - (a.version ?? 1));

  return (
    <ul className="space-y-2">
      {sorted.map((v) => {
        const isCurrent = v.id === currentId;
        const dateStr = v.createdAt
          ? new Date(v.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
          : null;
        return (
          <li
            key={v.id}
            className={`rounded-lg border bg-card p-3 ${isCurrent ? "border-primary/40" : "border-border"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                  v{v.version ?? 1}
                </span>
                {isCurrent && (
                  <span className="text-xs font-medium text-primary">current</span>
                )}
              </div>
              {dateStr && (
                <span className="text-xs text-muted-foreground shrink-0">{dateStr}</span>
              )}
            </div>
            {v.versionNotes && (
              <p className="text-sm mt-1.5">{v.versionNotes}</p>
            )}
            {!isCurrent && (
              <p className="text-xs text-muted-foreground mt-1">
                Archived
                {v.supersededAt
                  ? ` · ${new Date(v.supersededAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
                  : ""}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Loading / not-found states ──────────────────────────────────────────────

function FillingDetailSkeleton() {
  return (
    <div className="px-4 pt-6 pb-8 animate-pulse" aria-busy="true" aria-label="Loading filling">
      <div className="h-4 w-16 bg-muted rounded mb-4" />
      <div className="h-7 w-48 bg-muted rounded mb-2" />
      <div className="h-4 w-64 bg-muted rounded mb-6" />
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5">
        <div className="space-y-4">
          <div className="h-40 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
        </div>
        <div className="space-y-4">
          <div className="h-32 bg-muted rounded-lg" />
          <div className="h-24 bg-muted rounded-lg" />
          <div className="h-28 bg-muted rounded-lg" />
        </div>
      </div>
    </div>
  );
}

function FillingNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center gap-1.5">
      <p className="text-sm font-medium">This filling doesn&rsquo;t exist.</p>
      <p className="text-sm text-muted-foreground">It may have been deleted.</p>
      <Link href="/fillings" className="text-sm text-primary underline underline-offset-2 mt-2">
        Back to Fillings
      </Link>
    </div>
  );
}
