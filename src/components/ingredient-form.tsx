"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import type { Ingredient, CompositionKey } from "@/types";
import { getAllergensByRegion, COMPOSITION_FIELDS, migrateAllergens } from "@/types";
import { saveIngredient, useMarketRegion, useCurrencySymbol, useCoatings, useCurrentCoatingMappings, saveCoatingChocolateMapping, addCoating, updateCoatingTemperingFlag, useIngredientCategoryNames } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { ALL_NUTRIENT_FIELDS, getNutrientsByMarket, fillDerivedNutrition, type NutrientKey, type NutritionData } from "@/lib/nutrition";

const PURCHASE_UNITS = ["g", "kg", "ml", "L", "pcs"] as const;

// Grams per purchase unit for units where it's unambiguous.
// ml / L / pcs depend on density or piece size and must be entered manually.
function autoGramsPerUnit(purchaseUnit: string): number | null {
  if (purchaseUnit === "g") return 1;
  if (purchaseUnit === "kg") return 1000;
  return null;
}

interface IngredientFormProps {
  ingredient?: Ingredient;
  manufacturers?: string[];
  brands?: string[];
  vendors?: string[];
  sources?: string[];
  onSaved: () => void;
  onCancel: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onCategoryChange?: (category: string) => void;
  activeSection?: "details" | "composition" | "allergens" | "pricing" | "nutrition" | "shell";
}

const emptyComp: Record<CompositionKey, string> = {
  cacaoFat: "",
  sugar: "",
  milkFat: "",
  water: "",
  solids: "",
  otherFats: "",
  alcohol: "",
};

export function IngredientForm({ ingredient, manufacturers = [], brands = [], vendors = [], sources = [], onSaved, onCancel, onDirtyChange, onCategoryChange, activeSection }: IngredientFormProps) {
  const sec = activeSection ?? "details";
  const sym = useCurrencySymbol();
  const ingredientCategoryNames = useIngredientCategoryNames();
  const [name, setName] = useState("");
  const [commercialName, setCommercialName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [brand, setBrand] = useState("");
  const [vendor, setVendor] = useState("");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [comp, setComp] = useState<Record<CompositionKey, string>>({ ...emptyComp });
  const [allergens, setAllergens] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const region = useMarketRegion();
  const activeAllergens = getAllergensByRegion(region);
  const [pricingIrrelevant, setPricingIrrelevant] = useState(false);
  const [shellCapable, setShellCapable] = useState(false);
  const [coatingType, setCoatingType] = useState("");
  const [seedTempering, setSeedTempering] = useState(false);
  const coatings = useCoatings();
  const currentMappings = useCurrentCoatingMappings();

  // Purchase pricing
  const [purchaseCost, setPurchaseCost] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [purchaseQty, setPurchaseQty] = useState("1");
  const [purchaseUnit, setPurchaseUnit] = useState(ingredient?.purchaseUnit ?? "g");
  // For g/kg the value is fully determined by the unit, so always use the auto value —
  // this both sets a correct default for new ingredients and repairs existing records
  // saved with the old buggy default (purchaseUnit=g, gramsPerUnit=1000).
  const [gramsPerUnit, setGramsPerUnit] = useState(() => {
    const auto = autoGramsPerUnit(ingredient?.purchaseUnit ?? "g");
    if (auto != null) return String(auto);
    return ingredient?.gramsPerUnit != null ? String(ingredient.gramsPerUnit) : "";
  });
  // Track whether the user has manually edited gramsPerUnit — if so, don't auto-fill on unit change
  const [gramsPerUnitTouched, setGramsPerUnitTouched] = useState(() => ingredient?.gramsPerUnit != null);

  // Nutrition — local string state per field for editing
  const [nutritionStr, setNutritionStr] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ingredient) {
      onDirtyChange?.(false);
      setName(ingredient.name);
      setCommercialName(ingredient.commercialName ?? "");
      setManufacturer(ingredient.manufacturer);
      setBrand(ingredient.brand ?? "");
      setVendor(ingredient.vendor ?? "");
      setSource(ingredient.source);
      setNotes(ingredient.notes);
      setCategory(ingredient.category ?? "");
      onCategoryChange?.(ingredient.category ?? "");
      setComp({
        cacaoFat: String(ingredient.cacaoFat),
        sugar: String(ingredient.sugar),
        milkFat: String(ingredient.milkFat),
        water: String(ingredient.water),
        solids: String(ingredient.solids),
        otherFats: String(ingredient.otherFats),
        alcohol: String(ingredient.alcohol ?? 0),
      });
      setAllergens(migrateAllergens(ingredient.allergens));
      setPricingIrrelevant(ingredient.pricingIrrelevant ?? false);
      setShellCapable(ingredient.shellCapable ?? false);
      // Resolve current coating mapping for this ingredient
      const mappedEntry = Array.from(currentMappings.entries()).find(
        ([, m]) => m.ingredientId === ingredient.id
      );
      setCoatingType(mappedEntry?.[0] ?? "");
      setSeedTempering(mappedEntry?.[1]?.seedTempering ?? false);
      setPurchaseCost(ingredient.purchaseCost != null ? String(ingredient.purchaseCost) : "");
      setPurchaseDate(ingredient.purchaseDate ?? new Date().toISOString().split("T")[0]);
      setPurchaseQty(ingredient.purchaseQty != null ? String(ingredient.purchaseQty) : "1");
      const loadedUnit = ingredient.purchaseUnit ?? "g";
      setPurchaseUnit(loadedUnit);
      // For g/kg, override any stored value with the definitional auto value (repairs
      // records saved with the old buggy default).
      const autoLoaded = autoGramsPerUnit(loadedUnit);
      if (autoLoaded != null) {
        setGramsPerUnit(String(autoLoaded));
        setGramsPerUnitTouched(false);
      } else {
        setGramsPerUnit(ingredient.gramsPerUnit != null ? String(ingredient.gramsPerUnit) : "");
        setGramsPerUnitTouched(ingredient.gramsPerUnit != null);
      }
      // Nutrition
      const nStr: Record<string, string> = {};
      if (ingredient.nutrition) {
        for (const f of ALL_NUTRIENT_FIELDS) {
          const v = ingredient.nutrition[f.key];
          if (v != null) nStr[f.key] = String(v);
        }
      }
      setNutritionStr(nStr);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredient?.id]);

  // Auto-fill gramsPerUnit when purchaseUnit changes.
  //   - For g / kg: the value is fully determined by the unit (1 / 1000) — always
  //     enforce, overriding any stored or user-entered value.
  //   - For ml / L / pcs: the value depends on density / piece weight — only auto-fill
  //     when the user hasn't manually edited it.
  useEffect(() => {
    const auto = autoGramsPerUnit(purchaseUnit);
    if (auto !== null) {
      setGramsPerUnit(String(auto));
      setGramsPerUnitTouched(false);
      return;
    }
    // No auto value for this unit; leave whatever's there unless we have a touched override.
  }, [purchaseUnit]);

  const compTotal = useMemo(() => {
    return COMPOSITION_FIELDS.reduce((sum, f) => {
      const v = parseFloat(comp[f.key]);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);
  }, [comp]);

  const compValid = Math.abs(compTotal - 100) < 0.1;
  const compEmpty = COMPOSITION_FIELDS.every((f) => !comp[f.key] || comp[f.key] === "0");

  function toggleAllergen(a: string) {
    setAllergens((prev) =>
      prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]
    );
    onDirtyChange?.(true);
  }

  function setCompField(key: CompositionKey, value: string) {
    setComp((prev) => ({ ...prev, [key]: value }));
  }

  // For g/kg the field is locked; derive the effective value from the unit so the
  // preview and the save path stay correct even if state is briefly stale or a
  // legacy record has a wrong stored gramsPerUnit.
  const gramsPerUnitLocked = autoGramsPerUnit(purchaseUnit) !== null;
  const effectiveGramsPerUnit = useMemo(() => {
    const auto = autoGramsPerUnit(purchaseUnit);
    if (auto !== null) return auto;
    const parsed = parseFloat(gramsPerUnit);
    return isNaN(parsed) ? null : parsed;
  }, [purchaseUnit, gramsPerUnit]);

  // Derived cost per gram for preview
  const derivedCostPerGram = useMemo(() => {
    const cost = parseFloat(purchaseCost);
    const qtyVal = parseFloat(purchaseQty);
    if (!cost || !qtyVal || qtyVal <= 0) return null;
    if (!effectiveGramsPerUnit || effectiveGramsPerUnit <= 0) return null;
    return cost / (qtyVal * effectiveGramsPerUnit);
  }, [purchaseCost, purchaseQty, effectiveGramsPerUnit]);

  // Synchronous reentrancy guard — `saving` state updates asynchronously, so rapid
  // re-submits (double-click, Enter racing a click) can both pass through setSaving.
  // The ref flips immediately and blocks the second call at the door.
  const savingRef = useRef(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    if (!name.trim()) return;
    if (!compEmpty && !compValid) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Build nutrition data from local string state
      const nutritionData: NutritionData = {};
      let hasAnyNutrition = false;
      for (const f of ALL_NUTRIENT_FIELDS) {
        const v = parseFloat(nutritionStr[f.key] ?? "");
        if (!isNaN(v)) {
          nutritionData[f.key] = v;
          hasAnyNutrition = true;
        }
      }
      const filledNutrition = hasAnyNutrition ? fillDerivedNutrition(nutritionData) : undefined;

      await saveIngredient({
        ...(ingredient?.id ? { id: ingredient.id } : {}),
        name: name.trim(),
        commercialName: commercialName.trim() || undefined,
        manufacturer: manufacturer.trim(),
        brand: brand.trim() || undefined,
        vendor: vendor.trim() || undefined,
        source: source.trim(),
        category: category || undefined,
        cost: 0, // legacy field kept for compatibility
        notes: notes.trim(),
        pricingIrrelevant: pricingIrrelevant || undefined,
        shellCapable: (category === "Chocolate" && shellCapable) || undefined,
        purchaseCost: parseFloat(purchaseCost) || undefined,
        purchaseDate: purchaseDate || undefined,
        purchaseQty: parseFloat(purchaseQty) || undefined,
        purchaseUnit: purchaseUnit || undefined,
        // For g/kg the value is definitional — use the derived value so the DB
        // row is self-consistent even if the state or a legacy record had a wrong
        // gramsPerUnit (e.g. 2500 typed into a locked-by-definition field).
        gramsPerUnit: effectiveGramsPerUnit ?? undefined,
        cacaoFat: parseFloat(comp.cacaoFat) || 0,
        sugar: parseFloat(comp.sugar) || 0,
        milkFat: parseFloat(comp.milkFat) || 0,
        water: parseFloat(comp.water) || 0,
        solids: parseFloat(comp.solids) || 0,
        otherFats: parseFloat(comp.otherFats) || 0,
        alcohol: parseFloat(comp.alcohol) || 0,
        allergens,
        nutrition: filledNutrition,
      });

      // Save coating type mapping when shell-capable chocolate
      if (category === "Chocolate" && shellCapable && coatingType.trim() && ingredient?.id) {
        const value = coatingType.trim().toLowerCase();
        if (!coatings.includes(value)) {
          await addCoating(value);
        }
        await saveCoatingChocolateMapping(value, ingredient.id);
        // Update seed tempering flag on the mapping
        await updateCoatingTemperingFlag(value, seedTempering);
      }

      onSaved();
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  return (
    <form onSubmit={handleSubmit} onChange={() => onDirtyChange?.(true)} className="space-y-4">
      {sec === "details" && (
        <>
          <div>
            <label className="label">Commercial name</label>
            <input
              type="text"
              value={commercialName}
              onChange={(e) => setCommercialName(e.target.value)}
              className="input"
              placeholder="e.g. Guanaja 70%"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Manufacturer</label>
              <input
                type="text"
                list="manufacturer-list"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                className="input"
                placeholder="e.g. Valrhona"
              />
              {manufacturers.length > 0 && (
                <datalist id="manufacturer-list">
                  {manufacturers.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              )}
            </div>
            <div>
              <label className="label">Source</label>
              <input
                type="text"
                list="source-list"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="input"
                placeholder="e.g. Keylink"
              />
              {sources.length > 0 && (
                <datalist id="source-list">
                  {sources.map((s) => (
                    <option key={s} value={s} />
                  ))}
                </datalist>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Brand</label>
              <input
                type="text"
                list="brand-list"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="input"
                placeholder="e.g. Guanaja"
              />
              {brands.length > 0 && (
                <datalist id="brand-list">
                  {brands.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              )}
            </div>
            <div>
              <label className="label">Vendor</label>
              <input
                type="text"
                list="vendor-list"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                className="input"
                placeholder="e.g. Chocolate Trading Co"
              />
              {vendors.length > 0 && (
                <datalist id="vendor-list">
                  {vendors.map((v) => (
                    <option key={v} value={v} />
                  ))}
                </datalist>
              )}
            </div>
          </div>

          <div>
            <label className="label">Category</label>
            <select
              value={category}
              onChange={(e) => { setCategory(e.target.value); onCategoryChange?.(e.target.value); }}
              className="input"
            >
              <option value="">— select —</option>
              {ingredientCategoryNames.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input resize-none"
              placeholder="Any additional notes..."
            />
          </div>
        </>
      )}

      {sec === "shell" && (
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium mb-1">Shell chocolate</legend>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={shellCapable}
              onChange={(e) => { setShellCapable(e.target.checked); onDirtyChange?.(true); }}
              className="rounded border-border"
            />
            Can be used as shell chocolate
            <span className="text-xs text-muted-foreground">(couverture)</span>
          </label>

          {shellCapable && (
            <>
              <div>
                <label className="label">Coating type</label>
                <input
                  type="text"
                  list="coating-type-options"
                  value={coatingType}
                  onChange={(e) => { setCoatingType(e.target.value); onDirtyChange?.(true); }}
                  className="input"
                  placeholder="e.g. dark, milk, white"
                />
                <datalist id="coating-type-options">
                  {coatings.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>

              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={seedTempering}
                  onChange={(e) => { setSeedTempering(e.target.checked); onDirtyChange?.(true); }}
                  className="w-4 h-4 rounded border-border accent-primary"
                />
                <span className="text-sm">Hand tempering — seeding method</span>
              </label>
            </>
          )}
        </fieldset>
      )}

      {sec === "composition" && (
        <fieldset>
          <legend className="text-sm font-medium mb-1">Composition (%)</legend>
          <p className={cn(
            "text-xs mb-2",
            compEmpty ? "text-muted-foreground" : compValid ? "text-status-ok" : "text-destructive"
          )}>
            Total: {compTotal.toFixed(1)}%{!compEmpty && !compValid && " — must equal 100%"}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {COMPOSITION_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="label">{f.label}</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={comp[f.key]}
                  onChange={(e) => setCompField(f.key, e.target.value)}
                  className="input"
                />
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {sec === "allergens" && (
        <fieldset>
          <legend className="text-sm font-medium mb-3">Allergens</legend>
          <p className="text-xs text-muted-foreground mb-3">Tick all that apply to this ingredient</p>

          <div className="space-y-1 mb-4">
            {activeAllergens.filter(a => !a.group).map((a) => (
              <label key={a.id} className="flex items-start gap-2.5 cursor-pointer py-1 group">
                <input
                  type="checkbox"
                  checked={allergens.includes(a.id)}
                  onChange={() => toggleAllergen(a.id)}
                  className="mt-0.5 shrink-0 accent-[var(--color-primary)]"
                />
                <span className="flex-1 min-w-0">
                  <span className={`text-sm ${allergens.includes(a.id) ? "font-semibold text-foreground" : "text-foreground"}`}>{a.label}</span>
                  {a.hint && <span className="text-xs text-muted-foreground ml-1.5">{a.hint}</span>}
                </span>
              </label>
            ))}
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Tree nuts</span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const nutIds = activeAllergens.filter(a => a.group === "nuts").map(a => a.id);
                    setAllergens(prev => [...new Set([...prev, ...nutIds])]);
                    onDirtyChange?.(true);
                  }}
                  className="text-xs text-primary hover:underline"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nutIds = new Set(activeAllergens.filter(a => a.group === "nuts").map(a => a.id));
                    setAllergens(prev => prev.filter(a => !nutIds.has(a)));
                    onDirtyChange?.(true);
                  }}
                  className="text-xs text-muted-foreground hover:underline"
                >
                  None
                </button>
              </div>
            </div>
            <div className="p-3 grid grid-cols-2 gap-x-4 gap-y-1">
              {activeAllergens.filter(a => a.group === "nuts").map((a) => (
                <label key={a.id} className="flex items-center gap-2 cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    checked={allergens.includes(a.id)}
                    onChange={() => toggleAllergen(a.id)}
                    className="shrink-0 accent-[var(--color-primary)]"
                  />
                  <span className={`text-sm ${allergens.includes(a.id) ? "font-semibold text-foreground" : "text-foreground"}`}>{a.label}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>
      )}

      {sec === "pricing" && (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Purchase pricing</legend>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Purchase qty</label>
              <input
                type="number"
                step="any"
                min="0"
                value={purchaseQty}
                onChange={(e) => setPurchaseQty(e.target.value)}
                className="input"
                placeholder="1"
              />
            </div>
            <div>
              <label className="label">Purchase unit</label>
              <select
                value={purchaseUnit}
                onChange={(e) => setPurchaseUnit(e.target.value)}
                className="input"
              >
                {PURCHASE_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label
                className="label"
                title={gramsPerUnitLocked
                  ? `Fixed by the unit — 1 ${purchaseUnit} = ${autoGramsPerUnit(purchaseUnit)} g.`
                  : "Net weight in grams of a single unit (from packaging). For liquids, use density: water ≈ 1000 g/L, milk ≈ 1030, cream 35% ≈ 995, honey ≈ 1420, oil ≈ 920."}
              >
                g per unit
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={gramsPerUnit}
                onChange={(e) => { setGramsPerUnit(e.target.value); setGramsPerUnitTouched(true); }}
                readOnly={gramsPerUnitLocked}
                className={cn("input", gramsPerUnitLocked && "bg-muted/40 text-muted-foreground cursor-not-allowed")}
                placeholder="e.g. 1000"
                aria-readonly={gramsPerUnitLocked || undefined}
                title={gramsPerUnitLocked
                  ? `Fixed by the unit — 1 ${purchaseUnit} = ${autoGramsPerUnit(purchaseUnit)} g.`
                  : "Net weight in grams of a single unit (from packaging). For liquids, use density: water ≈ 1000 g/L, milk ≈ 1030, cream 35% ≈ 995, honey ≈ 1420, oil ≈ 920."}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Price excl. VAT ({sym})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
                className="input"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="label">Price last updated</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="input"
              />
            </div>
          </div>

          {derivedCostPerGram !== null && (
            <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 flex items-baseline gap-2">
              <span className="text-xs text-muted-foreground">Cost per gram:</span>
              <span className="text-sm font-semibold text-primary">
                {sym}{derivedCostPerGram < 0.01
                  ? derivedCostPerGram.toFixed(4)
                  : derivedCostPerGram.toFixed(3)}
                /g
              </span>
              {purchaseDate && (
                <span className="text-xs text-muted-foreground ml-auto">
                  updated {new Date(purchaseDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pricingIrrelevant}
              onChange={(e) => setPricingIrrelevant(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-xs text-muted-foreground">Not relevant for pricing (e.g. water, salt) — treated as zero cost</span>
          </label>
        </fieldset>
      )}

      {sec === "nutrition" && (
        <NutritionFormSection
          region={region}
          nutritionStr={nutritionStr}
          setNutritionStr={setNutritionStr}
          onDirtyChange={onDirtyChange}
        />
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving || !name.trim() || (!compEmpty && !compValid)}
          className="btn-primary flex-1 py-2"
        >
          {saving ? "Saving..." : ingredient?.id ? "Update" : "Add Ingredient"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Nutrition form section — shows market-relevant fields, extras collapsible
// ---------------------------------------------------------------------------

function NutritionFormSection({
  region,
  nutritionStr,
  setNutritionStr,
  onDirtyChange,
}: {
  region: import("@/types").MarketRegion;
  nutritionStr: Record<string, string>;
  setNutritionStr: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onDirtyChange?: (isDirty: boolean) => void;
}) {
  const marketNutrients = getNutrientsByMarket(region);
  const marketKeys = new Set(marketNutrients.map(n => n.key));
  const marketFields = ALL_NUTRIENT_FIELDS.filter(f => marketKeys.has(f.key));

  const groupLabels: Record<string, string> = {
    energy: "Energy",
    fats: "Fats",
    carbs: "Carbohydrates",
    protein: "Protein",
    minerals: "Salt, sodium & minerals",
  };

  const groups = [...new Set(marketFields.map(f => f.group))];

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium mb-1">Nutrition (per 100g)</legend>
      <p className="text-xs text-muted-foreground mb-3">
        Enter values per 100g. Energy and salt/sodium are auto-derived when you fill one side.
      </p>

      {groups.map(group => {
        const groupFields = marketFields.filter(f => f.group === group);
        if (groupFields.length === 0) return null;
        return (
          <div key={group}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{groupLabels[group]}</h3>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {groupFields.map(f => (
                <div key={f.key}>
                  <label className="label">
                    {f.label} <span className="text-muted-foreground font-normal">({f.unit})</span>
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={nutritionStr[f.key] ?? ""}
                    onChange={(e) => {
                      setNutritionStr(prev => ({ ...prev, [f.key]: e.target.value }));
                      onDirtyChange?.(true);
                    }}
                    className="input"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
