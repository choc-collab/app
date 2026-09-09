"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useProductCategory,
  useProductCategoryUsage,
  updateProductCategoryFields,
  deleteProductCategory,
  archiveProductCategory,
  unarchiveProductCategory,
} from "@/lib/hooks";
import { db } from "@/lib/db";
import {
  formatCategoryRange,
  categoryAllowsZeroShell,
  categoryAllowsFullShell,
} from "@/lib/productCategories";
import type { ProductCategory, ShopKind } from "@/types";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import { SidebarCard } from "@/components/detail-sidebar";
import { ArrowLeft, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useSpaId } from "@/lib/use-spa-id";

const SHOP_KIND_OPTIONS: ReadonlyArray<{ value: ShopKind; label: string; description: string }> = [
  { value: "moulded",   label: "Moulded",   description: "Round glossy disc — polycarb-mould bonbons." },
  { value: "enrobed",   label: "Enrobed",   description: "Square slab with matte finish — slab cut + dipped." },
  { value: "snack-bar", label: "Snack bar", description: "Larger moulded format — single-piece snack." },
  { value: "bar",       label: "Bar",       description: "Long horizontal segment — chocolate bar." },
];

function shopKindLabel(kind: ShopKind | undefined): string {
  return SHOP_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? "Default (round disc)";
}

export default function ProductCategoryDetailPage() {
  const categoryId = useSpaId("categories");
  const router = useRouter();

  const category = useProductCategory(categoryId);
  const usedInProducts = useProductCategoryUsage(categoryId);

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Loading vs. not-found — the live query returns `undefined` for both, so a
  // one-shot direct read resolves which one it actually is.
  const [loadState, setLoadState] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    db.productCategories.get(categoryId).then((c) => {
      if (!cancelled) setLoadState(c ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [categoryId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmDelete) setConfirmDelete(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete]);

  if (!categoryId || loadState === "loading" || (loadState === "found" && !category)) {
    return <DetailSkeleton cards={2} sidebar={1} label="Loading product category" />;
  }
  if (loadState === "not-found" || !category) {
    return (
      <DetailNotFound
        entity="product category"
        backHref="/products?tab=categories"
        backLabel="Product categories"
      />
    );
  }

  const inUseCount = usedInProducts.length;

  const subtitle = [
    shopKindLabel(category.shopKind),
    `${formatCategoryRange(category)} shell`,
    `default ${category.defaultShellPercent}%`,
    inUseCount > 0 ? `used by ${inUseCount} product${inUseCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  async function handleHardDelete() {
    if (!categoryId) return;
    try {
      await deleteProductCategory(categoryId);
      router.replace("/products?tab=categories");
    } catch (err) {
      // Only reachable in a race — the hard-delete path is shown solely when
      // nothing references the category.
      alert(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  async function handleArchive() {
    if (!categoryId) return;
    await archiveProductCategory(categoryId);
    setConfirmDelete(false);
    router.replace("/products?tab=categories");
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/products?tab=categories"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Product categories
        </Link>
      </div>

      {/* Header */}
      <div className="px-4 pb-5">
        <div className="flex items-center gap-2">
          <InlineNameEditor
            name={category.name}
            onSave={async (n) => { await updateProductCategoryFields(categoryId, { name: n }, "Name"); }}
            className="text-xl font-bold capitalize"
          />
          {category.archived && (
            <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
              <Archive className="w-3 h-3" /> Archived
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Main column: what you edit ── */}
        <div className="space-y-4 min-w-0">
          <ShopAppearanceCard categoryId={categoryId} category={category} />
          <ShellPercentageCard key={category.id} categoryId={categoryId} category={category} />

          {/* ── Destructive actions ── */}
          <div className="pt-2">
            {category.archived ? (
              <button
                onClick={() => unarchiveProductCategory(categoryId)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArchiveRestore className="w-4 h-4" /> Unarchive category
              </button>
            ) : inUseCount > 0 ? (
              /* Still referenced — archive is the only way out. */
              confirmDelete ? (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium">Archive this category?</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inUseCount} product{inUseCount === 1 ? "" : "s"} still reference
                    {inUseCount === 1 ? "s" : ""} this category, so it can&apos;t be deleted.
                    Archiving hides it from the picker on new products but keeps it linked to
                    existing ones.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleArchive} className="btn-primary px-4 py-2 text-sm">
                      Yes, archive category
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                      Cancel
                    </button>
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
                    <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                      Cancel
                    </button>
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
          </div>
        </div>

        {/* ── Sidebar: what the app tells you ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <SidebarCard title="Used in" meta={inUseCount > 0 ? inUseCount : undefined}>
            <UsedInPanel
              singular="product"
              plural="products"
              items={usedInProducts.map((product) => ({
                id: product.id ?? "",
                name: product.name,
                href: `/products/${encodeURIComponent(product.id ?? "")}`,
              }))}
              emptyMessage="No products are using this category yet."
              hideHeading
            />
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}

// ─── Shop appearance ─────────────────────────────────────────────────────────

function ShopAppearanceCard({
  categoryId,
  category,
}: {
  categoryId: string;
  category: ProductCategory;
}) {
  const selected = category.shopKind ?? "";
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[13px] font-semibold">Shop appearance</h2>
      </div>
      <div className="p-4">
        <select
          id="cat-shop-kind"
          value={selected}
          onChange={(e) =>
            updateProductCategoryFields(
              categoryId,
              { shopKind: (e.target.value || undefined) as ShopKind | undefined },
              "Shop appearance",
            )
          }
          className="input"
          aria-label="Shop appearance"
        >
          <option value="">Default (round disc)</option>
          {SHOP_KIND_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {/* Describes the chosen option, which its one-word label can't. */}
        <p className="text-xs text-muted-foreground mt-1.5">
          {SHOP_KIND_OPTIONS.find((o) => o.value === selected)?.description
            ?? "Products in this category render as a round disc in the Shop."}
        </p>
      </div>
    </div>
  );
}

// ─── Shell percentage ────────────────────────────────────────────────────────

/**
 * Min and max autosave on blur; the default is held until it's valid.
 *
 * This is the one blocking rule in the pantry. The three fields describe a range
 * and a starting point inside it, and `defaultShellPercent` seeds every new
 * product in the category — so a half-edited value here is read downstream in a
 * way a wrong min or max is not. Min and max therefore write freely, even when
 * that momentarily leaves the stored default outside the range (moving 30–40 to
 * 50–60 has no valid single-field order otherwise); the resulting inconsistency
 * is shown rather than hidden, and the default's own edit is refused until it
 * lands inside the range.
 */
function ShellPercentageCard({
  categoryId,
  category,
}: {
  categoryId: string;
  category: ProductCategory;
}) {
  // Keyed by `category.id` at the call site, so drafts reset on navigation but
  // survive the re-render each autosave triggers.
  const [minStr, setMinStr] = useState(String(category.shellPercentMin));
  const [maxStr, setMaxStr] = useState(String(category.shellPercentMax));
  const [defaultStr, setDefaultStr] = useState(String(category.defaultShellPercent));
  const [defaultError, setDefaultError] = useState<string | null>(null);

  function inRange(n: number): boolean {
    return Number.isFinite(n) && n >= 0 && n <= 100;
  }

  function commitMin() {
    const next = parseFloat(minStr);
    if (!inRange(next)) {
      setMinStr(String(category.shellPercentMin));
      return;
    }
    if (next === category.shellPercentMin) return;
    updateProductCategoryFields(categoryId, { shellPercentMin: next }, "Shell % min");
  }

  function commitMax() {
    const next = parseFloat(maxStr);
    if (!inRange(next)) {
      setMaxStr(String(category.shellPercentMax));
      return;
    }
    if (next === category.shellPercentMax) return;
    updateProductCategoryFields(categoryId, { shellPercentMax: next }, "Shell % max");
  }

  function commitDefault() {
    const next = parseFloat(defaultStr);
    if (!inRange(next)) {
      setDefaultError("Must be a number between 0 and 100. Not saved — the stored value is still " + category.defaultShellPercent + "%.");
      return;
    }
    if (next < category.shellPercentMin || next > category.shellPercentMax) {
      // The typed value stays in the input so the user can correct it rather
      // than retype it; the record keeps its last good value.
      setDefaultError(
        `Must sit between ${category.shellPercentMin} and ${category.shellPercentMax}. Not saved — the stored value is still ${category.defaultShellPercent}%.`,
      );
      return;
    }
    setDefaultError(null);
    if (next === category.defaultShellPercent) return;
    updateProductCategoryFields(categoryId, { defaultShellPercent: next }, "Default shell %");
  }

  // Inconsistencies in the *stored* record, as opposed to what's being typed.
  const storedRangeInverted = category.shellPercentMin > category.shellPercentMax;
  const storedDefaultOutside =
    category.defaultShellPercent < category.shellPercentMin ||
    category.defaultShellPercent > category.shellPercentMax;

  const allowsZero = categoryAllowsZeroShell(category);
  const allowsFull = categoryAllowsFullShell(category);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">Shell percentage</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatCategoryRange(category)}
        </span>
      </div>
      <div className="p-4 space-y-3">
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
              onBlur={commitMin}
              className="input"
              aria-label="Shell % min"
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
              onBlur={commitMax}
              className="input"
              aria-label="Shell % max"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="cat-shell-default">
            Default shell % — the starting value for new products, within min–max
          </label>
          <input
            id="cat-shell-default"
            type="number"
            min="0"
            max="100"
            step="1"
            value={defaultStr}
            onChange={(e) => { setDefaultStr(e.target.value); setDefaultError(null); }}
            onBlur={commitDefault}
            aria-invalid={defaultError ? true : undefined}
            className={`input w-40 ${defaultError ? "border-destructive" : ""}`}
            aria-label="Default shell %"
          />
          {defaultError && (
            <p role="alert" className="text-xs text-destructive bg-destructive/5 rounded-md px-2 py-1 mt-1.5">
              {defaultError}
            </p>
          )}
        </div>

        {storedRangeInverted && (
          <p className="text-xs text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-2 py-1">
            Minimum is above maximum — no shell percentage can satisfy this range.
          </p>
        )}
        {!storedRangeInverted && storedDefaultOutside && (
          <p className="text-xs text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-2 py-1">
            The saved default ({category.defaultShellPercent}%) now sits outside{" "}
            {formatCategoryRange(category)}. New products will start outside the range until it is
            updated.
          </p>
        )}

        {(allowsZero || allowsFull) && (
          <p className="text-xs text-muted-foreground">
            {allowsZero && allowsFull && "Allows shell-only products and layers-only products (e.g. plain bars and bean-to-bar)."}
            {allowsZero && !allowsFull && "Allows layers-only products (e.g. bean-to-bar — no shell)."}
            {!allowsZero && allowsFull && "Allows shell-only products (e.g. plain chocolate bars)."}
          </p>
        )}
      </div>
    </div>
  );
}
