"use client";

import { useState, useMemo } from "react";
import { useIngredients, usePackagingList, useShoppingItems, setIngredientLowStock, markIngredientOrdered, unorderIngredient, setPackagingLowStock, markPackagingOrdered, unorderPackaging, saveShoppingItem, markShoppingItemOrdered, deleteShoppingItem, useDecorationMaterials, setDecorationMaterialLowStock, markDecorationMaterialOrdered, unorderDecorationMaterial } from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { ShoppingCart, Check, ChevronDown, Plus, X, Trash2 } from "lucide-react";
import Link from "next/link";
import { SHOPPING_ITEM_CATEGORIES, DECORATION_MATERIAL_TYPE_LABELS } from "@/types";

function timeAgo(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function ShoppingPage() {
  const ingredients = useIngredients(false);
  const packaging = usePackagingList();
  const shoppingItems = useShoppingItems();
  const decorationMaterials = useDecorationMaterials();

  const [orderedExpanded, setOrderedExpanded] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState<string>("");
  const [newNote, setNewNote] = useState("");

  // For auto-recognition: track which DB record the typed name matches
  const [matchedIngredientId, setMatchedIngredientId] = useState<string | null>(null);
  const [matchedPackagingId, setMatchedPackagingId] = useState<string | null>(null);

  // Combined suggestion list for datalist
  const suggestions = useMemo(() => {
    const ing = ingredients.map((i) => ({ id: i.id!, name: i.name, type: "ingredient" as const, category: i.category }));
    const pkg = packaging.map((p) => ({ id: p.id!, name: p.name, type: "packaging" as const, category: undefined }));
    return [...ing, ...pkg];
  }, [ingredients, packaging]);

  function inferCategory(type: "ingredient" | "packaging", ingCategory?: string): string {
    if (type === "packaging") return "Packaging";
    if (ingCategory === "Cocoa Butters") return "Cocoa Butter";
    return "Ingredient";
  }

  function handleNameChange(value: string) {
    setNewName(value);
    const lower = value.trim().toLowerCase();
    const match = suggestions.find((s) => s.name.toLowerCase() === lower);
    if (match) {
      setMatchedIngredientId(match.type === "ingredient" ? match.id : null);
      setMatchedPackagingId(match.type === "packaging" ? match.id : null);
      setNewCategory(inferCategory(match.type, match.category ?? undefined));
    } else {
      setMatchedIngredientId(null);
      setMatchedPackagingId(null);
    }
  }

  // Pending: low stock but not yet ordered
  const pendingIngredients = useMemo(
    () => ingredients.filter((i) => i.lowStock && !i.lowStockOrdered),
    [ingredients]
  );
  const pendingPackaging = useMemo(
    () => packaging.filter((p) => p.lowStock && !p.lowStockOrdered),
    [packaging]
  );
  const pendingMaterials = useMemo(
    () => decorationMaterials.filter((m) => m.lowStock && !m.lowStockOrdered),
    [decorationMaterials]
  );
  const pendingItems = useMemo(
    () => shoppingItems.filter((s) => !s.orderedAt).sort((a, b) => b.addedAt - a.addedAt),
    [shoppingItems]
  );

  // Ordered: flagged and order placed, awaiting delivery
  const orderedIngredients = useMemo(
    () => ingredients.filter((i) => i.lowStock && i.lowStockOrdered),
    [ingredients]
  );
  const orderedPackaging = useMemo(
    () => packaging.filter((p) => p.lowStock && p.lowStockOrdered),
    [packaging]
  );
  const orderedMaterials = useMemo(
    () => decorationMaterials.filter((m) => m.lowStock && m.lowStockOrdered),
    [decorationMaterials]
  );
  const orderedItems = useMemo(
    () => shoppingItems.filter((s) => !!s.orderedAt).sort((a, b) => b.orderedAt! - a.orderedAt!),
    [shoppingItems]
  );

  const totalPending = pendingIngredients.length + pendingPackaging.length + pendingMaterials.length + pendingItems.length;
  const totalOrdered = orderedIngredients.length + orderedPackaging.length + orderedMaterials.length + orderedItems.length;

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    if (matchedIngredientId) {
      await setIngredientLowStock(matchedIngredientId, true);
    } else if (matchedPackagingId) {
      await setPackagingLowStock(matchedPackagingId, true);
    } else {
      await saveShoppingItem({
        name: newName.trim(),
        category: newCategory || undefined,
        note: newNote.trim() || undefined,
        addedAt: Date.now(),
      });
    }
    setNewName("");
    setNewCategory("");
    setNewNote("");
    setMatchedIngredientId(null);
    setMatchedPackagingId(null);
    setShowAddForm(false);
  }

  function resetAddForm() {
    setShowAddForm(false);
    setNewName("");
    setNewCategory("");
    setNewNote("");
    setMatchedIngredientId(null);
    setMatchedPackagingId(null);
  }

  return (
    <div>
      <PageHeader title="Shopping List" description="Items to reorder for the workshop" />
      <div className="px-4 pb-8 space-y-4">

        {totalPending === 0 && totalOrdered === 0 && !showAddForm && (
          <div className="py-12 text-center">
            <ShoppingCart className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nothing to order — all stocked up.</p>
            <button
              onClick={() => setShowAddForm(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary"
            >
              <Plus className="w-4 h-4" /> Add an item
            </button>
          </div>
        )}

        {(totalPending > 0 || totalOrdered > 0 || showAddForm) && (
          <>
            {/* Pending section */}
            {totalPending > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Needs ordering ({totalPending})
                </h2>

                {pendingIngredients.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 ml-1">Ingredients</p>
                    <ul className="space-y-1.5">
                      {pendingIngredients.map((ing) => (
                        <li key={ing.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${ing.outOfStock ? "border-status-alert-edge bg-status-alert-bg" : "border-status-warn-edge bg-status-warn-bg"}`}>
                          <div className={`w-2 h-2 rounded-full shrink-0 ${ing.outOfStock ? "bg-status-alert-edge" : "bg-status-warn-edge"}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{ing.name}</p>
                              {ing.outOfStock && (
                                <span className="text-[10px] font-medium text-status-alert bg-status-alert-bg px-1.5 py-0.5 rounded-full shrink-0">out of stock</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {ing.category && <span className="text-xs text-muted-foreground">{ing.category}</span>}
                              {ing.lowStockSince && (
                                <>
                                  {ing.category && <span className="text-muted-foreground/40 text-xs">·</span>}
                                  <span className="text-xs text-muted-foreground">flagged {timeAgo(ing.lowStockSince)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Link
                              href={`/ingredients/${encodeURIComponent(ing.id ?? "")}`}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                            >
                              View
                            </Link>
                            <button
                              onClick={() => markIngredientOrdered(ing.id!)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium"
                              title="Mark as ordered"
                            >
                              <Check className="w-3 h-3" /> Ordered
                            </button>
                            {pendingRemove === `ing-${ing.id}` ? (
                              <span className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">Remove?</span>
                                <button
                                  onClick={() => { setIngredientLowStock(ing.id!, false); setPendingRemove(null); }}
                                  className="text-red-600 font-medium hover:underline"
                                >Yes</button>
                                <button onClick={() => setPendingRemove(null)} className="text-muted-foreground hover:underline">Cancel</button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setPendingRemove(`ing-${ing.id}`)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                                title="Remove from list"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pendingPackaging.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 ml-1">Packaging</p>
                    <ul className="space-y-1.5">
                      {pendingPackaging.map((pkg) => (
                        <li key={pkg.id} className="flex items-center gap-3 rounded-lg border border-status-warn-edge bg-status-warn-bg px-3 py-2.5">
                          <div className="w-2 h-2 rounded-full bg-status-warn-edge shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{pkg.name}</p>
                            {pkg.lowStockSince && (
                              <span className="text-xs text-muted-foreground">flagged {timeAgo(pkg.lowStockSince)}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Link
                              href={`/packaging/${encodeURIComponent(pkg.id ?? "")}`}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                            >
                              View
                            </Link>
                            <button
                              onClick={() => markPackagingOrdered(pkg.id!)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium"
                              title="Mark as ordered"
                            >
                              <Check className="w-3 h-3" /> Ordered
                            </button>
                            {pendingRemove === `pkg-${pkg.id}` ? (
                              <span className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">Remove?</span>
                                <button
                                  onClick={() => { setPackagingLowStock(pkg.id!, false); setPendingRemove(null); }}
                                  className="text-red-600 font-medium hover:underline"
                                >Yes</button>
                                <button onClick={() => setPendingRemove(null)} className="text-muted-foreground hover:underline">Cancel</button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setPendingRemove(`pkg-${pkg.id}`)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                                title="Remove from list"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pendingMaterials.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 ml-1">Decoration</p>
                    <ul className="space-y-1.5">
                      {pendingMaterials.map((m) => (
                        <li key={m.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${m.outOfStock ? "border-status-alert-edge bg-status-alert-bg" : "border-status-warn-edge bg-status-warn-bg"}`}>
                          <span
                            className="w-2 h-2 rounded-full shrink-0 border border-black/10"
                            style={{ backgroundColor: m.color ?? (m.outOfStock ? "#f87171" : "#fbbf24") }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium truncate">{m.name}</p>
                              {m.outOfStock && (
                                <span className="text-[10px] font-medium text-status-alert bg-status-alert-bg px-1.5 py-0.5 rounded-full shrink-0">out of stock</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-muted-foreground">{DECORATION_MATERIAL_TYPE_LABELS[m.type]}</span>
                              {m.lowStockSince && (
                                <>
                                  <span className="text-muted-foreground/40 text-xs">·</span>
                                  <span className="text-xs text-muted-foreground">flagged {timeAgo(m.lowStockSince)}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Link
                              href={`/pantry/decoration/${encodeURIComponent(m.id ?? "")}`}
                              className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors"
                            >
                              View
                            </Link>
                            <button
                              onClick={() => markDecorationMaterialOrdered(m.id!)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium"
                              title="Mark as ordered"
                            >
                              <Check className="w-3 h-3" /> Ordered
                            </button>
                            {pendingRemove === `mat-${m.id}` ? (
                              <span className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">Remove?</span>
                                <button
                                  onClick={() => { setDecorationMaterialLowStock(m.id!, false); setPendingRemove(null); }}
                                  className="text-red-600 font-medium hover:underline"
                                >Yes</button>
                                <button onClick={() => setPendingRemove(null)} className="text-muted-foreground hover:underline">Cancel</button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setPendingRemove(`mat-${m.id}`)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                                title="Remove from list"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {pendingItems.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5 ml-1">Other items</p>
                    <ul className="space-y-1.5">
                      {pendingItems.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 rounded-lg border border-status-warn-edge bg-status-warn-bg px-3 py-2.5">
                          <div className="w-2 h-2 rounded-full bg-status-warn-edge shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.category && <span className="text-xs text-muted-foreground">{item.category}</span>}
                              {item.note && (
                                <>
                                  {item.category && <span className="text-muted-foreground/40 text-xs">·</span>}
                                  <span className="text-xs text-muted-foreground italic truncate">{item.note}</span>
                                </>
                              )}
                              <span className="text-muted-foreground/40 text-xs">·</span>
                              <span className="text-xs text-muted-foreground">added {timeAgo(item.addedAt)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => markShoppingItemOrdered(item.id!)}
                              className="inline-flex items-center gap-1 rounded-full bg-primary text-primary-foreground px-2.5 py-1.5 text-xs font-medium"
                              title="Mark as ordered"
                            >
                              <Check className="w-3 h-3" /> Ordered
                            </button>
                            {pendingRemove === `item-${item.id}` ? (
                              <span className="flex items-center gap-1.5 text-xs">
                                <span className="text-muted-foreground">Delete?</span>
                                <button
                                  onClick={() => { deleteShoppingItem(item.id!); setPendingRemove(null); }}
                                  className="text-red-600 font-medium hover:underline"
                                >Yes</button>
                                <button onClick={() => setPendingRemove(null)} className="text-muted-foreground hover:underline">Cancel</button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setPendingRemove(`item-${item.id}`)}
                                className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                                title="Delete"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Add item */}
            {showAddForm ? (
              <form onSubmit={handleAddItem} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div>
                  <input
                    type="text"
                    list="shopping-suggestions"
                    value={newName}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Item name…"
                    autoFocus
                    required
                    className="input"
                  />
                  <datalist id="shopping-suggestions">
                    {suggestions.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                  {(matchedIngredientId || matchedPackagingId) && (
                    <p className="text-xs text-primary mt-1">
                      Recognised — will flag as low stock directly.
                    </p>
                  )}
                </div>
                {!(matchedIngredientId || matchedPackagingId) && (
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    className="input"
                  >
                    <option value="">Category (optional)</option>
                    {SHOPPING_ITEM_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
                {newCategory && (matchedIngredientId || matchedPackagingId) && (
                  <p className="text-xs text-muted-foreground">Category: {newCategory}</p>
                )}
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Note — quantity, supplier, link… (optional)"
                  className="input"
                />
                <div className="flex gap-2">
                  <button type="submit" disabled={!newName.trim()} className="btn-primary flex-1 py-2">
                    Add
                  </button>
                  <button type="button" onClick={resetAddForm} className="btn-secondary px-4 py-2">
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-4 h-4" /> Add item
              </button>
            )}

            {/* Ordered / awaiting delivery */}
            {totalOrdered > 0 && (
              <section>
                <button
                  onClick={() => setOrderedExpanded((v) => !v)}
                  className="flex items-center gap-2 w-full text-left mb-2"
                >
                  <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${orderedExpanded ? "" : "-rotate-90"}`} />
                  <h2 className="text-sm font-semibold text-muted-foreground">Ordered — awaiting delivery ({totalOrdered})</h2>
                </button>
                {orderedExpanded && (
                  <ul className="space-y-1.5 ml-6">
                    {orderedIngredients.map((ing) => (
                      <li key={ing.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                        <div className="w-2 h-2 rounded-full bg-status-ok-edge shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{ing.name}</p>
                          <span className="text-xs text-muted-foreground">{ing.category ?? "Ingredient"}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => unorderIngredient(ing.id!)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1.5 transition-colors"
                            title="Move back to needs ordering"
                          >
                            Undo order
                          </button>
                          <button
                            onClick={() => setIngredientLowStock(ing.id!, false)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1.5 transition-colors"
                            title="Mark as restocked — remove from list"
                          >
                            <Check className="w-3 h-3" /> Restocked
                          </button>
                        </div>
                      </li>
                    ))}
                    {orderedPackaging.map((pkg) => (
                      <li key={pkg.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                        <div className="w-2 h-2 rounded-full bg-status-ok-edge shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{pkg.name}</p>
                          <span className="text-xs text-muted-foreground">Packaging</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => unorderPackaging(pkg.id!)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1.5 transition-colors"
                            title="Move back to needs ordering"
                          >
                            Undo order
                          </button>
                          <button
                            onClick={() => setPackagingLowStock(pkg.id!, false)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1.5 transition-colors"
                            title="Mark as restocked — remove from list"
                          >
                            <Check className="w-3 h-3" /> Restocked
                          </button>
                        </div>
                      </li>
                    ))}
                    {orderedMaterials.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                        <span
                          className="w-2 h-2 rounded-full shrink-0 border border-black/10"
                          style={{ backgroundColor: m.color ?? "#86efac" }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{m.name}</p>
                          <span className="text-xs text-muted-foreground">{DECORATION_MATERIAL_TYPE_LABELS[m.type]}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => unorderDecorationMaterial(m.id!)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1.5 transition-colors"
                            title="Move back to needs ordering"
                          >
                            Undo order
                          </button>
                          <button
                            onClick={() => setDecorationMaterialLowStock(m.id!, false)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1.5 transition-colors"
                            title="Mark as restocked — remove from list"
                          >
                            <Check className="w-3 h-3" /> Restocked
                          </button>
                        </div>
                      </li>
                    ))}
                    {orderedItems.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                        <div className="w-2 h-2 rounded-full bg-status-ok-edge shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.name}</p>
                          {item.category && <span className="text-xs text-muted-foreground">{item.category}</span>}
                        </div>
                        {pendingRemove === `ordered-${item.id}` ? (
                          <span className="flex items-center gap-1.5 text-xs">
                            <span className="text-muted-foreground">Delete?</span>
                            <button
                              onClick={() => { deleteShoppingItem(item.id!); setPendingRemove(null); }}
                              className="text-red-600 font-medium hover:underline"
                            >Yes</button>
                            <button onClick={() => setPendingRemove(null)} className="text-muted-foreground hover:underline">Cancel</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setPendingRemove(`ordered-${item.id}`)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                            title="Remove"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}

      </div>
    </div>
  );
}
