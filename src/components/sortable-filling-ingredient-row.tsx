"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FillingIngredientRow } from "./filling-ingredient-row";
import type { FillingIngredient, Ingredient } from "@/types";

interface Props {
  li: FillingIngredient;
  ingredient: Ingredient | undefined;
  pct?: number;
  onChanged: () => void;
  readonly?: boolean;
}

export function SortableFillingIngredientRow({ li, ingredient, pct, onChanged, readonly }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: li.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} suppressHydrationWarning>
      <FillingIngredientRow
        li={li}
        ingredient={ingredient}
        pct={pct}
        onChanged={onChanged}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
        isDragging={isDragging}
        readonly={readonly}
      />
    </div>
  );
}
