"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useFilling, useFillingIngredients, useIngredients, saveFilling, deleteFilling, deleteFillingWithCleanup, archiveFillingWithCleanup, unarchiveFilling, updateFillingAllergens, useFillingUsage, reorderFillingIngredients, useFillingVersionHistory, forkFillingVersion, getFillingForkImpact, getFillingDeleteImpact, hasProductBeenProduced, hasFillingBeenProduced, getFillingArchiveImpact, useProductsList, saveProduct, addFillingToProduct, duplicateFilling, useAllFillingStatuses } from "@/lib/hooks";
import { useSpaId } from "@/lib/use-spa-id";
import type { FillingArchiveImpact, FillingDeleteImpact } from "@/lib/hooks";
import { SortableFillingIngredientRow } from "@/components/sortable-filling-ingredient-row";
import { AddFillingIngredient } from "@/components/add-filling-ingredient";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import { CategoryPicker } from "@/components/category-picker";
import { ArrowLeft, Pencil, Trash2, Lock, LockOpen, GitBranch, Plus, Search, Copy, ArchiveRestore, Archive } from "lucide-react";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { StepListEditor, StepList } from "@/components/step-list-editor";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import type { Ingredient, Product } from "@/types";
import { DEFAULT_FILLING_STATUSES, allergenLabel } from "@/types";

export default function FillingDetailPage() {
  const fillingId = useSpaId("fillings");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const isForked = searchParams.get("forked") === "1";
  const isDuplicate = searchParams.get("duplicate") === "1";
  const filling = useFilling(fillingId);
  const fillingIngredients = useFillingIngredients(fillingId);
  const allIngredients = useIngredients();
  const products = useFillingUsage(fillingId);
  const versionHistory = useFillingVersionHistory(fillingId);
  const existingStatuses = useAllFillingStatuses();
  const statusSuggestions = [...new Set([...DEFAULT_FILLING_STATUSES, ...existingStatuses])].sort();

  const [activeTab, setActiveTab] = useState<"ingredients" | "history">("ingredients");
  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [unlocked, setUnlocked] = useState(isForked);
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [status, setStatus] = useState("");
  const [shelfLifeWeeks, setShelfLifeWeeks] = useState<string>("");
  const [syncedId, setSyncedId] = useState<string | null>(null);

  // Fork state
  const [showForkPanel, setShowForkPanel] = useState(false);
  const [forkNotes, setForkNotes] = useState("");
  const [forkImpact, setForkImpact] = useState<Product[] | null>(null);
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

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showForkPanel) { setShowForkPanel(false); setForkNotes(""); setForkImpact(null); }
      else if (showArchivePanel) { setShowArchivePanel(false); setArchiveImpact(null); }
      else if (confirmDelete) { setConfirmDelete(false); }
      else if (editing) { handleCancel(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showForkPanel, showArchivePanel, confirmDelete, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync form state when filling loads (also on new fillings, which start in edit mode)
  if (filling && filling.id && filling.id !== syncedId && (!editing || isNew)) {
    setCategory(filling.category || "");
    setDescription(filling.description || "");
    setInstructions(filling.instructions || "");
    setStatus(filling.status || "");
    setShelfLifeWeeks(filling.shelfLifeWeeks != null ? String(filling.shelfLifeWeeks) : "");
    setSyncedId(filling.id);
  }

  // Check production status on load to determine Archive vs Delete
  useEffect(() => {
    if (filling?.id && !filling.archived) {
      hasFillingBeenProduced(filling.id).then(setFillingProduced);
    }
  }, [filling?.id, filling?.archived]);

  const [savedOnce, setSavedOnce] = useState(false);
  const formDirty = editing && filling != null && (
    category !== (filling.category || "") ||
    description !== (filling.description || "") ||
    instructions !== (filling.instructions || "") ||
    status !== (filling.status || "") ||
    shelfLifeWeeks !== (filling.shelfLifeWeeks != null ? String(filling.shelfLifeWeeks) : "")
  );
  const isDirty = (isNew && !savedOnce) || formDirty;

  const handleConfirmLeave = useCallback(async () => {
    if (isNew && filling?.id) {
      await deleteFilling(filling.id);
    }
  }, [isNew, filling?.id]);

  const { safeBack } = useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  const ingredientMap = new Map<string, Ingredient>();
  for (const ing of allIngredients) {
    if (ing.id != null) ingredientMap.set(ing.id, ing);
  }

  function toGrams(amount: number, unit: string): number | null {
    if (unit === "g" || unit === "ml") return amount;
    if (unit === "kg" || unit === "L") return amount * 1000;
    return null;
  }

  const totalGrams = fillingIngredients.reduce((sum, li) => {
    const g = toGrams(li.amount, li.unit);
    return g != null ? sum + g : sum;
  }, 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  const handleIngredientChanged = useCallback(() => {
    if (fillingId) updateFillingAllergens(fillingId);
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

  if (!fillingId || !filling) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  async function handleSave() {
    if (!fillingId) return;
    const parsedShelfLife = parseFloat(shelfLifeWeeks);
    await saveFilling({
      ...filling!,
      category: category || "",
      description: (description || "").trim(),
      instructions: (instructions || "").trim(),
      status: status.trim() || undefined,
      shelfLifeWeeks: !isNaN(parsedShelfLife) && parsedShelfLife > 0 ? parsedShelfLife : undefined,
    });
    setEditing(false);
    setSavedOnce(true);
    if (isNew) router.replace(`/fillings/${encodeURIComponent(fillingId)}`);
  }

  function handleCancel() {
    setCategory(filling!.category);
    setDescription(filling!.description);
    setInstructions(filling!.instructions);
    setStatus(filling!.status || "");
    setShelfLifeWeeks(filling!.shelfLifeWeeks != null ? String(filling!.shelfLifeWeeks) : "");
    setEditing(false);
    if (isNew && fillingId) router.replace(`/fillings/${encodeURIComponent(fillingId)}`);
  }

  function startEditing() {
    setCategory(filling!.category);
    setDescription(filling!.description);
    setInstructions(filling!.instructions);
    setStatus(filling!.status || "");
    setShelfLifeWeeks(filling!.shelfLifeWeeks != null ? String(filling!.shelfLifeWeeks) : "");
    setEditing(true);
  }

  async function handleOpenForkPanel() {
    if (!fillingId) return;
    const { products } = await getFillingForkImpact(fillingId);
    setForkImpact(products);
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

  const versionLabel = filling.version != null ? `v${filling.version}` : null;
  // Show history tab only if this filling is part of a version chain
  const hasVersionHistory = versionHistory.length > 1 || filling.rootId != null;

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <button
          onClick={() => safeBack()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="px-4 pb-4 space-y-4">
        {/* Name row — always visible, inline-editable via pencil on name */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
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
          {!editing && (
            <button
              onClick={startEditing}
              aria-label="Edit filling"
              className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
            >
              <Pencil aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Category subtitle — shown below name in read mode */}
        {!editing && filling.category && (
          <p className="text-sm text-primary -mt-2">
            {filling.category}
          </p>
        )}

        {editing ? (
          /* ── Edit form (all fields except name) ── */
          <div className="space-y-3">
            <CategoryPicker
              category={category}
              onCategoryChange={(cat) => setCategory(cat)}
            />
            <div>
              <label className="label">Notes</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Notes…"
                rows={3}
                className="input resize-none"
              />
            </div>
            <div>
              <label className="label">Status</label>
              <input
                type="text"
                list="filling-status-list"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="input"
                placeholder="e.g. to try, testing, confirmed"
              />
              {statusSuggestions.length > 0 && (
                <datalist id="filling-status-list">
                  {statusSuggestions.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </div>
            <div>
              <label className="label">Shelf life (weeks)</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={shelfLifeWeeks}
                onChange={(e) => setShelfLifeWeeks(e.target.value)}
                placeholder="e.g. 8"
                className="input w-32"
              />
              <p className="text-xs text-muted-foreground mt-1">How long this filling stays fresh. Used to auto-suggest product shelf life and track previous batch freshness.</p>
            </div>
            <div>
              <label className="label">Instructions</label>
              <StepListEditor
                value={instructions}
                onChange={setInstructions}
                placeholder="Describe this step…"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                className="btn-primary px-3 py-1.5"
              >
                Save
              </button>
              <button
                onClick={handleCancel}
                className="btn-secondary px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* ── Read-only view ── */
          <>
            {filling.description && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{filling.description}</p>
            )}
            {filling.status && (
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                filling.status === "confirmed" ? "bg-success-muted text-success" :
                filling.status === "testing"   ? "bg-warning-muted text-warning" :
                filling.status === "to try"    ? "bg-muted text-muted-foreground" :
                                                 "bg-sky-50 text-sky-700 border border-sky-200"
              }`}>
                {filling.status.charAt(0).toUpperCase() + filling.status.slice(1)}
              </span>
            )}
            {filling.shelfLifeWeeks != null && (
              <p className="text-xs text-muted-foreground">Shelf life: {filling.shelfLifeWeeks} weeks</p>
            )}
            {filling.allergens.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {filling.allergens.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-amber-300 bg-amber-50 text-amber-800 px-2 py-0.5 text-xs"
                  >
                    {allergenLabel(a)}
                  </span>
                ))}
              </div>
            )}
            {filling.instructions && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">Instructions</h2>
                <StepList text={filling.instructions} />
              </div>
            )}
          </>
        )}
      </div>

      {/* Tab strip — only shown when not editing */}
      {!editing && hasVersionHistory && (
        <div className="flex border-b border-border mb-2 px-4">
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
              {tab === "ingredients" ? "Ingredients" : "Versions"}
            </button>
          ))}
        </div>
      )}

      {/* Ingredients tab */}
      {(!editing && activeTab === "history") ? (
        <FillingVersionHistoryTab versions={versionHistory} currentId={fillingId} />
      ) : (
        <div className="px-4 pb-6">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Ingredients ({fillingIngredients.length})
            </h2>
            {totalGrams > 0 && (
              <span className="text-xs text-muted-foreground">
                Total: {totalGrams % 1 === 0 ? totalGrams : totalGrams.toFixed(1)}g
              </span>
            )}
          </div>
          {editing && filling.status === "confirmed" && (
            <div className={`flex items-center justify-between rounded-lg px-3 py-2 mb-2 text-xs ${unlocked ? "bg-warning-muted text-warning border border-warning/30" : "bg-muted text-muted-foreground"}`}>
              {unlocked ? (
                <>
                  <span className="flex items-center gap-1.5"><LockOpen aria-hidden="true" className="w-3.5 h-3.5" /> Unlocked — be careful editing a confirmed filling</span>
                  <button onClick={() => setUnlocked(false)} className="font-medium underline underline-offset-2 ml-3 shrink-0">Lock</button>
                </>
              ) : (
                <>
                  <span className="flex items-center gap-1.5"><Lock aria-hidden="true" className="w-3.5 h-3.5" /> Ingredients locked (confirmed)</span>
                  <button onClick={() => setUnlocked(true)} className="font-medium underline underline-offset-2 ml-3 shrink-0">Unlock</button>
                </>
              )}
            </div>
          )}
          {fillingIngredients.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fillingIngredients.map((li) => li.id!)} strategy={verticalListSortingStrategy}>
                <div className="divide-y divide-border rounded-lg border border-border bg-card px-3">
                  {fillingIngredients.map((li) => {
                    const g = toGrams(li.amount, li.unit);
                    const pct = totalGrams > 0 && g != null ? (g / totalGrams) * 100 : undefined;
                    return (
                      <SortableFillingIngredientRow
                        key={li.id}
                        li={li}
                        ingredient={ingredientMap.get(li.ingredientId)}
                        pct={pct}
                        onChanged={handleIngredientChanged}
                        readonly={!editing || (filling.status === "confirmed" && !unlocked)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          ) : (
            <p className="text-xs text-muted-foreground mb-2">No ingredients added yet.</p>
          )}
          {editing && (
            <div className="mt-2">
              <AddFillingIngredient fillingId={fillingId} onAdded={handleIngredientChanged} />
            </div>
          )}
        </div>
      )}

      {!editing && activeTab === "ingredients" && (
        <FillingProductSection fillingId={fillingId} products={products} />
      )}

      {!editing && (
        <div className="px-4 pb-8 border-t border-border pt-4 space-y-4">
          {/* Create new version */}
          {showForkPanel ? (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
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
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleFork}
                  disabled={forking}
                  className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  {forking ? "Creating…" : "Create new version"}
                </button>
                <button
                  onClick={() => { setShowForkPanel(false); setForkImpact(null); setForkNotes(""); }}
                  className="btn-secondary px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            !filling.supersededAt && (
              <button
                onClick={handleOpenForkPanel}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                title="Create a new version of this filling, archiving the current one"
              >
                <GitBranch className="w-4 h-4" /> Create new version
              </button>
            )
          )}

          {/* Duplicate */}
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

          {/* Unarchive (for archived fillings) */}
          {filling.archived && (
            <button
              onClick={async () => { await unarchiveFilling(fillingId); }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArchiveRestore className="w-4 h-4" /> Unarchive filling
            </button>
          )}

          {/* Archive (for produced fillings) */}
          {!filling.archived && showArchivePanel && archiveImpact ? (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium">Archive &ldquo;{filling.name}&rdquo;</p>
              </div>
              <p className="text-xs text-muted-foreground">
                This filling has been used in production and cannot be deleted. Archiving will hide it from lists but preserve it for production history.
              </p>

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
                    try {
                      await archiveFillingWithCleanup(fillingId, {
                        archiveSoleProducts,
                        removeFromMultiProducts,
                      });
                      router.replace("/fillings");
                    } finally {
                      setArchiving(false);
                    }
                  }}
                  disabled={archiving}
                  className="btn-primary px-4 py-2 text-sm disabled:opacity-50"
                >
                  {archiving ? "Archiving…" : "Archive filling"}
                </button>
                <button
                  onClick={() => { setShowArchivePanel(false); setArchiveImpact(null); setArchiveSoleProducts(true); setRemoveFromMultiProducts(true); }}
                  className="btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : !filling.archived && !showArchivePanel && fillingProduced && (
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

          {/* Delete (only for non-archived, non-produced fillings) */}
          {!filling.archived && !fillingProduced && (
            <>
              {confirmDelete ? (
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
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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
    <div className="px-4 pb-6">
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
        <div className="flex gap-2">
          <button
            onClick={() => setAction("create")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New product with this filling
          </button>
          {allProducts.length > 0 && (
            <>
              <span className="text-xs text-border">|</span>
              <button
                onClick={() => setAction("add")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add to existing product
              </button>
            </>
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

function FillingVersionHistoryTab({ versions, currentId }: { versions: import("@/types").Filling[]; currentId: string }) {
  if (versions.length === 0) {
    return <p className="text-sm text-muted-foreground px-4 pb-8">No version history yet.</p>;
  }

  // Show newest first
  const sorted = [...versions].sort((a, b) => (b.version ?? 1) - (a.version ?? 1));

  return (
    <ul className="space-y-2 px-4 pb-8">
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
