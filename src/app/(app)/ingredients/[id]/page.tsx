"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";
import { useIngredient, useIngredients, useIngredientUsage, saveIngredient, deleteIngredient, archiveIngredient, unarchiveIngredient, checkIngredientBeforeDelete, useIngredientPriceHistory, deleteIngredientPriceHistoryEntry, setIngredientLowStock, setIngredientOutOfStock, markIngredientOrdered, useCurrencySymbol, useCurrentCoatingMappings } from "@/lib/hooks";
import type { IngredientDeleteCheck } from "@/lib/hooks";
import { IngredientForm } from "@/components/ingredient-form";
import { COMPOSITION_FIELDS, allergenLabel, costPerGram as computeCostPerGram, type Ingredient } from "@/types";
import { ArrowLeft, Pencil, Layers, Trash2, ChevronDown, X, AlertTriangle, Archive, ArchiveRestore } from "lucide-react";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { StockStatusPanel } from "@/components/stock-status-panel";
import { getNutrientsByMarket, getNutritionPanelTitle, hasNutritionData, formatNutrientValue, percentDailyValue, getMissingMandatoryNutrients, fillDerivedNutrition } from "@/lib/nutrition";
import { useMarketRegion } from "@/lib/hooks";
import Link from "next/link";


export default function IngredientDetailPage() {
  const ingredientId = useSpaId("ingredients");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const sym = useCurrencySymbol();
  const ingredient = useIngredient(ingredientId);
  const allIngredients = useIngredients();
  const usage = useIngredientUsage(ingredientId);
  const priceHistory = useIngredientPriceHistory(ingredientId);
  const manufacturers = [...new Set(allIngredients.map((i) => i.manufacturer).filter(Boolean))];
  const ingredientBrands = [...new Set(allIngredients.map((i) => i.brand).filter(Boolean))] as string[];
  const ingredientVendors = [...new Set(allIngredients.map((i) => i.vendor).filter(Boolean))] as string[];
  const sources = [...new Set(allIngredients.map((i) => i.source).filter(Boolean))];
  const currentMappings = useCurrentCoatingMappings();
  const [priceHistoryExpanded, setPriceHistoryExpanded] = useState(false);
  const [pendingRemovePriceEntry, setPendingRemovePriceEntry] = useState<string | null>(null);

  const [editing, setEditing] = useState(isNew);
  const [formDirty, setFormDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteCheck, setDeleteCheck] = useState<IngredientDeleteCheck | null>(null);
  const [activeTab, setActiveTab] = useState<"details" | "composition" | "allergens" | "pricing" | "nutrition" | "shell">("details");
  const [draftCategory, setDraftCategory] = useState("");
  const [shellRevealCount, setShellRevealCount] = useState(0); // increments each time the tab unlocks mid-session
  const market = useMarketRegion();

  // While editing, tabs follow the in-progress form value; otherwise the saved value.
  const effectiveCategory = editing ? draftCategory : (ingredient?.category ?? "");
  const showShellTab = effectiveCategory === "Chocolate";

  // Seed draftCategory from the saved value while not editing, so entering edit mode
  // doesn't briefly flip showShellTab off (which would kick the Shell tab back to Details
  // before the form's own effect reports the category).
  useEffect(() => {
    if (!editing) setDraftCategory(ingredient?.category ?? "");
  }, [editing, ingredient?.category]);

  // If the user switches away from Chocolate while sitting on the shell tab, step back to details.
  useEffect(() => {
    if (!showShellTab && activeTab === "shell") setActiveTab("details");
  }, [showShellTab, activeTab]);

  // Bump reveal counter when the tab transitions from hidden → visible (not on initial load).
  const hasMountedRef = useRef(false);
  const prevShowShellRef = useRef(showShellTab);
  useEffect(() => {
    if (hasMountedRef.current && showShellTab && !prevShowShellRef.current) {
      setShellRevealCount((n) => n + 1);
    }
    hasMountedRef.current = true;
    prevShowShellRef.current = showShellTab;
  }, [showShellTab]);

  const [savedOnce, setSavedOnce] = useState(false);
  const formIsDirty = editing && formDirty;
  const isDirty = (isNew && !savedOnce) || formIsDirty;
  const handleConfirmLeave = useCallback(async () => {
    if (isNew && ingredient?.id) {
      await deleteIngredient(ingredient.id);
    }
  }, [isNew, ingredient?.id]);
  const { safeBack } = useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (editing) handleCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ingredientId || !ingredient) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  function handleSaved() {
    setSavedOnce(true);
    setEditing(false);
    setFormDirty(false);
    if (isNew && ingredientId) router.replace(`/ingredients/${encodeURIComponent(ingredientId)}`);
  }

  function handleCancel() {
    setEditing(false);
    setFormDirty(false);
    if (isNew && ingredientId) router.replace(`/ingredients/${encodeURIComponent(ingredientId)}`);
  }

  const tags = ingredient.allergens.filter(Boolean);

  // Use the shared utility — it derives gramsPerUnit from the unit for g/kg, so
  // legacy records with a wrong stored gramsPerUnit still render the right value.
  const costPerGram = computeCostPerGram(ingredient);

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <button onClick={() => safeBack()} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="px-4 pb-4">
        {/* Name + edit button — always visible above tabs */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <InlineNameEditor
              name={ingredient.name}
              onSave={async (n) => { await saveIngredient({ ...ingredient, name: n }); }}
              className="text-xl font-bold"
            />
            {ingredient.archived && (
              <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                <Archive className="w-3 h-3" /> Archived
              </span>
            )}
          </div>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
              aria-label="Edit ingredient"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {!editing && (
          <>
            {/* Subtitle — manufacturer, brand, vendor, source, category */}
            {(ingredient.manufacturer || ingredient.brand || ingredient.vendor || ingredient.source || ingredient.category) && (
              <div className="mb-3">
                {ingredient.manufacturer && (
                  <p className="text-sm text-muted-foreground mt-0.5">{ingredient.manufacturer}</p>
                )}
                {ingredient.brand && (
                  <p className="text-sm text-muted-foreground">{ingredient.brand}</p>
                )}
                {ingredient.vendor && (
                  <p className="text-sm text-muted-foreground">{ingredient.vendor}</p>
                )}
                {ingredient.source && (
                  <p className="text-sm text-muted-foreground">{ingredient.source}</p>
                )}
                {ingredient.category && (
                  <p className="text-sm text-primary mt-0.5">{ingredient.category}</p>
                )}
              </div>
            )}

            {/* Stock status */}
            <div className="mb-4">
              <StockStatusPanel
                lowStock={ingredient.lowStock}
                lowStockOrdered={ingredient.lowStockOrdered}
                outOfStock={ingredient.outOfStock}
                itemName={ingredient.name}
                onFlagLowStock={() => setIngredientLowStock(ingredientId, true)}
                onFlagOutOfStock={() => setIngredientOutOfStock(ingredientId, true)}
                onMarkOrdered={() => markIngredientOrdered(ingredientId)}
                onClearOutOfStock={() => setIngredientOutOfStock(ingredientId, false)}
                onClearLowStock={() => setIngredientLowStock(ingredientId, false)}
              />
            </div>
          </>
        )}
      </div>

      {/* Tab strip — always visible */}
      <div className="flex border-b border-border mb-4 px-4 overflow-x-auto">
        {(["details", "composition", "allergens", "pricing", "nutrition"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            } ${tab === "details" ? "order-1" : tab === "composition" ? "order-3" : tab === "allergens" ? "order-4" : tab === "pricing" ? "order-5" : "order-6"}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        {showShellTab && (
          <ShellTabButton
            key={`shell-${shellRevealCount}`}
            active={activeTab === "shell"}
            animate={shellRevealCount > 0}
            onClick={() => setActiveTab("shell")}
          />
        )}
      </div>

      <div className="px-4 pb-6">
        {editing ? (
          <IngredientForm
            ingredient={ingredient}
            manufacturers={manufacturers}
            brands={ingredientBrands}
            vendors={ingredientVendors}
            sources={sources}
            onSaved={handleSaved}
            onCancel={handleCancel}
            onDirtyChange={setFormDirty}
            onCategoryChange={setDraftCategory}
            activeSection={activeTab}
          />
        ) : (
          <>
            {/* Details tab */}
            {activeTab === "details" && (
              <div>
                {ingredient.notes && (
                  <div className="mb-4">
                    <h2 className="text-sm font-medium text-muted-foreground mb-1">Notes</h2>
                    <p className="text-sm whitespace-pre-wrap">{ingredient.notes}</p>
                  </div>
                )}

                <UsedInPanel
                  singular="filling"
                  plural="fillings"
                  items={usage.map(({ filling, products }) => ({
                    id: filling.id ?? "",
                    name: filling.name,
                    href: `/fillings/${encodeURIComponent(filling.id ?? "")}`,
                    icon: <Layers aria-hidden="true" className="w-4 h-4" />,
                    subItems: products.map((r) => r.name),
                  }))}
                  emptyMessage={!ingredient.notes ? "This ingredient hasn't been added to any fillings yet." : undefined}
                  className="mt-2"
                />
              </div>
            )}

            {/* Composition tab */}
            {activeTab === "composition" && (
              <div>
                {COMPOSITION_FIELDS.some((f) => (ingredient[f.key] ?? 0) > 0) ? (
                  <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {COMPOSITION_FIELDS.filter((f) => (ingredient[f.key] ?? 0) > 0).map((f) => (
                      <div key={f.key} className="flex justify-between px-3 py-2 text-sm">
                        <span className="text-muted-foreground">{f.label}</span>
                        <span className="font-medium">{ingredient[f.key]}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No composition data recorded. <button onClick={() => setEditing(true)} className="text-primary hover:underline">Edit ingredient</button> to add it.</p>
                )}
              </div>
            )}

            {/* Allergens tab */}
            {activeTab === "allergens" && (
              <div>
                {tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {tags.map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-status-warn-bg text-status-warn border border-status-warn-edge px-3 py-1 text-sm font-medium"
                      >
                        {allergenLabel(a)}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-4">No allergens declared. <button onClick={() => setEditing(true)} className="text-primary hover:underline">Edit ingredient</button> to add them.</p>
                )}
              </div>
            )}

            {/* Pricing tab */}
            {activeTab === "pricing" && (
              <div>
                {ingredient.purchaseCost != null ? (
                  <div className="mb-4">
                    <div className="rounded-lg border border-border bg-card px-3 py-2 space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Purchase cost</span>
                        <span className="font-medium">{sym}{ingredient.purchaseCost}</span>
                      </div>
                      {ingredient.purchaseQty != null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Quantity</span>
                          <span>{ingredient.purchaseQty} {ingredient.purchaseUnit}</span>
                        </div>
                      )}
                      {costPerGram !== null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Cost per gram</span>
                          <span className="font-medium text-primary">
                            {sym}{costPerGram < 0.01 ? costPerGram.toFixed(4) : costPerGram.toFixed(3)}/g
                          </span>
                        </div>
                      )}
                      {ingredient.purchaseDate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Updated</span>
                          <span>
                            {new Intl.DateTimeFormat(undefined, {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            }).format(new Date(ingredient.purchaseDate))}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground mb-4 py-4">No pricing data recorded. <button onClick={() => setEditing(true)} className="text-primary hover:underline">Edit ingredient</button> to add it.</p>
                )}

                {priceHistory.length > 0 && (
                  <div>
                    <button
                      onClick={() => setPriceHistoryExpanded((v) => !v)}
                      className="flex items-center gap-2 w-full text-left mb-2"
                    >
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${priceHistoryExpanded ? "" : "-rotate-90"}`} />
                      <h2 className="text-sm font-medium text-muted-foreground">Price history</h2>
                      <span className="text-xs text-muted-foreground">({priceHistory.length})</span>
                    </button>
                    {priceHistoryExpanded && (
                      <ul className="space-y-1 ml-6">
                        {priceHistory.map((entry) => (
                          <li key={entry.id} className="rounded-md border border-border bg-card px-3 py-2">
                            <div className="flex justify-between items-baseline gap-2">
                              <span className="text-sm font-medium text-primary">
                                {sym}{entry.costPerGram < 0.01 ? entry.costPerGram.toFixed(4) : entry.costPerGram.toFixed(3)}/g
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {new Date(entry.recordedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </span>
                                {pendingRemovePriceEntry === entry.id ? (
                                  <span className="flex items-center gap-1.5 text-xs">
                                    <span className="text-muted-foreground">Delete?</span>
                                    <button
                                      onClick={async () => { await deleteIngredientPriceHistoryEntry(entry.id!); setPendingRemovePriceEntry(null); }}
                                      className="text-red-600 font-medium hover:underline"
                                    >Yes</button>
                                    <button
                                      onClick={() => setPendingRemovePriceEntry(null)}
                                      className="text-muted-foreground hover:underline"
                                    >Cancel</button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => setPendingRemovePriceEntry(entry.id!)}
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                    aria-label="Delete price entry"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {(entry.purchaseCost != null || entry.purchaseQty != null) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {entry.purchaseCost != null && `${sym}${entry.purchaseCost}`}
                                {entry.purchaseQty != null && ` for ${entry.purchaseQty}${entry.purchaseUnit ?? ""}`}
                                {entry.gramsPerUnit != null && ` (${entry.gramsPerUnit}g/unit)`}
                              </p>
                            )}
                            {entry.note && (
                              <p className="text-xs text-muted-foreground italic mt-0.5">{entry.note}</p>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Nutrition tab */}
            {activeTab === "nutrition" && (
              <IngredientNutritionReadView ingredient={ingredient} market={market} onEdit={() => setEditing(true)} />
            )}

            {/* Shell tab (Chocolate only) */}
            {activeTab === "shell" && (
              <ShellTabReadView
                ingredient={ingredient}
                ingredientId={ingredientId}
                currentMappings={currentMappings}
                onEdit={() => setEditing(true)}
              />
            )}

            <div className="mt-8 border-t border-border pt-4 space-y-4">
              {ingredient.archived && (
                <button
                  onClick={async () => { await unarchiveIngredient(ingredientId); }}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArchiveRestore className="w-4 h-4" /> Unarchive ingredient
                </button>
              )}
              {confirmDelete && deleteCheck ? (
                <IngredientDeletePanel
                  check={deleteCheck}
                  onDelete={async () => { await deleteIngredient(ingredientId); router.replace("/ingredients"); }}
                  onArchive={async () => { await archiveIngredient(ingredientId); router.replace("/ingredients"); }}
                  onCancel={() => { setConfirmDelete(false); setDeleteCheck(null); }}
                />
              ) : (
                <button
                  onClick={async () => {
                    const check = await checkIngredientBeforeDelete(ingredientId);
                    setDeleteCheck(check);
                    setConfirmDelete(true);
                  }}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete ingredient
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ShellTabButton({ active, animate, onClick }: { active: boolean; animate: boolean; onClick: () => void }) {
  // When `animate` is true (user just unlocked the tab by setting category=Chocolate mid-session),
  // fade in and briefly flash the primary tint so the new tab is noticed. On initial page load
  // for an already-chocolate ingredient, skip the effect and render steady.
  const [mounted, setMounted] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [animate]);
  return (
    <button
      onClick={onClick}
      className={`order-2 px-4 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 rounded-t-sm transition-[opacity,transform,background-color,color,border-color] duration-500 ease-out ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      } ${mounted ? "opacity-100 translate-y-0 bg-transparent" : "opacity-0 -translate-y-0.5 bg-primary/15"}`}
    >
      Shell
    </button>
  );
}

function ShellTabReadView({
  ingredient,
  ingredientId,
  currentMappings,
  onEdit,
}: {
  ingredient: Ingredient;
  ingredientId: string;
  currentMappings: Map<string, import("@/types").CoatingChocolateMapping>;
  onEdit: () => void;
}) {
  const currentCoatingName = Array.from(currentMappings.entries()).find(
    ([, m]) => m.ingredientId === ingredientId
  )?.[0] ?? null;

  const currentMapping = currentCoatingName ? currentMappings.get(currentCoatingName) : null;

  if (!ingredient.shellCapable) {
    return (
      <div>
        <p className="text-sm text-muted-foreground py-4">
          Not marked as shell chocolate.{" "}
          <button onClick={onEdit} className="text-primary hover:underline">Edit ingredient</button> to enable.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs font-medium">
          Shell chocolate (couverture)
        </span>
      </div>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        <div className="flex justify-between px-3 py-2 text-sm">
          <span className="text-muted-foreground">Coating type</span>
          {currentCoatingName ? (
            <span className="font-medium capitalize">{currentCoatingName}</span>
          ) : (
            <span className="text-muted-foreground">— not set —</span>
          )}
        </div>
        {currentMapping && (
          <div className="flex justify-between px-3 py-2 text-sm">
            <span className="text-muted-foreground">Hand tempering (seeding)</span>
            <span>{currentMapping.seedTempering ? "Yes" : "No"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function IngredientDeletePanel({
  check,
  onDelete,
  onArchive,
  onCancel,
}: {
  check: IngredientDeleteCheck;
  onDelete: () => Promise<void>;
  onArchive: () => Promise<void>;
  onCancel: () => void;
}) {
  const { activeFillings, produced } = check;
  const hasActiveFillings = activeFillings.length > 0;

  // Case 3: produced AND still in active fillings → blocked
  if (produced && hasActiveFillings) {
    return (
      <div className="rounded-lg border border-warning/30 bg-warning-muted p-4 space-y-3">
        <p className="text-sm font-medium text-warning">Cannot remove this ingredient</p>
        <p className="text-xs text-muted-foreground">
          This ingredient has been used in production and is still part of {activeFillings.length === 1 ? "an active filling" : `${activeFillings.length} active fillings`}.
          Replace it in {activeFillings.length === 1 ? "this filling" : "these fillings"} first, then you can archive it.
        </p>
        <ul className="space-y-1">
          {activeFillings.map((l) => (
            <li key={l.id} className="text-xs font-medium flex items-center gap-1.5">
              <Link href={`/fillings/${encodeURIComponent(l.id ?? '')}`} className="text-primary underline underline-offset-2 hover:text-primary/80">
                {l.name}
              </Link>
            </li>
          ))}
        </ul>
        <button onClick={onCancel} className="btn-secondary px-4 py-2">
          OK
        </button>
      </div>
    );
  }

  // Case 4: produced but only in superseded fillings → safe to archive
  if (produced && !hasActiveFillings) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <p className="text-sm font-medium text-destructive">Archive this ingredient?</p>
        <p className="text-xs text-muted-foreground">
          This ingredient has been used in production batches. It will be archived — hidden from lists but preserved for history.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onArchive}
            className="inline-flex items-center justify-center rounded-full bg-warning text-warning-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-warning/90"
          >
            Archive ingredient
          </button>
          <button onClick={onCancel} className="btn-secondary px-4 py-2">Cancel</button>
        </div>
      </div>
    );
  }

  // Case 2: in active fillings but never produced → warn, allow delete
  if (hasActiveFillings) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <p className="text-sm font-medium text-destructive">Delete this ingredient?</p>
        <p className="text-xs text-muted-foreground">
          This ingredient is used in {activeFillings.length} filling{activeFillings.length !== 1 ? "s" : ""}. Deleting it will remove it from {activeFillings.length === 1 ? "that filling" : "those fillings"}. This cannot be undone.
        </p>
        <ul className="space-y-1">
          {activeFillings.map((l) => (
            <li key={l.id} className="text-xs font-medium flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-destructive shrink-0" />
              {l.name}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button
            onClick={onDelete}
            className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
          >
            Yes, delete ingredient
          </button>
          <button onClick={onCancel} className="btn-secondary px-4 py-2">Cancel</button>
        </div>
      </div>
    );
  }

  // Case 1: not in use anywhere → simple delete
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <p className="text-sm font-medium text-destructive">Delete this ingredient?</p>
      <p className="text-xs text-muted-foreground">This will permanently remove the ingredient from your library. This cannot be undone.</p>
      <div className="flex gap-2">
        <button
          onClick={onDelete}
          className="inline-flex items-center justify-center rounded-lg bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
        >
          Yes, delete ingredient
        </button>
        <button onClick={onCancel} className="btn-secondary px-4 py-2">Cancel</button>
      </div>
    </div>
  );
}

function IngredientNutritionReadView({ ingredient, market, onEdit }: { ingredient: Ingredient; market: import("@/types").MarketRegion; onEdit: () => void }) {
  const nutrients = getNutrientsByMarket(market);
  const panelTitle = getNutritionPanelTitle(market);
  const nutrition = ingredient.nutrition ? fillDerivedNutrition(ingredient.nutrition) : undefined;
  const hasData = hasNutritionData(nutrition);
  const missing = getMissingMandatoryNutrients(nutrition, market);
  const showDV = market === "US";

  if (!hasData) {
    return (
      <div>
        <p className="text-sm text-muted-foreground py-4">
          No nutrition data recorded.{" "}
          <button onClick={onEdit} className="text-primary hover:underline">Edit ingredient</button> to add it.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-sm font-medium text-muted-foreground mb-2">{panelTitle}</h2>
      <p className="text-xs text-muted-foreground mb-3">Values per 100g</p>

      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {nutrients.map((n) => {
          const val = nutrition?.[n.key];
          const dv = showDV ? percentDailyValue(val, n.dailyValue) : undefined;
          return (
            <div key={n.key} className="flex items-baseline justify-between px-3 py-2 text-sm">
              <span className={`text-muted-foreground ${n.indent === 1 ? "ml-4" : n.indent === 2 ? "ml-8" : ""}`}>
                {n.label}
              </span>
              <div className="flex items-baseline gap-3">
                <span className={`font-medium ${val == null ? "text-muted-foreground/50" : ""}`}>
                  {formatNutrientValue(val, n.unit)}
                </span>
                {dv != null && (
                  <span className="text-xs text-muted-foreground w-10 text-right">{dv}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {missing.length > 0 && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            {missing.length} mandatory {missing.length === 1 ? "nutrient" : "nutrients"} missing for {market} labels:{" "}
            {missing.map(m => m.label).join(", ")}
          </span>
        </div>
      )}
    </div>
  );
}
