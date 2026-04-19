"use client";

import { use, useState, useEffect, useCallback } from "react";
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
import { ArrowLeft, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";

/** Generate a URL-safe slug from a display name. */
function nameToSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

export default function DecorationCategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const categoryId = decodeURIComponent(idStr);
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

  // Navigation guard — delete incomplete record if user leaves a ?new=1 page without saving
  const [savedOnce, setSavedOnce] = useState(false);
  const isDirty = isNew && !savedOnce;
  const handleConfirmLeave = useCallback(async () => {
    if (isNew) {
      try { await deleteDecorationCategory(categoryId); } catch { /* ignore */ }
    }
  }, [isNew, categoryId]); // eslint-disable-line react-hooks/exhaustive-deps
  useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  // Auto-save and strip ?new=1 once the category loads for a new record
  useEffect(() => {
    if (isNew && category && !savedOnce) {
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

  if (!category) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
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
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="px-4 pb-6 space-y-6 max-w-lg">
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

        {/* Read-only info */}
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          <div className="flex justify-between items-center px-3 py-2 text-sm">
            <span className="text-muted-foreground">Materials</span>
            <span>{inUseCount}</span>
          </div>
        </div>

        <UsedInPanel
          singular="material"
          plural="materials"
          items={materialsUsingCategory.map((m) => ({
            id: m.id ?? "",
            name: m.name,
            href: `/pantry/decoration/${encodeURIComponent(m.id ?? "")}`,
          }))}
          emptyMessage="No materials are using this category yet."
        />

        {/* Archive / Delete */}
        <section className="pt-4 border-t border-border">
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
      </div>
    </div>
  );
}
