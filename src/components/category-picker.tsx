"use client";

import { useFillingCategories } from "@/lib/hooks";

interface CategoryPickerProps {
  category: string;
  onCategoryChange: (cat: string) => void;
}

export function CategoryPicker({ category, onCategoryChange }: CategoryPickerProps) {
  const categories = useFillingCategories();
  return (
    <div>
      <label className="label">Category</label>
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="input"
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
    </div>
  );
}
