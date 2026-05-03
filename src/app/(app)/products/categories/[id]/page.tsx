"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useProductCategory,
  useProductCategoryUsage,
  saveProductCategory,
  deleteProductCategory,
  archiveProductCategory,
  unarchiveProductCategory,
} from "@/lib/hooks";
import {
  validateCategoryRange,
  formatCategoryRange,
  categoryAllowsZeroShell,
  categoryAllowsFullShell,
} from "@/lib/productCategories";
import type { ShopKind } from "@/types";

const SHOP_KIND_OPTIONS: ReadonlyArray<{ value: ShopKind; label: string; description: string }> = [
  { value: "moulded",   label: "Moulded",   description: "Round glossy disc — polycarb-mould bonbons." },
  { value: "enrobed",   label: "Enrobed",   description: "Square slab with matte finish — slab cut + dipped." },
  { value: "snack-bar", label: "Snack bar", description: "Larger moulded format — single-piece snack." },
  { value: "bar",       label: "Bar",       description: "Long horizontal segment — chocolate bar." },
];
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { ArrowLeft, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";

export default function ProductCategoryDetailPage() {
  const categoryId = useSpaId("categories");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const category = useProductCategory(categoryId);
  const usedInProducts = useProductCategoryUsage(categoryId);

  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit form state — local string buffers so users can clear/retype freely
  // (see AGENT.md "Number Input Pattern"). Committed on save.
  const [minStr, setMinStr] = useState("");
  const [maxStr, setMaxStr] = useState("");
  const [defaultStr, setDefaultStr] = useState("");
  const [shopKind, setShopKind] = useState<ShopKind | "">("");
  const [errors, setErrors] = useState<string[]>([]);

  // Navigation guard — delete incomplete record if user leaves ?new=1 without saving
  const [savedOnce, setSavedOnce] = useState(false);
  const formDirty = editing && category != null && (
    minStr !== String(category.shellPercentMin) ||
    maxStr !== String(category.shellPercentMax) ||
    defaultStr !== String(category.defaultShellPercent) ||
    shopKind !== (category.shopKind ?? "")
  );
  const isDirty = (isNew && !savedOnce) || formDirty;
  const handleConfirmLeave = useCallback(async () => {
    if (isNew && categoryId) {
      try { await deleteProductCategory(categoryId); } catch { /* in-use guard may prevent delete — fine, leave it */ }
    }
  }, [isNew, categoryId]);  
  useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (editing) handleCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  function syncForm(c: NonNullable<typeof category>) {
    setMinStr(String(c.shellPercentMin));
    setMaxStr(String(c.shellPercentMax));
    setDefaultStr(String(c.defaultShellPercent));
    setShopKind(c.shopKind ?? "");
    setErrors([]);
  }

  function startEditing() {
    if (!category) return;
    syncForm(category);
    setEditing(true);
  }

  function handleCancel() {
    if (!category) return;
    syncForm(category);
    setEditing(false);
    setErrors([]);
    if (isNew && categoryId) router.replace(`/products/categories/${encodeURIComponent(categoryId)}`);
  }

  // Initialise the form when entering edit mode (covers ?new=1 path).
  useEffect(() => {
    if (category && editing) syncForm(category);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category?.id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!category?.id) return;
    const parsed = {
      shellPercentMin: parseFloat(minStr),
      shellPercentMax: parseFloat(maxStr),
      defaultShellPercent: parseFloat(defaultStr),
    };
    const validation = validateCategoryRange(parsed);
    if (!validation.valid) {
      setErrors(validation.errors);
      return;
    }
    await saveProductCategory({
      id: category.id,
      name: category.name,
      shellPercentMin: parsed.shellPercentMin,
      shellPercentMax: parsed.shellPercentMax,
      defaultShellPercent: parsed.defaultShellPercent,
      shopKind: shopKind === "" ? undefined : shopKind,
      archived: category.archived,
    });
    setSavedOnce(true);
    setEditing(false);
    setErrors([]);
    if (isNew && categoryId) router.replace(`/products/categories/${encodeURIComponent(categoryId)}`);
  }

  async function handleHardDelete() {
    if (!categoryId) return;
    try {
      await deleteProductCategory(categoryId);
      router.replace("/products?tab=categories");
    } catch (err) {
      // Should be impossible from the UI (we only show the hard-delete path when usedInProducts.length === 0),
      // but surface the error in case of a race condition.
      alert(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  async function handleArchive() {
    if (!categoryId) return;
    await archiveProductCategory(categoryId);
    setConfirmDelete(false);
    router.replace("/products?tab=categories");
  }

  if (!categoryId || !category) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const inUseCount = usedInProducts.length;
  const allowsZero = categoryAllowsZeroShell(category);
  const allowsFull = categoryAllowsFullShell(category);

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/products?tab=categories"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="px-4 pb-6 space-y-6 max-w-lg">

        {/* Name row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <InlineNameEditor
              name={category.name}
              onSave={async (n) => {
                await saveProductCategory({
                  id: category.id,
                  name: n,
                  shellPercentMin: category.shellPercentMin,
                  shellPercentMax: category.shellPercentMax,
                  defaultShellPercent: category.defaultShellPercent,
                  shopKind: category.shopKind,
                  archived: category.archived,
                });
              }}
              className="text-xl font-bold capitalize"
            />
            {category.archived && (
              <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                <Archive className="w-3 h-3" /> Archived
              </span>
            )}
          </div>
          {!editing && (
            <button
              onClick={startEditing}
              className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
              aria-label="Edit product category"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {editing ? (
          /* ── Edit form ── */
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label" htmlFor="cat-shop-kind">Shop appearance</label>
              <select
                id="cat-shop-kind"
                value={shopKind}
                onChange={(e) => setShopKind(e.target.value as ShopKind | "")}
                className="input"
                aria-label="Shop appearance"
              >
                <option value="">Default (round disc)</option>
                {SHOP_KIND_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                {SHOP_KIND_OPTIONS.find((o) => o.value === shopKind)?.description
                  ?? "Controls how products in this category render in the Shop (palette tiles, cavities, summary chips)."}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cat-shell-min">Shell % min</label>
                <input
                  id="cat-shell-min"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={minStr}
                  onChange={(e) => setMinStr(e.target.value)}
                  className="input"
                  aria-label="Shell % min"
                  autoFocus={isNew}
                />
              </div>
              <div>
                <label className="label" htmlFor="cat-shell-max">Shell % max</label>
                <input
                  id="cat-shell-max"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={maxStr}
                  onChange={(e) => setMaxStr(e.target.value)}
                  className="input"
                  aria-label="Shell % max"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="cat-shell-default">Default shell %</label>
              <input
                id="cat-shell-default"
                type="number"
                min="0"
                max="100"
                step="1"
                value={defaultStr}
                onChange={(e) => setDefaultStr(e.target.value)}
                className="input w-32"
                aria-label="Default shell %"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used as the starting value for new products in this category. Must lie within the min–max range.
              </p>
            </div>

            {errors.length > 0 && (
              <ul className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                {errors.map((err, i) => (
                  <li key={i} className="text-xs text-destructive">{err}</li>
                ))}
              </ul>
            )}

            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 py-2">Save</button>
              <button type="button" onClick={handleCancel} className="btn-secondary px-4 py-2">Cancel</button>
            </div>
          </form>
        ) : (
          /* ── Read-only view ── */
          <>
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              <div className="flex justify-between items-center px-3 py-2 text-sm">
                <span className="text-muted-foreground">Shop appearance</span>
                <span>
                  {SHOP_KIND_OPTIONS.find((o) => o.value === category.shopKind)?.label
                    ?? "Default (round disc)"}
                </span>
              </div>
              <div className="flex justify-between items-center px-3 py-2 text-sm">
                <span className="text-muted-foreground">Shell % range</span>
                <span className="font-mono">{formatCategoryRange(category)}</span>
              </div>
              <div className="flex justify-between items-center px-3 py-2 text-sm">
                <span className="text-muted-foreground">Default shell %</span>
                <span className="font-mono">{category.defaultShellPercent}%</span>
              </div>
              {(allowsZero || allowsFull) && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {allowsZero && allowsFull && "Allows shell-only products and layers-only products (e.g. plain bars and bean-to-bar)."}
                  {allowsZero && !allowsFull && "Allows layers-only products (e.g. bean-to-bar — no shell)."}
                  {!allowsZero && allowsFull && "Allows shell-only products (e.g. plain chocolate bars)."}
                </div>
              )}
            </div>

            <UsedInPanel
              singular="product"
              plural="products"
              items={usedInProducts.map((product) => ({
                id: product.id ?? "",
                name: product.name,
                href: `/products/${encodeURIComponent(product.id ?? "")}`,
              }))}
              emptyMessage="No products are using this category yet."
            />

            {/* Archive / Delete */}
            <section className="pt-4 border-t border-border">
              {category.archived ? (
                <button
                  onClick={() => unarchiveProductCategory(categoryId)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArchiveRestore className="w-4 h-4" /> Unarchive category
                </button>
              ) : inUseCount > 0 ? (
                /* In use — archive only, no delete */
                confirmDelete ? (
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium">Archive this category?</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inUseCount} product{inUseCount === 1 ? "" : "s"} still reference{inUseCount === 1 ? "s" : ""} this category, so it can&apos;t be deleted.
                      Archiving hides it from the picker on new products but keeps it linked to existing ones.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleArchive}
                        className="btn-primary px-4 py-2 text-sm"
                      >
                        Yes, archive category
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Archive className="w-4 h-4" /> Archive category
                  </button>
                )
              ) : (
                /* Not in use — allow full delete */
                confirmDelete ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                    <p className="text-sm text-destructive font-medium">Delete this category?</p>
                    <p className="text-xs text-muted-foreground">
                      No products are currently using it. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleHardDelete}
                        className="rounded-full bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium"
                      >
                        Yes, delete
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-4 h-4" /> Delete category
                  </button>
                )
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
