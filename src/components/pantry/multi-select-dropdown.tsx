import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Multi-select checkbox dropdown — used in filter panels where the option set is
 * large enough that chip buttons would overflow (e.g. ingredients by category or
 * manufacturer).
 *
 * For short, fixed option lists prefer <FilterChipGroup multi ... /> instead.
 *
 * @example
 * <MultiSelectDropdown
 *   placeholder="All categories"
 *   options={Array.from(INGREDIENT_CATEGORIES)}
 *   selected={filterCategories}
 *   onToggle={toggleFilterCategory}
 * />
 */
export function MultiSelectDropdown({
  placeholder,
  options,
  selected,
  onToggle,
}: {
  placeholder: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const summary =
    selected.size === 0
      ? placeholder
      : selected.size === 1
      ? Array.from(selected)[0]
      : `${selected.size} selected`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs transition-colors ${
          selected.size > 0
            ? "border-primary bg-primary/5 font-medium text-foreground"
            : "border-border bg-background text-muted-foreground hover:bg-muted"
        }`}
      >
        <span className="max-w-[180px] truncate">{summary}</span>
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-card border border-border rounded-lg shadow-lg min-w-[200px] max-h-56 overflow-y-auto py-1">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted cursor-pointer text-xs"
            >
              <input
                type="checkbox"
                checked={selected.has(opt)}
                onChange={() => onToggle(opt)}
                className="rounded border-border shrink-0"
              />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
