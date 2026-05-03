"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useFillingCategory,
  useFillingCategories,
  useFillingCategoryUsage,
  saveFillingCategory,
  deleteFillingCategory,
  archiveFillingCategory,
  unarchiveFillingCategory,
  useFillings,
} from "@/lib/hooks";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { ArrowLeft, Trash2, Archive, ArchiveRestore, Check } from "lucide-react";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";
import { COLOR_BLIND_SAFE_PALETTE } from "@/types";
import { contrastingTextColor, tintBg, tintEdge, chipTextColor, NEUTRAL_CATEGORY_HEX } from "@/lib/categoryColor";

const FALLBACK_COLOR = NEUTRAL_CATEGORY_HEX;

function isHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export default function FillingCategoryDetailPage() {
  const categoryId = useSpaId("categories");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const category = useFillingCategory(categoryId);
  const inUseCount = useFillingCategoryUsage(category?.name);
  const allFillings = useFillings();
  const allCategories = useFillingCategories();
  const sharedColorWith = (category?.color
    ? allCategories.filter(
        (c) => c.id !== category?.id && !c.archived && (c.color ?? "").toLowerCase() === category.color!.toLowerCase(),
      )
    : []
  ).map((c) => c.name);

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
  }, [isNew, categoryId]);  
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
      color: category.color,
      archived: category.archived,
    });
  }

  async function handleColorChange(next: string) {
    if (!category) return;
    if (!isHex(next)) return;
    await saveFillingCategory({
      id: category.id,
      name: category.name,
      shelfStable: category.shelfStable,
      color: next,
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

        {/* Colour picker — drives the bar segment, chip, and legend on the
            product-cost page. Defaults to the colour-blind-safe Okabe-Ito palette. */}
        <section className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div>
            <label className="label">Colour</label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Used on the product-cost breakdown bar, chips, and legend. Defaults are picked from a colour-blind-safe palette.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              type="color"
              value={category.color ?? FALLBACK_COLOR}
              onChange={(e) => handleColorChange(e.target.value)}
              className="w-10 h-10 rounded-md border border-border cursor-pointer p-0.5"
              title="Pick custom colour"
            />
            <span className="text-sm text-muted-foreground font-mono">
              {category.color ?? "—"}
            </span>
          </div>

          {sharedColorWith.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-medium">Shared colour:</span>{" "}
              {sharedColorWith.length === 1
                ? `“${sharedColorWith[0]}” already uses this colour.`
                : `${sharedColorWith.length} other categories already use this colour (${sharedColorWith.join(", ")}).`}
              {" "}They will be indistinguishable on the product-cost breakdown.
            </div>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Quick picks</p>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_BLIND_SAFE_PALETTE.map((swatch) => {
                const active = (category.color ?? "").toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => handleColorChange(swatch.hex)}
                    title={`${swatch.name} (${swatch.hex})`}
                    aria-label={`Use ${swatch.name}`}
                    aria-pressed={active}
                    className={`w-7 h-7 rounded-md border transition-all flex items-center justify-center ${
                      active
                        ? "border-foreground ring-2 ring-foreground/20 scale-105"
                        : "border-border hover:scale-105"
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  >
                    {active && (
                      <Check
                        className="w-3.5 h-3.5"
                        style={{ color: contrastingTextColor(swatch.hex) }}
                        aria-hidden="true"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live preview — the same bar/chip combo used on the product-cost page */}
          <div className="rounded-md border border-border bg-background p-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Preview</p>
            <div className="flex h-3 rounded overflow-hidden w-full">
              <div className="w-1/3 bg-muted" />
              <div
                className="w-1/3 transition-colors"
                style={{ backgroundColor: category.color ?? FALLBACK_COLOR }}
              />
              <div className="w-1/3 bg-muted" />
            </div>
            <span
              className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border font-medium"
              style={{
                color: chipTextColor(category.color ?? FALLBACK_COLOR),
                backgroundColor: tintBg(category.color ?? FALLBACK_COLOR),
                borderColor: tintEdge(category.color ?? FALLBACK_COLOR),
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: category.color ?? FALLBACK_COLOR }}
              />
              {category.name}
            </span>
          </div>
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
