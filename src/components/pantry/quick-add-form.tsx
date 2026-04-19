/**
 * Inline quick-add form — appears below the toolbar when the user taps + (or presses "n").
 *
 * Provides the submit / cancel button row and form wrapper. Put your fields in `children`.
 * The first child should be an `<input autoFocus>` so focus lands there immediately.
 *
 * @example
 * {showAdd && (
 *   <QuickAddForm
 *     onSubmit={handleAdd}
 *     onCancel={() => { setShowAdd(false); setNewName(""); }}
 *     submitLabel="Create Ingredient"
 *     canSubmit={!!newName.trim()}
 *   >
 *     <input
 *       className="input"
 *       value={newName}
 *       onChange={(e) => setNewName(e.target.value)}
 *       placeholder="Ingredient name…"
 *       autoFocus
 *       required
 *     />
 *   </QuickAddForm>
 * )}
 */
export function QuickAddForm({
  onSubmit,
  onCancel,
  submitLabel,
  canSubmit,
  children,
}: {
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  submitLabel: string;
  canSubmit: boolean;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-border bg-card p-3 space-y-2"
    >
      {children}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary flex-1 py-2"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary px-4 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
