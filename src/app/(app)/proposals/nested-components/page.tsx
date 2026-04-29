"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  Layers,
  Sprout,
  AlertTriangle,
  Check,
  Beaker,
  Package,
  Info,
} from "lucide-react";

// ─── Mock domain types ────────────────────────────────────────────────────────
type IngredientRef = { kind: "ingredient"; id: IngredientId; amount: number; note?: string };
type FillingRef = { kind: "filling"; id: string; amount: number; note?: string };
type ComponentRef = IngredientRef | FillingRef;

type IngredientId = keyof typeof INGREDIENTS;

const INGREDIENTS = {
  sugar: { name: "Caster sugar", manufacturer: "Tate & Lyle", allergens: [] as string[], costPerG: 0.003 },
  butter: { name: "Butter 82%", manufacturer: "Président", allergens: ["milk"], costPerG: 0.012 },
  cream: { name: "Cream 35%", manufacturer: "Isigny", allergens: ["milk"], costPerG: 0.006 },
  dark70: { name: "Dark chocolate 70%", manufacturer: "Valrhona · Guanaja", allergens: ["soy"], costPerG: 0.024 },
  milk40: { name: "Milk chocolate 40%", manufacturer: "Valrhona · Jivara", allergens: ["milk", "soy"], costPerG: 0.022 },
  salt: { name: "Fleur de sel", manufacturer: "Guérande", allergens: [], costPerG: 0.018 },
  hazelnut: { name: "Hazelnut praline", manufacturer: "House-made", allergens: ["tree-nuts"], costPerG: 0.038 },
} as const;

type Filling = { id: string; name: string; category: string; components: ComponentRef[] };

const INITIAL_FILLINGS: Record<string, Filling> = {
  "caramel-base": {
    id: "caramel-base",
    name: "Salted caramel base",
    category: "Caramels & Syrups",
    components: [
      { kind: "ingredient", id: "sugar", amount: 100 },
      { kind: "ingredient", id: "butter", amount: 40 },
      { kind: "ingredient", id: "cream", amount: 60 },
      { kind: "ingredient", id: "salt", amount: 2, note: "pinch" },
    ],
  },
  "dark-caramel-ganache": {
    id: "dark-caramel-ganache",
    name: "Dark caramel ganache",
    category: "Ganaches (Emulsions)",
    components: [
      { kind: "ingredient", id: "dark70", amount: 120 },
      { kind: "ingredient", id: "cream", amount: 60 },
      { kind: "filling", id: "caramel-base", amount: 40 },
    ],
  },
  "milk-caramel-ganache": {
    id: "milk-caramel-ganache",
    name: "Milk caramel ganache",
    category: "Ganaches (Emulsions)",
    components: [
      { kind: "ingredient", id: "milk40", amount: 130 },
      { kind: "ingredient", id: "cream", amount: 55 },
      { kind: "filling", id: "caramel-base", amount: 30 },
    ],
  },
  "hazelnut-praline": {
    id: "hazelnut-praline",
    name: "Hazelnut praline",
    category: "Pralines & Giandujas",
    components: [
      { kind: "ingredient", id: "hazelnut", amount: 150 },
      { kind: "ingredient", id: "milk40", amount: 50 },
    ],
  },
};

// ─── Recursive resolvers ──────────────────────────────────────────────────────
function resolveAllergens(fillings: Record<string, Filling>, id: string, seen = new Set<string>()): string[] {
  if (seen.has(id)) return [];
  seen.add(id);
  const f = fillings[id];
  if (!f) return [];
  const out = new Set<string>();
  for (const c of f.components) {
    if (c.kind === "ingredient") {
      INGREDIENTS[c.id].allergens.forEach((a) => out.add(a));
    } else {
      resolveAllergens(fillings, c.id, new Set(seen)).forEach((a) => out.add(a));
    }
  }
  return [...out].sort();
}

function resolveCostPerG(fillings: Record<string, Filling>, id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const f = fillings[id];
  if (!f) return 0;
  let total = 0;
  let totalG = 0;
  for (const c of f.components) {
    totalG += c.amount;
    if (c.kind === "ingredient") {
      total += INGREDIENTS[c.id].costPerG * c.amount;
    } else {
      total += resolveCostPerG(fillings, c.id, new Set(seen)) * c.amount;
    }
  }
  return totalG > 0 ? total / totalG : 0;
}

function wouldCreateCycle(fillings: Record<string, Filling>, hostId: string, childId: string): boolean {
  if (hostId === childId) return true;
  const child = fillings[childId];
  if (!child) return false;
  for (const c of child.components) {
    if (c.kind === "filling" && wouldCreateCycle(fillings, hostId, c.id)) return true;
  }
  return false;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NestedComponentsProposalPage() {
  const [tab, setTab] = useState<"nested" | "plan">("nested");

  return (
    <div className="pb-16">
      <div className="px-4 pt-4 max-w-2xl">
        <Link
          href="/proposals"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Proposals
        </Link>
      </div>
      <PageHeader
        title="Nested components & filling-only plans"
        description="Two linked proposals. (1) a filling can contain another filling — live references, not snapshots. (2) a production plan can output fillings only, skipping products and moulds."
      />

      {/* Tab strip — matches existing detail-page tab pattern */}
      <div className="flex border-b border-border px-4 max-w-2xl overflow-x-auto">
        {(
          [
            { id: "nested", label: "Filling-in-filling", icon: Layers },
            { id: "plan", label: "Filling-only plan", icon: Sprout },
          ] as const
        ).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm whitespace-nowrap -mb-px border-b-2 transition-colors ${
                tab === t.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              aria-pressed={tab === t.id}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "nested" ? <NestedFillingsTab /> : <FillingOnlyPlanTab />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// TAB 1 — Filling-in-filling
// ──────────────────────────────────────────────────────────────────────────────
function NestedFillingsTab() {
  const [fillings] = useState(INITIAL_FILLINGS);
  const [hostId, setHostId] = useState("dark-caramel-ganache");
  const [components, setComponents] = useState<ComponentRef[]>(
    INITIAL_FILLINGS["dark-caramel-ganache"].components,
  );
  const [adding, setAdding] = useState<null | "ingredient" | "filling">(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pendingRemoveIdx, setPendingRemoveIdx] = useState<number | null>(null);
  const [cycleDemo, setCycleDemo] = useState(false);

  // Build a virtual host filling for cost/allergen resolution
  const virtualFillings = useMemo(() => {
    return { ...fillings, [hostId]: { ...fillings[hostId], components } };
  }, [fillings, hostId, components]);

  const allergens = useMemo(() => resolveAllergens(virtualFillings, hostId), [virtualFillings, hostId]);
  const costPerG = useMemo(() => resolveCostPerG(virtualFillings, hostId), [virtualFillings, hostId]);
  const totalG = components.reduce((s, c) => s + c.amount, 0);

  function handleAdd(kind: "ingredient" | "filling", id: string) {
    setComponents((prev) => [...prev, { kind, id, amount: 10 } as ComponentRef]);
    setAdding(null);
  }

  function handleRemove(idx: number) {
    setComponents((prev) => prev.filter((_, i) => i !== idx));
    setPendingRemoveIdx(null);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const host = fillings[hostId];

  return (
    <div className="px-4 pt-6 pb-8 max-w-2xl">
      {/* Which filling are we editing? */}
      <div className="mb-6">
        <label className="label" htmlFor="demo-filling-select">Demo filling</label>
        <select
          id="demo-filling-select"
          aria-label="Demo filling"
          value={hostId}
          onChange={(e) => {
            const id = e.target.value;
            setHostId(id);
            setComponents(fillings[id].components);
            setExpanded(new Set());
            setPendingRemoveIdx(null);
            setCycleDemo(false);
          }}
          className="input w-full max-w-xs"
        >
          {Object.values(fillings).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Pick any filling to see how nested components might work on its detail page.
        </p>
      </div>

      {/* Host header */}
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Components ({components.length})
        </h2>
        <span className="text-xs text-muted-foreground">Total: {totalG % 1 === 0 ? totalG : totalG.toFixed(1)}g</span>
      </div>

      {/* Component list */}
      <div className="divide-y divide-border rounded-lg border border-border bg-card">
        {components.map((c, idx) => (
          <ComponentRow
            key={idx}
            comp={c}
            idx={idx}
            pct={totalG > 0 ? (c.amount / totalG) * 100 : 0}
            fillings={fillings}
            expanded={c.kind === "filling" && expanded.has(`${idx}-${c.id}`)}
            onToggle={() => toggleExpand(`${idx}-${c.id}`)}
            pendingRemove={pendingRemoveIdx === idx}
            onRequestRemove={() => setPendingRemoveIdx(idx)}
            onCancelRemove={() => setPendingRemoveIdx(null)}
            onConfirmRemove={() => handleRemove(idx)}
            onAmountChange={(next) => {
              setComponents((prev) => prev.map((x, i) => (i === idx ? { ...x, amount: next } : x)));
            }}
          />
        ))}
      </div>

      {/* Add-component picker */}
      <div className="mt-3">
        {adding === null ? (
          <button
            onClick={() => setAdding("ingredient")}
            className="inline-flex items-center gap-1.5 text-sm text-foreground hover:opacity-70 transition-opacity"
          >
            <Plus className="w-4 h-4" /> Add component
          </button>
        ) : (
          <AddComponentPanel
            mode={adding}
            onModeChange={setAdding}
            onAdd={handleAdd}
            onCancel={() => setAdding(null)}
            fillings={fillings}
            hostId={hostId}
            currentlyUsedFillingIds={new Set(components.filter((c) => c.kind === "filling").map((c) => c.id))}
          />
        )}
      </div>

      {/* Cycle detection demo */}
      <div className="mt-6 rounded-xl border border-border bg-muted/40 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-muted-foreground" /> Cycle detection
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              If adding a filling would create a loop (A → B → A), the picker greys it out and
              explains why. Toggle the demo to see a simulated warning state.
            </p>
          </div>
          <button
            onClick={() => setCycleDemo((v) => !v)}
            className="btn-secondary px-3 py-1 text-xs shrink-0"
          >
            {cycleDemo ? "Hide demo" : "Show demo"}
          </button>
        </div>
        {cycleDemo && (
          <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-xs">
            <p className="flex items-center gap-1.5 text-destructive font-medium">
              <AlertTriangle className="w-3.5 h-3.5" /> Would create a cycle
            </p>
            <p className="text-muted-foreground mt-1 leading-relaxed">
              &ldquo;{host.name}&rdquo; is already used inside that filling&rsquo;s recipe (2 levels deep).
              Using it here would make the cost calculation loop forever.
            </p>
          </div>
        )}
      </div>

      {/* Aggregate panel — the payoff of recursion */}
      <section className="mt-8">
        <p className="mono-label text-muted-foreground mb-3">Aggregate · recursive</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Cost per 100g</p>
            <p className="text-2xl font-display tracking-tight">€{(costPerG * 100).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Nested fillings contribute their resolved cost-per-gram.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-1">Allergens</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {allergens.length > 0 ? (
                allergens.map((a) => (
                  <span
                    key={a}
                    className="rounded-full border border-amber-300 bg-amber-50 text-amber-800 px-2 py-0.5 text-xs capitalize"
                  >
                    {a}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">None</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Bubbled up from every ingredient in every nested filling.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Component row ────────────────────────────────────────────────────────────
function ComponentRow(props: {
  comp: ComponentRef;
  idx: number;
  pct: number;
  fillings: Record<string, Filling>;
  expanded: boolean;
  onToggle: () => void;
  pendingRemove: boolean;
  onRequestRemove: () => void;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
  onAmountChange: (next: number) => void;
}) {
  const { comp, pct, fillings, expanded, onToggle, pendingRemove, onRequestRemove, onCancelRemove, onConfirmRemove, onAmountChange } = props;

  if (comp.kind === "ingredient") {
    const ing = INGREDIENTS[comp.id];
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />
        <span className="flex-1 text-sm truncate">
          {ing.name}
          <span className="text-muted-foreground"> ({ing.manufacturer})</span>
        </span>
        <span className="text-xs text-muted-foreground w-10 text-right shrink-0 font-mono">{pct.toFixed(1)}%</span>
        <AmountEditor value={comp.amount} onChange={onAmountChange} />
        <RemoveControl pending={pendingRemove} onRequest={onRequestRemove} onCancel={onCancelRemove} onConfirm={onConfirmRemove} />
      </div>
    );
  }

  // Filling row
  const nested = fillings[comp.id];
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0 cursor-grab" />
        <button
          onClick={onToggle}
          className="flex-1 flex items-center gap-2 min-w-0 text-left hover:opacity-80 transition-opacity"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${nested?.name}` : `Expand ${nested?.name}`}
        >
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="mono-label bg-foreground/[0.04] border border-border rounded px-1.5 py-0.5 text-muted-foreground shrink-0">
            Filling
          </span>
          <span className="text-sm truncate">{nested?.name ?? "Unknown"}</span>
        </button>
        <span className="text-xs text-muted-foreground w-10 text-right shrink-0 font-mono">{pct.toFixed(1)}%</span>
        <AmountEditor value={comp.amount} onChange={onAmountChange} />
        <RemoveControl pending={pendingRemove} onRequest={onRequestRemove} onCancel={onCancelRemove} onConfirm={onConfirmRemove} />
      </div>
      {expanded && nested && (
        <div className="bg-muted/30 border-t border-border px-3 py-2">
          <p className="mono-label text-muted-foreground mb-1.5 pl-6">
            Inside {nested.name}
          </p>
          <div className="pl-6 space-y-1">
            {nested.components.map((nc, i) => (
              <NestedPreviewLine key={i} comp={nc} fillings={fillings} depth={1} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NestedPreviewLine({ comp, fillings, depth }: { comp: ComponentRef; fillings: Record<string, Filling>; depth: number }) {
  if (comp.kind === "ingredient") {
    const ing = INGREDIENTS[comp.id];
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground" style={{ paddingLeft: `${(depth - 1) * 12}px` }}>
        <span className="w-3 h-px bg-border shrink-0" />
        <span className="flex-1 truncate">{ing.name}</span>
        <span className="font-mono shrink-0">{comp.amount}g</span>
      </div>
    );
  }
  const nested = fillings[comp.id];
  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground" style={{ paddingLeft: `${(depth - 1) * 12}px` }}>
        <span className="w-3 h-px bg-border shrink-0" />
        <span className="mono-label text-muted-foreground/70 shrink-0">F</span>
        <span className="flex-1 truncate italic">{nested?.name ?? "Unknown"}</span>
        <span className="font-mono shrink-0">{comp.amount}g</span>
      </div>
      {nested && depth < 3 &&
        nested.components.map((nc, i) => (
          <NestedPreviewLine key={i} comp={nc} fillings={fillings} depth={depth + 1} />
        ))}
    </>
  );
}

function AmountEditor({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [local, setLocal] = useState(String(value));
  // Sync if external changes
  if (String(value) !== local && document.activeElement?.tagName !== "INPUT") {
    // noop — just reflect in display
  }
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="0.1"
        min="0"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = parseFloat(local);
          if (!isNaN(n) && n !== value) onChange(n);
          else setLocal(String(value));
        }}
        className="w-16 rounded-md border border-border bg-card px-2 py-1 text-sm text-right focus:outline-none focus:border-foreground"
        aria-label="Amount in grams"
      />
      <span className="text-xs text-muted-foreground">g</span>
    </div>
  );
}

function RemoveControl({ pending, onRequest, onCancel, onConfirm }: { pending: boolean; onRequest: () => void; onCancel: () => void; onConfirm: () => void }) {
  if (pending) {
    return (
      <span className="flex items-center gap-1.5 text-xs shrink-0">
        <span className="text-muted-foreground">Remove?</span>
        <button onClick={onConfirm} className="text-destructive font-medium hover:underline">Yes</button>
        <button onClick={onCancel} className="text-muted-foreground hover:underline">Cancel</button>
      </span>
    );
  }
  return (
    <button
      onClick={onRequest}
      className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
      aria-label="Remove component"
    >
      <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
    </button>
  );
}

// ─── Add-component popover ────────────────────────────────────────────────────
function AddComponentPanel({
  mode,
  onModeChange,
  onAdd,
  onCancel,
  fillings,
  hostId,
  currentlyUsedFillingIds,
}: {
  mode: "ingredient" | "filling";
  onModeChange: (m: "ingredient" | "filling") => void;
  onAdd: (kind: "ingredient" | "filling", id: string) => void;
  onCancel: () => void;
  fillings: Record<string, Filling>;
  hostId: string;
  currentlyUsedFillingIds: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const ingredientOptions = Object.entries(INGREDIENTS)
    .filter(([, v]) => v.name.toLowerCase().includes(query.toLowerCase()))
    .map(([id, v]) => ({ id, ...v }));

  const fillingOptions = Object.values(fillings)
    .filter((f) => f.name.toLowerCase().includes(query.toLowerCase()))
    .map((f) => {
      const cycle = wouldCreateCycle(fillings, hostId, f.id) || f.id === hostId;
      const already = currentlyUsedFillingIds.has(f.id);
      return { f, cycle, already };
    });

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 p-0.5 bg-muted rounded-full w-fit">
        {(["ingredient", "filling"] as const).map((m) => (
          <button
            key={m}
            onClick={() => onModeChange(m)}
            className={`px-3.5 py-1 text-xs rounded-full transition-colors ${
              mode === m ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "ingredient" ? "Ingredient" : "Filling"}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={mode === "ingredient" ? "Search ingredients…" : "Search fillings…"}
        className="input w-full"
        autoFocus
      />

      <div className="max-h-64 overflow-y-auto -mx-1 px-1">
        {mode === "ingredient" ? (
          <ul className="divide-y divide-border">
            {ingredientOptions.map((opt) => (
              <li key={opt.id}>
                <button
                  onClick={() => onAdd("ingredient", opt.id)}
                  className="w-full flex items-center gap-2 py-2 text-left hover:bg-muted/40 rounded-md px-2 transition-colors"
                >
                  <Package className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm truncate">
                    {opt.name}
                    <span className="text-muted-foreground"> ({opt.manufacturer})</span>
                  </span>
                </button>
              </li>
            ))}
            {ingredientOptions.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No matches.</p>}
          </ul>
        ) : (
          <ul className="divide-y divide-border">
            {fillingOptions.map(({ f, cycle, already }) => {
              const disabled = cycle || already;
              return (
                <li key={f.id}>
                  <button
                    onClick={() => !disabled && onAdd("filling", f.id)}
                    disabled={disabled}
                    className={`w-full flex items-center gap-2 py-2 text-left rounded-md px-2 transition-colors ${
                      disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/40"
                    }`}
                  >
                    <Beaker className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 text-sm truncate">{f.name}</span>
                    {cycle && (
                      <span className="inline-flex items-center gap-1 mono-label text-destructive shrink-0">
                        <AlertTriangle className="w-3 h-3" /> Cycle
                      </span>
                    )}
                    {!cycle && already && (
                      <span className="mono-label text-muted-foreground shrink-0">Already added</span>
                    )}
                  </button>
                </li>
              );
            })}
            {fillingOptions.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No matches.</p>}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between pt-1">
        <p className="text-xs text-muted-foreground">
          {mode === "filling" ? "Picking a filling creates a live reference — edits flow through." : "Ingredients are leaf nodes."}
        </p>
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// TAB 2 — Filling-only plan
// ──────────────────────────────────────────────────────────────────────────────
type PlanType = "full" | "fillings-only";

function FillingOnlyPlanTab() {
  const [planType, setPlanType] = useState<PlanType>("fillings-only");
  const [rows, setRows] = useState<{ fillingId: string; batches: number }[]>([
    { fillingId: "caramel-base", batches: 2 },
    { fillingId: "dark-caramel-ganache", batches: 1 },
  ]);
  const [adding, setAdding] = useState(false);

  const fillings = INITIAL_FILLINGS;
  const BATCH_GRAMS_ESTIMATE = 500; // Cosmetic for demo

  const totalBatches = rows.reduce((s, r) => s + r.batches, 0);
  const totalGrams = rows.reduce((s, r) => s + r.batches * BATCH_GRAMS_ESTIMATE, 0);

  return (
    <div className="px-4 pt-6 pb-8 max-w-2xl">
      {/* Plan type picker */}
      <p className="mono-label text-muted-foreground mb-3">Plan type</p>
      <div className="grid grid-cols-2 gap-2 mb-8">
        <PlanTypeCard
          selected={planType === "full"}
          onClick={() => setPlanType("full")}
          icon={Package}
          title="Full production"
          tagline="Products, moulds, shell, fillings, cap, unmould."
        />
        <PlanTypeCard
          selected={planType === "fillings-only"}
          onClick={() => setPlanType("fillings-only")}
          icon={Sprout}
          title="Fillings only"
          tagline="Just batches of filling — output goes to stock for later use."
        />
      </div>

      {planType === "full" ? (
        <div className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          The existing new-plan flow handles this — product select → mould → batch sizes.
          Nothing changes for the full-production path.
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Fillings to make ({rows.length})
            </h2>
            <span className="text-xs text-muted-foreground">
              Batch size is set per filling category (or overridden).
            </span>
          </div>

          <div className="divide-y divide-border rounded-lg border border-border bg-card">
            {rows.map((row, idx) => {
              const f = fillings[row.fillingId];
              return (
                <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                  <Beaker className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{f?.name ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground truncate">{f?.category}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <input
                      type="number"
                      min="1"
                      value={row.batches}
                      onChange={(e) => {
                        const n = Math.max(1, parseInt(e.target.value) || 1);
                        setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, batches: n } : r)));
                      }}
                      className="w-14 rounded-md border border-border bg-card px-2 py-1 text-sm text-right focus:outline-none focus:border-foreground"
                      aria-label={`Batches of ${f?.name}`}
                    />
                    <span className="text-xs text-muted-foreground">×</span>
                    <span className="text-xs text-muted-foreground tabular-nums w-16 text-right">
                      {row.batches * BATCH_GRAMS_ESTIMATE}g
                    </span>
                  </div>
                  <button
                    onClick={() => setRows((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
                    aria-label={`Remove ${f?.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              );
            })}
            {rows.length === 0 && (
              <p className="px-3 py-6 text-xs text-muted-foreground text-center">
                No fillings selected. Click &ldquo;Add filling&rdquo; below.
              </p>
            )}
          </div>

          <div className="mt-3">
            {adding ? (
              <AddFillingPicker
                fillings={fillings}
                excluded={new Set(rows.map((r) => r.fillingId))}
                onPick={(id) => {
                  setRows((prev) => [...prev, { fillingId: id, batches: 1 }]);
                  setAdding(false);
                }}
                onCancel={() => setAdding(false)}
              />
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1.5 text-sm text-foreground hover:opacity-70 transition-opacity"
              >
                <Plus className="w-4 h-4" /> Add filling
              </button>
            )}
          </div>

          {/* Summary */}
          <section className="mt-10 rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/40">
              <p className="mono-label text-muted-foreground">Output</p>
            </div>
            <div className="px-4 py-4 space-y-2">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Filling batches</span>
                <span className="text-lg font-display">{totalBatches}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Total yield (approx.)</span>
                <span className="text-lg font-display tabular-nums">{totalGrams}g</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Skipped phases</span>
                <span className="text-xs text-muted-foreground tabular-nums">colour · shell · fill · cap · unmould</span>
              </div>
              <div className="pt-3 flex items-center gap-2 text-xs text-muted-foreground border-t border-border">
                <Check className="w-3.5 h-3.5 text-success" />
                <span>Batches land in <strong className="text-foreground font-medium">FillingStock</strong> — ready to draw into future product plans or nest into other fillings.</span>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-border bg-muted/40 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Prototype — no plan will be created.</span>
              <button className="btn-primary" disabled title="Prototype only — no DB write">
                Create plan
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PlanTypeCard({
  selected,
  onClick,
  icon: Icon,
  title,
  tagline,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Package;
  title: string;
  tagline: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={`text-left rounded-xl border p-4 transition-colors ${
        selected
          ? "border-foreground bg-card"
          : "border-border bg-card hover:border-foreground/40"
      }`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${selected ? "bg-foreground text-background" : "bg-muted text-foreground"}`}>
          <Icon className="w-4 h-4" />
        </div>
        {selected && <Check className="w-3.5 h-3.5 text-foreground ml-auto" />}
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{tagline}</p>
    </button>
  );
}

function AddFillingPicker({
  fillings,
  excluded,
  onPick,
  onCancel,
}: {
  fillings: Record<string, Filling>;
  excluded: Set<string>;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const options = Object.values(fillings).filter(
    (f) => !excluded.has(f.id) && f.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search fillings…"
        className="input w-full"
        autoFocus
      />
      <ul className="divide-y divide-border max-h-64 overflow-y-auto -mx-1 px-1">
        {options.map((f) => (
          <li key={f.id}>
            <button
              onClick={() => onPick(f.id)}
              className="w-full flex items-center gap-2 py-2 text-left hover:bg-muted/40 rounded-md px-2 transition-colors"
            >
              <Beaker className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{f.name}</p>
                <p className="text-xs text-muted-foreground truncate">{f.category}</p>
              </div>
            </button>
          </li>
        ))}
        {options.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No matches.</p>}
      </ul>
      <div className="flex justify-end">
        <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
