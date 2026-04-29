"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProduct, useProductFillings, useFillings, useFilling, useMouldsList, useProductCategories, useProductCategory, useCoatings, useShellCapableIngredients, saveProduct, addFillingToProduct, removeFillingFromProduct, updateProductFillingPercentage, updateProductFillingFraction, reorderProductFillings, deleteProduct, duplicateProduct, archiveProduct, unarchiveProduct, hasProductBeenProduced, usePlanProductsForProduct, useProductionPlans, useProductFillingHistory, useProductCostSnapshots, useLatestProductCostSnapshot, recalculateProductCost, useIngredients, useAllFillingIngredientsByFilling, useAllFillingComponentsByFilling, useDecorationMaterials, saveDecorationMaterial, setPlanProductStockStatus, useCurrencySymbol, useMarketRegion, useDefaultFillMode, useShellDesigns, useDecorationCategoryLabels, useDecorationMaterialColorMap, useFillingCategoryMap } from "@/lib/hooks";
import { deriveShopColor, resolveShopColor } from "@/lib/shopColor";
import { SHELL_TECHNIQUES, DECORATION_MATERIAL_TYPE_LABELS, DECORATION_APPLY_AT_OPTIONS, normalizeApplyAt, type Product, type ShellDesignStep, type ShellDesignApplyAt, type ProductCostSnapshot, type BreakdownEntry, type ProductFilling, costPerGram, type DecorationMaterial, allergenLabel, type FillMode } from "@/types";
import { colorToCSS } from "@/lib/colors";
import { NEUTRAL_CATEGORY_HEX } from "@/lib/categoryColor";
import { deserializeBreakdown, enrichBreakdownLabels, formatCost, costDelta, deriveShellPercentageFromFractions, fillFractionToGrams, gramsToFillFraction } from "@/lib/costCalculation";
import { reachableIngredientIds } from "@/lib/fillingComponents";
import { getNutrientsByMarket, getNutritionPanelTitle, scaleToServing, formatNutrientValue, percentDailyValue, calculateProductNutrition } from "@/lib/nutrition";
import { calculateShellWeightG, calculateCapWeightG } from "@/lib/costCalculation";
import type { MarketRegion } from "@/types";
import { ArrowLeft, Camera, Plus, X, Search, Trash2, Pencil, ChevronRight, StickyNote, RefreshCw, AlertTriangle, Undo2, Copy, Archive, ArchiveRestore, GripVertical, Snowflake } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { DragEndEvent } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { DraggableAttributes } from "@dnd-kit/core";
import { InlineNameEditor } from "@/components/inline-name-editor";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";

export default function ProductDetailPage() {
  const productId = useSpaId("products");
  const router = useRouter();
  const product = useProduct(productId);
  const productFillings = useProductFillings(productId);
  const allFillings = useFillings();
  const fillingCategoryMap = useFillingCategoryMap();
  const allMoulds = useMouldsList(true);
  const productCategories = useProductCategories();
  const productCategory = useProductCategory(product?.productCategoryId);
  const shellCapableIngredients = useShellCapableIngredients();
  const coatings = useCoatings();
  const sym = useCurrencySymbol();

  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const market = useMarketRegion();
  const defaultFillMode = useDefaultFillMode();
  const [activeTab, setActiveTab] = useState<"product" | "shell" | "fillingHistory" | "batches" | "cost" | "nutrition">("product");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "history") setActiveTab("batches");
    if (params.get("tab") === "shell") setActiveTab("shell");
    if (params.get("tab") === "fillingHistory") setActiveTab("fillingHistory");
    if (params.get("tab") === "batches") setActiveTab("batches");
    if (params.get("tab") === "cost") setActiveTab("cost");
    if (params.get("tab") === "nutrition") setActiveTab("nutrition");
  }, []);

  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [productProduced, setProductProduced] = useState(false);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);
  const [showDuplicatePanel, setShowDuplicatePanel] = useState(false);
  const [duplicateFillings, setDuplicateFillings] = useState(false);
  const [duplicatingProduct, setDuplicatingProduct] = useState(false);

  // Local buffered state for edit mode
  const [localFillMode, setLocalFillMode] = useState<FillMode>("percentage");
  const [localProductCategoryId, setLocalProductCategoryId] = useState("");
  const [localShellIngredientId, setLocalShellIngredientId] = useState("");
  const [localShellPercentageStr, setLocalShellPercentageStr] = useState("");
  const [localCoating, setLocalCoating] = useState("");
  const [localTags, setLocalTags] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [localShelfLife, setLocalShelfLife] = useState("");
  const [localLowStockThreshold, setLocalLowStockThreshold] = useState("");
  const [localMouldId, setLocalMouldId] = useState("");
  const [batchQtyInput, setBatchQtyInput] = useState("");
  const [localShellDesign, setLocalShellDesign] = useState<ShellDesignStep[]>([]);
  // Empty string means "use auto" — the save path sends `undefined` so the
  // Shop falls back to the derived / hashed colour.
  const [localShopColor, setLocalShopColor] = useState<string>("");

  const [saveErrors, setSaveErrors] = useState<string[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [fillingSearch, setFillingSearch] = useState("");
  const [tagInput, setTagInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showAssign) { setShowAssign(false); setFillingSearch(""); }
      else if (confirmRemovePhoto) { setConfirmRemovePhoto(false); }
      else if (showDuplicatePanel) { setShowDuplicatePanel(false); setDuplicateFillings(false); }
      else if (confirmDelete) { setConfirmDelete(false); }
      else if (editing) { handleCancel(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showAssign, confirmRemovePhoto, showDuplicatePanel, confirmDelete, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync form state when product first loads
  useEffect(() => {
    if (product && (!editing || isNew)) {
      setLocalFillMode(product.fillMode ?? defaultFillMode);
      setLocalProductCategoryId(product.productCategoryId || "");
      setLocalShellIngredientId(product.shellIngredientId || "");
      setLocalShellPercentageStr(String(product.shellPercentage ?? productCategory?.defaultShellPercent ?? 37));
      setLocalCoating(product.coating || "");
      setLocalTags(product.tags ?? []);
      setNotes(product.notes || "");
      setLocalShelfLife(product.shelfLifeWeeks || "");
      setLocalLowStockThreshold(product.lowStockThreshold != null ? String(product.lowStockThreshold) : "");
      setLocalMouldId(product.defaultMouldId || "");
      setBatchQtyInput(String(product.defaultBatchQty ?? 1));
      setLocalShellDesign(product.shellDesign ?? []);
      setLocalShopColor(product.shopColor ?? "");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

  // Check production status on load to determine Archive vs Delete
  useEffect(() => {
    if (product?.id && !product.archived) {
      hasProductBeenProduced(product.id).then(setProductProduced);
    }
  }, [product?.id, product?.archived]);

  // For ?new=1 products, the record was already created with just a name on the
  // list page. Treat it as always dirty so the navigation guard fires — if the
  // user confirms "leave without saving", we delete the incomplete record.
  const [savedOnce, setSavedOnce] = useState(false);
  const formDirty = editing && product != null && (
    localFillMode !== (product.fillMode ?? defaultFillMode) ||
    localProductCategoryId !== (product.productCategoryId || "") ||
    localShellIngredientId !== (product.shellIngredientId || "") ||
    localShellPercentageStr !== String(product.shellPercentage ?? productCategory?.defaultShellPercent ?? 37) ||
    localCoating !== (product.coating || "") ||
    notes !== (product.notes || "") ||
    localShelfLife !== (product.shelfLifeWeeks || "") ||
    localLowStockThreshold !== (product.lowStockThreshold != null ? String(product.lowStockThreshold) : "") ||
    localMouldId !== (product.defaultMouldId || "") ||
    batchQtyInput !== String(product.defaultBatchQty ?? 1) ||
    JSON.stringify([...localTags].sort()) !== JSON.stringify([...(product.tags ?? [])].sort()) ||
    JSON.stringify(localShellDesign) !== JSON.stringify(product.shellDesign ?? []) ||
    (localShopColor || undefined) !== product.shopColor
  );
  const isDirty = (isNew && !savedOnce) || formDirty;
  // When leaving a ?new=1 product without saving, delete the incomplete record
  const handleConfirmLeave = useCallback(async () => {
    if (isNew && product?.id) {
      await deleteProduct(product.id);
    }
  }, [isNew, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const { safeBack } = useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  // Recommended shelf life: shortest filling shelf life among assigned fillings
  const recommendedShelfLife = useMemo(() => {
    let min: number | null = null;
    let limitingFilling: string | null = null;
    for (const rl of productFillings) {
      const filling = allFillings.find((l) => l.id === rl.fillingId);
      if (filling?.shelfLifeWeeks != null) {
        if (min === null || filling.shelfLifeWeeks < min) {
          min = filling.shelfLifeWeeks;
          limitingFilling = filling.name;
        }
      }
    }
    return min !== null ? { weeks: min, fillingName: limitingFilling! } : null;
  }, [productFillings, allFillings]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  async function handleFillingDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = productFillings.findIndex((rl) => rl.id === active.id);
    const newIndex = productFillings.findIndex((rl) => rl.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = [...productFillings];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    await reorderProductFillings(reordered);
  }

  if (!productId || !product) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // IDs of fillings already assigned to this product
  const assignedFillingIds = new Set(productFillings.map((rl) => rl.fillingId));

  // Available fillings not yet assigned
  const availableFillings = allFillings.filter((l) => !assignedFillingIds.has(l.id!));
  const filteredAvailable = fillingSearch
    ? availableFillings.filter((l) => {
        const q = fillingSearch.toLowerCase();
        return l.name.toLowerCase().includes(q) || l.description?.toLowerCase().includes(q);
      })
    : availableFillings;

  function startEditing() {
    if (!product) return;
    setLocalFillMode(product.fillMode ?? defaultFillMode);
    setLocalProductCategoryId(product.productCategoryId || "");
    setLocalShellIngredientId(product.shellIngredientId || "");
    setLocalShellPercentageStr(String(product.shellPercentage ?? productCategory?.defaultShellPercent ?? 37));
    setLocalCoating(product.coating || "");
    setLocalTags(product.tags ?? []);
    setNotes(product.notes || "");
    setLocalShelfLife(product.shelfLifeWeeks || "");
    setLocalLowStockThreshold(product.lowStockThreshold != null ? String(product.lowStockThreshold) : "");
    setLocalMouldId(product.defaultMouldId || "");
    setBatchQtyInput(String(product.defaultBatchQty ?? 1));
    setLocalShellDesign(product.shellDesign ?? []);
    setEditing(true);
  }

  async function handleSave() {
    if (!productId) return;
    const batchQty = Math.max(1, parseInt(batchQtyInput) || 1);
    const shellPct = parseFloat(localShellPercentageStr);

    // Validate required fields
    const errors: string[] = [];
    if (!localProductCategoryId) errors.push("Category is required.");
    if (localFillMode === "grams" && !localMouldId) errors.push("Default mould is required when fill mode is By grams — shell % is derived from the cavity weight.");
    // Determine effective shell % (derived in grams mode, explicit in percentage mode)
    let effectiveShellPct = isNaN(shellPct) ? 0 : shellPct;
    if (localFillMode === "grams" && localMouldId && localProductCategoryId) {
      const mould = allMoulds.find((m) => m.id === localMouldId);
      const category = productCategories.find((c) => c.id === localProductCategoryId);
      if (mould && category) {
        const totalFillFraction = productFillings.reduce((sum, pf) => sum + (pf.fillFraction ?? 0), 0);
        const derived = deriveShellPercentageFromFractions(totalFillFraction);
        effectiveShellPct = derived;
        if (derived < category.shellPercentMin || derived > category.shellPercentMax) {
          errors.push(`Derived shell % (${derived}%) is outside the ${category.name} category range (${category.shellPercentMin}%–${category.shellPercentMax}%). Adjust fill grams or pick a different mould.`);
        }
      }
    }
    if (effectiveShellPct > 0 && !localShellIngredientId) errors.push("Shell chocolate is required when shell % is greater than 0.");
    if (errors.length > 0) {
      setSaveErrors(errors);
      setActiveTab("product");
      return;
    }
    setSaveErrors([]);

    await saveProduct({
      id: productId,
      name: product!.name,
      photo: product!.photo,
      popularity: product!.popularity,
      productCategoryId: localProductCategoryId,
      shellIngredientId: localShellIngredientId || undefined,
      shellPercentage: isNaN(shellPct) ? undefined : shellPct,
      coating: localCoating || undefined,
      tags: localTags.length > 0 ? localTags : undefined,
      notes: notes.trim() || undefined,
      shelfLifeWeeks: localShelfLife.trim() || undefined,
      lowStockThreshold: (() => {
        const v = parseInt(localLowStockThreshold.trim(), 10);
        return isNaN(v) || v < 0 ? undefined : v;
      })(),
      defaultMouldId: localMouldId || undefined,
      defaultBatchQty: batchQty,
      shellDesign: localShellDesign,
      fillMode: localFillMode,
      shopColor: localShopColor || undefined,
    });
    setEditing(false);
    setSavedOnce(true);
    if (isNew) router.replace(`/products/${encodeURIComponent(productId)}`);
  }

  function handleCancel() {
    if (!product) return;
    setLocalFillMode(product.fillMode ?? defaultFillMode);
    setLocalProductCategoryId(product.productCategoryId || "");
    setLocalShellIngredientId(product.shellIngredientId || "");
    setLocalShellPercentageStr(String(product.shellPercentage ?? productCategory?.defaultShellPercent ?? 37));
    setLocalCoating(product.coating || "");
    setLocalTags(product.tags ?? []);
    setNotes(product.notes || "");
    setLocalShelfLife(product.shelfLifeWeeks || "");
    setLocalLowStockThreshold(product.lowStockThreshold != null ? String(product.lowStockThreshold) : "");
    setLocalMouldId(product.defaultMouldId || "");
    setBatchQtyInput(String(product.defaultBatchQty ?? 1));
    setLocalShellDesign(product.shellDesign ?? []);
    setLocalShopColor(product.shopColor ?? "");
    setEditing(false);
    setShowAssign(false);
    setFillingSearch("");
    setSaveErrors([]);
    if (isNew && productId) router.replace(`/products/${encodeURIComponent(productId)}`);
  }

  async function handlePopularity(stars: number) {
    if (!productId) return;
    const newVal = product!.popularity === stars ? undefined : stars;
    await saveProduct({ id: productId, name: product!.name, photo: product!.photo, popularity: newVal });
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !productId) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      await saveProduct({ id: productId, name: product!.name, photo: base64 });
    };
    reader.readAsDataURL(file);
  }

  async function handleAssignFilling(fillingId: string) {
    if (!productId) return;
    await addFillingToProduct(productId, fillingId);
    setFillingSearch("");
    setShowAssign(false);
  }

  async function handleRemoveFilling(productFillingId: string) {
    await removeFillingFromProduct(productFillingId);
  }

  function handleAddTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (!trimmed || localTags.includes(trimmed)) return;
    setLocalTags([...localTags, trimmed]);
    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    setLocalTags(localTags.filter((t) => t !== tag));
  }

  return (
    <div>
      {/* Back */}
      <div className="px-4 pt-6 pb-2">
        <button onClick={() => safeBack()} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Photo + Name */}
      <div className="px-4 pb-4">
        <div className="flex gap-4 items-start">
          <div className="relative shrink-0 group">
            {product.photo ? (
              <>
                <img
                  src={product.photo}
                  alt={product.name}
                  width={80}
                  height={80}
                  className="w-20 h-20 rounded-lg object-cover cursor-pointer"
                  onClick={() => { if (!confirmRemovePhoto) fileInputRef.current?.click(); }}
                />
                {confirmRemovePhoto ? (
                  <div className="absolute -top-1.5 -right-1.5 flex gap-1">
                    <button
                      onClick={() => { saveProduct({ id: productId, name: product!.name, photo: undefined }); setConfirmRemovePhoto(false); }}
                      className="h-5 px-1.5 rounded-full bg-red-600 text-white text-[10px] font-medium"
                    >Remove</button>
                    <button
                      onClick={() => setConfirmRemovePhoto(false)}
                      className="w-5 h-5 rounded-full bg-stone-400 text-white flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmRemovePhoto(true)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-stone-700 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove photo"
                    aria-label="Remove photo"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-20 rounded-lg bg-muted flex flex-col items-center justify-center text-muted-foreground gap-1"
              >
                <Camera className="w-5 h-5" />
                <span className="text-[10px]">Photo</span>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="hidden"
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <InlineNameEditor
                    name={product.name}
                    onSave={async (n) => { await saveProduct({ id: productId, name: n, photo: product.photo }); }}
                    className="text-xl font-bold"
                  />
                  {product.archived && (
                    <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                      <Archive className="w-3 h-3" /> Archived
                    </span>
                  )}
                </div>
                {!editing && (
                  <div className="flex gap-0.5 mt-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        onClick={() => handlePopularity(star)}
                        aria-label={`Rate ${star} star${star !== 1 ? "s" : ""}`}
                        className="p-0.5 transition-transform active:scale-110"
                      >
                        <svg className={`w-5 h-5 ${(product.popularity ?? 0) >= star ? "text-primary fill-primary" : "text-border fill-transparent"}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" />
                        </svg>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {!editing && (
                <button
                  onClick={startEditing}
                  aria-label="Edit product"
                  className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
                >
                  <Pencil aria-hidden="true" className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-border mb-4 px-4 overflow-x-auto">
        {(["product", "shell", "fillingHistory", "batches", "cost", "nutrition"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap -mb-px border-b-2 transition-colors ${
              activeTab === tab
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "shell" ? "Shell Design" : tab === "fillingHistory" ? "Filling History" : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "shell" && (
        <>
          {editing ? (
            <>
              <ShopColorControl
                value={localShopColor}
                onChange={setLocalShopColor}
                productName={product.name}
                shellDesign={localShellDesign}
              />
              <ShellDesignSection
                steps={localShellDesign}
                onUpdate={setLocalShellDesign}
                readonly={false}
              />
              {saveErrors.length > 0 && (
                <div className="px-4 pb-3">
                  <ul className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                    {saveErrors.map((err, i) => (
                      <li key={i} className="text-xs text-destructive">{err}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="px-4 pb-6 flex gap-2">
                <button onClick={handleSave} className="btn-primary px-4 py-2">Save</button>
                <button onClick={handleCancel} className="btn-secondary px-4 py-2">Cancel</button>
              </div>
            </>
          ) : (
            <>
              <ShopColorReadonly product={product} />
              {(product.shellDesign ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center px-4">No shell design steps recorded yet.</p>
              ) : (
                <ShellDesignSection
                  steps={product.shellDesign ?? []}
                  onUpdate={() => {}}
                  readonly
                />
              )}
            </>
          )}
        </>
      )}

      {activeTab === "fillingHistory" && (
        <ProductFillingHistorySection productId={productId} />
      )}

      {activeTab === "batches" && (
        <BatchHistoryTab productId={productId} />
      )}

      {activeTab === "cost" && (
        <ProductCostTab productId={productId} product={product} productFillings={productFillings} allMoulds={allMoulds} sym={sym} />
      )}

      {activeTab === "nutrition" && (
        <ProductNutritionTab productId={productId} productFillings={productFillings} market={market} />
      )}

      {activeTab === "product" && (
      <>

      {editing ? (
        <>
        {/* --- EDIT MODE --- */}

        {/* Category */}
        <div className="px-4 pb-4">
          <label className="label">Category</label>
          <select
            value={localProductCategoryId}
            onChange={(e) => {
              setLocalProductCategoryId(e.target.value);
              // When switching categories, update shellPercentage to the new category's default
              const cat = productCategories.find((c) => c.id === e.target.value);
              if (cat) setLocalShellPercentageStr(String(cat.defaultShellPercent));
            }}
            className="input capitalize"
          >
            <option value="">— None —</option>
            {productCategories.map((c) => (
              <option key={c.id} value={c.id} className="capitalize">{c.name}</option>
            ))}
          </select>
        </div>

        {/* Shell chocolate + percentage */}
        {(() => {
          const shellPct = parseFloat(localShellPercentageStr) || 0;
          const selectedCategory = productCategories.find((c) => c.id === localProductCategoryId);

          // In grams mode, derive shell % from the stored fillFraction values
          // (mould-agnostic, so the result is the same regardless of which mould
          // we're displaying against — but we still require a default mould so
          // gram inputs/outputs can be shown to the user).
          const isGramsMode = localFillMode === "grams";
          let derivedShellPct: number | null = null;
          let derivedShellLabel: string | null = null;
          let derivedOutOfRange = false;
          if (isGramsMode) {
            const mould = allMoulds.find((m) => m.id === localMouldId);
            if (!mould) {
              derivedShellLabel = "Set a mould to see derived shell %";
            } else {
              const totalFillFraction = productFillings.reduce((sum, pf) => sum + (pf.fillFraction ?? 0), 0);
              derivedShellPct = deriveShellPercentageFromFractions(totalFillFraction);
              derivedShellLabel = `${derivedShellPct}% (derived from fill grams)`;
              if (selectedCategory && (derivedShellPct < selectedCategory.shellPercentMin || derivedShellPct > selectedCategory.shellPercentMax)) {
                derivedOutOfRange = true;
              }
            }
          }

          // In grams mode use derived shell %; in percentage mode use the explicit input
          const effectiveShellPct = isGramsMode && derivedShellPct !== null ? derivedShellPct : shellPct;
          const showShellIngredient = effectiveShellPct > 0;

          return (
            <div className="px-4 pb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {showShellIngredient && (
                  <div>
                    <label className="label">Shell chocolate</label>
                    {shellCapableIngredients.length === 0 ? (
                      <p className="text-xs text-warning mt-1">
                        No shell chocolates available. Create an ingredient with category &quot;Chocolate&quot; and mark it as &quot;shell capable&quot; first.
                      </p>
                    ) : (
                      <select
                        value={localShellIngredientId}
                        onChange={(e) => setLocalShellIngredientId(e.target.value)}
                        className="input"
                      >
                        <option value="">— None —</option>
                        {shellCapableIngredients.map((ing) => (
                          <option key={ing.id} value={ing.id}>{ing.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}
                <div>
                  <label className="label">Shell %</label>
                  {isGramsMode ? (
                    <>
                      <p className={`text-sm mt-1 py-1.5 ${derivedOutOfRange ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                        {derivedShellLabel}
                      </p>
                      {selectedCategory && derivedShellPct !== null && (
                        <p className={`text-xs mt-1 ${derivedOutOfRange ? "text-destructive" : "text-muted-foreground"}`}>
                          {derivedOutOfRange
                            ? `Out of range: ${selectedCategory.shellPercentMin}%–${selectedCategory.shellPercentMax}%. Adjust fill grams or mould.`
                            : `Range: ${selectedCategory.shellPercentMin}%–${selectedCategory.shellPercentMax}%`}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <input
                        type="number"
                        min={selectedCategory?.shellPercentMin ?? 0}
                        max={selectedCategory?.shellPercentMax ?? 100}
                        step="1"
                        value={localShellPercentageStr}
                        onChange={(e) => setLocalShellPercentageStr(e.target.value)}
                        className="input w-24"
                      />
                      {selectedCategory && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Range: {selectedCategory.shellPercentMin}%–{selectedCategory.shellPercentMax}%
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Tags */}
        <div className="px-4 pb-4">
          <label className="label">Tags</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {localTags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium capitalize">
                {tag}
                <button onClick={() => handleRemoveTag(tag)} aria-label={`Remove tag ${tag}`}>
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddTag(tagInput); } }}
              placeholder="Add tag (e.g. christmas)"
              className="input"
            />
            <button
              onClick={() => handleAddTag(tagInput)}
              disabled={!tagInput.trim()}
              className="btn-primary px-3 py-1.5"
            >
              Add
            </button>
          </div>
        </div>

        {/* Notes */}
        <div className="px-4 pb-4">
          <label className="label">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Tasting notes, storage tips, variations…"
            rows={3}
            className="input"
          />
        </div>

        {/* Shelf life + low-stock threshold */}
        <div className="px-4 pb-4 flex gap-4 flex-wrap">
          <div>
            <label className="label">Shelf life (weeks)</label>
            <input
              type="text"
              value={localShelfLife}
              onChange={(e) => setLocalShelfLife(e.target.value)}
              placeholder={recommendedShelfLife ? String(recommendedShelfLife.weeks) : "e.g. 4 or 4–6…"}
              className="input w-32"
            />
            {recommendedShelfLife && (
              <p className="text-xs text-muted-foreground mt-1">
                Suggested: <button
                  type="button"
                  onClick={() => setLocalShelfLife(String(recommendedShelfLife.weeks))}
                  className="text-primary font-medium hover:underline"
                >{recommendedShelfLife.weeks} weeks</button>
                <span className="ml-1">— based on {recommendedShelfLife.fillingName}</span>
              </p>
            )}
          </div>
          <div>
            <label className="label">Low-stock threshold</label>
            <input
              type="number"
              min={0}
              value={localLowStockThreshold}
              onChange={(e) => setLocalLowStockThreshold(e.target.value)}
              placeholder="e.g. 12"
              className="input w-32"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Pieces below which this product is flagged low in the production wizard.
            </p>
          </div>
        </div>

        {/* Fill mode toggle + fillings — hidden when shell % = 100 (pure shell product, e.g. plain bar) */}
        {(parseFloat(localShellPercentageStr) || 0) < 100 && (
        <>
        {/* Fill mode toggle */}
        <div className="px-4 pb-4">
          <label className="label">Fill mode</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setLocalFillMode("percentage")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${localFillMode === "percentage" ? "bg-accent text-accent-foreground" : "border border-border"}`}
            >
              By percentage
            </button>
            <button
              type="button"
              onClick={() => setLocalFillMode("grams")}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${localFillMode === "grams" ? "bg-accent text-accent-foreground" : "border border-border"}`}
            >
              By grams
            </button>
          </div>
        </div>
        <div className="px-4 space-y-3 pb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Fillings ({productFillings.length})
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => setShowAssign(true)}
                className="flex items-center gap-1 text-xs text-primary font-medium"
              >
                <Plus className="w-3.5 h-3.5" /> Assign filling
              </button>
              <Link
                href="/fillings"
                className="text-xs text-muted-foreground underline"
              >
                Create new filling
              </Link>
            </div>
          </div>

          {/* Assign existing filling picker */}
          {showAssign && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={fillingSearch}
                  onChange={(e) => setFillingSearch(e.target.value)}
                  placeholder="Search fillings to assign..."
                  autoFocus
                  className="input !pl-8"
                />
              </div>
              {filteredAvailable.length > 0 ? (
                <ul className="max-h-48 overflow-y-auto space-y-1">
                  {filteredAvailable.map((filling) => (
                    <li key={filling.id}>
                      <button
                        onClick={() => handleAssignFilling(filling.id!)}
                        className="w-full text-left rounded-full px-2 py-1.5 hover:bg-muted transition-colors"
                      >
                        <span className="text-sm font-medium">{filling.name}</span>
                        {(filling.category || filling.description) && (
                          <div className="text-xs text-muted-foreground truncate">
                            {[filling.category, filling.description].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground py-2 text-center">
                  {availableFillings.length === 0
                    ? "All fillings are already assigned."
                    : "No fillings match your search."}
                </p>
              )}
              <button
                onClick={() => { setShowAssign(false); setFillingSearch(""); }}
                className="text-xs text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Assigned fillings */}
          {productFillings.length === 0 && !showAssign ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No fillings assigned yet. Assign an existing filling or create a new one.
            </p>
          ) : (
            <>
              {localFillMode === "grams" && (
                <p className="text-xs text-muted-foreground italic">
                  Grams are entered against the default mould and stored as a proportion of cavity volume.
                  When you produce on a different mould, the grams scale automatically to preserve the recipe.
                </p>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFillingDragEnd}>
                <SortableContext items={productFillings.map((bl) => bl.id!)} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2">
                    {productFillings.map((bl) => {
                      const editMould = allMoulds.find((m) => m.id === localMouldId);
                      const editCavityG = editMould?.cavityWeightG ?? null;
                      return (
                        <SortableProductFillingRow
                          key={bl.id}
                          productFilling={bl}
                          fillMode={localFillMode}
                          cavityWeightG={editCavityG}
                          onRemove={() => handleRemoveFilling(bl.id!)}
                          onUpdatePercentage={(pct) => updateProductFillingPercentage(bl.id!, pct)}
                          onUpdateGrams={(g) => {
                            // Convert the user's grams (against the default mould) to a
                            // mould-agnostic fraction before storing. Skip if no default
                            // mould — the grams input is disabled in that state.
                            if (editCavityG == null) return;
                            const fraction = gramsToFillFraction(g, editCavityG);
                            void updateProductFillingFraction(bl.id!, fraction);
                          }}
                        />
                      );
                    })}
                  </ul>
                </SortableContext>
              </DndContext>
              {productFillings.length > 1 && localFillMode !== "grams" && (
                <FillBar productFillings={productFillings.map((bl) => {
                  const filling = allFillings.find((l) => l.id === bl.fillingId);
                  return {
                    ...bl,
                    fillingName: filling?.name ?? "Filling",
                    categoryColor: fillingCategoryMap.get(filling?.category ?? "")?.color ?? NEUTRAL_CATEGORY_HEX,
                  };
                })} />
              )}
            </>
          )}
        </div>
        </>
        )}

        {/* Production defaults */}
        <div className="px-4 pb-6 space-y-3 border-t border-border pt-4">
          <h2 className="text-sm font-medium text-muted-foreground">Production defaults</h2>
          <div className="space-y-2">
            <div>
              <label className="label">
                Default mould{localFillMode === "grams" && <span className="text-destructive"> *</span>}
              </label>
              <select
                value={localMouldId}
                onChange={(e) => setLocalMouldId(e.target.value)}
                className="input"
              >
                <option value="">— No default mould —</option>
                {allMoulds.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.cavityWeightG} g · {m.numberOfCavities} cavities)
                  </option>
                ))}
              </select>
              {localFillMode === "grams" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Required in By grams mode — cavity weight is used to derive shell %.
                </p>
              )}
            </div>
            <div>
              <label className="label">Default batch quantity</label>
              <input
                type="number"
                min="1"
                step="1"
                value={batchQtyInput}
                onChange={(e) => setBatchQtyInput(e.target.value)}
                className="input w-32"
              />
            </div>
          </div>
        </div>

        {/* Validation errors */}
        {saveErrors.length > 0 && (
          <div className="px-4 pb-3">
            <ul className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
              {saveErrors.map((err, i) => (
                <li key={i} className="text-xs text-destructive">{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Save / Cancel */}
        <div className="px-4 pb-6 flex gap-2">
          <button onClick={handleSave} className="btn-primary px-4 py-2">Save</button>
          <button onClick={handleCancel} className="btn-secondary px-4 py-2">Cancel</button>
        </div>
        </>
      ) : (
        <>
        {/* --- VIEW MODE --- */}

        {/* Category + Shell info */}
        {(productCategory || product.shellIngredientId) && (
          <div className="px-4 pb-4 flex flex-wrap gap-2">
            {productCategory && (
              <span className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium capitalize">{productCategory.name}</span>
            )}
            {product.shellIngredientId && (() => {
              const shellIng = shellCapableIngredients.find((i) => i.id === product.shellIngredientId);
              return shellIng ? (
                <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-xs font-medium">
                  {shellIng.name} · {product.shellPercentage ?? 37}%
                </span>
              ) : null;
            })()}
          </div>
        )}

        {/* Tags */}
        {(product.tags ?? []).length > 0 && (
          <div className="px-4 pb-4 flex flex-wrap gap-1.5">
            {(product.tags ?? []).map((tag) => (
              <span key={tag} className="rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium capitalize">{tag}</span>
            ))}
          </div>
        )}

        {/* Notes */}
        {product.notes && (
          <div className="px-4 pb-4">
            <h2 className="text-sm font-medium text-muted-foreground mb-1">Notes</h2>
            <p className="text-sm whitespace-pre-wrap">{product.notes}</p>
          </div>
        )}

        {/* Shelf life + low-stock threshold */}
        {(product.shelfLifeWeeks || recommendedShelfLife || product.lowStockThreshold != null) && (
          <div className="px-4 pb-4 flex gap-8 flex-wrap">
            {(product.shelfLifeWeeks || recommendedShelfLife) && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">Shelf life</h2>
                {product.shelfLifeWeeks ? (
                  <>
                    <p className="text-sm">{product.shelfLifeWeeks} weeks</p>
                    {recommendedShelfLife && parseFloat(product.shelfLifeWeeks) > recommendedShelfLife.weeks && (
                      <p className="text-xs text-status-warn mt-0.5">
                        Note: {recommendedShelfLife.fillingName} has a {recommendedShelfLife.weeks}-week shelf life
                      </p>
                    )}
                  </>
                ) : recommendedShelfLife ? (
                  <p className="text-xs text-muted-foreground">
                    Suggested: {recommendedShelfLife.weeks} weeks (based on {recommendedShelfLife.fillingName})
                  </p>
                ) : null}
              </div>
            )}
            {product.lowStockThreshold != null && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-1">Low-stock threshold</h2>
                <p className="text-sm">{product.lowStockThreshold} pcs</p>
              </div>
            )}
          </div>
        )}

        {/* Fillings */}
        <div className="px-4 space-y-3 pb-6">
          <h2 className="text-sm font-medium text-muted-foreground">
            Fillings ({productFillings.length})
          </h2>
          {productFillings.length === 0 ? (
            <p className="text-muted-foreground text-sm py-4 text-center">
              No fillings assigned yet.
            </p>
          ) : (
            <>
              <ul className="space-y-2">
                {productFillings.map((bl) => {
                  const viewMould = allMoulds.find((m) => m.id === product.defaultMouldId);
                  return (
                    <ProductFillingRow
                      key={bl.id}
                      productFilling={bl}
                      fillMode={product?.fillMode ?? defaultFillMode}
                      cavityWeightG={viewMould?.cavityWeightG ?? null}
                      onRemove={() => {}}
                      onUpdatePercentage={() => {}}
                      onUpdateGrams={() => {}}
                      readonly
                    />
                  );
                })}
              </ul>
              {productFillings.length > 1 && (
                <FillBar productFillings={productFillings.map((bl) => {
                  const filling = allFillings.find((l) => l.id === bl.fillingId);
                  return {
                    ...bl,
                    fillingName: filling?.name ?? "Filling",
                    categoryColor: fillingCategoryMap.get(filling?.category ?? "")?.color ?? NEUTRAL_CATEGORY_HEX,
                  };
                })} />
              )}
            </>
          )}
        </div>

        {/* Production defaults — read-only */}
        {(product.defaultMouldId || (product.defaultBatchQty && product.defaultBatchQty > 1)) && (
          <div className="px-4 pb-6 space-y-2 border-t border-border pt-4">
            <h2 className="text-sm font-medium text-muted-foreground">Production defaults</h2>
            {product.defaultMouldId && (
              <p className="text-sm">
                <span className="text-muted-foreground">Mould:</span>{" "}
                {allMoulds.find((m) => m.id === product.defaultMouldId)?.name ?? "Unknown"}
              </p>
            )}
            {product.defaultBatchQty && product.defaultBatchQty > 1 && (
              <p className="text-sm">
                <span className="text-muted-foreground">Batch qty:</span> {product.defaultBatchQty}
              </p>
            )}
          </div>
        )}
        </>
      )}

      {/* Delete product — always accessible */}
      {!editing && (
      <div className="px-4 pb-8 border-t border-border pt-4 space-y-4">
        {/* Duplicate */}
        {showDuplicatePanel ? (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Copy className="w-4 h-4 text-muted-foreground shrink-0" />
              <p className="text-sm font-medium">Duplicate &ldquo;{product?.name}&rdquo;</p>
            </div>
            <p className="text-xs text-muted-foreground">
              A new product will be created with the same type, coating, tags, notes, shell design, and production defaults.
            </p>
            {productFillings.length > 0 && (
              <>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={duplicateFillings}
                    onChange={(e) => setDuplicateFillings(e.target.checked)}
                    className="rounded border-border"
                  />
                  <span className="text-xs">
                    Also duplicate {productFillings.length === 1 ? "the filling" : `all ${productFillings.length} fillings`} as new copies
                  </span>
                </label>
                <p className="text-xs text-muted-foreground ml-6 -mt-2">
                  {duplicateFillings
                    ? "Each filling will be copied as an independent filling you can edit separately."
                    : "The duplicate will share the same fillings as the original."}
                </p>
              </>
            )}
            <div className="flex gap-2 pt-1">
              <button
                onClick={async () => {
                  setDuplicatingProduct(true);
                  try {
                    const newId = await duplicateProduct(productId, { duplicateFillings });
                    router.push(`/products/${encodeURIComponent(newId)}?new=1`);
                  } finally {
                    setDuplicatingProduct(false);
                  }
                }}
                disabled={duplicatingProduct}
                className="btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {duplicatingProduct ? "Duplicating…" : "Duplicate product"}
              </button>
              <button
                onClick={() => { setShowDuplicatePanel(false); setDuplicateFillings(false); }}
                className="btn-secondary px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setShowDuplicatePanel(true); setConfirmDelete(false); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="w-4 h-4" /> Duplicate product
          </button>
        )}

        {/* Unarchive (for archived products) */}
        {product?.archived && (
          <button
            onClick={async () => { await unarchiveProduct(productId); }}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArchiveRestore className="w-4 h-4" /> Unarchive product
          </button>
        )}

        {/* Archive (for produced products) */}
        {!product?.archived && productProduced && (
          confirmDelete ? (
            <div className="rounded-lg border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium">Archive this product?</p>
              </div>
              <p className="text-xs text-muted-foreground">This product has been used in production and cannot be deleted. Archiving will hide it from lists but preserve it for production history.</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => { await archiveProduct(productId); router.replace("/products"); }}
                  className="btn-primary px-4 py-2 text-sm"
                >
                  Yes, archive product
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <Archive className="w-4 h-4" /> Archive product
            </button>
          )
        )}

        {/* Delete (only for non-archived, non-produced products) */}
        {!product?.archived && !productProduced && (
          confirmDelete ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm font-medium text-destructive">Delete this product?</p>
              <p className="text-xs text-muted-foreground">This will permanently remove the product and all its filling assignments. This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={async () => { await deleteProduct(productId); router.replace("/products"); }}
                  className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
                >
                  Yes, delete product
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete product
            </button>
          )
        )}
      </div>
      )}

      </>
      )}
    </div>
  );
}

function ProductFillingHistorySection({ productId }: { productId: string }) {
  const history = useProductFillingHistory(productId);

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center px-4">
        No filling version changes recorded yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2 px-4 pb-8">
      {history.map((entry) => {
        const dateStr = new Date(entry.replacedAt).toLocaleDateString("en-GB", {
          day: "numeric", month: "short", year: "numeric",
        });
        const oldVersion = entry.oldFilling?.version ?? 1;
        const newVersion = entry.newFilling?.version ?? 1;
        const fillingName = entry.newFilling?.name ?? entry.oldFilling?.name ?? "Unknown filling";
        return (
          <li key={entry.id} className="rounded-lg border border-border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{fillingName}</p>
              <span className="text-xs text-muted-foreground shrink-0">{dateStr}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-mono">v{oldVersion}</span>
              {" → "}
              <span className="font-mono">v{newVersion}</span>
            </p>
            {entry.newFilling?.versionNotes && (
              <p className="text-xs mt-1 text-foreground">{entry.newFilling.versionNotes}</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const BATCH_STATUS_LABEL: Record<string, string> = { draft: "Not started", active: "In progress", done: "Done" };
const BATCH_STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-warning-muted text-warning",
  done: "bg-success-muted text-success",
};

function BatchHistoryTab({ productId }: { productId: string }) {
  const planProducts = usePlanProductsForProduct(productId);
  const allPlans = useProductionPlans();
  const moulds = useMouldsList(true);
  const [pendingRestore, setPendingRestore] = useState<string | null>(null);

  const planMap = useMemo(() => new Map(allPlans.map((p) => [p.id!, p])), [allPlans]);
  const mouldMap = useMemo(() => new Map(moulds.map((m) => [m.id!, m])), [moulds]);

  const rows = useMemo(() => {
    const mapped = planProducts
      .map((pb) => {
        const plan = planMap.get(pb.planId);
        const mould = mouldMap.get(pb.mouldId);
        return plan ? { pb, plan, mould } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    const active = mapped
      .filter((r) => r.plan.status !== "done")
      .sort((a, b) => new Date(b.plan.createdAt).getTime() - new Date(a.plan.createdAt).getTime());

    const done = mapped
      .filter((r) => r.plan.status === "done")
      .sort((a, b) => {
        const dateA = a.plan.completedAt ? new Date(a.plan.completedAt).getTime() : new Date(a.plan.createdAt).getTime();
        const dateB = b.plan.completedAt ? new Date(b.plan.completedAt).getTime() : new Date(b.plan.createdAt).getTime();
        return dateB - dateA;
      });

    return [...active, ...done];
  }, [planProducts, planMap, mouldMap]);

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center px-4">
        This product hasn't been included in any production batch yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2 px-4 pb-8">
      {rows.map(({ pb, plan, mould }) => {
        const planned = mould ? mould.numberOfCavities * pb.quantity : null;
        const productCount = pb.actualYield ?? planned;
        const availableCount = pb.currentStock ?? pb.actualYield ?? 0;
        const frozenCount = pb.frozenQty ?? 0;
        const fullyFrozen = availableCount <= 0 && frozenCount > 0;
        const partiallyFrozen = availableCount > 0 && frozenCount > 0;
        const dateFinished = plan.completedAt
          ? new Date(plan.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
          : null;
        const isDone = plan.status === "done";

        return (
          <li key={pb.id} className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Header row */}
            <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2">
              <div className="min-w-0">
                {plan.batchNumber && (
                  <span className="font-mono text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{plan.batchNumber}</span>
                )}
                <p className="font-medium text-sm mt-0.5 truncate">{plan.name}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${BATCH_STATUS_STYLE[plan.status]}`}>
                    {BATCH_STATUS_LABEL[plan.status]}
                  </span>
                  {isDone && (
                    pb.stockStatus === "gone" ? (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground">Gone</span>
                    ) : fullyFrozen ? (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200 inline-flex items-center gap-0.5">
                        <Snowflake className="w-2.5 h-2.5" /> Frozen
                      </span>
                    ) : pb.stockStatus === "low" ? (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-status-warn-bg text-status-warn">Low</span>
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary">In stock</span>
                    )
                  )}
                  {isDone && partiallyFrozen && (
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200 inline-flex items-center gap-0.5"
                      title="Some pieces from this batch are in the freezer"
                    >
                      <Snowflake className="w-2.5 h-2.5" /> {frozenCount} frozen
                    </span>
                  )}
                </div>
                {dateFinished
                  ? <p className="text-[10px] text-muted-foreground">Finished {dateFinished}</p>
                  : <p className="text-[10px] text-muted-foreground">{new Date(plan.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                }
              </div>
            </div>

            {/* Stats row */}
            <div className="px-3 pb-2">
              {mould ? (
                <p className="text-xs text-muted-foreground">
                  {mould.name} · {pb.quantity} mould{pb.quantity !== 1 ? "s" : ""}
                  {productCount !== null && (
                    <span className="text-foreground font-medium"> · {productCount} products</span>
                  )}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">{pb.quantity} mould{pb.quantity !== 1 ? "s" : ""}</p>
              )}
            </div>

            {/* Notes */}
            {(plan.notes || pb.notes) && (
              <div className="px-3 pb-2 space-y-1 border-t border-border pt-2">
                {plan.notes && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <StickyNote className="w-3 h-3 shrink-0 mt-px text-muted-foreground/60" />
                    <span><span className="font-medium text-foreground">Batch:</span> {plan.notes}</span>
                  </p>
                )}
                {pb.notes && (
                  <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                    <StickyNote className="w-3 h-3 shrink-0 mt-px text-muted-foreground/60" />
                    <span><span className="font-medium text-foreground">Product:</span> {pb.notes}</span>
                  </p>
                )}
              </div>
            )}

            {/* Restore from "gone" — inline confirmation (mirrors Stock page pattern) */}
            {isDone && pb.stockStatus === "gone" && (
              pendingRestore === pb.id ? (
                <div className="px-3 py-2 border-t border-border bg-muted/40 flex items-center gap-3">
                  <p className="text-xs text-muted-foreground flex-1">Restore to in stock?</p>
                  <button
                    onClick={() => { setPlanProductStockStatus(pb.id!, undefined); setPendingRestore(null); }}
                    className="text-xs font-medium text-foreground"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setPendingRestore(null)}
                    className="text-xs text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setPendingRestore(pb.id!)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground px-3 py-2 border-t border-border hover:bg-muted hover:text-foreground transition-colors w-full"
                >
                  <Undo2 className="w-3 h-3" />
                  Restore to stock
                </button>
              )
            )}

            {/* Link to batch */}
            <Link
              href={plan.status === "done"
                ? `/production/${plan.id}/summary?from=${encodeURIComponent(`/products/${productId}?tab=history`)}`
                : `/production/${plan.id}?from=${encodeURIComponent(`/products/${productId}?tab=history`)}`}
              className="flex items-center gap-1 text-xs text-primary px-3 py-2 border-t border-border hover:bg-muted transition-colors"
            >
              View batch <ChevronRight className="w-3 h-3" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// --- Cost Tab ---

function ProductCostTab({
  productId,
  product,
  productFillings,
  allMoulds,
  sym = "€",
}: {
  productId: string;
  product: { defaultMouldId?: string; coating?: string; name: string };
  productFillings: import("@/types").ProductFilling[];
  allMoulds: import("@/types").Mould[];
  sym?: string;
}) {
  const snapshots = useProductCostSnapshots(productId);
  const latest = useLatestProductCostSnapshot(productId);
  const allIngredients = useIngredients();
  // Full table reads so the missing-pricing warning sees nested fillings too.
  const allFillingIngredientsMap = useAllFillingIngredientsByFilling();
  const allFillingComponentsMap = useAllFillingComponentsByFilling();
  const allFillings = useFillings();

  const [recalculating, setRecalculating] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [sortKey, setSortKey] = useState<"layer" | "ingredient" | "grams" | "costPerGram" | "subtotal" | "pct">("subtotal");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [breakdownView, setBreakdownView] = useState<"grouped" | "flat">("grouped");
  const [collapsedLayers, setCollapsedLayers] = useState<Set<string>>(new Set());

  const mould = allMoulds.find((m) => m.id === product.defaultMouldId);
  const hasMould = !!mould;
  const hasCoating = !!product.coating;

  const ingredientsMap = new Map(allIngredients.map((i) => [i.id!, i]));
  const fillingsMap = new Map(allFillings.map((l) => [l.id!, l]));

  // Ingredients used in this product that have no pricing (and aren't marked
  // irrelevant). Walks nested fillings so an unpriced leaf inside a child
  // filling is still surfaced to the user.
  const missingPricingIngredients = useMemo(() => {
    const names = new Set<string>();
    for (const rl of productFillings) {
      const ids = reachableIngredientIds(rl.fillingId, allFillingIngredientsMap, allFillingComponentsMap);
      for (const id of ids) {
        const ing = ingredientsMap.get(id);
        if (ing && costPerGram(ing) === null) names.add(ing.name);
      }
    }
    return Array.from(names);
  }, [productFillings, allFillingIngredientsMap, allFillingComponentsMap, ingredientsMap]);

  const latestBreakdown: BreakdownEntry[] = latest
    ? enrichBreakdownLabels(deserializeBreakdown(latest.breakdown), ingredientsMap, fillingsMap)
    : [];

  const totalCost = useMemo(() => latestBreakdown.reduce((s, e) => s + e.subtotal, 0), [latestBreakdown]);

  function handleSort(key: "layer" | "ingredient" | "grams" | "costPerGram" | "subtotal" | "pct") {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  }

  // Split each breakdown row into layer + ingredient parts so both can be columns.
  // Shell/cap rows share the synthetic layer id "__shell__"; their ingredient label
  // is extracted from "Shell (chocolate name)".
  const enrichedBreakdown = useMemo(() => {
    return latestBreakdown.map(e => {
      const pct = totalCost > 0 ? e.subtotal / totalCost : 0;
      if (e.kind === "shell" || e.kind === "cap") {
        // Legacy snapshots emit separate shell + cap rows; the current cost engine
        // combines them into a single "shell" row. Treat both as shell-like here so
        // old data renders with a real layer/ingredient name instead of "Unknown".
        const labelPrefix = e.kind === "cap" ? "Cap" : "Shell";
        const re = new RegExp(`^${labelPrefix}\\s*\\((.+)\\)\\s*$`);
        const m = re.exec(e.label);
        const ingredientName = m ? m[1] : e.label.replace(new RegExp(`^${labelPrefix}\\s*`), "") || "chocolate";
        return { ...e, pct, layerId: "__shell__", layerName: "Shell", ingredientName };
      }
      const filling = e.fillingId ? fillingsMap.get(e.fillingId) : undefined;
      const ingredient = e.ingredientId ? ingredientsMap.get(e.ingredientId) : undefined;
      return {
        ...e,
        pct,
        layerId: e.fillingId ?? "__unknown__",
        layerName: filling?.name ?? "Unknown layer",
        ingredientName: ingredient?.name ?? "Unknown ingredient",
      };
    });
  }, [latestBreakdown, totalCost, fillingsMap, ingredientsMap]);

  // Flat view merges rows by ingredient: if butter is used in multiple layers,
  // a single row sums the weight + subtotal and lists all source layers.
  // Shell entries stay separate (no ingredientId) and key on their own name.
  const mergedBreakdown = useMemo(() => {
    type Merged = {
      key: string;
      ingredientName: string;
      layerNames: string[];
      grams: number;
      subtotal: number;
      pct: number;
      costPerGram: number;
      isShell: boolean;
    };
    const merged = new Map<string, Merged>();
    for (const row of enrichedBreakdown) {
      const isShellLike = row.kind === "shell" || row.kind === "cap";
      const key = isShellLike ? `__shell__:${row.ingredientName}` : (row.ingredientId ?? `__ing__:${row.ingredientName}`);
      const existing = merged.get(key);
      if (existing) {
        existing.grams += row.grams;
        existing.subtotal += row.subtotal;
        existing.pct += row.pct;
        if (!existing.layerNames.includes(row.layerName)) existing.layerNames.push(row.layerName);
      } else {
        merged.set(key, {
          key,
          ingredientName: row.ingredientName,
          layerNames: [row.layerName],
          grams: row.grams,
          subtotal: row.subtotal,
          pct: row.pct,
          costPerGram: row.costPerGram,
          isShell: isShellLike,
        });
      }
    }
    return Array.from(merged.values());
  }, [enrichedBreakdown]);

  const sortedMergedBreakdown = useMemo(() => {
    return [...mergedBreakdown].sort((a, b) => {
      const mult = sortDir === "asc" ? 1 : -1;
      if (sortKey === "layer") {
        const byLayer = a.layerNames[0].localeCompare(b.layerNames[0]);
        return mult * (byLayer !== 0 ? byLayer : a.ingredientName.localeCompare(b.ingredientName));
      }
      if (sortKey === "ingredient") {
        const byIng = a.ingredientName.localeCompare(b.ingredientName);
        return mult * (byIng !== 0 ? byIng : a.layerNames[0].localeCompare(b.layerNames[0]));
      }
      const diff: Record<string, number> = {
        grams: a.grams - b.grams,
        costPerGram: a.costPerGram - b.costPerGram,
        subtotal: a.subtotal - b.subtotal,
        pct: a.pct - b.pct,
      };
      return mult * (diff[sortKey] ?? 0);
    });
  }, [mergedBreakdown, sortKey, sortDir]);

  // Group by layer for the "Grouped" view. Layer order follows first appearance
  // in latestBreakdown so the visual order matches the product's filling order,
  // with Shell floating to the bottom.
  const groupedBreakdown = useMemo(() => {
    const groups = new Map<string, {
      layerId: string;
      layerName: string;
      rows: typeof enrichedBreakdown;
      weight: number;
      subtotal: number;
      pct: number;
    }>();
    for (const row of enrichedBreakdown) {
      const existing = groups.get(row.layerId);
      if (existing) {
        existing.rows.push(row);
        existing.weight += row.grams;
        existing.subtotal += row.subtotal;
        existing.pct += row.pct;
      } else {
        groups.set(row.layerId, {
          layerId: row.layerId,
          layerName: row.layerName,
          rows: [row],
          weight: row.grams,
          subtotal: row.subtotal,
          pct: row.pct,
        });
      }
    }
    // Legacy snapshots emit separate shell + cap rows. Collapse them into a single
    // row per ingredient so the Shell group matches the current engine's output.
    const shellGroup = groups.get("__shell__");
    if (shellGroup && shellGroup.rows.length > 1) {
      const byIngredient = new Map<string, typeof shellGroup.rows[number]>();
      for (const row of shellGroup.rows) {
        const existing = byIngredient.get(row.ingredientName);
        if (existing) {
          existing.grams += row.grams;
          existing.subtotal += row.subtotal;
          existing.pct += row.pct;
        } else {
          byIngredient.set(row.ingredientName, { ...row });
        }
      }
      shellGroup.rows = Array.from(byIngredient.values());
    }
    const arr = Array.from(groups.values());
    // Push Shell to the bottom; preserve filling insertion order for the rest.
    return arr.sort((a, b) => {
      if (a.layerId === "__shell__") return 1;
      if (b.layerId === "__shell__") return -1;
      return 0;
    });
  }, [enrichedBreakdown]);

  function toggleLayer(layerId: string) {
    setCollapsedLayers(prev => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }

  // Chronological for chart, newest-first for change log
  const chronological = [...snapshots].reverse();
  const displayedHistory = showAllHistory ? snapshots : snapshots.slice(0, 10);

  async function handleRecalculate() {
    setRecalculating(true);
    try {
      await recalculateProductCost(productId);
    } finally {
      setRecalculating(false);
    }
  }

  return (
    <div className="px-4 pb-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          {latest ? (
            <div>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-primary">{formatCost(latest.costPerProduct, sym)}</p>
                {missingPricingIngredients.length > 0 && (
                  <span className="inline-flex items-center rounded-full border border-status-alert-edge bg-status-alert-bg px-2 py-0.5 text-[11px] font-medium text-status-alert">
                    Incomplete
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">per product · 1 cavity</p>
            </div>
          ) : (
            <div>
              <p className="text-lg font-medium text-muted-foreground">No cost data yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">Click Recalculate to compute</p>
            </div>
          )}
          <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
            {mould && <span>Mould: {mould.name} ({mould.cavityWeightG}g)</span>}
            {product.coating && <span className="capitalize">Coating: {product.coating}</span>}
          </div>
        </div>
        <button
          onClick={handleRecalculate}
          disabled={recalculating}
          className="flex items-center gap-1.5 rounded-full border border-border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recalculating ? "animate-spin" : ""}`} />
          Recalculate
        </button>
      </div>

      {/* Warnings */}
      {!hasMould && (
        <div className="flex items-start gap-2 rounded-md bg-status-warn-bg border border-status-warn-edge px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
          <p className="text-xs text-status-warn">
            Set a <strong>default mould</strong> on this product to enable cost calculation.
          </p>
        </div>
      )}
      {hasMould && !hasCoating && (
        <div className="flex items-start gap-2 rounded-md bg-status-warn-bg border border-status-warn-edge px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
          <p className="text-xs text-status-warn">
            Shell and cap costs require a coating type. Set one above, then map it to a chocolate
            ingredient in <strong>Settings → Coating Chocolates</strong>.
          </p>
        </div>
      )}
      {missingPricingIngredients.length > 0 && (
        <div className="flex items-start gap-2 rounded-md bg-status-alert-bg border border-status-alert-edge px-3 py-2">
          <AlertTriangle className="w-4 h-4 text-status-alert shrink-0 mt-0.5" />
          <div className="text-xs text-status-alert">
            <p>
              The cost shown is incomplete. Add a purchase price for{" "}
              <strong>{missingPricingIngredients.length} ingredient{missingPricingIngredients.length > 1 ? "s" : ""}</strong>{" "}
              before relying on this total:
            </p>
            <p className="mt-0.5">{missingPricingIngredients.join(", ")}</p>
            <Link href="/ingredients" className="mt-1 inline-block underline font-medium hover:no-underline">
              Go to ingredients →
            </Link>
          </div>
        </div>
      )}

      {/* Chart */}
      {chronological.length >= 2 && (
        <div>
          <h2 className="text-sm font-semibold text-primary mb-2">Cost over time</h2>
          <CostHistoryChart snapshots={chronological} sym={sym} />
        </div>
      )}

      {/* Breakdown */}
      {latestBreakdown.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2 gap-3">
            <h2 className="text-sm font-semibold text-primary">Current breakdown</h2>
            <div className="inline-flex rounded-md border border-border bg-card p-0.5 text-xs">
              <button
                onClick={() => setBreakdownView("grouped")}
                className={`px-2.5 py-1 rounded transition-colors ${breakdownView === "grouped" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                By layer
              </button>
              <button
                onClick={() => setBreakdownView("flat")}
                className={`px-2.5 py-1 rounded transition-colors ${breakdownView === "flat" ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              >
                Sortable
              </button>
            </div>
          </div>

          {breakdownView === "grouped" ? (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {groupedBreakdown.map((group, gi) => {
                const collapsed = collapsedLayers.has(group.layerId);
                return (
                  <div key={group.layerId} className={gi > 0 ? "border-t border-border" : ""}>
                    <button
                      onClick={() => toggleLayer(group.layerId)}
                      className="w-full grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-left"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${collapsed ? "" : "rotate-90"}`} />
                      <span className="text-sm font-medium">{group.layerName}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{group.weight.toFixed(2)}g</span>
                      <div className="flex items-center gap-1.5 min-w-[4.5rem] justify-end">
                        <div className="h-1 w-12 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-status-warn-edge"
                            style={{ width: `${group.pct * 100}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{(group.pct * 100).toFixed(1)}%</span>
                      </div>
                      <span className="text-sm font-semibold text-primary tabular-nums">{formatCost(group.subtotal, sym)}</span>
                    </button>
                    {!collapsed && (
                      <ul className="divide-y divide-border">
                        {group.rows.map((row, ri) => (
                          <li key={ri} className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-3 py-1.5 pl-9 hover:bg-muted/20 transition-colors">
                            <span />
                            <span className="text-xs">{row.ingredientName}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{row.grams.toFixed(2)}g</span>
                            <span className="text-xs text-muted-foreground tabular-nums w-[4.5rem] text-right">{sym}{row.costPerGram.toFixed(4)}/g</span>
                            <span className="text-xs font-medium tabular-nums">{formatCost(row.subtotal, sym)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5 border-t border-border bg-muted/40">
                <span />
                <span className="text-sm font-semibold">Total</span>
                <span />
                <span />
                <span className="text-sm font-bold text-primary tabular-nums">{formatCost(totalCost, sym)}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th
                      className="text-left px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("layer")}
                    >
                      Layer{sortKey === "layer" && <span className="ml-0.5 opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>}
                    </th>
                    <th
                      className="text-left px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("ingredient")}
                    >
                      Ingredient{sortKey === "ingredient" && <span className="ml-0.5 opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>}
                    </th>
                    <th
                      className="text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("grams")}
                    >
                      Weight{sortKey === "grams" && <span className="ml-0.5 opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>}
                    </th>
                    <th
                      className="text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("costPerGram")}
                    >
                      {sym}/g{sortKey === "costPerGram" && <span className="ml-0.5 opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>}
                    </th>
                    <th
                      className="text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("pct")}
                    >
                      % cost{sortKey === "pct" && <span className="ml-0.5 opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>}
                    </th>
                    <th
                      className="text-right px-3 py-2 text-xs font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors"
                      onClick={() => handleSort("subtotal")}
                    >
                      Subtotal{sortKey === "subtotal" && <span className="ml-0.5 opacity-60">{sortDir === "desc" ? "↓" : "↑"}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedMergedBreakdown.map((entry, i) => (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {entry.layerNames.map((name, li) => (
                            <span key={li} className="inline-flex items-center rounded-full border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                              {name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">{entry.ingredientName}</td>
                      <td className="px-3 py-2 text-xs text-right text-muted-foreground tabular-nums">{entry.grams.toFixed(2)}g</td>
                      <td className="px-3 py-2 text-xs text-right text-muted-foreground tabular-nums">{entry.costPerGram.toFixed(4)}</td>
                      <td className="px-3 py-2 text-xs text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-muted-foreground tabular-nums">{(entry.pct * 100).toFixed(1)}%</span>
                          <div className="h-1 w-10 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-status-warn-edge"
                              style={{ width: `${entry.pct * 100}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-right font-medium tabular-nums">{formatCost(entry.subtotal, sym)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-muted/40">
                    <td colSpan={5} className="px-3 py-2 text-xs font-semibold">Total</td>
                    <td className="px-3 py-2 text-xs text-right font-bold text-primary tabular-nums">
                      {formatCost(totalCost, sym)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {latest && (
            <p className="text-xs text-muted-foreground mt-1.5">
              Calculated {new Date(latest.recordedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              {" · "}{latest.triggerDetail}
            </p>
          )}
        </div>
      )}

      {/* Change log */}
      {snapshots.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-primary mb-2">Change history</h2>
          <ul className="space-y-1.5">
            {displayedHistory.map((snap, i) => {
              const prev = snapshots[i + 1];
              const delta = prev ? costDelta(snap.costPerProduct, prev.costPerProduct, sym) : null;
              return (
                <li key={snap.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{formatCost(snap.costPerProduct, sym)}</span>
                    <div className="flex items-center gap-2">
                      {delta && (
                        <span className={`text-xs font-medium ${delta.positive ? "text-status-alert" : "text-status-ok"}`}>
                          {delta.label}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(snap.recordedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{snap.triggerDetail}</p>
                  <div className="flex gap-2 mt-0.5 text-xs text-muted-foreground">
                    {snap.mouldId && snap.mouldId !== product.defaultMouldId && (
                      <span>Mould: {allMoulds.find((m) => m.id === snap.mouldId)?.name ?? `#${snap.mouldId}`}</span>
                    )}
                    {snap.coatingName && <span className="capitalize">{snap.coatingName}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          {snapshots.length > 10 && !showAllHistory && (
            <button
              onClick={() => setShowAllHistory(true)}
              className="mt-2 text-xs text-primary hover:underline"
            >
              Show all {snapshots.length} entries
            </button>
          )}
        </div>
      )}

      {snapshots.length === 0 && hasMould && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No cost history yet. Press Recalculate to create the first entry.
        </p>
      )}
    </div>
  );
}

// Minimal SVG line chart — no external deps
function CostHistoryChart({ snapshots, sym = "€" }: { snapshots: ProductCostSnapshot[]; sym?: string }) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; snap: ProductCostSnapshot } | null>(null);

  if (snapshots.length < 2) return null;

  const W = 320;
  const H = 100;
  const PAD = { top: 8, right: 8, bottom: 20, left: 48 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const costs = snapshots.map((s) => s.costPerProduct);
  const times = snapshots.map((s) => new Date(s.recordedAt).getTime());
  const minCost = Math.min(...costs);
  const maxCost = Math.max(...costs);
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  // Add vertical padding so data points don't sit flush at the chart edges
  const dataCostRange = maxCost - minCost || maxCost * 0.1 || 0.01;
  const vPad = dataCostRange * 0.25;
  const yMin = Math.max(0, minCost - vPad);
  const yMax = maxCost + vPad;
  const yRange = yMax - yMin;
  const timeRange = maxTime - minTime || 1;

  function toX(t: number) { return PAD.left + ((t - minTime) / timeRange) * innerW; }
  function toY(c: number) { return PAD.top + (1 - (c - yMin) / yRange) * innerH; }

  const points = snapshots.map((s) => `${toX(new Date(s.recordedAt).getTime())},${toY(s.costPerProduct)}`).join(" ");

  // 3 Y ticks: top data value, midpoint, bottom data value
  const yTicks = [maxCost, (minCost + maxCost) / 2, minCost];

  const triggerColors: Record<ProductCostSnapshot["triggerType"], string> = {
    ingredient_price: "#c2410c",  // orange
    filling_version: "#7c3aed",     // purple
    mould_change: "#0369a1",      // blue
    coating_change: "#065f46",    // green
    shell_change: "#b45309",      // amber
    manual: "#6b7280",            // grey
  };

  // Date labels: first and last
  const dateLabel = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 120 }}
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Y gridlines + labels */}
        {yTicks.map((tick, i) => {
          const y = toY(tick);
          return (
            <g key={i}>
              <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke="#e5e7eb" strokeWidth={1} strokeDasharray={tick === minCost || tick === maxCost ? "none" : "3 3"} />
              <text x={PAD.left - 4} y={y} textAnchor="end" fontSize={9} fill="#9ca3af" dominantBaseline="middle">{formatCost(tick, sym)}</text>
            </g>
          );
        })}

        {/* Vertical axis line */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + innerH} stroke="#e5e7eb" strokeWidth={1} />

        {/* X axis date labels */}
        <text x={PAD.left} y={H - 4} textAnchor="start" fontSize={9} fill="#9ca3af">{dateLabel(minTime)}</text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" fontSize={9} fill="#9ca3af">{dateLabel(maxTime)}</text>

        {/* Line */}
        <polyline points={points} fill="none" stroke="var(--color-primary, #78350f)" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Data points */}
        {snapshots.map((snap, i) => {
          const cx = toX(new Date(snap.recordedAt).getTime());
          const cy = toY(snap.costPerProduct);
          const color = triggerColors[snap.triggerType];
          return (
            <circle
              key={snap.id}
              cx={cx}
              cy={cy}
              r={4}
              fill={color}
              stroke="white"
              strokeWidth={1.5}
              className="cursor-pointer"
              onMouseEnter={(e) => {
                const svg = (e.target as SVGElement).closest("svg")!;
                const rect = svg.getBoundingClientRect();
                setTooltip({ x: cx, y: cy, snap });
              }}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {(Object.entries(triggerColors) as [ProductCostSnapshot["triggerType"], string][])
          .filter(([type]) => snapshots.some((s) => s.triggerType === type))
          .map(([type, color]) => (
            <span key={type} className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
              {{ ingredient_price: "ingredient price", filling_version: "filling updated", mould_change: "mould changed", coating_change: "coating changed", shell_change: "shell change", manual: "initial" }[type]}
            </span>
          ))}
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="absolute z-10 pointer-events-none rounded-md border border-border bg-card shadow-md px-2.5 py-1.5 text-xs"
          style={{
            left: Math.min(tooltip.x / W * 100, 70) + "%",
            top: (tooltip.y / 120 * 100) + "%",
            transform: "translate(-50%, -120%)",
          }}
        >
          <p className="font-semibold">{formatCost(tooltip.snap.costPerProduct, sym)}</p>
          <p className="text-muted-foreground">{new Date(tooltip.snap.recordedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
          <p className="text-muted-foreground max-w-[160px] truncate">{tooltip.snap.triggerDetail}</p>
        </div>
      )}
    </div>
  );
}

// MaterialPicker lets the user search and select a DecorationMaterial to add to a step.
// When the typed name has no exact match, a "+ Create" row appears inline.
function MaterialPicker({
  allMaterials,
  excludeIds,
  onAdd,
  filterType,
  categoryLabels,
}: {
  allMaterials: DecorationMaterial[];
  excludeIds: string[];
  onAdd: (id: string) => void;
  filterType?: string;
  categoryLabels?: Map<string, string>;
}) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const trimmed = input.trim();

  const filtered = useMemo(() => {
    const query = trimmed.toLowerCase();
    return allMaterials
      .filter((m) => !excludeIds.includes(m.id!))
      .filter((m) => !filterType || m.type === filterType)
      .filter((m) => !query || m.name.toLowerCase().includes(query));
  }, [trimmed, allMaterials, excludeIds, filterType]);

  const exactMatch = trimmed
    ? allMaterials.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())
    : false;
  const showCreate = !!trimmed && !exactMatch;
  const totalOptions = filtered.length + (showCreate ? 1 : 0);

  useEffect(() => { setHighlightIdx(-1); }, [input]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function select(material: DecorationMaterial) {
    onAdd(material.id!);
    setInput("");
    setOpen(false);
    setHighlightIdx(-1);
  }

  async function handleCreateNew() {
    if (!trimmed) return;
    const id = await saveDecorationMaterial({
      name: trimmed,
      type: "cocoa_butter",
      color: colorToCSS(trimmed),
    });
    onAdd(id);
    setInput("");
    setOpen(false);
    setHighlightIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const showDropdown = !!trimmed && totalOptions > 0;
    if (!showDropdown) {
      if (e.key === "Escape") { setOpen(false); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlightIdx((prev) => Math.min(prev + 1, totalOptions - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < filtered.length) {
        select(filtered[highlightIdx]);
      } else if (showCreate && highlightIdx === filtered.length) {
        handleCreateNew();
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightIdx(-1);
    }
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        value={input}
        onChange={(e) => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search decoration materials…"
        className="input"
      />
      {open && (filtered.length > 0 || showCreate) && (
        <ul className="absolute z-20 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
          {filtered.map((m, idx) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => select(m)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${
                  idx === highlightIdx ? "bg-primary/10" : "hover:bg-muted"
                }`}
              >
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                  style={{ backgroundColor: m.color ?? "#9ca3af" }}
                />
                <span>{m.name} <span className="text-xs text-muted-foreground font-normal">· {categoryLabels?.get(m.type) ?? DECORATION_MATERIAL_TYPE_LABELS[m.type] ?? m.type}</span></span>
              </button>
            </li>
          ))}
          {showCreate && (
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleCreateNew}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors border-t border-border ${
                  highlightIdx === filtered.length ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                }`}
              >
                + Create <span className="font-medium text-foreground ml-1">"{trimmed}"</span>
                <span className="ml-auto text-xs">Cocoa Butter</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ShellDesignSection({
  steps,
  onUpdate,
  readonly = false,
}: {
  steps: ShellDesignStep[];
  onUpdate: (steps: ShellDesignStep[]) => void;
  readonly?: boolean;
}) {
  const allMaterials = useDecorationMaterials();
  const materialsMap = useMemo(
    () => new Map(allMaterials.map((m) => [m.id!, m])),
    [allMaterials]
  );
  const shellDesigns = useShellDesigns();
  const categoryLabels = useDecorationCategoryLabels();

  function update(newSteps: ShellDesignStep[]) {
    onUpdate(newSteps);
  }

  function addStep() {
    const defaultTechnique = shellDesigns.length > 0 ? shellDesigns[0].name : (SHELL_TECHNIQUES[0] as string);
    const defaultApplyAt = shellDesigns.length > 0 ? normalizeApplyAt(shellDesigns[0].defaultApplyAt) : "colour";
    update([...steps, { technique: defaultTechnique, materialIds: [], notes: "", applyAt: defaultApplyAt }]);
  }

  function removeStep(i: number) {
    update(steps.filter((_, idx) => idx !== i));
  }

  function updateTechnique(i: number, technique: string) {
    update(steps.map((s, idx) => (idx === i ? { ...s, technique } : s)));
  }

  function addMaterial(stepIdx: number, materialId: string) {
    if (steps[stepIdx].materialIds.includes(materialId)) return;
    update(steps.map((s, i) =>
      i === stepIdx ? { ...s, materialIds: [...s.materialIds, materialId] } : s
    ));
  }

  function removeMaterial(stepIdx: number, materialId: string) {
    update(
      steps.map((s, i) =>
        i === stepIdx ? { ...s, materialIds: s.materialIds.filter((id) => id !== materialId) } : s
      )
    );
  }

  function updateNotes(i: number, notes: string) {
    update(steps.map((s, idx) => (idx === i ? { ...s, notes } : s)));
  }

  function updateApplyAt(i: number, applyAt: ShellDesignApplyAt) {
    update(steps.map((s, idx) => (idx === i ? { ...s, applyAt } : s)));
  }

  return (
    <div className="px-4 pb-6 border-t border-border pt-4 space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">Shell design</h2>

      {steps.length > 0 && (
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="rounded-lg border border-border bg-card p-3 space-y-3">
              {/* Technique row */}
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0 select-none">
                  {i + 1}
                </span>
                {readonly ? (
                  <span className="text-sm font-medium">{step.technique}</span>
                ) : (
                  <>
                    <select
                      value={step.technique}
                      onChange={(e) => {
                        // Apply both technique + default applyAt in a SINGLE update.
                        // Splitting into two calls (updateTechnique then updateApplyAt)
                        // caused the second to overwrite the first with stale `steps`
                        // from the closure, reverting the technique back to the
                        // previous value on every change.
                        const newTechnique = e.target.value;
                        const design = shellDesigns.find((d) => d.name === newTechnique);
                        const newApplyAt = design?.defaultApplyAt
                          ? normalizeApplyAt(design.defaultApplyAt)
                          : undefined;
                        update(steps.map((s, idx) =>
                          idx === i
                            ? { ...s, technique: newTechnique, ...(newApplyAt ? { applyAt: newApplyAt } : {}) }
                            : s
                        ));
                      }}
                      className="input"
                    >
                      {shellDesigns.map((d) => (
                        <option key={d.id} value={d.name}>{d.name}</option>
                      ))}
                      {/* Fallback for legacy techniques not in the DB */}
                      {shellDesigns.length === 0 && SHELL_TECHNIQUES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                      {shellDesigns.length > 0 && !shellDesigns.some((d) => d.name === step.technique) && (
                        <option value={step.technique}>{step.technique}</option>
                      )}
                    </select>
                    <button
                      onClick={() => removeStep(i)}
                      className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
                      aria-label="Remove step"
                    >
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </>
                )}
              </div>

              {/* Decoration materials */}
              <div>
                <label className="label">Decoration materials</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {step.materialIds.map((id) => {
                    const m = materialsMap.get(id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium"
                      >
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                          style={{ backgroundColor: m?.color ?? "#9ca3af" }}
                        />
                        {m?.name ?? id}
                        {m && (
                          <span className="text-primary/60 font-normal">· {categoryLabels.get(m.type) ?? DECORATION_MATERIAL_TYPE_LABELS[m.type] ?? m.type}</span>
                        )}
                        {!readonly && (
                          <button
                            onClick={() => removeMaterial(i, id)}
                            aria-label={`Remove ${m?.name ?? id}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
                {!readonly && (
                  <MaterialPicker
                    allMaterials={allMaterials}
                    excludeIds={step.materialIds}
                    onAdd={(id) => addMaterial(i, id)}
                    filterType={step.technique === "Transfer Sheet" ? "transfer_sheet" : undefined}
                    categoryLabels={categoryLabels}
                  />
                )}
              </div>

              {/* Apply timing */}
              {(() => {
                const isTransferSheet = step.materialIds.some(
                  (id) => materialsMap.get(id)?.type === "transfer_sheet"
                );
                const normalized = normalizeApplyAt(step.applyAt);
                const phaseLabel = DECORATION_APPLY_AT_OPTIONS.find((o) => o.value === normalized)?.label ?? normalized;
                if (readonly) {
                  if (isTransferSheet) {
                    return (
                      <p className="text-xs text-muted-foreground italic">Applied at capping (transfer sheet)</p>
                    );
                  }
                  if (normalized !== "colour") {
                    return (
                      <p className="text-xs text-muted-foreground italic">Applied during: {phaseLabel}</p>
                    );
                  }
                  return null;
                }
                if (isTransferSheet) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      Applied at capping — transfer sheets are always placed during capping
                    </p>
                  );
                }
                return (
                  <div>
                    <label className="label">Apply when</label>
                    <select
                      value={normalized}
                      onChange={(e) => updateApplyAt(i, e.target.value as ShellDesignApplyAt)}
                      className="input"
                    >
                      {DECORATION_APPLY_AT_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })()}

              {/* Notes */}
              {readonly ? (
                step.notes && <p className="text-xs text-muted-foreground">{step.notes}</p>
              ) : (
                <div>
                  <label className="label">Technique notes</label>
                  <input
                    type="text"
                    value={step.notes ?? ""}
                    onChange={(e) => updateNotes(i, e.target.value)}
                    placeholder="e.g. Use a soft brush, keep cocoa butter at 31°C…"
                    className="input"
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!readonly && (
        <button
          onClick={addStep}
          className="flex items-center gap-1 text-xs text-primary font-medium"
          title="Add decoration step"
        >
          <Plus className="w-3.5 h-3.5" /> Add decoration step
        </button>
      )}
    </div>
  );
}

function SortableProductFillingRow({
  productFilling,
  fillMode,
  cavityWeightG,
  onRemove,
  onUpdatePercentage,
  onUpdateGrams,
}: {
  productFilling: ProductFilling;
  fillMode: FillMode;
  /** Cavity weight of the product's default mould, used to convert the stored
   *  `fillFraction` to/from grams for display and input. Null when no default
   *  mould is set (grams mode is then disabled — handled upstream). */
  cavityWeightG: number | null;
  onRemove: () => void;
  onUpdatePercentage: (pct: number) => void;
  onUpdateGrams: (g: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: productFilling.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} suppressHydrationWarning>
      <ProductFillingRow
        productFilling={productFilling}
        fillMode={fillMode}
        cavityWeightG={cavityWeightG}
        onRemove={onRemove}
        onUpdatePercentage={onUpdatePercentage}
        onUpdateGrams={onUpdateGrams}
        readonly={false}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
        isDragging={isDragging}
      />
    </div>
  );
}

function ProductFillingRow({
  productFilling,
  fillMode,
  cavityWeightG,
  onRemove,
  onUpdatePercentage,
  onUpdateGrams,
  readonly = false,
  dragHandleListeners,
  dragHandleAttributes,
  isDragging,
}: {
  productFilling: ProductFilling;
  fillMode: FillMode;
  /** Default mould's cavity weight (g of water ≈ ml). Required to convert the
   *  stored `fillFraction` (mould-agnostic) to user-facing grams. Null when no
   *  default mould is set — grams display falls back to "—". */
  cavityWeightG: number | null;
  onRemove: () => void;
  onUpdatePercentage: (pct: number) => void;
  onUpdateGrams: (g: number) => void;
  readonly?: boolean;
  dragHandleListeners?: SyntheticListenerMap;
  dragHandleAttributes?: DraggableAttributes;
  isDragging?: boolean;
}) {
  const filling = useFilling(productFilling.fillingId);
  const isGrams = fillMode === "grams";
  // Convert the stored fraction back to grams for display/input, against the
  // product's default mould. Rounded to 1 decimal so the field stays tidy.
  const gramsForDefault = cavityWeightG != null && productFilling.fillFraction != null
    ? Math.round(fillFractionToGrams(productFilling.fillFraction, cavityWeightG) * 10) / 10
    : null;
  const [pctInput, setPctInput] = useState(String(productFilling.fillPercentage ?? 100));
  const [gramsInput, setGramsInput] = useState(gramsForDefault != null ? String(gramsForDefault) : "");
  const [focused, setFocused] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(false);

  useEffect(() => {
    if (!focused) {
      setPctInput(String(productFilling.fillPercentage ?? 100));
      setGramsInput(gramsForDefault != null ? String(gramsForDefault) : "");
    }
  }, [productFilling.fillPercentage, gramsForDefault, focused]);

  if (!filling) return null;

  function commitPercentage() {
    const val = parseInt(pctInput);
    if (!isNaN(val) && val > 0 && val <= 100) {
      onUpdatePercentage(val);
    } else {
      setPctInput(String(productFilling.fillPercentage ?? 100));
    }
  }

  function commitGrams() {
    const val = parseFloat(gramsInput);
    if (!isNaN(val) && val >= 0) {
      onUpdateGrams(val);
    } else {
      setGramsInput(gramsForDefault != null ? String(gramsForDefault) : "");
    }
  }

  return (
    <li className={`rounded-lg border border-border bg-card p-3 flex items-start gap-2 ${isDragging ? "opacity-50" : ""}`}>
      {!readonly && (
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 mt-0.5 text-muted-foreground/40 hover:text-muted-foreground touch-none shrink-0"
          aria-label="Drag to reorder"
          suppressHydrationWarning
          {...dragHandleListeners}
          {...dragHandleAttributes}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <Link href={`/fillings/${encodeURIComponent(filling.id ?? '')}`} className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-medium text-sm">{filling.name}</h3>
          <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[10px] font-semibold shrink-0 tabular-nums">
            {isGrams ? `${gramsForDefault ?? 0}g` : `${productFilling.fillPercentage ?? 100}%`}
          </span>
        </div>
        {(filling.category || filling.subcategory) && (
          <p className="text-xs text-primary/80 truncate">
            {filling.category}{filling.subcategory && ` › ${filling.subcategory}`}
          </p>
        )}
        {filling.description && (
          <p className="text-xs text-muted-foreground truncate">{filling.description}</p>
        )}
        {filling.allergens.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {filling.allergens.map((a) => (
              <span
                key={a}
                className="rounded-full bg-status-warn-bg text-status-warn border border-status-warn-edge px-2 py-0.5 text-[10px] font-medium"
              >
                {allergenLabel(a)}
              </span>
            ))}
          </div>
        )}
      </Link>
      {readonly ? (
        <span className="text-xs text-muted-foreground shrink-0">
          {isGrams ? `${gramsForDefault ?? 0}g` : `${productFilling.fillPercentage ?? 100}%`}
        </span>
      ) : (
        <>
          <div className="flex items-center gap-1 shrink-0">
            {isGrams ? (
              <>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={gramsInput}
                  onChange={(e) => setGramsInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => { setFocused(false); commitGrams(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
                  placeholder="0"
                  title="Grams of filling per cavity in the default mould. Stored as a fraction of cavity volume so production on a different mould rescales the recipe automatically."
                  className="input w-16 text-right"
                />
                <span className="text-xs text-muted-foreground">g</span>
              </>
            ) : (
              <>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={pctInput}
                  onChange={(e) => setPctInput(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => { setFocused(false); commitPercentage(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur(); } }}
                  className="input w-14 text-right"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </>
            )}
          </div>
          {pendingRemove ? (
            <span className="flex items-center gap-1.5 text-xs shrink-0">
              <span className="text-muted-foreground">Remove?</span>
              <button
                onClick={() => { onRemove(); setPendingRemove(false); }}
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
              className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
              aria-label={`Remove ${filling.name}`}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </>
      )}
    </li>
  );
}

function FillBar({ productFillings }: { productFillings: { id?: string; fillingId: string; fillPercentage: number; fillingName: string; categoryColor: string }[] }) {
  const total = productFillings.reduce((s, bl) => s + (bl.fillPercentage ?? 0), 0);
  const isValid = total === 100;
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Calculate left offset (%) for the tooltip anchor
  let offset = 0;
  const offsets = productFillings.map((bl) => {
    const mid = offset + (bl.fillPercentage ?? 0) / 2;
    offset += bl.fillPercentage ?? 0;
    return mid;
  });

  return (
    <div className="space-y-1.5">
      <div className="relative">
        {/* Tooltip */}
        {hoveredIdx !== null && (
          <div
            className="absolute -top-7 z-10 pointer-events-none"
            style={{ left: `${offsets[hoveredIdx]}%`, transform: "translateX(-50%)" }}
          >
            <div className="rounded bg-foreground text-background text-[10px] font-medium px-1.5 py-0.5 whitespace-nowrap">
              {productFillings[hoveredIdx].fillingName} · {productFillings[hoveredIdx].fillPercentage}%
            </div>
          </div>
        )}
        <div className="flex rounded-full overflow-hidden h-3 gap-px bg-muted">
          {productFillings.map((bl, i) => {
            const pct = bl.fillPercentage ?? 0;
            return (
              <div
                key={bl.id}
                className="transition-all cursor-default"
                style={{ width: `${pct}%`, backgroundColor: bl.categoryColor }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onTouchStart={() => setHoveredIdx(i)}
                onTouchEnd={() => setHoveredIdx(null)}
              />
            );
          })}
          {!isValid && total < 100 && (
            <div className="flex-1 bg-destructive/20" />
          )}
        </div>
      </div>
      {!isValid && (
        <p className="text-[10px] text-destructive font-medium">
          Fill percentages total {total}% — adjust to reach 100%
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nutrition tab — aggregated per-product and per-100g nutrition data
// ---------------------------------------------------------------------------

function ProductNutritionTab({ productId, productFillings, market }: { productId: string; productFillings: ProductFilling[]; market: MarketRegion }) {
  const product = useProduct(productId);
  const allIngredients = useIngredients(true);
  const allMoulds = useMouldsList(true);
  // Read the *full* filling-ingredient and filling-component tables so the
  // recursive flattener inside `calculateProductNutrition` can expand nested
  // fillings — its walk needs every level, not just the host fillings on
  // this product.
  const fillingIngredientsMap = useAllFillingIngredientsByFilling();
  const fillingComponentsMap = useAllFillingComponentsByFilling();

  const ingredientMap = useMemo(() => new Map(allIngredients.map(i => [i.id!, i])), [allIngredients]);
  const mould = allMoulds.find(m => m.id === product?.defaultMouldId);
  const shellIngredient = product?.shellIngredientId ? (ingredientMap.get(product.shellIngredientId) ?? null) : null;

  // In grams mode, derive shell percentage from the stored fillFraction values.
  // Fractions are mould-agnostic, so the shell ratio is the same on any mould.
  const effectiveShellPercentage = useMemo(() => {
    if (product?.fillMode === "grams" && mould) {
      const totalFillFraction = productFillings.reduce((sum, pf) => sum + (pf.fillFraction ?? 0), 0);
      return deriveShellPercentageFromFractions(totalFillFraction);
    }
    return product?.shellPercentage ?? 37;
  }, [product?.fillMode, product?.shellPercentage, mould, productFillings]);

  const result = useMemo(
    () => calculateProductNutrition({
      mould: mould ?? null,
      productFillings,
      fillingIngredientsMap,
      fillingComponentsMap,
      ingredientMap,
      shellIngredient: shellIngredient ?? null,
      shellPercentage: effectiveShellPercentage,
    }),
    [mould, productFillings, fillingIngredientsMap, fillingComponentsMap, ingredientMap, shellIngredient, effectiveShellPercentage],
  );

  const { per100g, perProduct, productWeightG, ingredientsWithData, ingredientsTotal, warnings } = result;
  const nutrients = getNutrientsByMarket(market);
  const panelTitle = getNutritionPanelTitle(market);
  const showDV = market === "US";
  const showPerProduct = true; // always show per-product column
  // US also shows per-serving (RACC 30g for candy)
  const showPerServing = market === "US";
  const perServing = showPerServing ? scaleToServing(per100g, 30) : perProduct;

  const hasData = Object.keys(per100g).length > 0;

  if (!product) return null;

  if (productFillings.length === 0 && !shellIngredient) {
    return (
      <div className="px-4 pb-6">
        <p className="text-sm text-muted-foreground py-8 text-center">
          Add fillings to this product to see nutrition data.
        </p>
      </div>
    );
  }

  if (!mould) {
    return (
      <div className="px-4 pb-6">
        <p className="text-sm text-muted-foreground py-8 text-center">
          Set a default mould on this product to calculate per-product nutrition.
          The mould determines shell, cap, and fill weights.
        </p>
      </div>
    );
  }

  if (!hasData) {
    return (
      <div className="px-4 pb-6">
        <p className="text-sm text-muted-foreground py-8 text-center">
          None of the ingredients in this product have nutrition data.
          Add nutrition values to your ingredients to see aggregated data here.
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-6">
      <h2 className="text-sm font-medium text-muted-foreground mb-1">{panelTitle}</h2>

      {warnings.map((w, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-amber-700 mb-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>{w}</span>
        </div>
      ))}

      {ingredientsWithData < ingredientsTotal && (
        <div className="flex items-start gap-2 text-xs text-amber-700 mb-1">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Nutrition data for {ingredientsWithData} of {ingredientsTotal} ingredients.
            Values are partial — add data to remaining ingredients for complete figures.
          </span>
        </div>
      )}

      <p className="text-xs text-muted-foreground mb-3 mt-2">
        Product weight: {productWeightG.toFixed(1)}g
        {" "}(shell + cap: {mould ? (calculateShellWeightG(mould) + calculateCapWeightG(mould)).toFixed(1) : "?"}g
        {shellIngredient ? ` of ${shellIngredient.name}` : ""}
        {", "}fill: {mould ? (productWeightG - calculateShellWeightG(mould) - calculateCapWeightG(mould)).toFixed(1) : "?"}g)
        {showPerServing && " · FDA serving: 30g"}
      </p>

      {/* Nutrition table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {/* Header row */}
        <div className="flex items-center px-3 py-2 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground">
          <span className="flex-1">Nutrient</span>
          <span className="w-24 text-right">Per 100g</span>
          {showPerProduct && (
            <span className="w-24 text-right">Per product</span>
          )}
          {showPerServing && (
            <span className="w-24 text-right">Per serving</span>
          )}
          {showDV && (
            <span className="w-16 text-right">%DV</span>
          )}
        </div>

        {/* Nutrient rows */}
        {nutrients.map((n) => {
          const val100 = per100g[n.key];
          const valProduct = perProduct[n.key];
          const valServing = showPerServing ? perServing[n.key] : undefined;
          const dv = showDV ? percentDailyValue(valServing, n.dailyValue) : undefined;

          return (
            <div
              key={n.key}
              className={`flex items-baseline px-3 py-1.5 text-sm border-b border-border last:border-b-0 ${
                n.indent === 0 ? "font-medium" : "font-normal"
              }`}
            >
              <span className={`flex-1 ${n.indent === 1 ? "ml-4 text-muted-foreground" : n.indent === 2 ? "ml-8 text-muted-foreground" : ""}`}>
                {n.label}
              </span>
              <span className={`w-24 text-right ${val100 == null ? "text-muted-foreground/50" : ""}`}>
                {formatNutrientValue(val100, n.unit)}
              </span>
              {showPerProduct && (
                <span className={`w-24 text-right ${valProduct == null ? "text-muted-foreground/50" : ""}`}>
                  {formatNutrientValue(valProduct, n.unit)}
                </span>
              )}
              {showPerServing && (
                <span className={`w-24 text-right ${valServing == null ? "text-muted-foreground/50" : ""}`}>
                  {formatNutrientValue(valServing, n.unit)}
                </span>
              )}
              {showDV && (
                <span className="w-16 text-right text-xs text-muted-foreground">
                  {dv != null ? `${dv}%` : ""}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- Shop display colour control (edit + readonly) ----

/** Edit-mode control. Matches the decoration-materials page's colour input
 *  (40×40 native picker + mono hex). Handles the extra "auto" state that
 *  decoration materials don't need — when empty, the Shop derives from
 *  the shell design (falling back to a name-hash). */
function ShopColorControl({
  value,
  onChange,
  productName,
  shellDesign,
}: {
  value: string;
  onChange: (next: string) => void;
  productName: string;
  shellDesign: ShellDesignStep[];
}) {
  const materialColorById = useDecorationMaterialColorMap();
  const derived = deriveShopColor({ name: productName, shellDesign }, materialColorById);
  const isExplicit = value !== "";
  const effective = isExplicit
    ? value
    : resolveShopColor({ name: productName, shellDesign }, materialColorById);
  const effectiveHex = hexFromAny(effective);

  return (
    <div className="px-4 pb-4">
      <label className="label" htmlFor="shop-color-input">Shop display colour</label>
      {isExplicit ? (
        <div className="flex items-center gap-3">
          <input
            id="shop-color-input"
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : effectiveHex}
            onChange={(e) => onChange(e.target.value)}
            className="w-10 h-10 rounded-md border border-border cursor-pointer p-0.5"
            title="Pick colour"
            aria-label="Pick shop display colour"
            data-testid="shop-color-input"
          />
          <span className="text-sm text-muted-foreground font-mono">{value}</span>
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-xs text-muted-foreground hover:text-foreground underline"
            data-testid="shop-color-reset"
          >
            Use auto
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="w-10 h-10 rounded-md border border-border p-0.5"
            data-testid="shop-color-swatch"
          >
            <div className="w-full h-full rounded-sm" style={{ background: effective }} />
          </div>
          <span className="text-sm text-muted-foreground font-mono">{effectiveHex}</span>
          <button
            type="button"
            onClick={() => onChange(effectiveHex)}
            className="text-xs text-muted-foreground hover:text-foreground underline"
            data-testid="shop-color-override"
          >
            Customize
          </button>
        </div>
      )}
      <p className="text-xs text-muted-foreground mt-1.5">
        {isExplicit
          ? "Custom colour for the bonbon disc in the Shop (cavities, palette, summary)."
          : derived
            ? "Auto — from the first colour-phase decoration material."
            : "Auto — falls back to a colour hashed from the name."}
      </p>
    </div>
  );
}

/** Readonly variant for the non-edit view of the Shell Design tab. Matches
 *  the edit control's 40×40 swatch + mono hex pattern. */
function ShopColorReadonly({ product }: { product: Product }) {
  const materialColorById = useDecorationMaterialColorMap();
  const derived = deriveShopColor(product, materialColorById);
  const effective = resolveShopColor(product, materialColorById);
  const isExplicit = Boolean(product.shopColor);
  const source = isExplicit ? "custom" : derived ? "auto (from shell design)" : "auto (hashed from name)";

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="text-xs font-medium text-muted-foreground mb-1.5">Shop display colour</div>
      <div className="flex items-center gap-3">
        <div
          aria-hidden
          className="w-10 h-10 rounded-md border border-border p-0.5 shrink-0"
        >
          <div className="w-full h-full rounded-sm" style={{ background: effective }} />
        </div>
        <span className="text-sm text-muted-foreground font-mono">
          {hexFromAny(effective)}
        </span>
        <span className="text-xs text-muted-foreground">· {source}</span>
      </div>
    </div>
  );
}

/** Best-effort conversion of an arbitrary CSS colour to a 7-char hex so the
 *  native <input type="color"> gets a valid value. Named / hsl / rgb colours
 *  all resolve correctly when rendered into a detached element's style. */
function hexFromAny(css: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(css)) return css;
  if (typeof document === "undefined") return "#a8753a";
  const el = document.createElement("div");
  el.style.color = css;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color;
  document.body.removeChild(el);
  const m = rgb.match(/rgb(?:a)?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return "#a8753a";
  const hex = [m[1], m[2], m[3]]
    .map((n) => parseInt(n, 10).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}
