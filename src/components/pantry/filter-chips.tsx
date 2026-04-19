/**
 * Filter chip row — used inside <FilterPanel> to render a labeled group of toggle chips.
 *
 * Supports two selection modes:
 *
 *  **Radio mode** (single active value, e.g. stock status)
 *    Pass `value`, `defaultValue` and `onChange`.
 *    Clicking the active chip reverts to `defaultValue`; clicking any other chip selects it.
 *
 *  **Multi mode** (any number active, e.g. type/category filters)
 *    Pass `multi={true}`, `selected` (a Set<string>) and `onToggle`.
 *
 * @example — radio (stock status)
 * <FilterChipGroup
 *   label="Stock status"
 *   options={STOCK_OPTIONS}
 *   value={filterStock}
 *   defaultValue="all"
 *   onChange={setFilterStock}
 * />
 *
 * @example — multi (type filter)
 * <FilterChipGroup
 *   label="Type"
 *   options={TYPE_OPTIONS}
 *   multi
 *   selected={filterTypes}
 *   onToggle={toggleFilterType}
 * />
 */

type RadioProps = {
  label: string;
  options: { value: string; label: string }[];
  multi?: false;
  value: string;
  defaultValue: string;
  onChange: (v: string) => void;
  selected?: never;
  onToggle?: never;
};

type MultiProps = {
  label: string;
  options: { value: string; label: string }[];
  multi: true;
  selected: Set<string>;
  onToggle: (v: string) => void;
  value?: never;
  defaultValue?: never;
  onChange?: never;
};

type FilterChipGroupProps = RadioProps | MultiProps;

export function FilterChipGroup(props: FilterChipGroupProps) {
  function isActive(value: string) {
    if (props.multi) return props.selected.has(value);
    return props.value === value;
  }

  function handleClick(value: string) {
    if (props.multi) {
      props.onToggle(value);
    } else {
      props.onChange(props.value === value ? props.defaultValue : value);
    }
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{props.label}</p>
      <div className="flex flex-wrap gap-1">
        {props.options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleClick(opt.value)}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
              isActive(opt.value)
                ? "bg-accent text-accent-foreground"
                : "border border-border hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
