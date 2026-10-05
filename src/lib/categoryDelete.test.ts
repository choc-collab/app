import { describe, expect, it } from "vitest";
import { decideCategoryDelete } from "./categoryDelete";

describe("decideCategoryDelete", () => {
  it("allows deleting a category nothing references", () => {
    expect(decideCategoryDelete({ usageCount: 0, sameNameCount: 1 })).toEqual({
      canDelete: true,
      reason: "unused",
    });
  });

  it("refuses the last row holding a name that is still in use", () => {
    // Nothing would resolve the name afterwards — this is the case the guard
    // has always been protecting, and it stays protected.
    expect(decideCategoryDelete({ usageCount: 12, sameNameCount: 1 })).toEqual({
      canDelete: false,
      reason: "in-use",
    });
  });

  it("allows deleting a duplicate even while the name is heavily used", () => {
    // The #171 case: 3 copies of "Ganaches", 12 fillings referencing the name.
    // Removing one leaves two rows still answering to it.
    expect(decideCategoryDelete({ usageCount: 12, sameNameCount: 3 })).toEqual({
      canDelete: true,
      reason: "duplicate",
    });
  });

  it("allows deleting a duplicate of a protected name", () => {
    // Otherwise duplicated "Chocolate" rows would be permanently stuck: the
    // protection exists so the name survives, and four copies of it do survive.
    expect(
      decideCategoryDelete({ usageCount: 40, sameNameCount: 4, isProtectedName: true }),
    ).toEqual({ canDelete: true, reason: "duplicate" });
  });

  it("still refuses the only copy of a protected name, even when unused", () => {
    expect(
      decideCategoryDelete({ usageCount: 0, sameNameCount: 1, isProtectedName: true }),
    ).toEqual({ canDelete: false, reason: "protected-name" });
  });

  it("treats a protected name as the stronger objection when it is also in use", () => {
    expect(
      decideCategoryDelete({ usageCount: 7, sameNameCount: 1, isProtectedName: true }),
    ).toEqual({ canDelete: false, reason: "protected-name" });
  });
});
