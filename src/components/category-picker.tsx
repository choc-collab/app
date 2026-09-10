"use client";

import { useFillingCategories } from "@/lib/hooks";

interface CategoryPickerProps {
  category: string;
  onCategoryChange: (cat: string) => void;
  /** Skip the "Category" label above the select — for callers that render their
   *  own label (e.g. a sidebar property row). Default false, unchanged for
   *  existing callers. */
  hideLabel?: boolean;
  /** Override the select's className (defaults to the standard `.input` look). */
  selectClassName?: string;
}

export function CategoryPicker({ category, onCategoryChange, hideLabel, selectClassName }: CategoryPickerProps) {
  const categories = useFillingCategories();
  const select = (
    <select
      value={category}
      onChange={(e) => onCategoryChange(e.target.value)}
      className={selectClassName ?? "input"}
    >
      <option value="">— Select category —</option>
      {categories.map((cat) => (
        <option key={cat.id ?? cat.name} value={cat.name}>{cat.name}</option>
      ))}
      {/* Preserve any legacy/custom category currently set on the filling that isn't in the table */}
      {category && !categories.some((c) => c.name === category) && (
        <option value={category}>{category}</option>
      )}
    </select>
  );

  if (hideLabel) return select;

  return (
    <div>
      <label className="label">Category</label>
      {select}
    </div>
  );
}
