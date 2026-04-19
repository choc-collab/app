"use client";

import { useEffect } from "react";
import { seedIfNeeded } from "@/lib/seed";
import { ensureDefaultProductCategories, ensureDefaultDecorationCategories, ensureDefaultShellDesigns, ensureDefaultFillingCategories, ensureDefaultIngredientCategories } from "@/lib/hooks";

export function SeedLoader() {
  useEffect(() => {
    // Idempotent — only inserts the defaults if the table is empty. Runs on every
    // app load so fresh users (who skip the v4 upgrade hook) still get the seeded values.
    ensureDefaultProductCategories().catch((e) => console.error("ensureDefaultProductCategories failed:", e));
    ensureDefaultDecorationCategories().catch((e) => console.error("ensureDefaultDecorationCategories failed:", e));
    ensureDefaultShellDesigns().catch((e) => console.error("ensureDefaultShellDesigns failed:", e));
    ensureDefaultFillingCategories().catch((e) => console.error("ensureDefaultFillingCategories failed:", e));
    ensureDefaultIngredientCategories().catch((e) => console.error("ensureDefaultIngredientCategories failed:", e));
    seedIfNeeded();
  }, []);

  return null;
}
