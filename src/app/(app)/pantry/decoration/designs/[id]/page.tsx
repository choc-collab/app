"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useShellDesign,
  useShellDesignUsage,
  saveShellDesign,
  deleteShellDesign,
  archiveShellDesign,
  unarchiveShellDesign,
} from "@/lib/hooks";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { ArrowLeft, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { DECORATION_APPLY_AT_OPTIONS, normalizeApplyAt } from "@/types";
import type { ShellDesignApplyAt } from "@/types";

export default function ShellDesignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const designId = decodeURIComponent(idStr);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const design = useShellDesign(designId);
  const usedInProducts = useShellDesignUsage(design?.name);

  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit form state
  const [editApplyAt, setEditApplyAt] = useState<ShellDesignApplyAt>("colour");
  const [errors, setErrors] = useState<string[]>([]);

  // Navigation guard
  const [savedOnce, setSavedOnce] = useState(false);
  const formDirty = editing && design != null && editApplyAt !== normalizeApplyAt(design.defaultApplyAt);
  const isDirty = (isNew && !savedOnce) || formDirty;
  const handleConfirmLeave = useCallback(async () => {
    if (isNew) {
      try { await deleteShellDesign(designId); } catch { /* ignore */ }
    }
  }, [isNew, designId]); // eslint-disable-line react-hooks/exhaustive-deps
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

  function syncForm(d: NonNullable<typeof design>) {
    setEditApplyAt(normalizeApplyAt(d.defaultApplyAt));
    setErrors([]);
  }

  function startEditing() {
    if (!design) return;
    syncForm(design);
    setEditing(true);
  }

  function handleCancel() {
    if (!design) return;
    syncForm(design);
    setEditing(false);
    setErrors([]);
    if (isNew) router.replace(`/pantry/decoration/designs/${encodeURIComponent(designId)}`);
  }

  useEffect(() => {
    if (design && editing) syncForm(design);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [design?.id]);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!design?.id) return;
    await saveShellDesign({
      id: design.id,
      name: design.name,
      defaultApplyAt: editApplyAt,
      archived: design.archived,
    });
    setSavedOnce(true);
    setEditing(false);
    setErrors([]);
    if (isNew) router.replace(`/pantry/decoration/designs/${encodeURIComponent(designId)}`);
  }

  async function handleHardDelete() {
    try {
      await deleteShellDesign(designId);
      router.replace("/pantry/decoration");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete design");
    }
  }

  async function handleArchive() {
    await archiveShellDesign(designId);
    setConfirmDelete(false);
    router.replace("/pantry/decoration");
  }

  if (!design) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const inUseCount = usedInProducts.length;
  const normalizedPhase = normalizeApplyAt(design.defaultApplyAt);
  const currentApplyAt = DECORATION_APPLY_AT_OPTIONS.find((o) => o.value === normalizedPhase);

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
        {/* Name row */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 flex items-center gap-2">
            <InlineNameEditor
              name={design.name}
              onSave={async (n) => {
                await saveShellDesign({
                  id: design.id,
                  name: n,
                  defaultApplyAt: design.defaultApplyAt,
                  archived: design.archived,
                });
              }}
              className="text-xl font-bold"
            />
            {design.archived && (
              <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                <Archive className="w-3 h-3" /> Archived
              </span>
            )}
          </div>
          {!editing && (
            <button
              onClick={startEditing}
              className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
              aria-label="Edit shell design"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {editing ? (
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label" htmlFor="design-apply-at">Production step</label>
              <select
                id="design-apply-at"
                value={editApplyAt}
                onChange={(e) => setEditApplyAt(e.target.value as ShellDesignApplyAt)}
                className="input w-full"
                autoFocus={isNew}
              >
                {DECORATION_APPLY_AT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                Determines which production phase this design step appears in during a batch.
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
          <>
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              <div className="flex justify-between items-center px-3 py-2 text-sm">
                <span className="text-muted-foreground">Production step</span>
                <span>{currentApplyAt?.label ?? "Unknown"}</span>
              </div>
            </div>

            <UsedInPanel
              singular="product"
              plural="products"
              items={usedInProducts.map((product) => ({
                id: product.id ?? "",
                name: product.name,
                href: `/products/${encodeURIComponent(product.id ?? "")}`,
              }))}
              emptyMessage="No products are using this design yet."
            />

            {/* Archive / Delete */}
            <section className="pt-4 border-t border-border">
              {design.archived ? (
                <button
                  onClick={() => unarchiveShellDesign(designId)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArchiveRestore className="w-4 h-4" /> Unarchive design
                </button>
              ) : inUseCount > 0 ? (
                confirmDelete ? (
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium">Archive this design?</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {inUseCount} product{inUseCount === 1 ? "" : "s"} still reference{inUseCount === 1 ? "s" : ""} this design, so it can&apos;t be deleted.
                      Archiving hides it from the technique picker on new shell design steps.
                    </p>
                    <div className="flex gap-2">
                      <button onClick={handleArchive} className="btn-primary px-4 py-2 text-sm">
                        Yes, archive design
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">Cancel</button>
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
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">Cancel</button>
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
            </section>
          </>
        )}
      </div>
    </div>
  );
}
