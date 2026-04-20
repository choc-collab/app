"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useIngredientCategory,
  useIngredientCategoryUsage,
  saveIngredientCategory,
  deleteIngredientCategory,
  archiveIngredientCategory,
  unarchiveIngredientCategory,
} from "@/lib/hooks";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { ArrowLeft, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";

export default function IngredientCategoryDetailPage() {
  const categoryId = useSpaId("categories");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const category = useIngredientCategory(categoryId);
  const usedInIngredients = useIngredientCategoryUsage(category?.name);

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Navigation guard — delete incomplete record if user leaves ?new=1 without saving
  const [savedOnce, setSavedOnce] = useState(false);
  const isDirty = isNew && !savedOnce;
  const handleConfirmLeave = useCallback(async () => {
    if (isNew && categoryId) {
      try { await deleteIngredientCategory(categoryId); } catch { /* in-use guard may prevent delete — fine, leave it */ }
    }
  }, [isNew, categoryId]);
  useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  // Strip ?new=1 after initial render to mark the record as "committed"
  useEffect(() => {
    if (isNew && category && categoryId) {
      setSavedOnce(true);
      router.replace(`/ingredients/categories/${encodeURIComponent(categoryId)}`);
    }
  }, [isNew, category?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmDelete) setConfirmDelete(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete]);

  async function handleHardDelete() {
    if (!categoryId) return;
    try {
      await deleteIngredientCategory(categoryId);
      router.replace("/ingredients?tab=categories");
    } catch (err) {
      // Surface error inline — e.g. "Chocolate" protection or race condition
      setDeleteError(err instanceof Error ? err.message : "Failed to delete category");
    }
  }

  async function handleArchive() {
    if (!categoryId) return;
    await archiveIngredientCategory(categoryId);
    setConfirmDelete(false);
    router.replace("/ingredients?tab=categories");
  }

  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!categoryId || !category) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const inUseCount = usedInIngredients.length;
  const isChocolate = category.name === "Chocolate";

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/ingredients?tab=categories"
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
                await saveIngredientCategory({
                  id: category.id,
                  name: n,
                  archived: category.archived,
                });
              }}
              className="text-xl font-bold"
            />
            {category.archived && (
              <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                <Archive className="w-3 h-3" /> Archived
              </span>
            )}
          </div>
        </div>

        {/* Used in panel */}
        <UsedInPanel
          singular="ingredient"
          plural="ingredients"
          items={usedInIngredients.map((ing) => ({
            id: ing.id ?? "",
            name: ing.name,
            href: `/ingredients/${encodeURIComponent(ing.id ?? "")}`,
          }))}
          emptyMessage="No ingredients are using this category yet."
        />

        {/* Archive / Delete */}
        <section className="pt-4 border-t border-border">
          {deleteError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 mb-3">
              <p className="text-xs text-destructive">{deleteError}</p>
            </div>
          )}

          {category.archived ? (
            <button
              onClick={() => unarchiveIngredientCategory(categoryId)}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArchiveRestore className="w-4 h-4" /> Unarchive category
            </button>
          ) : isChocolate ? (
            /* Chocolate is protected — explain why */
            <p className="text-xs text-muted-foreground">
              The &ldquo;Chocolate&rdquo; category cannot be deleted or archived — it is required for shell ingredient selection.
            </p>
          ) : inUseCount > 0 ? (
            /* In use — archive only, no delete */
            confirmDelete ? (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium">Archive this category?</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {inUseCount} ingredient{inUseCount === 1 ? "" : "s"} still reference{inUseCount === 1 ? "s" : ""} this category, so it can&apos;t be deleted.
                  Archiving hides it from the picker on new ingredients but keeps it linked to existing ones.
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
                  No ingredients are currently using it. This cannot be undone.
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
      </div>
    </div>
  );
}
