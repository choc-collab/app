import { FilterChipGroup } from "./filter-chips";

/**
 * Standardised "show archived" filter chip for all list pages.
 *
 * Wraps FilterChipGroup in radio mode with two options:
 *   "Hide archived" (default) / "Show archived"
 *
 * Drop this inside a <FilterPanel> on any list page that has archivable entities.
 *
 * @example
 * <ArchiveFilterChip
 *   value={f.showArchived}
 *   onChange={(v) => setF("showArchived", v)}
 * />
 */
export function ArchiveFilterChip({
  value,
  onChange,
}: {
  /** Whether archived items are currently shown. */
  value: boolean;
  /** Called with the new boolean when the user toggles. */
  onChange: (show: boolean) => void;
}) {
  return (
    <FilterChipGroup
      label="Archived"
      options={[
        { value: "no", label: "Hide archived" },
        { value: "yes", label: "Show archived" },
      ]}
      value={value ? "yes" : "no"}
      defaultValue="no"
      onChange={(v) => onChange(v === "yes")}
    />
  );
}
