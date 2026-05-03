"use client";

import { useState, useMemo, type SyntheticEvent } from "react";
import { Plus, AlertTriangle } from "lucide-react";
import {
  useFillings,
  useAllFillingComponents,
  saveFillingComponent,
  FillingComponentCycleError,
} from "@/lib/hooks";
import { buildChildMap, wouldCreateCycle } from "@/lib/fillingComponents";

interface AddFillingComponentProps {
  /** The host filling we're adding a nested component to. */
  fillingId: string;
  /** Filling ids already linked as components — disabled in the picker so
   *  the user can't double-add the same child. */
  existingChildIds: ReadonlyArray<string>;
  onAdded?: () => void;
}

/**
 * Picker that lets the user pick another filling as a nested component of
 * the current host filling. Disables options that would close a cycle (the
 * candidate already contains the host directly or transitively) and options
 * already linked.
 */
export function AddFillingComponent({ fillingId, existingChildIds, onAdded }: AddFillingComponentProps) {
  const fillings = useFillings();
  const allComponents = useAllFillingComponents();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const childMap = useMemo(() => buildChildMap(allComponents), [allComponents]);
  const existingSet = useMemo(() => new Set(existingChildIds), [existingChildIds]);

  // Annotate each filling with the reason it can't be picked, if any. The host
  // itself is always disabled (self-ref), already-linked children are
  // disabled, and anything that would close a cycle is disabled.
  const options = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fillings
      .filter((f) => f.id != null && !f.archived)
      .filter((f) => (q ? f.name.toLowerCase().includes(q) : true))
      .map((f) => {
        const isHost = f.id === fillingId;
        const already = existingSet.has(f.id!);
        const cycle = !isHost && !already && wouldCreateCycle(childMap, fillingId, f.id!);
        return { f, isHost, already, cycle };
      })
      .slice(0, 20);
  }, [fillings, search, fillingId, existingSet, childMap]);

  function handleCancel() {
    setOpen(false);
    setSearch("");
    setSelectedId("");
    setAmount("");
    setError(null);
  }

  async function handleAdd(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId || !amount) return;
    setError(null);
    try {
      await saveFillingComponent({
        fillingId,
        childFillingId: selectedId,
        amount: parseFloat(amount) || 0,
        unit: "g",
      });
      setOpen(false);
      setSearch("");
      setSelectedId("");
      setAmount("");
      onAdded?.();
    } catch (err) {
      // Cycle errors are user-facing; everything else falls back to a generic
      // message so we still surface failures.
      if (err instanceof FillingComponentCycleError) {
        setError("That filling already contains this one — can't nest.");
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-primary font-medium mt-1"
        data-testid="add-filling-component-btn"
      >
        <Plus className="w-3.5 h-3.5" /> Add nested filling
      </button>
    );
  }

  const selected = options.find((o) => o.f.id === selectedId);

  return (
    <form
      onSubmit={handleAdd}
      className="mt-2 p-2 rounded-md border border-border bg-muted/50 space-y-2"
      data-testid="add-filling-component-form"
    >
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setSelectedId("");
        }}
        placeholder="Search fillings…"
        aria-label="Search fillings"
        autoFocus
        className="input"
        data-testid="add-filling-component-search"
      />
      {!selectedId && options.length > 0 && (
        <ul className="max-h-40 overflow-y-auto rounded-md border border-border bg-card">
          {options.map(({ f, isHost, already, cycle }) => {
            const disabled = isHost || already || cycle;
            const reason = isHost
              ? "Self"
              : already
                ? "Added"
                : cycle
                  ? "Cycle"
                  : null;
            return (
              <li key={f.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedId(f.id!)}
                  className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-sm transition-colors ${
                    disabled
                      ? "text-muted-foreground opacity-60 cursor-not-allowed"
                      : "hover:bg-muted"
                  }`}
                >
                  <span className="truncate">{f.name}</span>
                  {reason && (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                      {cycle && <AlertTriangle className="w-3 h-3" aria-hidden="true" />}
                      {reason}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {selected && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="label">{selected.f.name} · amount</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") handleCancel();
              }}
              required
              className="input min-w-[7rem]"
              autoFocus
              data-testid="add-filling-component-amount"
            />
          </div>
          <span className="text-sm text-muted-foreground pb-1">g</span>
          <button
            type="submit"
            disabled={!amount}
            className="btn-primary px-3 py-1.5"
            data-testid="add-filling-component-submit"
          >
            Add
          </button>
        </div>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleCancel}
        className="text-xs text-muted-foreground"
      >
        Cancel
      </button>
    </form>
  );
}
