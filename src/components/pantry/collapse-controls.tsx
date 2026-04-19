/**
 * "Collapse all / Expand all" controls shown at the top of a grouped list.
 *
 * Only render these when the list has results — they have no effect on an empty list.
 *
 * @example
 * {grouped.length > 0 && (
 *   <CollapseControls
 *     onCollapseAll={() => setCollapsedGroups(new Set(grouped.map((g) => g.key)))}
 *     onExpandAll={() => setCollapsedGroups(new Set())}
 *   />
 * )}
 */
export function CollapseControls({
  onCollapseAll,
  onExpandAll,
}: {
  onCollapseAll: () => void;
  onExpandAll: () => void;
}) {
  return (
    <div className="flex justify-end gap-3">
      <button onClick={onCollapseAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        Collapse all
      </button>
      <button onClick={onExpandAll} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
        Expand all
      </button>
    </div>
  );
}
