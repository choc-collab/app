"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useIngredient, useIngredients, useIngredientUsage, updateIngredientFields, deleteIngredient,
  archiveIngredient, unarchiveIngredient, checkIngredientBeforeDelete, useIngredientPriceHistory,
  deleteIngredientPriceHistoryEntry, setIngredientLowStock, setIngredientOutOfStock,
  markIngredientOrdered, useCurrencySymbol, useCoatings, useCurrentCoatingMappings,
  saveCoatingChocolateMapping, addCoating, updateCoatingTemperingFlag,
  useIngredientCategoryNames, useMarketRegion,
} from "@/lib/hooks";
import type { IngredientDeleteCheck } from "@/lib/hooks";
import { db } from "@/lib/db";
import {
  COMPOSITION_FIELDS, allergenLabel, getAllergensByRegion, migrateAllergens,
  costPerGram as computeCostPerGram, type Ingredient, type CompositionKey,
} from "@/types";
import { ArrowLeft, Layers, Trash2, X, Archive, ArchiveRestore } from "lucide-react";
import { UsedInPanel } from "@/components/pantry";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { StockStatusPanel } from "@/components/stock-status-panel";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import {
  SidebarCard, PropertyRow, DerivedRow, PROPERTY_INPUT_CLASS,
} from "@/components/detail-sidebar";
import { IngredientNutritionEditor } from "@/components/ingredient-nutrition-editor";
import { fillDerivedNutrition, getMissingMandatoryNutrients } from "@/lib/nutrition";
import { useSpaId } from "@/lib/use-spa-id";

const PURCHASE_UNITS = ["g", "kg", "ml", "L", "pcs"] as const;

/** Grams per purchase unit where the unit fully determines it. ml / L / pcs
 *  depend on density or piece size and must be entered by hand. */
function autoGramsPerUnit(purchaseUnit: string): number | null {
  if (purchaseUnit === "g") return 1;
  if (purchaseUnit === "kg") return 1000;
  return null;
}

type TabId = "details" | "composition" | "allergens" | "pricing" | "nutrition" | "shell";

/** Swatch colours for the composition proportion bar, in `COMPOSITION_FIELDS` order. */
const COMPOSITION_COLORS = [
  "var(--accent-cocoa-ink)",
  "var(--accent-cocoa-bg)",
  "var(--accent-taupe-bg)",
  "var(--accent-blue-bg)",
  "var(--accent-sage-bg)",
  "var(--accent-lilac-bg)",
  "var(--accent-butter-bg)",
];

export default function IngredientDetailPage() {
  const ingredientId = useSpaId("ingredients");
  const router = useRouter();

  const sym = useCurrencySymbol();
  const ingredient = useIngredient(ingredientId);
  const allIngredients = useIngredients();
  const usage = useIngredientUsage(ingredientId);
  const priceHistory = useIngredientPriceHistory(ingredientId);
  const market = useMarketRegion();

  const manufacturers = [...new Set(allIngredients.map((i) => i.manufacturer).filter(Boolean))];
  const brands = [...new Set(allIngredients.map((i) => i.brand).filter(Boolean))] as string[];
  const vendors = [...new Set(allIngredients.map((i) => i.vendor).filter(Boolean))] as string[];
  const sources = [...new Set(allIngredients.map((i) => i.source).filter(Boolean))];

  const [activeTab, setActiveTab] = useState<TabId>("details");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteCheck, setDeleteCheck] = useState<IngredientDeleteCheck | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // Loading vs. not-found — the live query returns `undefined` for both, so a
  // one-shot direct read resolves which one it actually is.
  const [status, setStatus] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!ingredientId) return;
    let cancelled = false;
    db.ingredients.get(ingredientId).then((i) => {
      if (!cancelled) setStatus(i ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [ingredientId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) { setConfirmDelete(false); setDeleteCheck(null); }
      else if (confirmArchive) setConfirmArchive(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, confirmArchive]);

  if (!ingredientId || status === "loading" || (status === "found" && !ingredient)) {
    return <DetailSkeleton cards={2} sidebar={4} tabs label="Loading ingredient" />;
  }
  if (status === "not-found" || !ingredient) {
    return <DetailNotFound entity="ingredient" backHref="/ingredients" backLabel="Ingredients" />;
  }

  const costPerGram = computeCostPerGram(ingredient);
  const showShellTab = ingredient.category === "Chocolate";
  // The Shell tab disappears the moment the category stops being Chocolate, so
  // a stale selection has to fall back rather than render an empty panel.
  const visibleTab: TabId = activeTab === "shell" && !showShellTab ? "details" : activeTab;

  const tabs: { id: TabId; label: string }[] = [
    { id: "details", label: "Details" },
    ...(showShellTab ? [{ id: "shell" as const, label: "Shell" }] : []),
    { id: "composition", label: "Composition" },
    { id: "allergens", label: "Allergens" },
    { id: "pricing", label: "Pricing" },
    { id: "nutrition", label: "Nutrition" },
  ];

  const subtitle = [
    ingredient.category,
    ingredient.manufacturer,
    costPerGram != null ? `${sym}${(costPerGram * 1000).toFixed(2)}/kg` : null,
    usage.length > 0 ? `used in ${usage.length} filling${usage.length !== 1 ? "s" : ""}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link href="/ingredients" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Ingredients
        </Link>
      </div>

      {/* Header */}
      <div className="px-4 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <InlineNameEditor
              name={ingredient.name}
              onSave={async (n) => { await updateIngredientFields(ingredientId, { name: n }); }}
              className="text-xl font-bold"
            />
            {ingredient.category && (
              <span className="rounded-full bg-accent text-accent-foreground px-2.5 py-0.5 text-[11px] font-medium shrink-0">
                {ingredient.category}
              </span>
            )}
            {ingredient.archived && (
              <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                <Archive className="w-3 h-3" /> Archived
              </span>
            )}
          </div>
          {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <button
          onClick={() => setActiveTab("pricing")}
          className="btn-primary px-4 py-2 text-sm shrink-0"
        >
          Log price
        </button>
      </div>

      {/* Tab strip */}
      <div className="flex border-b border-border mb-4 px-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-[13px] font-medium whitespace-nowrap -mb-px border-b-2 transition-colors ${
              visibleTab === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Main column ── */}
        <div className="space-y-4 min-w-0">
          {visibleTab === "details" && (
            <>
              <PropertiesCard
                key={`props-${ingredient.id}`}
                ingredientId={ingredientId}
                ingredient={ingredient}
                manufacturers={manufacturers}
                brands={brands}
                vendors={vendors}
                sources={sources}
              />
              <NotesCard key={`notes-${ingredient.id}`} ingredientId={ingredientId} ingredient={ingredient} />
            </>
          )}

          {visibleTab === "shell" && (
            <ShellCard key={`shell-${ingredient.id}`} ingredientId={ingredientId} ingredient={ingredient} />
          )}

          {visibleTab === "composition" && (
            <CompositionCard key={`comp-${ingredient.id}`} ingredientId={ingredientId} ingredient={ingredient} />
          )}

          {visibleTab === "allergens" && (
            <AllergensCard ingredientId={ingredientId} ingredient={ingredient} market={market} />
          )}

          {visibleTab === "pricing" && (
            <>
              <PricingCard key={`pricing-${ingredient.id}`} ingredientId={ingredientId} ingredient={ingredient} sym={sym} />
              <PriceHistoryCard history={priceHistory} sym={sym} />
            </>
          )}

          {visibleTab === "nutrition" && (
            <IngredientNutritionEditor
              key={`nutrition-${ingredient.id}`}
              ingredient={ingredient}
              market={market}
              onCommit={(nutrition) => updateIngredientFields(ingredientId, { nutrition }, "Nutrition")}
            />
          )}

          {/* ── Destructive actions ── */}
          <div className="pt-2 space-y-3">
            {ingredient.archived ? (
              <button
                onClick={async () => { await unarchiveIngredient(ingredientId); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArchiveRestore className="w-4 h-4" /> Unarchive ingredient
              </button>
            ) : confirmArchive ? (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-sm font-medium">Archive this ingredient?</p>
                <p className="text-xs text-muted-foreground">
                  It stays on every filling and batch that already uses it, but is hidden from
                  lists and pickers.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { await archiveIngredient(ingredientId); router.replace("/ingredients"); }}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Yes, archive ingredient
                  </button>
                  <button onClick={() => setConfirmArchive(false)} className="btn-secondary px-4 py-2">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setConfirmArchive(true); setConfirmDelete(false); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Archive className="w-4 h-4" /> Archive ingredient
              </button>
            )}

            {confirmDelete && deleteCheck ? (
              <IngredientDeletePanel
                check={deleteCheck}
                onDelete={async () => { await deleteIngredient(ingredientId); router.replace("/ingredients"); }}
                onArchive={async () => { await archiveIngredient(ingredientId); router.replace("/ingredients"); }}
                onCancel={() => { setConfirmDelete(false); setDeleteCheck(null); }}
              />
            ) : (
              <button
                onClick={async () => {
                  const check = await checkIngredientBeforeDelete(ingredientId);
                  setDeleteCheck(check);
                  setConfirmDelete(true);
                  setConfirmArchive(false);
                }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete ingredient
              </button>
            )}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <SidebarCard title="Stock">
            <StockStatusPanel
              lowStock={ingredient.lowStock}
              lowStockOrdered={ingredient.lowStockOrdered}
              outOfStock={ingredient.outOfStock}
              itemName={ingredient.name}
              onFlagLowStock={() => setIngredientLowStock(ingredientId, true)}
              onFlagOutOfStock={() => setIngredientOutOfStock(ingredientId, true)}
              onMarkOrdered={() => markIngredientOrdered(ingredientId)}
              onClearOutOfStock={() => setIngredientOutOfStock(ingredientId, false)}
              onClearLowStock={() => setIngredientLowStock(ingredientId, false)}
            />
          </SidebarCard>

          <DerivedCard ingredient={ingredient} market={market} sym={sym} costPerGram={costPerGram} />

          <SidebarCard title="Used in" meta={usage.length > 0 ? usage.length : undefined}>
            <UsedInPanel
              singular="filling"
              plural="fillings"
              items={usage.map(({ filling, products }) => ({
                id: filling.id ?? "",
                name: filling.name,
                href: `/fillings/${encodeURIComponent(filling.id ?? "")}`,
                icon: <Layers aria-hidden="true" className="w-4 h-4" />,
                subItems: products.map((r) => r.name),
              }))}
              emptyMessage="Not used in any filling yet."
              hideHeading
            />
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar: Properties ─────────────────────────────────────────────────────

function PropertiesCard({
  ingredientId,
  ingredient,
  manufacturers,
  brands,
  vendors,
  sources,
}: {
  ingredientId: string;
  ingredient: Ingredient;
  manufacturers: string[];
  brands: string[];
  vendors: string[];
  sources: string[];
}) {
  const categoryNames = useIngredientCategoryNames();

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[13px] font-semibold">Properties</h2>
      </div>
      <div className="p-4 space-y-1">
        <PropertyRow label="Category">
          <select
            value={ingredient.category ?? ""}
            onChange={(e) => updateIngredientFields(ingredientId, { category: e.target.value || undefined })}
            aria-label="Category"
            className={PROPERTY_INPUT_CLASS}
          >
            <option value="">— none —</option>
            {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </PropertyRow>

        <TextPropertyRow
          label="Commercial name"
          ariaLabel="Commercial name"
          value={ingredient.commercialName ?? ""}
          onCommit={(v) => updateIngredientFields(ingredientId, { commercialName: v || undefined })}
        />
        <TextPropertyRow
          label="Manufacturer"
          ariaLabel="Manufacturer"
          value={ingredient.manufacturer ?? ""}
          suggestions={manufacturers}
          listId="ing-manufacturer-list"
          // `manufacturer` is non-optional on the type, so it empties to "" not undefined.
          onCommit={(v) => updateIngredientFields(ingredientId, { manufacturer: v })}
        />
        <TextPropertyRow
          label="Brand"
          ariaLabel="Brand"
          value={ingredient.brand ?? ""}
          suggestions={brands}
          listId="ing-brand-list"
          onCommit={(v) => updateIngredientFields(ingredientId, { brand: v || undefined })}
        />
        <TextPropertyRow
          label="Vendor"
          ariaLabel="Vendor"
          value={ingredient.vendor ?? ""}
          suggestions={vendors}
          listId="ing-vendor-list"
          onCommit={(v) => updateIngredientFields(ingredientId, { vendor: v || undefined })}
        />
        <TextPropertyRow
          label="Source"
          ariaLabel="Source"
          value={ingredient.source ?? ""}
          suggestions={sources}
          listId="ing-source-list"
          onCommit={(v) => updateIngredientFields(ingredientId, { source: v })}
        />
      </div>
    </div>
  );
}

/** A property row holding free text: local draft while typing, commit on blur,
 *  and only when the value actually moved. */
function TextPropertyRow({
  label,
  ariaLabel,
  value,
  suggestions,
  listId,
  onCommit,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  suggestions?: string[];
  listId?: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Track the value this draft was seeded from, so a change made elsewhere
  // (import, another tab) can refresh the input without a prop-sync effect.
  const [seed, setSeed] = useState(value);
  if (seed !== value) {
    setSeed(value);
    setDraft(value);
  }

  return (
    <PropertyRow label={label}>
      <input
        type="text"
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed === value) return;
          onCommit(trimmed);
        }}
        placeholder="—"
        aria-label={ariaLabel}
        className={PROPERTY_INPUT_CLASS}
      />
      {listId && suggestions && suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </PropertyRow>
  );
}

// ─── Sidebar: Derived ────────────────────────────────────────────────────────

function DerivedCard({
  ingredient,
  market,
  sym,
  costPerGram,
}: {
  ingredient: Ingredient;
  market: import("@/types").MarketRegion;
  sym: string;
  costPerGram: number | null;
}) {
  const nutrition = ingredient.nutrition ? fillDerivedNutrition(ingredient.nutrition) : undefined;
  const missing = getMissingMandatoryNutrients(nutrition, market);

  return (
    <SidebarCard title="Derived" tinted className="space-y-2">
      <DerivedRow
        label="Cost per gram"
        value={
          costPerGram != null
            ? `${sym}${costPerGram < 0.01 ? costPerGram.toFixed(4) : costPerGram.toFixed(3)}`
            : "—"
        }
      />
      <DerivedRow
        label="Cost per kg"
        value={costPerGram != null ? `${sym}${(costPerGram * 1000).toFixed(2)}` : "—"}
      />
      <DerivedRow
        label="Energy"
        value={nutrition?.energyKcal != null ? `${nutrition.energyKcal} kcal` : "—"}
      />
      {missing.length > 0 && (
        <p className="text-[11px] text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-2 py-1">
          {missing.length} mandatory {missing.length === 1 ? "nutrient" : "nutrients"} missing for{" "}
          {market} labels: {missing.map((m) => m.label).join(", ")}
        </p>
      )}
    </SidebarCard>
  );
}

// ─── Main: Notes ─────────────────────────────────────────────────────────────

function NotesCard({ ingredientId, ingredient }: { ingredientId: string; ingredient: Ingredient }) {
  const [value, setValue] = useState(ingredient.notes ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === (ingredient.notes ?? "")) return;
    updateIngredientFields(ingredientId, { notes: trimmed }, "Notes");
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
          placeholder="Substitutions, supplier quirks, how it behaves…"
          rows={4}
          aria-label="Notes"
          className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}

// ─── Main: Composition ───────────────────────────────────────────────────────

function CompositionCard({ ingredientId, ingredient }: { ingredientId: string; ingredient: Ingredient }) {
  const [draft, setDraft] = useState<Record<CompositionKey, string>>(() => {
    const out = {} as Record<CompositionKey, string>;
    for (const f of COMPOSITION_FIELDS) {
      const v = ingredient[f.key] ?? 0;
      out[f.key] = v === 0 ? "" : String(v);
    }
    return out;
  });

  const total = useMemo(
    () => COMPOSITION_FIELDS.reduce((sum, f) => {
      const v = parseFloat(draft[f.key]);
      return sum + (isNaN(v) ? 0 : v);
    }, 0),
    [draft],
  );

  function commit(key: CompositionKey, raw: string) {
    const parsed = parseFloat(raw);
    const next = isNaN(parsed) ? 0 : parsed;
    if (next === (ingredient[key] ?? 0)) return;
    updateIngredientFields(ingredientId, { [key]: next }, "Composition");
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">Composition</h2>
        {/* Advisory only — each figure is independently true off a spec sheet and
            the remainder is legitimately unknown, so this never gates a write. */}
        <span className="text-xs text-muted-foreground tabular-nums">
          {total.toFixed(1)}% accounted for
        </span>
      </div>

      <div className="p-4">
        {total > 0 && (
          <div className="flex h-2 rounded-full overflow-hidden bg-muted mb-4">
            {COMPOSITION_FIELDS.map((f, i) => {
              const v = parseFloat(draft[f.key]);
              if (isNaN(v) || v <= 0) return null;
              return (
                <div
                  key={f.key}
                  style={{ width: `${Math.min(v, 100)}%`, background: COMPOSITION_COLORS[i] }}
                  title={`${f.label} ${v}%`}
                />
              );
            })}
          </div>
        )}

        <div className="space-y-1">
          {COMPOSITION_FIELDS.map((f, i) => (
            <div
              key={f.key}
              className="flex items-center justify-between gap-2 px-2 py-1.5 -mx-2 rounded-md hover:bg-muted transition-colors"
            >
              <span className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: COMPOSITION_COLORS[i] }}
                />
                {f.label}
              </span>
              <span className="flex items-baseline gap-1">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={draft[f.key]}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  onBlur={() => commit(f.key, draft[f.key])}
                  placeholder="—"
                  aria-label={f.label}
                  className="w-16 text-sm font-medium bg-transparent text-right border-0 focus:outline-none placeholder:font-normal placeholder:text-muted-foreground/50"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </span>
            </div>
          ))}
        </div>

        <label className="flex items-center gap-2 cursor-pointer mt-3 pt-3 border-t border-border">
          <input
            type="checkbox"
            checked={ingredient.awIrrelevant ?? false}
            onChange={(e) => updateIngredientFields(ingredientId, { awIrrelevant: e.target.checked || undefined })}
            className="rounded border-border"
          />
          <span className="text-xs text-muted-foreground">
            Doesn&rsquo;t meaningfully affect shelf life (e.g. citric acid, salt, zest) — excluded from Lab/Composition balance
          </span>
        </label>
      </div>
    </div>
  );
}

// ─── Main: Allergens ─────────────────────────────────────────────────────────

function AllergensCard({
  ingredientId,
  ingredient,
  market,
}: {
  ingredientId: string;
  ingredient: Ingredient;
  market: import("@/types").MarketRegion;
}) {
  const activeAllergens = getAllergensByRegion(market);
  // Allergens are one logical field, so every change writes the whole array —
  // never a per-checkbox partial that another toggle could clobber.
  const selected = migrateAllergens(ingredient.allergens ?? []);

  function write(next: string[]) {
    updateIngredientFields(ingredientId, { allergens: next }, "Allergens");
  }

  function toggle(id: string) {
    write(selected.includes(id) ? selected.filter((a) => a !== id) : [...selected, id]);
  }

  const nutIds = activeAllergens.filter((a) => a.group === "nuts").map((a) => a.id);

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[13px] font-semibold">Allergens</h2>
      </div>
      <div className="p-4">
        <div className="space-y-1 mb-4">
          {activeAllergens.filter((a) => !a.group).map((a) => (
            <label key={a.id} className="flex items-start gap-2.5 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={selected.includes(a.id)}
                onChange={() => toggle(a.id)}
                className="mt-0.5 shrink-0 accent-[var(--color-primary)]"
              />
              <span className="flex-1 min-w-0">
                <span className={`text-sm ${selected.includes(a.id) ? "font-semibold" : ""}`}>{a.label}</span>
                {a.hint && <span className="text-xs text-muted-foreground ml-1.5">{a.hint}</span>}
              </span>
            </label>
          ))}
        </div>

        <div className="border border-border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-muted/50 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide">Tree nuts</span>
            <div className="flex gap-3">
              <button
                onClick={() => write([...new Set([...selected, ...nutIds])])}
                className="text-xs text-primary hover:underline"
              >
                All
              </button>
              <button
                onClick={() => write(selected.filter((a) => !nutIds.includes(a)))}
                className="text-xs text-muted-foreground hover:underline"
              >
                None
              </button>
            </div>
          </div>
          <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-1">
            {activeAllergens.filter((a) => a.group === "nuts").map((a) => (
              <label key={a.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={selected.includes(a.id)}
                  onChange={() => toggle(a.id)}
                  className="shrink-0 accent-[var(--color-primary)]"
                />
                <span className={`text-sm ${selected.includes(a.id) ? "font-semibold" : ""}`}>{a.label}</span>
              </label>
            ))}
          </div>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
            {selected.map((a) => (
              <span
                key={a}
                className="rounded-full bg-status-warn-bg text-status-warn border border-status-warn-edge px-3 py-1 text-xs font-medium"
              >
                {allergenLabel(a)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main: Pricing ───────────────────────────────────────────────────────────

/**
 * The four price-bearing fields commit **as a group**, when focus leaves the
 * card — not field by field.
 *
 * Writing them individually would be actively wrong: every price write records
 * an `ingredientPriceHistory` entry and recomputes cost snapshots for every
 * product costed off this ingredient. Changing "10 kg for €50" to "5 kg for €25"
 * one field at a time would bank a spurious €0.010/g spike between the two
 * edits, polluting the price chart and the product cost-change log with a price
 * that never existed. Committing on the way out of the card means one edit
 * session, one history entry.
 */
function PricingCard({
  ingredientId,
  ingredient,
  sym,
}: {
  ingredientId: string;
  ingredient: Ingredient;
  sym: string;
}) {
  const [qty, setQty] = useState(ingredient.purchaseQty != null ? String(ingredient.purchaseQty) : "1");
  const [unit, setUnit] = useState(ingredient.purchaseUnit ?? "g");
  const [gpu, setGpu] = useState(() => {
    const auto = autoGramsPerUnit(ingredient.purchaseUnit ?? "g");
    if (auto != null) return String(auto);
    return ingredient.gramsPerUnit != null ? String(ingredient.gramsPerUnit) : "";
  });
  const [cost, setCost] = useState(ingredient.purchaseCost != null ? String(ingredient.purchaseCost) : "");
  const [priceDate, setPriceDate] = useState(
    ingredient.purchaseDate ?? new Date().toISOString().split("T")[0],
  );

  const gpuLocked = autoGramsPerUnit(unit) !== null;
  const effectiveGpu = useMemo(() => {
    const auto = autoGramsPerUnit(unit);
    if (auto !== null) return auto;
    const parsed = parseFloat(gpu);
    return isNaN(parsed) ? null : parsed;
  }, [unit, gpu]);

  const derivedCostPerGram = useMemo(() => {
    const c = parseFloat(cost);
    const q = parseFloat(qty);
    if (!c || !q || q <= 0) return null;
    if (!effectiveGpu || effectiveGpu <= 0) return null;
    return c / (q * effectiveGpu);
  }, [cost, qty, effectiveGpu]);

  function commitGroup() {
    const nextQty = parseFloat(qty) || undefined;
    const nextCost = parseFloat(cost) || undefined;
    const nextGpu = effectiveGpu ?? undefined;
    if (
      nextQty === ingredient.purchaseQty &&
      nextCost === ingredient.purchaseCost &&
      unit === (ingredient.purchaseUnit ?? "g") &&
      nextGpu === ingredient.gramsPerUnit &&
      priceDate === (ingredient.purchaseDate ?? "")
    ) return;
    updateIngredientFields(ingredientId, {
      purchaseQty: nextQty,
      purchaseCost: nextCost,
      purchaseUnit: unit || undefined,
      // Definitional for g/kg — write the derived value so the row stays
      // self-consistent even if a legacy record stored a wrong gramsPerUnit.
      gramsPerUnit: nextGpu,
      // User-set, not stamped automatically: a price is often entered from an
      // invoice days after the fact, and it dates the price-history entry.
      purchaseDate: priceDate || undefined,
    }, "Purchase pricing");
  }

  /** Commit only when focus leaves the card entirely — moving between the four
   *  inputs is still one editing session. */
  function handleBlurCapture(e: React.FocusEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    commitGroup();
  }

  function handleUnitChange(next: string) {
    setUnit(next);
    // For g/kg the grams-per-unit is fully determined by the unit, so enforce it
    // immediately rather than leaving a stale number visible.
    const auto = autoGramsPerUnit(next);
    if (auto != null) setGpu(String(auto));
  }

  return (
    <div className="rounded-lg border border-border bg-card" onBlur={handleBlurCapture}>
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">Purchase pricing</h2>
        {derivedCostPerGram != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {sym}
            {derivedCostPerGram < 0.01 ? derivedCostPerGram.toFixed(4) : derivedCostPerGram.toFixed(3)}/g
          </span>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label" htmlFor="ing-purchase-qty">Purchase qty</label>
            <input
              id="ing-purchase-qty"
              type="number"
              step="any"
              min="0"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="input"
              placeholder="1"
            />
          </div>
          <div>
            <label className="label" htmlFor="ing-purchase-unit">Purchase unit</label>
            <select
              id="ing-purchase-unit"
              value={unit}
              onChange={(e) => handleUnitChange(e.target.value)}
              className="input"
            >
              {PURCHASE_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label
              className="label"
              htmlFor="ing-grams-per-unit"
              title={gpuLocked
                ? `Fixed by the unit — 1 ${unit} = ${autoGramsPerUnit(unit)} g.`
                : "Net weight in grams of a single unit (from packaging). For liquids, use density: water ≈ 1000 g/L, milk ≈ 1030, cream 35% ≈ 995, honey ≈ 1420, oil ≈ 920."}
            >
              g per unit
            </label>
            <input
              id="ing-grams-per-unit"
              type="number"
              step="any"
              min="0"
              value={gpu}
              onChange={(e) => setGpu(e.target.value)}
              readOnly={gpuLocked}
              aria-readonly={gpuLocked || undefined}
              className={`input ${gpuLocked ? "bg-muted/40 text-muted-foreground cursor-not-allowed" : ""}`}
              placeholder="e.g. 1000"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="ing-purchase-cost">Price excl. VAT ({sym})</label>
            <input
              id="ing-purchase-cost"
              type="number"
              step="0.01"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="input"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="label" htmlFor="ing-purchase-date">Price last updated</label>
            <input
              id="ing-purchase-date"
              type="date"
              value={priceDate}
              onChange={(e) => setPriceDate(e.target.value)}
              className="input"
            />
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={ingredient.pricingIrrelevant ?? false}
            onChange={(e) => updateIngredientFields(ingredientId, { pricingIrrelevant: e.target.checked || undefined })}
            className="rounded border-border"
          />
          <span className="text-xs text-muted-foreground">
            Not relevant for pricing (e.g. water, salt) — treated as zero cost
          </span>
        </label>
      </div>
    </div>
  );
}

function PriceHistoryCard({
  history,
  sym,
}: {
  history: import("@/types").IngredientPriceHistory[];
  sym: string;
}) {
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && pendingRemove) setPendingRemove(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingRemove]);

  if (history.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">Price history</h2>
        <span className="text-[11px] text-muted-foreground tabular-nums">{history.length}</span>
      </div>
      <div>
        {history.map((entry) => (
          <div key={entry.id} className="px-4 py-2.5 border-b border-border last:border-b-0">
            <div className="flex justify-between items-baseline gap-2">
              <span className="text-sm font-medium text-primary tabular-nums">
                {sym}{entry.costPerGram < 0.01 ? entry.costPerGram.toFixed(4) : entry.costPerGram.toFixed(3)}/g
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {new Date(entry.recordedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                {pendingRemove === entry.id ? (
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Delete?</span>
                    <button
                      onClick={async () => { await deleteIngredientPriceHistoryEntry(entry.id!); setPendingRemove(null); }}
                      className="text-destructive font-medium hover:underline"
                    >
                      Yes
                    </button>
                    <button onClick={() => setPendingRemove(null)} className="text-muted-foreground hover:underline">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setPendingRemove(entry.id!)}
                    aria-label="Delete price entry"
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            {(entry.purchaseCost != null || entry.purchaseQty != null) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {entry.purchaseCost != null && `${sym}${entry.purchaseCost}`}
                {entry.purchaseQty != null && ` for ${entry.purchaseQty}${entry.purchaseUnit ?? ""}`}
                {entry.gramsPerUnit != null && ` (${entry.gramsPerUnit}g/unit)`}
              </p>
            )}
            {entry.note && <p className="text-xs text-muted-foreground italic mt-0.5">{entry.note}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main: Shell (Chocolate only) ────────────────────────────────────────────

function ShellCard({ ingredientId, ingredient }: { ingredientId: string; ingredient: Ingredient }) {
  const coatings = useCoatings();
  const currentMappings = useCurrentCoatingMappings();

  const mappedEntry = Array.from(currentMappings.entries()).find(
    ([, m]) => m.ingredientId === ingredientId,
  );
  const currentCoatingName = mappedEntry?.[0] ?? "";
  const seedTempering = mappedEntry?.[1]?.seedTempering ?? false;

  const [coatingType, setCoatingType] = useState(currentCoatingName);
  const [seed, setSeed] = useState(currentCoatingName);
  if (seed !== currentCoatingName) {
    setSeed(currentCoatingName);
    setCoatingType(currentCoatingName);
  }

  const shellCapable = ingredient.shellCapable ?? false;

  /** The coating name isn't a field on the ingredient — it's a
   *  `CoatingChocolateMapping` keyed by coating name, so committing it means
   *  registering the coating if it's new, then pointing it at this ingredient. */
  async function commitCoatingType() {
    const value = coatingType.trim().toLowerCase();
    if (!value || value === currentCoatingName) return;
    if (!coatings.includes(value)) await addCoating(value);
    await saveCoatingChocolateMapping(value, ingredientId);
    await updateCoatingTemperingFlag(value, seedTempering);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[13px] font-semibold">Shell chocolate</h2>
      </div>
      <div className="p-4 space-y-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={shellCapable}
            onChange={(e) => updateIngredientFields(ingredientId, { shellCapable: e.target.checked || undefined })}
            className="rounded border-border"
          />
          Can be used as shell chocolate
          <span className="text-xs text-muted-foreground">(couverture)</span>
        </label>

        {shellCapable && (
          <>
            <div>
              <label className="label" htmlFor="ing-coating-type">Coating type</label>
              <input
                id="ing-coating-type"
                type="text"
                list="coating-type-options"
                value={coatingType}
                onChange={(e) => setCoatingType(e.target.value)}
                onBlur={commitCoatingType}
                className="input"
                placeholder="e.g. dark, milk, white"
              />
              <datalist id="coating-type-options">
                {coatings.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={seedTempering}
                disabled={!currentCoatingName}
                onChange={(e) => {
                  if (currentCoatingName) updateCoatingTemperingFlag(currentCoatingName, e.target.checked);
                }}
                className="w-4 h-4 rounded border-border accent-primary disabled:opacity-40"
              />
              <span className="text-sm">Hand tempering — seeding method</span>
            </label>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Delete gate ─────────────────────────────────────────────────────────────

function IngredientDeletePanel({
  check,
  onDelete,
  onArchive,
  onCancel,
}: {
  check: IngredientDeleteCheck;
  onDelete: () => Promise<void>;
  onArchive: () => Promise<void>;
  onCancel: () => void;
}) {
  const { activeFillings, produced } = check;
  const hasActiveFillings = activeFillings.length > 0;

  // Case 3: produced AND still in active fillings → blocked outright.
  if (produced && hasActiveFillings) {
    return (
      <div className="rounded-lg border border-border bg-muted p-4 space-y-3">
        <p className="text-sm font-medium">Delete is blocked</p>
        <p className="text-xs text-muted-foreground">
          This ingredient has been produced and is still used by {activeFillings.length} active
          filling{activeFillings.length !== 1 ? "s" : ""}. Replace it on{" "}
          {activeFillings.length === 1 ? "that filling" : "those fillings"} first, or archive instead.
        </p>
        <ul className="space-y-1">
          {activeFillings.map((l) => (
            <li key={l.id} className="text-xs font-medium">
              <Link
                href={`/fillings/${encodeURIComponent(l.id ?? "")}`}
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {l.name}
              </Link>
            </li>
          ))}
        </ul>
        <button onClick={onCancel} className="btn-secondary px-4 py-2">OK</button>
      </div>
    );
  }

  // Case 4: produced, but only in superseded fillings → archive is the safe exit.
  if (produced && !hasActiveFillings) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <p className="text-sm font-medium text-destructive">Archive this ingredient?</p>
        <p className="text-xs text-muted-foreground">
          This ingredient has been used in production batches. It will be archived — hidden from
          lists but preserved for history.
        </p>
        <div className="flex gap-2">
          <button
            onClick={onArchive}
            className="inline-flex items-center justify-center rounded-full bg-warning text-warning-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-warning/90"
          >
            Archive ingredient
          </button>
          <button onClick={onCancel} className="btn-secondary px-4 py-2">Cancel</button>
        </div>
      </div>
    );
  }

  // Case 2: in active fillings but never produced → warn, then allow.
  if (hasActiveFillings) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <p className="text-sm font-medium text-destructive">Delete this ingredient?</p>
        <p className="text-xs text-muted-foreground">
          Used in {activeFillings.length} filling{activeFillings.length !== 1 ? "s" : ""}. Deleting
          removes it from {activeFillings.length === 1 ? "that filling" : "those fillings"}. This
          cannot be undone.
        </p>
        <ul className="space-y-1">
          {activeFillings.map((l) => (
            <li key={l.id} className="text-xs font-medium flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-destructive shrink-0" />
              {l.name}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button
            onClick={onDelete}
            className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
          >
            Yes, delete ingredient
          </button>
          <button onClick={onCancel} className="btn-secondary px-4 py-2">Cancel</button>
        </div>
      </div>
    );
  }

  // Case 1: not in use anywhere → straight delete.
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
      <p className="text-sm font-medium text-destructive">Delete this ingredient?</p>
      <p className="text-xs text-muted-foreground">
        This will permanently remove the ingredient from your library. This cannot be undone.
      </p>
      <div className="flex gap-2">
        <button
          onClick={onDelete}
          className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
        >
          Yes, delete ingredient
        </button>
        <button onClick={onCancel} className="btn-secondary px-4 py-2">Cancel</button>
      </div>
    </div>
  );
}
