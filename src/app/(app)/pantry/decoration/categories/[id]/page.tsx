"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useDecorationCategory,
  useDecorationCategoryUsageCounts,
  saveDecorationCategory,
  deleteDecorationCategory,
  archiveDecorationCategory,
  unarchiveDecorationCategory,
  useDecorationMaterials,
} from "@/lib/hooks";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import { SidebarCard } from "@/components/detail-sidebar";
import { db } from "@/lib/db";
import { ArrowLeft, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";

/** Generate a URL-safe slug from a display name. */
function nameToSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export default function DecorationCategoryDetailPage() {
  const categoryId = useSpaId("categories");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const category = useDecorationCategory(categoryId);
  const usageCounts = useDecorationCategoryUsageCounts();
  const allMaterials = useDecorationMaterials(true);

  // Materials using this category (by slug match)
  const materialsUsingCategory = category
    ? allMaterials.filter((m) => m.type === category.slug && !m.archived)
    : [];

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Loading vs. not-found — the live query returns `undefined` for both, so a
  // one-shot direct read resolves which one it actually is.
  const [loadState, setLoadState] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!categoryId) return;
    let cancelled = false;
    db.decorationCategories.get(categoryId).then((c) => {
      if (!cancelled) setLoadState(c ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [categoryId]);

  // Navigation guard — delete incomplete record if user leaves a ?new=1 page without saving
  const [savedOnce, setSavedOnce] = useState(false);
  const isDirty = isNew && !savedOnce;
  const handleConfirmLeave = useCallback(async () => {
    if (isNew && categoryId) {
      try { await deleteDecorationCategory(categoryId); } catch { /* ignore */ }
    }
  }, [isNew, categoryId]);  
  useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  // Auto-save and strip ?new=1 once the category loads for a new record
  useEffect(() => {
    if (isNew && category && !savedOnce && categoryId) {
      setSavedOnce(true);
      router.replace(`/pantry/decoration/categories/${encodeURIComponent(categoryId)}`);
    }
  }, [isNew, category, savedOnce, categoryId, router]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmDelete) setConfirmDelete(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete]);

  if (!categoryId || loadState === "loading" || (loadState === "found" && !category)) {
    return <DetailSkeleton cards={1} sidebar={1} label="Loading decoration category" />;
  }
  if (loadState === "not-found" || !category) {
    return (
      <DetailNotFound
        entity="decoration category"
        backHref="/pantry/decoration?tab=categories"
        backLabel="Decoration categories"
      />
    );
  }

  const inUseCount = usageCounts.get(category.slug) ?? 0;

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/pantry/decoration"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Decoration categories
        </Link>
      </div>

      <div className="px-4 pb-5">
        {/* Name row — edits name + auto-derives slug */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <InlineNameEditor
              name={category.name}
              onSave={async (n) => {
                await saveDecorationCategory({
                  id: category.id,
                  name: n,
                  slug: nameToSlug(n),
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
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Main column ── */}
        <section className="min-w-0">
          {category.archived ? (
            <button
              onClick={() => unarchiveDecorationCategory(categoryId)}
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
                  {inUseCount} material{inUseCount === 1 ? "" : "s"} still use{inUseCount === 1 ? "s" : ""} this category, so it can&apos;t be deleted.
                  Archiving hides it from the picker when creating new materials.
                </p>
                <div className="flex gap-2">
                  <button onClick={async () => { await archiveDecorationCategory(categoryId); setConfirmDelete(false); router.replace("/pantry/decoration"); }} className="btn-primary px-4 py-2 text-sm">
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
            confirmDelete ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm text-destructive font-medium">Delete this category?</p>
                <p className="text-xs text-muted-foreground">
                  No materials are currently using it. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { await deleteDecorationCategory(categoryId); router.replace("/pantry/decoration"); }}
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
            )
          )}
        </section>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <SidebarCard title="Used in" meta={inUseCount > 0 ? inUseCount : undefined}>
            <UsedInPanel
              singular="material"
              plural="materials"
              items={materialsUsingCategory.map((m) => ({
                id: m.id ?? "",
                name: m.name,
                href: `/pantry/decoration/${encodeURIComponent(m.id ?? "")}`,
              }))}
              emptyMessage="No materials are using this category yet."
              hideHeading
            />
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}
