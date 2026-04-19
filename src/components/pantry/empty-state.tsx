/**
 * Empty-state message for pantry list pages.
 *
 * Shows a different message depending on whether the list is truly empty
 * (no records at all) vs. just filtered down to nothing.
 *
 * @example
 * <EmptyState
 *   hasData={materials.length > 0}
 *   emptyMessage="No decoration materials yet. Tap + to add your first."
 *   filteredMessage="No materials match your filters."
 * />
 */
export function EmptyState({
  hasData,
  emptyMessage,
  filteredMessage,
}: {
  /** True when records exist but none pass the current search/filters. */
  hasData: boolean;
  emptyMessage: string;
  filteredMessage: string;
}) {
  return (
    <p className="text-muted-foreground text-sm py-8 text-center">
      {hasData ? filteredMessage : emptyMessage}
    </p>
  );
}
