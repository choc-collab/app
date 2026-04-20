"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useFillingCategory,
  useFillingCategoryUsage,
  saveFillingCategory,
  deleteFillingCategory,
  archiveFillingCategory,
  unarchiveFillingCategory,
  useFillings,
} from "@/lib/hooks";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { ArrowLeft, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";

export default function FillingCategoryDetailPage() {
  const categoryId = useSpaId("categories");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const category = useFillingCategory(categoryId);
  const inUseCount = useFillingCategoryUsage(category?.name);
  const allFillings = useFillings();

  const fillingsUsingCategory = category
    ? allFillings.filter((f) => f.category === category.name && !f.archived)
    : [];

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Navigation guard — delete incomplete record if user leaves a ?new=1 page without saving
  const [savedOnce, setSavedOnce] = useState(false);
  const isDirty = isNew && !savedOnce;
  const handleConfirmLeave = useCallback(async () => {
    if (isNew && categoryId) {
      try { await deleteFillingCategory(categoryId); } catch { /* ignore — silently keep if in use */ }
    }
  }, [isNew, categoryId]); // eslint-disable-line react-hooks/exhaustive-deps
  useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  // Strip ?new=1 once the category loads
  useEffect(() => {
    if (isNew && category && !savedOnce && categoryId) {
      setSavedOnce(true);
      router.replace(`/fillings/categories/${encodeURIComponent(categoryId)}`);
    }
  }, [isNew, category, savedOnce, categoryId, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmDelete) setConfirmDelete(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete]);

  if (!categoryId || !category) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  async function handleToggleShelfStable(next: boolean) {
    if (!category) return;
    await saveFillingCategory({
      id: category.id,
      name: category.name,
      shelfStable: next,
      archived: category.archived,
    });
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/fillings?tab=categories"
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
                await saveFillingCategory({
                  id: category.id,
                  name: n,
                  shelfStable: category.shelfStable,
                  archived: category.archived,
                });
              }}
              className="text-xl font-bold"
            />
            {category.shelfStable && (
              <span className="rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-[10px] font-medium shrink-0">
                Shelf-stable
              </span>
            )}
            {category.archived && (
              <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                <Archive className="w-3 h-3" /> Archived
              </span>
            )}
          </div>
        </div>

        {/* Shelf-stable toggle */}
        <section className="rounded-lg border border-border bg-card p-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={category.shelfStable}
              onChange={(e) => handleToggleShelfStable(e.target.checked)}
              className="mt-1"
            />
            <span className="flex-1">
              <span className="text-sm font-medium block">Treat as shelf-stable</span>
              <span className="text-xs text-muted-foreground block mt-1">
                When enabled, the production wizard will not auto-scale this filling to fit the moulds. Instead, it asks you for a batch multiplier (e.g. 1×, 2×) so you can prepare a deliberate batch size — useful for fillings made in fixed quantities like pralines or pâtes de fruit.
              </span>
            </span>
          </label>
        </section>

        {/* Read-only info */}
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          <div className="flex justify-between items-center px-3 py-2 text-sm">
            <span className="text-muted-foreground">Fillings in this category</span>
            <span>{inUseCount}</span>
          </div>
        </div>

        <UsedInPanel
          singular="filling"
          plural="fillings"
          items={fillingsUsingCategory.map((f) => ({
            id: f.id ?? "",
            name: f.name,
            href: `/fillings/${encodeURIComponent(f.id ?? "")}`,
          }))}
          emptyMessage="No fillings are using this category yet."
        />

        {/* Archive / Delete */}
        <section className="pt-4 border-t border-border">
          {category.archived ? (
            <button
              onClick={() => unarchiveFillingCategory(categoryId)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArchiveRestore className="w-4 h-4" /> Unarchive category
            </button>
          ) : inUseCount > 0 ? (
            confirmDelete ? (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium">Archive this category?</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {inUseCount} filling{inUseCount === 1 ? "" : "s"} still use{inUseCount === 1 ? "s" : ""} this category, so it can&apos;t be deleted.
                  Archiving hides it from the picker when creating new fillings; existing fillings keep the label.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { await archiveFillingCategory(categoryId); setConfirmDelete(false); router.replace("/fillings?tab=categories"); }}
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
          ) : confirmDelete ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <p className="text-sm text-destructive font-medium">Delete this category?</p>
              <p className="text-xs text-muted-foreground">
                No fillings are currently using it. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={async () => { await deleteFillingCategory(categoryId); router.replace("/fillings?tab=categories"); }}
                  className="rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium"
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
          )}
        </section>
      </div>
    </div>
  );
}
