"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";

/** Popover menu offering three create-flow shortcuts: Filling, Product,
 *  Ingredient. Each item navigates to the corresponding list page where
 *  the existing inline-add form is the next click. (A future polish task
 *  could deep-link past that form via a query param.) */
export function QuickAddMenu() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const items: { label: string; href: string; hint: string }[] = [
    { label: "Filling",     href: "/fillings",    hint: "Ganache, praline, caramel…" },
    { label: "Product",     href: "/products",    hint: "Bonbon, bar, snack format" },
    { label: "Ingredient",  href: "/ingredients", hint: "Chocolate, dairy, sugar, fat…" },
  ];

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-secondary"
      >
        <Plus className="w-4 h-4" />
        Quick add
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1.5 z-20 w-64 rounded-lg border border-border bg-card shadow-md p-1"
        >
          {items.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex flex-col gap-0.5 rounded-md px-3 py-2 hover:bg-muted focus:bg-muted focus:outline-none transition-colors"
            >
              <span className="text-sm font-medium">{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.hint}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
