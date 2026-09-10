"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useCollection,
  useCollectionProducts,
  useCollectionPackagings,
  useCollectionPricingSnapshots,
  updateCollectionFields,
  deleteCollection,
  addProductToCollection,
  removeProductFromCollection,
  saveCollectionPackaging,
  saveCollectionPricingSnapshot,
  deleteCollectionPackaging,
  useProductsList,
  usePackagingList,
  useAllPackagingOrders,
  useCurrencySymbol,
  useProductCategoryMap,
} from "@/lib/hooks";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Plus, Search, X, Trash2, ChevronDown, RefreshCw, AlertTriangle } from "lucide-react";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import { SidebarCard, PropertyRow, DerivedRow, PROPERTY_INPUT_CLASS } from "@/components/detail-sidebar";
import { useSpaId } from "@/lib/use-spa-id";
import Link from "next/link";
import type { Collection, ProductCostSnapshot, Packaging, PackagingOrder, CollectionPricingSnapshot } from "@/types";
import { costPerGram } from "@/types";
import {
  latestPackagingUnitCost,
  averageProductCost,
  calculateBoxPricing,
  marginHealth,
  marginDelta,
  formatPrice,
  formatMarginPercent,
  type ProductCostEntry,
  type BoxPricingResult,
  type MarginHealth,
} from "@/lib/collectionPricing";

type CollectionStatus = "active" | "upcoming" | "past" | "permanent";

function getStatus(startDate: string, endDate?: string): CollectionStatus {
  const today = new Date().toISOString().split("T")[0];
  if (!endDate) return startDate <= today ? "permanent" : "upcoming";
  if (startDate > today) return "upcoming";
  if (endDate < today) return "past";
  return "active";
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const STATUS_LABEL: Record<CollectionStatus, string> = {
  permanent: "Standard / ongoing",
  active: "Active",
  upcoming: "Upcoming",
  past: "Past",
};

const STATUS_CLASS: Record<CollectionStatus, string> = {
  permanent: "text-primary bg-primary/10",
  active: "text-emerald-700 bg-emerald-50",
  upcoming: "text-status-warn bg-status-warn-bg",
  past: "text-muted-foreground bg-muted",
};

const MARGIN_COLORS: Record<MarginHealth, { bar: string; text: string; bg: string }> = {
  healthy: { bar: "bg-emerald-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  thin: { bar: "bg-status-warn", text: "text-status-warn", bg: "bg-status-warn-bg" },
  negative: { bar: "bg-status-alert", text: "text-status-alert", bg: "bg-status-alert-bg" },
};

/** Bulk-fetch the latest cost snapshot per product (single query, stable hook count) */
function useProductCosts(productIds: string[]): Map<string, ProductCostSnapshot> {
  const key = productIds.join(",");
  const snapshots = useLiveQuery(async () => {
    const all = await db.productCostSnapshots.toArray();
    const latest = new Map<string, ProductCostSnapshot>();
    for (const snap of all) {
      const existing = latest.get(snap.productId);
      if (!existing || new Date(snap.recordedAt).getTime() > new Date(existing.recordedAt).getTime()) {
        latest.set(snap.productId, snap);
      }
    }
    return latest;
  }, [key]);
  return snapshots ?? new Map();
}

export default function CollectionDetailPage() {
  const collectionId = useSpaId("collections");
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from");
  const backHref = from === "pricing" ? "/pricing" : "/collections";
  const backLabel = from === "pricing" ? "Pricing & Margins" : "Collections";

  const sym = useCurrencySymbol();

  const collection = useCollection(collectionId);
  const collectionProducts = useCollectionProducts(collectionId);
  const collectionPackagings = useCollectionPackagings(collectionId);
  // Include archived so the name lookup map still resolves names for products
  // archived after being added. Archived products are filtered out of the
  // "Add product" picker separately.
  const allProducts = useProductsList(true);
  const productCategoryMap = useProductCategoryMap();
  const allPackaging = usePackagingList(true);
  const allOrders = useAllPackagingOrders();
  const allPricingSnapshots = useCollectionPricingSnapshots(collectionId);

  const productIds = useMemo(
    () => collectionProducts.map((cr) => cr.productId),
    [collectionProducts]
  );
  const productCostMap = useProductCosts(productIds);

  // Do any ingredients behind this collection's products lack pricing?
  const productIdsKey = productIds.join(",");
  const hasMissingIngredientPricing = useLiveQuery(async () => {
    if (productIds.length === 0) return false;
    const rls = await db.productFillings.where("productId").anyOf(productIds).toArray();
    if (rls.length === 0) return false;
    const fillingIds = [...new Set(rls.map((rl) => rl.fillingId))];
    const lis = await db.fillingIngredients.where("fillingId").anyOf(fillingIds).toArray();
    if (lis.length === 0) return false;
    const ingredientIds = [...new Set(lis.map((li) => li.ingredientId))];
    const ingredients = (await db.ingredients.bulkGet(ingredientIds)).filter((x): x is NonNullable<typeof x> => x != null);
    return ingredients.some((ing) => costPerGram(ing) === null);
  }, [productIdsKey]);

  const [activeTab, setActiveTab] = useState<"collection" | "pricing">("collection");

  // Product management
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  // Pricing management
  const [showAddBox, setShowAddBox] = useState(false);
  const [selectedPackagingId, setSelectedPackagingId] = useState("");
  const [sellPriceStr, setSellPriceStr] = useState("");
  const [pendingRemoveBox, setPendingRemoveBox] = useState<string | null>(null);
  const [editingSellPrice, setEditingSellPrice] = useState<string | null>(null);
  const [editSellPriceStr, setEditSellPriceStr] = useState("");
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());

  const [showDelete, setShowDelete] = useState(false);

  // Loading vs. not-found — `useCollection` returns `undefined` both while
  // pending and for a missing row, so a one-shot direct read resolves which.
  // (The page previously branched on `collection === null`, which this hook
  // never returns, so its "not found" state was unreachable.)
  const [loadState, setLoadState] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!collectionId) return;
    let cancelled = false;
    db.collections.get(collectionId).then((c) => {
      if (!cancelled) setLoadState(c ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [collectionId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (showDelete) setShowDelete(false);
      else if (pendingRemove) setPendingRemove(null);
      else if (pendingRemoveBox) setPendingRemoveBox(null);
      else if (showAddProduct) { setShowAddProduct(false); setProductSearch(""); }
      else if (showAddBox) setShowAddBox(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showDelete, pendingRemove, pendingRemoveBox, showAddProduct, showAddBox]);

  const productIdSet = useMemo(
    () => new Set(collectionProducts.map((cr) => cr.productId)),
    [collectionProducts]
  );

  const availableProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    return allProducts.filter(
      (r) => !r.archived && !productIdSet.has(r.id ?? "") && (!q || r.name.toLowerCase().includes(q))
    );
  }, [allProducts, productIdSet, productSearch]);

  const productMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of allProducts) if (r.id) m.set(r.id, r.name);
    return m;
  }, [allProducts]);

  const packagingMap = useMemo(() => {
    const m = new Map<string, Packaging>();
    for (const p of allPackaging) if (p.id) m.set(p.id, p);
    return m;
  }, [allPackaging]);

  const ordersByPackaging = useMemo(() => {
    const m = new Map<string, PackagingOrder[]>();
    for (const o of allOrders) {
      const arr = m.get(o.packagingId) ?? [];
      arr.push(o);
      m.set(o.packagingId, arr);
    }
    return m;
  }, [allOrders]);

  const snapshotsByPackaging = useMemo(() => {
    const m = new Map<string, CollectionPricingSnapshot[]>();
    for (const s of allPricingSnapshots) {
      const arr = m.get(s.packagingId) ?? [];
      arr.push(s);
      m.set(s.packagingId, arr);
    }
    return m;
  }, [allPricingSnapshots]);

  const productCosts: ProductCostEntry[] = useMemo(() => {
    const entries: ProductCostEntry[] = [];
    for (const rid of productIds) {
      const snap = productCostMap.get(rid);
      if (snap) entries.push({ productId: rid, costPerProduct: snap.costPerProduct });
    }
    return entries;
  }, [productIds, productCostMap]);

  const avgCost = useMemo(() => averageProductCost(productCosts), [productCosts]);

  const boxPricings = useMemo(() => {
    if (!avgCost) return [];
    return collectionPackagings.map((cp) => {
      const pkg = packagingMap.get(cp.packagingId);
      const orders = ordersByPackaging.get(cp.packagingId) ?? [];
      const unitCost = latestPackagingUnitCost(orders) ?? 0;
      const capacity = pkg?.capacity ?? 0;
      const pricing = calculateBoxPricing(avgCost.avg, capacity, unitCost, cp.sellPrice);
      const health = marginHealth(pricing.marginPercent);
      return { cp, pkg, pricing, health, unitCost };
    });
  }, [avgCost, collectionPackagings, packagingMap, ordersByPackaging]);

  const usedPackagingIds = useMemo(
    () => new Set(collectionPackagings.map((cp) => cp.packagingId)),
    [collectionPackagings]
  );

  const avgMargin = useMemo(() => {
    if (boxPricings.length === 0) return null;
    return boxPricings.reduce((sum, b) => sum + b.pricing.marginPercent, 0) / boxPricings.length;
  }, [boxPricings]);

  if (!collectionId || loadState === "loading" || (loadState === "found" && !collection)) {
    return <DetailSkeleton cards={2} sidebar={2} tabs label="Loading collection" />;
  }
  if (loadState === "not-found" || !collection) {
    return <DetailNotFound entity="collection" backHref={backHref} backLabel={backLabel} />;
  }

  const status = getStatus(collection.startDate, collection.endDate);

  async function handleDelete() {
    if (!collection?.id) return;
    await deleteCollection(collection.id);
    router.replace(backHref);
  }

  async function handleAddProduct(productId: string) {
    if (!collectionId) return;
    await addProductToCollection(collectionId, productId);
    setProductSearch("");
  }

  async function handleRemoveProduct(collectionProductId: string) {
    await removeProductFromCollection(collectionProductId);
    setPendingRemove(null);
  }

  /** Record a pricing snapshot for a packaging + sell price against current avg cost. */
  async function recordPricingSnapshot(
    packagingId: string,
    sellPrice: number,
    triggerType: CollectionPricingSnapshot["triggerType"],
    triggerDetail: string,
  ) {
    if (!avgCost || !collectionId) return;
    const pkg = packagingMap.get(packagingId);
    const orders = ordersByPackaging.get(packagingId) ?? [];
    const packagingUnitCost = latestPackagingUnitCost(orders) ?? 0;
    // Skip when the packaging has no cost data — the snapshot would be meaningless.
    if (packagingUnitCost === 0) return;
    const capacity = pkg?.capacity ?? 0;
    const pricing = calculateBoxPricing(avgCost.avg, capacity, packagingUnitCost, sellPrice);
    await saveCollectionPricingSnapshot({
      collectionId,
      packagingId,
      avgProductCost: avgCost.avg,
      packagingUnitCost,
      totalCost: pricing.totalCost,
      sellPrice,
      marginPercent: pricing.marginPercent,
      recordedAt: new Date(),
      triggerType,
      triggerDetail,
    });
  }

  async function handleAddBox() {
    if (!collectionId || !selectedPackagingId || !sellPriceStr) return;
    const price = parseFloat(sellPriceStr);
    if (isNaN(price) || price < 0) return;
    await saveCollectionPackaging({
      collectionId,
      packagingId: selectedPackagingId,
      sellPrice: price,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await recordPricingSnapshot(selectedPackagingId, price, "sell_price_change", `Box pricing configured at ${formatPrice(price, sym)}`);
    setSelectedPackagingId("");
    setSellPriceStr("");
    setShowAddBox(false);
  }

  async function handleUpdateSellPrice(cpId: string) {
    const price = parseFloat(editSellPriceStr);
    if (isNaN(price) || price < 0) return;
    const existing = collectionPackagings.find((cp) => cp.id === cpId);
    if (!existing) return;
    await saveCollectionPackaging({ ...existing, id: cpId, sellPrice: price });
    await recordPricingSnapshot(existing.packagingId, price, "sell_price_change", `Sell price updated to ${formatPrice(price, sym)}`);
    setEditingSellPrice(null);
    setEditSellPriceStr("");
  }

  async function handleRecalculate(cp: { id?: string; packagingId: string; sellPrice: number }) {
    await recordPricingSnapshot(cp.packagingId, cp.sellPrice, "manual", "Manual recalculation");
  }

  async function handleRemoveBox(cpId: string) {
    await deleteCollectionPackaging(cpId);
    setPendingRemoveBox(null);
  }

  const dateRange = collection.endDate
    ? `${formatDate(collection.startDate)} – ${formatDate(collection.endDate)}`
    : `${formatDate(collection.startDate)} · no end date`;

  const subtitle = [
    dateRange,
    `${collectionProducts.length} product${collectionProducts.length !== 1 ? "s" : ""}`,
    collectionPackagings.length > 0
      ? `${collectionPackagings.length} box size${collectionPackagings.length !== 1 ? "s" : ""}`
      : null,
    avgMargin != null ? `${formatMarginPercent(avgMargin)} avg margin` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> {backLabel}
        </Link>
      </div>

      {/* Header */}
      <div className="px-4 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <InlineNameEditor
              name={collection.name}
              onSave={async (n) => { await updateCollectionFields(collection!.id!, { name: n }); }}
              className="text-xl font-bold"
            />
            <span className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_CLASS[status]}`}>
              {STATUS_LABEL[status]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <button
          onClick={() => { setActiveTab("collection"); setShowAddProduct(true); }}
          className="btn-primary px-4 py-2 text-sm shrink-0"
        >
          Add product
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-border mb-4 px-4 overflow-x-auto">
        {([
          { id: "collection" as const, label: "Collection" },
          { id: "pricing" as const, label: "Pricing & margins" },
        ]).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-[13px] font-medium whitespace-nowrap -mb-px border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "collection" ? (
        <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
          {/* ── Main column ── */}
          <div className="space-y-4 min-w-0">
            {/* Products */}
            <div className="rounded-lg border border-border bg-card">
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-semibold">
                  Products <span className="font-normal text-muted-foreground">({collectionProducts.length})</span>
                </h2>
                <div className="relative w-[220px] max-w-[55%]">
                  <Search aria-hidden="true" className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); setShowAddProduct(true); }}
                    onFocus={() => setShowAddProduct(true)}
                    placeholder="Search products to add…"
                    aria-label="Search products to add"
                    className="input !pl-8 !py-1 text-xs"
                  />
                </div>
              </div>

              {showAddProduct && (
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  {availableProducts.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">
                      {allProducts.length === 0 ? "No products in library yet." : "All products already added."}
                    </p>
                  ) : (
                    <ul className="space-y-1 max-h-52 overflow-y-auto">
                      {availableProducts.map((r) => (
                        <li key={r.id}>
                          <button
                            onClick={() => handleAddProduct(r.id ?? "")}
                            className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                          >
                            {r.name}
                            {r.productCategoryId && productCategoryMap.get(r.productCategoryId) && (
                              <span className="ml-1.5 text-xs text-muted-foreground capitalize">
                                {productCategoryMap.get(r.productCategoryId)!.name}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    onClick={() => { setShowAddProduct(false); setProductSearch(""); }}
                    className="text-xs text-muted-foreground hover:underline mt-2"
                  >
                    Done
                  </button>
                </div>
              )}

              {collectionProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No products in this collection.</p>
              ) : (
                <div>
                  {collectionProducts.map((cr) => {
                    const snap = productCostMap.get(cr.productId);
                    const name = productMap.get(cr.productId) ?? cr.productId;
                    return (
                      <div
                        key={cr.id}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0 hover:bg-muted/40 transition-colors"
                      >
                        <span
                          aria-hidden="true"
                          className="w-7 h-7 rounded-md bg-muted shrink-0 flex items-center justify-center text-[11px] font-semibold text-muted-foreground"
                        >
                          {name.charAt(0).toUpperCase()}
                        </span>
                        <Link
                          href={`/products/${encodeURIComponent(cr.productId)}`}
                          className="flex-1 min-w-0 text-sm font-medium truncate hover:underline"
                        >
                          {name}
                        </Link>
                        {snap && (
                          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                            {formatPrice(snap.costPerProduct, sym)}/pc
                          </span>
                        )}
                        {pendingRemove === cr.id ? (
                          <span className="flex items-center gap-1.5 text-xs shrink-0">
                            <span className="text-muted-foreground">Remove?</span>
                            <button
                              onClick={() => handleRemoveProduct(cr.id ?? "")}
                              className="text-destructive font-medium hover:underline"
                            >
                              Yes
                            </button>
                            <button
                              onClick={() => setPendingRemove(null)}
                              className="text-muted-foreground hover:underline"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setPendingRemove(cr.id ?? "")}
                            className="text-muted-foreground/40 hover:text-destructive shrink-0 transition-colors"
                            aria-label={`Remove ${name} from collection`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {avgCost && productCosts.length > 0 && (
                <div className="px-4 py-2.5 bg-muted flex items-baseline justify-between">
                  <span className="text-xs text-muted-foreground">
                    Collection average{" "}
                    <span className="text-[10px]">({avgCost.count} with pricing)</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatPrice(avgCost.avg, sym)} / piece
                  </span>
                </div>
              )}
              {productCosts.length > 0 && avgCost && avgCost.count < productIds.length && (
                <p className="px-4 py-2 text-[11px] text-status-warn border-t border-border">
                  {productIds.length - avgCost.count} product(s) have no cost data yet — assign a mould and ingredients to include them.
                </p>
              )}
            </div>

            <NotesCard key={collection.id} collection={collection} />

            {/* Destructive row — delete only; collections have no archive. */}
            <div className="pt-2">
              {!showDelete ? (
                <button
                  onClick={() => setShowDelete(true)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete collection
                </button>
              ) : (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-destructive">Delete this collection?</p>
                  <p className="text-xs text-muted-foreground">
                    Removes the collection, its product list and its box pricing. The{" "}
                    {collectionProducts.length} product{collectionProducts.length !== 1 ? "s" : ""}{" "}
                    themselves stay in the catalogue. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleDelete} className="btn-destructive px-4 py-2 text-sm">
                      Yes, delete
                    </button>
                    <button onClick={() => setShowDelete(false)} className="btn-secondary px-4 py-2 text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4 lg:sticky lg:top-4">
            <PropertiesCard key={`props-${collection.id}`} collection={collection} />

            <SidebarCard title="Derived" tinted className="space-y-2">
              <DerivedRow label="Status" value={STATUS_LABEL[status]} />
              <DerivedRow label="Products" value={collectionProducts.length} />
              <DerivedRow
                label="Average cost"
                value={avgCost ? `${formatPrice(avgCost.avg, sym)}/pc` : "—"}
              />
              <DerivedRow
                label="Average margin"
                value={avgMargin != null ? formatMarginPercent(avgMargin) : "—"}
              />
              {hasMissingIngredientPricing && (
                <p className="text-[11px] text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-2 py-1">
                  Some ingredients behind these products have no pricing — margins may be
                  understated.
                </p>
              )}
            </SidebarCard>
          </div>
        </div>
      ) : (
        /* ── Pricing & margins — full width, no sidebar: the box cards carry cost
              breakdowns and margin history that 320px cannot hold. ── */
        <div className="px-4 pb-8 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[13px] font-semibold">
              Boxes <span className="font-normal text-muted-foreground">({collectionPackagings.length})</span>
            </h2>
            <button
              onClick={() => setShowAddBox((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Plus className="w-3.5 h-3.5" /> Add box
            </button>
          </div>

          {showAddBox && (
            <div className="rounded-lg border border-border bg-card p-3 space-y-3 max-w-md">
              <div>
                <label className="label" htmlFor="collection-packaging">Packaging</label>
                <select
                  id="collection-packaging"
                  value={selectedPackagingId}
                  onChange={(e) => setSelectedPackagingId(e.target.value)}
                  className="input"
                >
                  <option value="">Select packaging...</option>
                  {allPackaging
                    .filter((p) => p.id && !usedPackagingIds.has(p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>{p.name} ({p.capacity} pcs)</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="collection-sell-price">Sell price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">{sym}</span>
                  <input
                    id="collection-sell-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={sellPriceStr}
                    onChange={(e) => setSellPriceStr(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddBox(); }}
                    className="input !pl-7"
                    placeholder="24.95"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddBox}
                  disabled={!selectedPackagingId || !sellPriceStr}
                  className="btn-primary px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAddBox(false); setSelectedPackagingId(""); setSellPriceStr(""); }}
                  className="btn-secondary px-3 py-1.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {hasMissingIngredientPricing && (
            <div className="flex items-start gap-2 rounded-md bg-status-warn-bg border border-status-warn-edge px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-status-warn shrink-0 mt-0.5" />
              <p className="text-xs text-status-warn">
                Some ingredients in this collection&apos;s products have no pricing data — margin
                calculations may be understated. Check individual product cost tabs.
              </p>
            </div>
          )}

          {collectionPackagings.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg space-y-1">
              <p>No box pricing configured yet.</p>
              <p className="text-xs">Add a box to see cost breakdowns and margins.</p>
            </div>
          ) : !avgCost ? (
            <div className="text-sm text-muted-foreground py-8 text-center border border-dashed border-border rounded-lg space-y-1">
              <p>No product cost data available.</p>
              <p className="text-xs">Ensure products have a default mould and costed ingredients.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
              {boxPricings.map(({ cp, pkg, pricing, health, unitCost }) => {
                const cpId = cp.id ?? "";
                // Only show snapshots where packaging was actually priced —
                // filter out initialisation entries.
                const history = (snapshotsByPackaging.get(cp.packagingId) ?? []).filter((s) => s.packagingUnitCost > 0);
                return (
                  <BoxCard
                    key={cpId}
                    packagingName={pkg?.name ?? "Unknown"}
                    capacity={pkg?.capacity ?? 0}
                    pricing={pricing}
                    health={health}
                    packagingUnitCost={unitCost}
                    history={history}
                    historyExpanded={expandedHistory.has(cpId)}
                    onToggleHistory={() => setExpandedHistory((prev) => {
                      const next = new Set(prev);
                      if (next.has(cpId)) next.delete(cpId); else next.add(cpId);
                      return next;
                    })}
                    isEditingSellPrice={editingSellPrice === cpId}
                    editSellPriceStr={editSellPriceStr}
                    pendingRemove={pendingRemoveBox === cpId}
                    onStartEditSellPrice={() => {
                      setEditingSellPrice(cpId);
                      setEditSellPriceStr(String(cp.sellPrice));
                    }}
                    onEditSellPriceChange={setEditSellPriceStr}
                    onSaveSellPrice={() => handleUpdateSellPrice(cpId)}
                    onCancelEditSellPrice={() => setEditingSellPrice(null)}
                    onStartRemove={() => setPendingRemoveBox(cpId)}
                    onConfirmRemove={() => handleRemoveBox(cpId)}
                    onCancelRemove={() => setPendingRemoveBox(null)}
                    onRecalculate={() => handleRecalculate(cp)}
                    sym={sym}
                  />
                );
              })}
            </div>
          )}

          {collectionPackagings.length > 0 && (
            <Link href="/pricing" className="inline-block text-xs text-primary hover:underline">
              Compare across all collections &rarr;
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar: Properties ─────────────────────────────────────────────────────

function PropertiesCard({ collection }: { collection: Collection }) {
  const id = collection.id!;
  // Keyed by `collection.id` at the call site, so drafts reset on navigation
  // rather than on every autosave-triggered re-render.
  const [description, setDescription] = useState(collection.description ?? "");
  const descTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commitDescription(next: string) {
    const trimmed = next.trim();
    if (trimmed === (collection.description ?? "")) return;
    updateCollectionFields(id, { description: trimmed || undefined }, "Description");
  }

  return (
    <SidebarCard title="Properties">
      <div className="space-y-1">
        <PropertyRow label="Starts">
          <input
            type="date"
            value={collection.startDate ?? ""}
            // A collection with no start date has no derivable status, so an
            // empty value is ignored rather than written.
            onChange={(e) => { if (e.target.value) updateCollectionFields(id, { startDate: e.target.value }); }}
            aria-label="Start date"
            className={PROPERTY_INPUT_CLASS}
          />
        </PropertyRow>

        <PropertyRow label="Ends">
          <span className="flex items-center gap-1">
            <input
              type="date"
              value={collection.endDate ?? ""}
              min={collection.startDate}
              onChange={(e) => updateCollectionFields(id, { endDate: e.target.value || undefined })}
              aria-label="End date"
              className={PROPERTY_INPUT_CLASS}
            />
            {collection.endDate && (
              <button
                onClick={() => updateCollectionFields(id, { endDate: undefined })}
                aria-label="Clear end date"
                className="text-muted-foreground hover:text-foreground shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        </PropertyRow>
      </div>

      {/* Description is prose, so it gets a full-width block rather than a
          right-aligned value squeezed against its label. */}
      <div className="mt-2 pt-2 border-t border-border">
        <span className="text-xs text-muted-foreground">Description</span>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (descTimeout.current) clearTimeout(descTimeout.current);
            descTimeout.current = setTimeout(() => commitDescription(e.target.value), 600);
          }}
          onBlur={() => {
            if (descTimeout.current) clearTimeout(descTimeout.current);
            commitDescription(description);
          }}
          rows={2}
          placeholder="e.g. Easter 2026 gift box selection"
          aria-label="Description"
          className="w-full mt-1 text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/50"
        />
      </div>
    </SidebarCard>
  );
}

// ─── Main: Notes ─────────────────────────────────────────────────────────────

function NotesCard({ collection }: { collection: Collection }) {
  const id = collection.id!;
  const [value, setValue] = useState(collection.notes ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === (collection.notes ?? "")) return;
    updateCollectionFields(id, { notes: trimmed || undefined }, "Notes");
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
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[13px] font-semibold">Notes</h2>
      </div>
      <div className="p-4">
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Internal notes…"
          rows={3}
          aria-label="Notes"
          className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}

/* ─── Box pricing card ─── */

const TRIGGER_LABELS: Record<CollectionPricingSnapshot["triggerType"], string> = {
  sell_price_change: "Sell price",
  ingredient_price: "Ingredient cost",
  coating_change: "Coating change",
  packaging_cost: "Packaging cost",
  manual: "Recalculated",
};

const TRIGGER_COLORS: Record<CollectionPricingSnapshot["triggerType"], string> = {
  sell_price_change: "bg-primary/80",
  ingredient_price: "bg-status-warn-edge",
  coating_change: "bg-purple-400",
  packaging_cost: "bg-blue-400",
  manual: "bg-muted-foreground/40",
};

function BoxCard({
  packagingName,
  capacity,
  pricing,
  health,
  packagingUnitCost,
  history,
  historyExpanded,
  onToggleHistory,
  isEditingSellPrice,
  editSellPriceStr,
  pendingRemove,
  onStartEditSellPrice,
  onEditSellPriceChange,
  onSaveSellPrice,
  onCancelEditSellPrice,
  onStartRemove,
  onConfirmRemove,
  onCancelRemove,
  onRecalculate,
  sym = "€",
}: {
  packagingName: string;
  capacity: number;
  pricing: BoxPricingResult;
  health: MarginHealth;
  packagingUnitCost: number;
  history: CollectionPricingSnapshot[];
  historyExpanded: boolean;
  onToggleHistory: () => void;
  isEditingSellPrice: boolean;
  sym?: string;
  editSellPriceStr: string;
  pendingRemove: boolean;
  onStartEditSellPrice: () => void;
  onEditSellPriceChange: (v: string) => void;
  onSaveSellPrice: () => void;
  onCancelEditSellPrice: () => void;
  onStartRemove: () => void;
  onConfirmRemove: () => void;
  onCancelRemove: () => void;
  onRecalculate: () => void;
}) {
  const colors = MARGIN_COLORS[health];
  const barWidth = Math.min(Math.max(pricing.marginPercent, 0), 100);

  // Build sparkline from history (oldest→newest for left-to-right trend)
  const chartData = [...history].reverse();
  const margins = chartData.map((s) => s.marginPercent);
  const minM = margins.length > 1 ? Math.min(...margins) : 0;
  const maxM = margins.length > 1 ? Math.max(...margins) : 100;
  const rangeM = maxM - minM || 10;
  const chartW = 120;
  const chartH = 32;
  const pad = 2;

  function toX(i: number) {
    return margins.length === 1
      ? chartW / 2
      : pad + (i / (margins.length - 1)) * (chartW - pad * 2);
  }
  function toY(m: number) {
    return chartH - pad - ((m - minM) / rangeM) * (chartH - pad * 2);
  }

  const points = margins.map((m, i) => `${toX(i).toFixed(1)},${toY(m).toFixed(1)}`).join(" ");

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold">{packagingName}</p>
          <p className="text-[11px] text-muted-foreground">{capacity} products per box</p>
        </div>
        <div className="flex items-center gap-1.5">
          {pendingRemove ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Remove?</span>
              <button onClick={onConfirmRemove} className="text-red-600 font-medium hover:underline">Yes</button>
              <button onClick={onCancelRemove} className="text-muted-foreground hover:underline">Cancel</button>
            </span>
          ) : (
            <button
              onClick={onStartRemove}
              className="text-muted-foreground/40 hover:text-muted-foreground"
              aria-label="Remove box configuration"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Cost breakdown */}
      <div className="px-3 pb-2 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">{capacity} product{capacity === 1 ? "" : "s"} &times; {formatPrice(pricing.productCost / (capacity || 1), sym)}</span>
          <span className="tabular-nums">{formatPrice(pricing.productCost, sym)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Packaging</span>
          <span className="tabular-nums">{formatPrice(packagingUnitCost, sym)}</span>
        </div>
        <div className="flex justify-between text-xs font-medium border-t border-border/50 pt-1">
          <span>Total cost</span>
          <span className="tabular-nums">{formatPrice(pricing.totalCost, sym)}</span>
        </div>
      </div>

      {/* Sell price + margin */}
      <div className={`px-3 py-2.5 ${colors.bg} border-t border-border/30`}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Sell price</span>
            {isEditingSellPrice ? (
              <span className="flex items-center gap-1">
                <span className="text-xs text-muted-foreground">{sym}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editSellPriceStr}
                  onChange={(e) => onEditSellPriceChange(e.target.value)}
                  onBlur={onSaveSellPrice}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onSaveSellPrice();
                    if (e.key === "Escape") onCancelEditSellPrice();
                  }}
                  autoFocus
                  className="w-20 text-xs px-1.5 py-0.5 rounded border border-border bg-card"
                />
              </span>
            ) : (
              <button
                onClick={onStartEditSellPrice}
                className="text-xs font-semibold tabular-nums hover:underline"
              >
                {formatPrice(pricing.sellPrice, sym)}
              </button>
            )}
          </div>
          <span className={`text-xs font-bold tabular-nums ${colors.text}`}>
            {formatMarginPercent(pricing.marginPercent)} margin
          </span>
        </div>

        {/* Margin bar */}
        <div className="h-1.5 rounded-full bg-black/5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${colors.bar}`}
            style={{ width: `${barWidth}%` }}
          />
        </div>

        <div className="flex justify-between mt-1.5">
          <span className={`text-[11px] ${colors.text}`}>
            {formatPrice(pricing.marginAbsolute, sym)} per box
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatPrice(pricing.marginAbsolute / (capacity || 1), sym)} per product
          </span>
        </div>
      </div>

      {/* Pricing history */}
      <div className="border-t border-border/40">
        <div className="flex items-center px-3 py-2 text-[11px] text-muted-foreground hover:bg-muted/30 transition-colors">
          <button
            onClick={onToggleHistory}
            className="flex-1 flex items-center gap-1.5 hover:text-foreground text-left"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${historyExpanded ? "" : "-rotate-90"}`} />
            Pricing history
            {history.length > 0 && <span className="opacity-60">({history.length})</span>}
          </button>
          {history.length === 0 ? (
            packagingUnitCost > 0 ? (
              <button
                onClick={onRecalculate}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                title="Record current margin as first snapshot"
              >
                <RefreshCw className="w-2.5 h-2.5" /> Record
              </button>
            ) : null
          ) : (
            <button
              onClick={onRecalculate}
              className="flex items-center gap-1 text-[11px] hover:text-foreground"
              title="Record current margin as a new snapshot"
            >
              <RefreshCw className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {historyExpanded && history.length > 0 && (
          <div className="px-3 pb-3 space-y-3">
            {/* Sparkline */}
            {margins.length > 1 && (
              <div className="flex items-center gap-2">
                <svg width={chartW} height={chartH} className="shrink-0">
                  <polyline
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-primary/60"
                  />
                  {margins.map((m, i) => {
                    const h = marginHealth(m);
                    const dotColor = h === "healthy" ? "#10b981" : h === "thin" ? "#f59e0b" : "#ef4444";
                    return (
                      <circle key={i} cx={toX(i)} cy={toY(m)} r="2" fill={dotColor} />
                    );
                  })}
                </svg>
                <div className="text-[10px] text-muted-foreground leading-tight">
                  <p>{formatMarginPercent(margins[0])} → {formatMarginPercent(margins[margins.length - 1])}</p>
                  {margins.length > 1 && (() => {
                    const delta = marginDelta(margins[margins.length - 1], margins[0]);
                    return (
                      <p className={delta.improved ? "text-emerald-600" : "text-red-600"}>
                        {delta.label} overall
                      </p>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Event list */}
            <ul className="space-y-1.5">
              {history.map((snap, i) => {
                const prev = history[i + 1];
                const delta = prev ? marginDelta(snap.marginPercent, prev.marginPercent) : null;
                const snapDate = new Date(snap.recordedAt);
                const dateStr = `${snapDate.getDate().toString().padStart(2, "0")}/${(snapDate.getMonth() + 1).toString().padStart(2, "0")}/${snapDate.getFullYear()}`;
                return (
                  <li key={snap.id ?? i} className="flex items-start gap-2 text-[11px]">
                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${TRIGGER_COLORS[snap.triggerType]}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="font-medium tabular-nums">{formatMarginPercent(snap.marginPercent)}</span>
                        {delta && (
                          <span className={`tabular-nums ${delta.improved ? "text-emerald-600" : "text-red-600"}`}>
                            {delta.label}
                          </span>
                        )}
                        <span className="text-muted-foreground ml-auto shrink-0">{dateStr}</span>
                      </div>
                      <p className="text-muted-foreground truncate">
                        <span className="font-medium">{TRIGGER_LABELS[snap.triggerType]}</span>
                        {" · "}{snap.triggerDetail}
                      </p>
                      <p className="text-muted-foreground/70">
                        Cost {formatPrice(snap.totalCost, sym)} · Sell {formatPrice(snap.sellPrice, sym)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {historyExpanded && history.length === 0 && (
          <p className="px-3 pb-3 text-[11px] text-muted-foreground">
            {packagingUnitCost === 0
              ? "No pricing history yet — log a packaging order to record the first snapshot."
              : "No history yet — click the refresh icon above to record the current margin."}
          </p>
        )}
      </div>
    </div>
  );
}
