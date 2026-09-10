"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  useShellDesign,
  useShellDesignUsage,
  updateShellDesignFields,
  deleteShellDesign,
  archiveShellDesign,
  unarchiveShellDesign,
} from "@/lib/hooks";
import { db } from "@/lib/db";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import { SidebarCard } from "@/components/detail-sidebar";
import { ArrowLeft, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useSpaId } from "@/lib/use-spa-id";
import { DECORATION_APPLY_AT_OPTIONS, normalizeApplyAt } from "@/types";
import type { ShellDesignApplyAt } from "@/types";

export default function ShellDesignDetailPage() {
  const designId = useSpaId("designs");
  const router = useRouter();

  const design = useShellDesign(designId);
  const usedInProducts = useShellDesignUsage(design?.name);

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Loading vs. not-found — the live query returns `undefined` for both, so a
  // one-shot direct read resolves which one it actually is.
  const [loadState, setLoadState] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!designId) return;
    let cancelled = false;
    db.shellDesigns.get(designId).then((d) => {
      if (!cancelled) setLoadState(d ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [designId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmDelete) setConfirmDelete(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete]);

  if (!designId || loadState === "loading" || (loadState === "found" && !design)) {
    return <DetailSkeleton cards={1} sidebar={1} label="Loading shell design" />;
  }
  if (loadState === "not-found" || !design) {
    return (
      <DetailNotFound
        entity="shell design"
        backHref="/pantry/decoration"
        backLabel="Decoration"
      />
    );
  }

  const inUseCount = usedInProducts.length;
  const normalizedPhase = normalizeApplyAt(design.defaultApplyAt);
  const currentApplyAt = DECORATION_APPLY_AT_OPTIONS.find((o) => o.value === normalizedPhase);

  const subtitle = [
    currentApplyAt?.label ?? "Unknown step",
    inUseCount > 0 ? `used by ${inUseCount} product${inUseCount === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");

  async function handleHardDelete() {
    if (!designId) return;
    try {
      await deleteShellDesign(designId);
      router.replace("/pantry/decoration");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete design");
    }
  }

  async function handleArchive() {
    if (!designId) return;
    await archiveShellDesign(designId);
    setConfirmDelete(false);
    router.replace("/pantry/decoration");
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/pantry/decoration"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Decoration
        </Link>
      </div>

      {/* Header */}
      <div className="px-4 pb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <InlineNameEditor
            name={design.name}
            onSave={async (n) => { await updateShellDesignFields(designId, { name: n }, "Name"); }}
            className="text-xl font-bold"
          />
          {design.archived && (
            <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
              <Archive className="w-3 h-3" /> Archived
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Main column ── */}
        <div className="space-y-4 min-w-0">
          <div className="rounded-lg border border-border bg-card">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-[13px] font-semibold">Production step</h2>
            </div>
            <div className="p-4">
              <label className="label" htmlFor="design-apply-at">
                Which production phase this design step appears in during a batch
              </label>
              <select
                id="design-apply-at"
                value={normalizedPhase}
                onChange={(e) =>
                  updateShellDesignFields(
                    designId,
                    { defaultApplyAt: e.target.value as ShellDesignApplyAt },
                    "Production step",
                  )
                }
                aria-label="Production step"
                className="input w-full"
              >
                {DECORATION_APPLY_AT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Destructive actions ── */}
          <div className="pt-2">
            {design.archived ? (
              <button
                onClick={() => unarchiveShellDesign(designId)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArchiveRestore className="w-4 h-4" /> Unarchive design
              </button>
            ) : inUseCount > 0 ? (
              /* Still referenced — archive is the only way out. */
              confirmDelete ? (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium">Delete is blocked</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {inUseCount} product{inUseCount === 1 ? "" : "s"} still reference
                    {inUseCount === 1 ? "s" : ""} this design, so it can&apos;t be deleted.
                    Archiving hides it from the technique picker on new shell design steps.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={handleArchive} className="btn-primary px-4 py-2 text-sm">
                      Archive instead
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
                  <Archive className="w-4 h-4" /> Archive design
                </button>
              )
            ) : (
              confirmDelete ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm text-destructive font-medium">Delete this design?</p>
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
                  <Trash2 className="w-4 h-4" /> Delete design
                </button>
              )
            )}
          </div>
        </div>

        {/* ── Sidebar ── */}
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
              emptyMessage="No products are using this design yet."
              hideHeading
            />
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}
