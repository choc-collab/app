import { LayoutList, Rows3 } from "lucide-react";
import type { ViewDensity } from "@/lib/use-persisted-density";

/**
 * Two-button segmented toggle that switches a list between the default
 * detailed view and a compact name-only view. Sits above the Collapse-all /
 * Expand-all controls.
 */
export function ViewDensityToggle({
  value,
  onChange,
}: {
  value: ViewDensity;
  onChange: (next: ViewDensity) => void;
}) {
  return (
    <div
      className="inline-flex rounded-full border border-border bg-card p-0.5"
      role="group"
      aria-label="View density"
    >
      <button
        type="button"
        onClick={() => onChange("default")}
        aria-pressed={value === "default"}
        title="Default view — show all details"
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
          value === "default"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <LayoutList aria-hidden="true" className="w-3.5 h-3.5" />
        Default
      </button>
      <button
        type="button"
        onClick={() => onChange("compact")}
        aria-pressed={value === "compact"}
        title="Compact view — names only"
        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
          value === "compact"
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Rows3 aria-hidden="true" className="w-3.5 h-3.5" />
        Compact
      </button>
    </div>
  );
}
