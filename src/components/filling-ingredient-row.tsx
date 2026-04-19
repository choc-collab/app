"use client";

import { useState } from "react";
import type { FillingIngredient, Ingredient } from "@/types";
import { deleteFillingIngredient, saveFillingIngredient } from "@/lib/hooks";
import { GripVertical, Trash2, Lock } from "lucide-react";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import type { DraggableAttributes } from "@dnd-kit/core";

interface FillingIngredientRowProps {
  li: FillingIngredient;
  ingredient: Ingredient | undefined;
  pct?: number;
  onChanged: () => void;
  dragHandleListeners?: SyntheticListenerMap;
  dragHandleAttributes?: DraggableAttributes;
  isDragging?: boolean;
  readonly?: boolean;
}

export function FillingIngredientRow({
  li,
  ingredient,
  pct,
  onChanged,
  dragHandleListeners,
  dragHandleAttributes,
  isDragging,
  readonly,
}: FillingIngredientRowProps) {
  const [amount, setAmount] = useState(String(li.amount));
  const [note, setNote] = useState(li.note ?? "");
  const [pendingRemove, setPendingRemove] = useState(false);

  async function handleBlur() {
    const newAmount = parseFloat(amount) || 0;
    if (newAmount !== li.amount) {
      await saveFillingIngredient({ ...li, amount: newAmount, unit: "g" });
      onChanged();
    }
  }

  async function handleNoteBlur() {
    const trimmed = note.trim();
    if (trimmed !== (li.note ?? "")) {
      await saveFillingIngredient({ ...li, note: trimmed || undefined });
      onChanged();
    }
  }

  async function handleDelete() {
    await deleteFillingIngredient(li.id!);
    onChanged();
  }

  return (
    <div
      className={`flex items-center gap-2 py-1 ${isDragging ? "opacity-50" : ""}`}
    >
      {readonly ? (
        <Lock aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
      ) : (
        <button
          className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 text-muted-foreground/40 hover:text-muted-foreground touch-none shrink-0"
          aria-label="Drag to reorder"
          suppressHydrationWarning
          {...dragHandleListeners}
          {...dragHandleAttributes}
        >
          <GripVertical className="w-4 h-4" />
        </button>
      )}
      <span className="flex-1 text-sm truncate">
        {ingredient?.name ?? "Unknown"}
        {ingredient?.manufacturer && (
          <span className="text-muted-foreground"> ({ingredient.manufacturer})</span>
        )}
      </span>
      {pct != null && (
        <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
          {pct.toFixed(1)}%
        </span>
      )}
      {readonly ? (
        <>
          <span className="w-24 text-sm text-right text-muted-foreground">{li.amount} g</span>
          <span className="w-28 text-xs text-muted-foreground truncate" title={li.note || undefined}>
            {li.note ?? ""}
          </span>
        </>
      ) : (
        <>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={handleBlur}
              aria-label="Amount in grams"
              className="w-20 rounded-md border border-border bg-card px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">g</span>
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder="note…"
            aria-label="Note"
            className="w-28 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-muted-foreground placeholder:text-muted-foreground/40 hover:border-border focus:border-border focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {pendingRemove ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">Remove?</span>
              <button
                onClick={() => { handleDelete(); setPendingRemove(false); }}
                className="text-red-600 font-medium hover:underline"
              >
                Yes
              </button>
              <button
                onClick={() => setPendingRemove(false)}
                className="text-muted-foreground hover:underline"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setPendingRemove(true)}
              className="p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Remove ingredient"
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
