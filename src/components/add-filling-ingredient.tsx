"use client";

import { useState, useEffect, useRef, type SyntheticEvent } from "react";
import { useIngredients, saveFillingIngredient, saveIngredient } from "@/lib/hooks";
import { Plus } from "lucide-react";

interface AddFillingIngredientProps {
  fillingId: string;
  onAdded: () => void;
}

export function AddFillingIngredient({ fillingId, onAdded }: AddFillingIngredientProps) {
  const ingredients = useIngredients();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | "">("");
  const [amount, setAmount] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const filtered = (search
    ? ingredients.filter(
        (i) =>
          i.name.toLowerCase().includes(search.toLowerCase()) ||
          i.manufacturer.toLowerCase().includes(search.toLowerCase())
      )
    : ingredients
  ).slice(0, 10);

  const trimmedSearch = search.trim();
  const exactMatch = trimmedSearch
    ? ingredients.some((i) => i.name.toLowerCase() === trimmedSearch.toLowerCase())
    : false;
  const showCreateOption = !!trimmedSearch && !selectedId && !exactMatch;

  // Total navigable items = filtered results + optional create row
  const totalItems = filtered.length + (showCreateOption ? 1 : 0);

  // Reset highlight when search changes
  useEffect(() => { setHighlightedIndex(-1); }, [search]);

  // 'n' shortcut to open the form when nothing is focused
  useEffect(() => {
    if (open) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function selectIngredient(ing: (typeof ingredients)[0]) {
    setSelectedId(ing.id!);
    setSearch(ing.manufacturer ? `${ing.name} (${ing.manufacturer})` : ing.name);
    setHighlightedIndex(-1);
  }

  async function handleCreateNew() {
    if (!trimmedSearch) return;
    const id = await saveIngredient({
      name: trimmedSearch,
      manufacturer: "",
      source: "",
      cost: 0,
      notes: "",
      cacaoFat: 0,
      sugar: 0,
      milkFat: 0,
      water: 0,
      solids: 0,
      otherFats: 0,
      allergens: [],
    });
    setSelectedId(id);
    setSearch(trimmedSearch);
    setHighlightedIndex(-1);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    const showDropdown = !!trimmedSearch && !selectedId && totalItems > 0;
    if (!showDropdown) {
      if (e.key === "Escape") { setOpen(false); setSearch(""); setSelectedId(""); }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, totalItems - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightedIndex >= 0) {
        e.preventDefault();
        if (highlightedIndex < filtered.length) {
          selectIngredient(filtered[highlightedIndex]);
        } else {
          handleCreateNew();
        }
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
      setSelectedId("");
    }
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return;
    const item = listRef.current.children[highlightedIndex] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  async function handleAdd(e: SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedId || !amount) return;
    await saveFillingIngredient({
      fillingId,
      ingredientId: selectedId as string,
      amount: parseFloat(amount) || 0,
      unit: "g",
    });
    setSelectedId("");
    setAmount("");
    setSearch("");
    setOpen(false);
    onAdded();
  }

  function handleCancel() {
    setOpen(false);
    setSearch("");
    setSelectedId("");
    setHighlightedIndex(-1);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 text-xs text-primary font-medium mt-1"
      >
        <Plus className="w-3.5 h-3.5" /> Add ingredient
        <kbd className="ml-1 rounded border border-border bg-muted px-1 py-0.5 font-sans text-muted-foreground" style={{fontSize: "0.65rem"}}>n</kbd>
      </button>
    );
  }

  return (
    <form onSubmit={handleAdd} className="mt-2 p-2 rounded-md border border-border bg-muted/50 space-y-2">
      <div>
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSelectedId(""); }}
          onKeyDown={handleSearchKeyDown}
          placeholder="Search ingredient…"
          aria-label="Search ingredient"
          autoFocus
          className="input"
        />
        {trimmedSearch && !selectedId && (filtered.length > 0 || showCreateOption) && (
          <ul ref={listRef} className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-card">
            {filtered.map((ing, idx) => (
              <li key={ing.id}>
                <button
                  type="button"
                  onClick={() => selectIngredient(ing)}
                  className={`w-full text-left px-2 py-1.5 text-sm transition-colors ${
                    idx === highlightedIndex ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  }`}
                >
                  {ing.name}
                  {ing.manufacturer && (
                    <span className="text-muted-foreground"> ({ing.manufacturer})</span>
                  )}
                </button>
              </li>
            ))}
            {showCreateOption && (
              <li>
                <button
                  type="button"
                  onClick={handleCreateNew}
                  className={`w-full text-left px-2 py-1.5 text-sm transition-colors border-t border-border ${
                    highlightedIndex === filtered.length ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  + Create <span className="font-medium text-foreground">"{trimmedSearch}"</span> as new ingredient
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
      {selectedId && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="label">Amount</label>
            <input
              type="number"
              step="0.1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); }}
              required
              className="input min-w-[7rem]"
              autoFocus
            />
          </div>
          <span className="text-sm text-muted-foreground pb-1">g</span>
          <button
            type="submit"
            disabled={!amount}
            className="btn-primary px-3 py-1.5"
          >
            Add
          </button>
        </div>
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
