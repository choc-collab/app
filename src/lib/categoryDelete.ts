/**
 * Pure rule for whether a category row can be hard-deleted or only archived.
 *
 * Filling and ingredient categories are linked by NAME (`Filling.category`,
 * `Ingredient.category`), not by id. So the guard has to ask whether the *name*
 * survives the delete, not whether this row is referenced — no reference points
 * at a row in the first place. When several rows carry the same name, deleting
 * one is safe: everything referencing that name still resolves through the
 * copies that remain.
 *
 * Duplicates are not hypothetical. Before v0.9.2, seeding ran before the initial
 * cloud sync, so every fresh browser profile inserted another full set of the
 * defaults (issue #171). A name-based guard makes those copies permanently
 * undeletable, because each one is "in use" by virtue of the name it shares.
 */

export type CategoryDeleteVerdict =
  | { canDelete: true; reason: "unused" | "duplicate" }
  | { canDelete: false; reason: "in-use" | "protected-name" };

export interface CategoryDeleteInput {
  /** Rows referencing this category by name. */
  usageCount: number;
  /** Category rows carrying this exact name, including the one being deleted. */
  sameNameCount: number;
  /** "Chocolate" on ingredient categories — shell selection needs the name to exist. */
  isProtectedName?: boolean;
}

export function decideCategoryDelete({
  usageCount,
  sameNameCount,
  isProtectedName = false,
}: CategoryDeleteInput): CategoryDeleteVerdict {
  // Checked first, and deliberately ahead of the protected name: a duplicate
  // "Chocolate" is exactly the row we need to be able to remove, and the name
  // goes on existing without it.
  if (sameNameCount > 1) return { canDelete: true, reason: "duplicate" };
  if (isProtectedName) return { canDelete: false, reason: "protected-name" };
  if (usageCount > 0) return { canDelete: false, reason: "in-use" };
  return { canDelete: true, reason: "unused" };
}
