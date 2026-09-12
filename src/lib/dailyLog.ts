/**
 * Daily Log — pure derivation. No React, no IndexedDB.
 *
 * The Log has two halves:
 *   1. What the app already knows happened on a day — moulds coloured, shells
 *      cast, fillings made, boxes sold, orders captured, recipes created… This
 *      "digest" is NEVER stored. It is derived here from the existing tables,
 *      which means it back-fills every day since the first batch and stays
 *      correct when a batch or sale is later edited.
 *   2. What the chocolatier writes down (`LogEntry`) and day-level facts such
 *      as workshop temperature/humidity (`LogDay`) — those are stored and
 *      only *grouped* here.
 *
 * Everything takes plain arrays plus explicit dates; nothing calls
 * `new Date()` internally, so the functions stay deterministic and testable.
 * Days are local ISO "YYYY-MM-DD" strings (see `toISODate` in lib/orders).
 */

import type {
  Customer,
  Experiment,
  Filling,
  FillingStock,
  GiveAwayRecord,
  Ingredient,
  IngredientPriceHistory,
  LogDay,
  LogEntry,
  Mould,
  Order,
  Packaging,
  PackagingOrder,
  PlanFilling,
  PlanPhaseDate,
  PlanProduct,
  PlanStepStatus,
  PrepTask,
  Product,
  ProductionPhaseId,
  ProductionPlan,
  Sale,
  ShoppingItem,
} from "@/types";
import { GIVE_AWAY_REASONS, PRODUCTION_PHASES } from "@/types";
import { toISODate, monthLabel, MONTH_NAMES, ORDER_STATUS_LABEL, eventLengthDays } from "@/lib/orders";
import { getTotalCavities } from "@/lib/production";
import { isSchedulablePhaseRow } from "@/lib/schedule";

// ─── Dates ───────────────────────────────────────────────────────────────────

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Local calendar day of any timestamp the tables use: a `Date`, a ms number,
 *  an ISO date-time string, or an ISO date already ("2026-09-09" passes
 *  through untouched). Returns null for anything unparseable so callers can
 *  skip the row rather than bucket it under 1970. */
export function isoDayOf(value: Date | number | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : toISODate(d);
  }
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : toISODate(d);
}

/** `iso` shifted by `delta` whole days (local, DST-safe). */
export function shiftISODate(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return toISODate(new Date(y, m - 1, d + delta));
}

/** "Tuesday 9 September 2026" — fixed EN names, no locale, no Date-in-JSX. */
export function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()];
  return `${weekday} ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** "Tue 9 Sep" — compact form for list cards and the calendar. */
export function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAY_NAMES[new Date(y, m - 1, d).getDay()].slice(0, 3);
  return `${weekday} ${d} ${MONTH_NAMES[m - 1].slice(0, 3)}`;
}

/** "Today" / "Yesterday" / null — for the badge beside a day heading. */
export function relativeDayLabel(iso: string, todayISO: string): string | null {
  if (iso === todayISO) return "Today";
  if (iso === shiftISODate(todayISO, -1)) return "Yesterday";
  return null;
}

// ─── Digest model ────────────────────────────────────────────────────────────

export type LogArea = "workshop" | "shop" | "orders" | "lab" | "pantry" | "schedule";

export const LOG_AREAS: ReadonlyArray<LogArea> = ["workshop", "shop", "orders", "lab", "pantry", "schedule"];

export const LOG_AREA_LABEL: Record<LogArea, string> = {
  workshop: "Workshop",
  shop: "Shop",
  orders: "Orders",
  lab: "Lab",
  pantry: "Pantry",
  schedule: "Schedule",
};

export interface DigestLine {
  /** Stable key for React lists — unique within a day. */
  key: string;
  area: LogArea;
  /** The headline, e.g. "Coloured 6 moulds". */
  text: string;
  /** Secondary detail, e.g. "Salted caramel, Praline · Batch 20260909-001". */
  detail?: string;
  /** Where the line came from — a batch, sale list, order, recipe… */
  href?: string;
  /** Presentation order inside the area (lower first). */
  rank: number;
}

export interface DayDigest {
  date: string;
  lines: DigestLine[];
  /** Number of lines per area — drives the calendar markers. */
  counts: Record<LogArea, number>;
}

export function emptyDigest(date: string): DayDigest {
  return { date, lines: [], counts: { workshop: 0, shop: 0, orders: 0, lab: 0, pantry: 0, schedule: 0 } };
}

/** Every table the digest reads. All optional so callers (and tests) only
 *  pass what they have; a missing table simply contributes no lines. Products
 *  are accepted without their `photo` to keep the payload light. */
export interface LogSources {
  plans?: readonly ProductionPlan[];
  planProducts?: readonly PlanProduct[];
  planFillings?: readonly PlanFilling[];
  stepStatuses?: readonly PlanStepStatus[];
  moulds?: readonly Mould[];
  products?: readonly Omit<Product, "photo">[];
  fillings?: readonly Filling[];
  fillingStock?: readonly FillingStock[];
  sales?: readonly Sale[];
  giveaways?: readonly GiveAwayRecord[];
  orders?: readonly Order[];
  customers?: readonly Customer[];
  experiments?: readonly Experiment[];
  ingredients?: readonly Ingredient[];
  priceHistory?: readonly IngredientPriceHistory[];
  packaging?: readonly Packaging[];
  packagingOrders?: readonly PackagingOrder[];
  shoppingItems?: readonly ShoppingItem[];
  planPhaseDates?: readonly PlanPhaseDate[];
  prepTasks?: readonly PrepTask[];
  /** Symbol prefixed to revenue figures, e.g. "€". */
  currencySymbol?: string;
}

// ─── Aggregation ─────────────────────────────────────────────────────────────

type Phase = "color" | "shell" | "fill" | "cap" | "unmould" | "package";

const SCHEDULE_PHASE_LABEL = Object.fromEntries(
  PRODUCTION_PHASES.map((p) => [p.id, p.label]),
) as Record<ProductionPhaseId, string>;

const PHASE_RANK: Record<Phase | "filling", number> = {
  filling: 10,
  color: 20,
  shell: 30,
  fill: 40,
  cap: 50,
  unmould: 60,
  package: 70,
};

/** Per (day, plan) accumulator for production-step completions. */
interface PlanDayAcc {
  plan: ProductionPlan;
  /** phase → planProduct ids whose step for that phase was completed. */
  phases: Map<Phase, Set<string>>;
  fillingIds: Set<string>;
}

/** Resolve a `planStepStatus.stepKey` to what it represents. Plan-product ids
 *  are UUIDs (with hyphens), so the key is matched against the plan's known
 *  ids rather than split on "-". Decoration steps (`shell-after-…`) and
 *  anything unknown resolve to null and are ignored. */
export function parseStepKey(
  key: string,
  planProductIds: readonly string[],
  planFillingById: ReadonlyMap<string, PlanFilling>,
): { phase: Phase; planProductId: string } | { phase: "filling"; fillingId: string } | null {
  const dash = key.indexOf("-");
  if (dash < 0) return null;
  const prefix = key.slice(0, dash);
  const rest = key.slice(dash + 1);
  if (prefix === "filling") return rest ? { phase: "filling", fillingId: rest } : null;
  if (prefix === "planfilling") {
    const pf = planFillingById.get(rest);
    return pf ? { phase: "filling", fillingId: pf.fillingId } : null;
  }
  if (prefix === "color" || prefix === "shell" || prefix === "fill" || prefix === "cap" || prefix === "unmould" || prefix === "package") {
    const pbId = planProductIds.find((id) => rest === id || rest.startsWith(id + "-"));
    return pbId ? { phase: prefix, planProductId: pbId } : null;
  }
  return null;
}

/** Physical moulds a plan product occupies — primary plus any additional. */
function physicalMoulds(pb: PlanProduct): number {
  return pb.quantity + (pb.additionalMoulds ?? []).reduce((s, m) => s + m.quantity, 0);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function joinNames(names: Iterable<string>, max = 3): string {
  const list = [...new Set(names)].filter(Boolean);
  if (list.length <= max) return list.join(", ");
  return `${list.slice(0, max).join(", ")} +${list.length - max} more`;
}

function formatMoney(symbol: string, value: number): string {
  return `${symbol}${value.toFixed(2)}`;
}

function bucket<T>(map: Map<string, T[]>, iso: string | null, item: T): void {
  if (!iso) return;
  const list = map.get(iso);
  if (list) list.push(item);
  else map.set(iso, [item]);
}

/**
 * Derive the digest for every day that has any activity, in one pass over
 * each table. Returns a map keyed by ISO day; days without activity are
 * absent (use `emptyDigest` for those).
 */
export function computeDigestIndex(src: LogSources): Map<string, DayDigest> {
  const symbol = src.currencySymbol ?? "";
  const lines = new Map<string, DigestLine[]>();
  const add = (iso: string | null, line: DigestLine) => bucket(lines, iso, line);

  const productName = new Map<string, string>();
  for (const p of src.products ?? []) if (p.id) productName.set(p.id, p.name);
  const fillingName = new Map<string, string>();
  for (const f of src.fillings ?? []) if (f.id) fillingName.set(f.id, f.name);
  const mouldById = new Map<string, Mould>();
  for (const m of src.moulds ?? []) if (m.id) mouldById.set(m.id, m);
  const planById = new Map<string, ProductionPlan>();
  for (const p of src.plans ?? []) if (p.id) planById.set(p.id, p);
  const orderById = new Map<string, Order>();
  for (const o of src.orders ?? []) if (o.id) orderById.set(o.id, o);
  const planProductsByPlan = new Map<string, PlanProduct[]>();
  for (const pb of src.planProducts ?? []) bucket(planProductsByPlan, pb.planId, pb);
  const planProductById = new Map<string, PlanProduct>();
  for (const pb of src.planProducts ?? []) if (pb.id) planProductById.set(pb.id, pb);
  const planFillingById = new Map<string, PlanFilling>();
  for (const pf of src.planFillings ?? []) if (pf.id) planFillingById.set(pf.id, pf);

  const planLabel = (plan: ProductionPlan) => plan.batchNumber ? `${plan.name} · ${plan.batchNumber}` : plan.name;
  const planHref = (plan: ProductionPlan) => `/production/${encodeURIComponent(plan.id ?? "")}`;
  const piecesOf = (pb: PlanProduct) => pb.actualYield ?? getTotalCavities(pb, mouldById);

  // ── Workshop: production steps completed, grouped per day + plan ──
  const stepAcc = new Map<string, Map<string, PlanDayAcc>>(); // iso → planId → acc
  for (const st of src.stepStatuses ?? []) {
    if (!st.done || !st.doneAt) continue;
    const plan = planById.get(st.planId);
    if (!plan) continue;
    const iso = isoDayOf(st.doneAt);
    if (!iso) continue;
    const ids = (planProductsByPlan.get(st.planId) ?? []).map((pb) => pb.id!).filter(Boolean);
    const parsed = parseStepKey(st.stepKey, ids, planFillingById);
    if (!parsed) continue;
    let byPlan = stepAcc.get(iso);
    if (!byPlan) { byPlan = new Map(); stepAcc.set(iso, byPlan); }
    let acc = byPlan.get(st.planId);
    if (!acc) { acc = { plan, phases: new Map(), fillingIds: new Set() }; byPlan.set(st.planId, acc); }
    if (parsed.phase === "filling") {
      acc.fillingIds.add(parsed.fillingId);
    } else {
      let set = acc.phases.get(parsed.phase);
      if (!set) { set = new Set(); acc.phases.set(parsed.phase, set); }
      set.add(parsed.planProductId);
    }
  }
  for (const [iso, byPlan] of stepAcc) {
    for (const [planId, acc] of byPlan) {
      const suffix = planLabel(acc.plan);
      const href = planHref(acc.plan);
      if (acc.fillingIds.size > 0) {
        add(iso, {
          key: `step-filling-${planId}`, area: "workshop", rank: PHASE_RANK.filling, href,
          text: `Made ${plural(acc.fillingIds.size, "filling")}`,
          detail: `${joinNames([...acc.fillingIds].map((id) => fillingName.get(id) ?? "Unknown filling"))} · ${suffix}`,
        });
      }
      for (const [phase, pbIds] of acc.phases) {
        const pbs = [...pbIds].map((id) => planProductById.get(id)).filter((pb): pb is PlanProduct => !!pb);
        const moulds = pbs.reduce((s, pb) => s + physicalMoulds(pb), 0);
        const pieces = pbs.reduce((s, pb) => s + piecesOf(pb), 0);
        const names = joinNames(pbs.map((pb) => productName.get(pb.productId) ?? "Unknown product"));
        const text =
          phase === "color" ? `Coloured ${plural(moulds, "mould")}` :
          phase === "shell" ? `Cast shells in ${plural(moulds, "mould")}` :
          phase === "fill" ? `Filled ${plural(moulds, "mould")}` :
          phase === "cap" ? `Capped ${plural(moulds, "mould")}` :
          phase === "unmould" ? `Unmoulded ${plural(pieces, "piece")}` :
          `Packaged ${plural(pieces, "piece")}`;
        add(iso, { key: `step-${phase}-${planId}`, area: "workshop", rank: PHASE_RANK[phase], href, text, detail: `${names} · ${suffix}` });
      }
    }
  }

  // ── Workshop: batches started / finished ──
  for (const plan of src.plans ?? []) {
    if (!plan.id) continue;
    add(isoDayOf(plan.createdAt), {
      key: `plan-start-${plan.id}`, area: "workshop", rank: 5, href: planHref(plan),
      text: `Started batch ${plan.name}`,
      detail: plan.batchNumber,
    });
    if (plan.status === "done" && plan.completedAt) {
      const pbs = planProductsByPlan.get(plan.id) ?? [];
      const pieces = pbs.reduce((s, pb) => s + piecesOf(pb), 0);
      add(isoDayOf(plan.completedAt), {
        key: `plan-done-${plan.id}`, area: "workshop", rank: 80, href: planHref(plan),
        text: `Finished batch ${plan.name}`,
        detail: pieces > 0 ? `${plural(pieces, "piece")} into stock${plan.batchNumber ? ` · ${plan.batchNumber}` : ""}` : plan.batchNumber,
      });
    }
  }

  // ── Workshop: freezer moves on product batches ──
  for (const pb of src.planProducts ?? []) {
    if (!pb.id) continue;
    const name = productName.get(pb.productId) ?? "Unknown product";
    const plan = planById.get(pb.planId);
    const href = plan ? planHref(plan) : undefined;
    if (pb.frozenAt) {
      add(isoDayOf(pb.frozenAt), {
        key: `freeze-${pb.id}`, area: "workshop", rank: 90, href,
        text: `Froze ${name}`,
        detail: pb.frozenQty ? plural(pb.frozenQty, "piece") : undefined,
      });
    }
    if (pb.defrostedAt) {
      add(isoDayOf(pb.defrostedAt), { key: `defrost-${pb.id}`, area: "workshop", rank: 91, href, text: `Defrosted ${name}` });
    }
  }

  // ── Workshop: filling stock recorded by hand (plan-made stock is already
  //    covered by the "Made N fillings" step line) + freezer moves ──
  for (const fs of src.fillingStock ?? []) {
    if (!fs.id) continue;
    const name = fillingName.get(fs.fillingId) ?? "Unknown filling";
    if (!fs.planId) {
      add(isoDayOf(fs.madeAt), {
        key: `fillstock-${fs.id}`, area: "workshop", rank: 12, href: "/stock",
        text: `Recorded ${name} stock`,
        detail: `${Math.round(fs.remainingG)} g`,
      });
    }
    if (fs.frozenAt) {
      add(isoDayOf(fs.frozenAt), { key: `fillfreeze-${fs.id}`, area: "workshop", rank: 92, href: "/stock", text: `Froze ${name}` });
    }
    if (fs.defrostedAt) {
      add(isoDayOf(fs.defrostedAt), { key: `filldefrost-${fs.id}`, area: "workshop", rank: 93, href: "/stock", text: `Defrosted ${name}` });
    }
  }

  // ── Shop: boxes prepared / sold, give-aways ──
  const prepared = new Map<string, Sale[]>();
  const sold = new Map<string, Sale[]>();
  for (const s of src.sales ?? []) {
    bucket(prepared, isoDayOf(s.preparedAt), s);
    if (s.status === "sold" && s.soldAt) bucket(sold, isoDayOf(s.soldAt), s);
  }
  const piecesIn = (sales: Sale[]) => sales.reduce((n, s) => n + s.cells.filter(Boolean).length, 0);
  for (const [iso, list] of prepared) {
    add(iso, {
      key: "sales-prepared", area: "shop", rank: 10, href: "/shop",
      text: `Prepared ${plural(list.length, "box", "boxes")}`,
      detail: plural(piecesIn(list), "piece"),
    });
  }
  for (const [iso, list] of sold) {
    const revenue = list.reduce((n, s) => n + s.price, 0);
    add(iso, {
      key: "sales-sold", area: "shop", rank: 20, href: "/shop",
      text: `Sold ${plural(list.length, "box", "boxes")}`,
      detail: `${plural(piecesIn(list), "piece")} · ${formatMoney(symbol, revenue)}`,
    });
  }
  const giveaways = new Map<string, GiveAwayRecord[]>();
  for (const g of src.giveaways ?? []) bucket(giveaways, isoDayOf(g.at), g);
  for (const [iso, list] of giveaways) {
    const pieces = list.reduce((n, g) => n + g.pieceCount, 0);
    const reasons = joinNames(list.map((g) => GIVE_AWAY_REASONS.find((r) => r.value === g.reason)?.label ?? g.reason));
    add(iso, {
      key: "giveaways", area: "shop", rank: 30, href: "/shop/giveaways",
      text: `Gave away ${plural(pieces, "piece")}`,
      detail: reasons || undefined,
    });
  }

  // ── Orders: captured, happening, customers added ──
  for (const o of src.orders ?? []) {
    if (!o.id) continue;
    const href = `/orders/${encodeURIComponent(o.id)}`;
    add(isoDayOf(o.createdAt), {
      key: `order-new-${o.id}`, area: "orders", rank: 10, href,
      text: `New order: ${o.title}`,
      detail: ORDER_STATUS_LABEL[o.status],
    });
    if (o.status !== "cancelled") {
      const days = Math.min(eventLengthDays(o), 62);
      for (let i = 0; i < days; i++) {
        add(shiftISODate(o.eventDate, i), {
          key: `order-event-${o.id}`, area: "orders", rank: 5, href,
          text: `Event: ${o.title}`,
          detail: days > 1 ? `Day ${i + 1} of ${days} · ${ORDER_STATUS_LABEL[o.status]}` : ORDER_STATUS_LABEL[o.status],
        });
      }
    }
  }
  for (const c of src.customers ?? []) {
    if (!c.id) continue;
    add(isoDayOf(c.createdAt), {
      key: `customer-${c.id}`, area: "orders", rank: 20, href: `/orders/customers/${encodeURIComponent(c.id)}`,
      text: `New customer: ${c.name}`,
    });
  }

  // ── Schedule: production phase dates + prep tasks ──
  for (const pd of src.planPhaseDates ?? []) {
    if (!pd.id || !isSchedulablePhaseRow(pd)) continue;
    const plan = planById.get(pd.planId);
    const phaseLabel = pd.coating
      ? `${SCHEDULE_PHASE_LABEL[pd.phase]} · ${pd.coating}`
      : SCHEDULE_PHASE_LABEL[pd.phase];
    add(pd.scheduledDate, {
      key: `phase-date-${pd.id}`, area: "schedule", rank: 10,
      href: `/production/${encodeURIComponent(pd.planId)}?tab=${pd.phase}`,
      text: `Scheduled: ${phaseLabel}`,
      detail: plan ? planLabel(plan) : undefined,
    });
  }
  for (const t of src.prepTasks ?? []) {
    if (!t.id) continue;
    let href: string | undefined;
    let linkedTo: string | undefined;
    if (t.orderId) {
      href = `/orders/${encodeURIComponent(t.orderId)}`;
      linkedTo = orderById.get(t.orderId)?.title;
    } else if (t.planId) {
      const plan = planById.get(t.planId);
      href = `/production/${encodeURIComponent(t.planId)}`;
      linkedTo = plan ? planLabel(plan) : undefined;
    }
    add(t.scheduledDate, {
      key: `task-${t.id}`, area: "schedule", rank: 20, href,
      text: t.done ? `Done: ${t.title}` : `Task: ${t.title}`,
      detail: [linkedTo, t.notes].filter(Boolean).join(" · ") || undefined,
    });
  }

  // ── Lab: experiments started or forked ──
  for (const e of src.experiments ?? []) {
    if (!e.id) continue;
    const forked = (e.version ?? 1) > 1;
    add(isoDayOf(e.createdAt), {
      key: `experiment-${e.id}`, area: "lab", rank: 10, href: `/calculator/${encodeURIComponent(e.id)}`,
      text: forked ? `Forked experiment: ${e.name}` : `New experiment: ${e.name}`,
      detail: forked ? `Version ${e.version}` : undefined,
    });
  }

  // ── Pantry: recipes, products, moulds, purchases, prices, shopping ──
  for (const f of src.fillings ?? []) {
    if (!f.id || !f.createdAt) continue;
    const versioned = (f.version ?? 1) > 1;
    add(isoDayOf(f.createdAt), {
      key: `filling-new-${f.id}`, area: "pantry", rank: 10, href: `/fillings/${encodeURIComponent(f.id)}`,
      text: versioned ? `New version of ${f.name}` : `New filling recipe: ${f.name}`,
      detail: versioned ? `Version ${f.version}` : f.category || undefined,
    });
  }
  for (const p of src.products ?? []) {
    if (!p.id) continue;
    add(isoDayOf(p.createdAt), {
      key: `product-new-${p.id}`, area: "pantry", rank: 20, href: `/products/${encodeURIComponent(p.id)}`,
      text: `New product: ${p.name}`,
    });
  }
  const counted = new Map<string, Omit<Product, "photo">[]>();
  for (const p of src.products ?? []) if (p.id && p.stockCountedAt) bucket(counted, isoDayOf(p.stockCountedAt), p);
  for (const [iso, list] of counted) {
    add(iso, {
      key: "stock-count", area: "pantry", rank: 25, href: "/stock",
      text: `Counted stock of ${plural(list.length, "product")}`,
      detail: joinNames(list.map((p) => p.name)),
    });
  }
  for (const m of src.moulds ?? []) {
    if (!m.id || !m.createdAt) continue;
    add(isoDayOf(m.createdAt), {
      key: `mould-new-${m.id}`, area: "pantry", rank: 30, href: `/moulds/${encodeURIComponent(m.id)}`,
      text: `New mould: ${m.name}`,
    });
  }
  const ingredientName = new Map<string, string>();
  for (const i of src.ingredients ?? []) if (i.id) ingredientName.set(i.id, i.name);
  const bought = new Map<string, Ingredient[]>();
  for (const i of src.ingredients ?? []) if (i.id && i.purchaseDate) bucket(bought, isoDayOf(i.purchaseDate), i);
  for (const [iso, list] of bought) {
    add(iso, {
      key: "ingredients-bought", area: "pantry", rank: 40, href: "/ingredients",
      text: `Bought ${plural(list.length, "ingredient")}`,
      detail: joinNames(list.map((i) => i.name)),
    });
  }
  const priced = new Map<string, IngredientPriceHistory[]>();
  for (const h of src.priceHistory ?? []) bucket(priced, isoDayOf(h.recordedAt), h);
  for (const [iso, list] of priced) {
    const names = [...new Set(list.map((h) => ingredientName.get(h.ingredientId) ?? "Unknown ingredient"))];
    add(iso, {
      key: "prices", area: "pantry", rank: 45, href: "/ingredients",
      text: `Updated ${plural(names.length, "ingredient price")}`,
      detail: joinNames(names),
    });
  }
  const packagingName = new Map<string, string>();
  for (const p of src.packaging ?? []) if (p.id) packagingName.set(p.id, p.name);
  for (const po of src.packagingOrders ?? []) {
    if (!po.id) continue;
    add(isoDayOf(po.orderedAt), {
      key: `packaging-order-${po.id}`, area: "pantry", rank: 50, href: `/packaging/${encodeURIComponent(po.packagingId)}`,
      text: `Ordered ${po.quantity} × ${packagingName.get(po.packagingId) ?? "packaging"}`,
      detail: po.supplier || undefined,
    });
  }
  const shopAdded = new Map<string, ShoppingItem[]>();
  const shopOrdered = new Map<string, ShoppingItem[]>();
  for (const s of src.shoppingItems ?? []) {
    bucket(shopAdded, isoDayOf(s.addedAt), s);
    if (s.orderedAt) bucket(shopOrdered, isoDayOf(s.orderedAt), s);
  }
  for (const [iso, list] of shopAdded) {
    add(iso, {
      key: "shopping-added", area: "pantry", rank: 60, href: "/shopping",
      text: `Added ${plural(list.length, "item")} to the shopping list`,
      detail: joinNames(list.map((s) => s.name)),
    });
  }
  for (const [iso, list] of shopOrdered) {
    add(iso, {
      key: "shopping-ordered", area: "pantry", rank: 61, href: "/shopping",
      text: `Ordered ${plural(list.length, "shopping item")}`,
      detail: joinNames(list.map((s) => s.name)),
    });
  }

  // ── Assemble ──
  const out = new Map<string, DayDigest>();
  for (const [iso, dayLines] of lines) {
    const digest = emptyDigest(iso);
    // Stable sort: ties keep insertion order (the order rows came out of the
    // tables), so two orders captured the same day stay in creation order.
    digest.lines = dayLines.sort(
      (a, b) => LOG_AREAS.indexOf(a.area) - LOG_AREAS.indexOf(b.area) || a.rank - b.rank,
    );
    for (const l of digest.lines) digest.counts[l.area]++;
    out.set(iso, digest);
  }
  return out;
}

/** Convenience for a single day. */
export function computeDayDigest(iso: string, src: LogSources): DayDigest {
  return computeDigestIndex(src).get(iso) ?? emptyDigest(iso);
}

/** "Coloured 6 moulds · Sold 2 boxes · New order: Popup" — the first `max`
 *  lines, then "+N more". Empty string when nothing happened. */
export function digestHeadline(digest: DayDigest, max = 3): string {
  const texts = digest.lines.slice(0, max).map((l) => l.text);
  const rest = digest.lines.length - texts.length;
  if (rest > 0) texts.push(`+${rest} more`);
  return texts.join(" · ");
}

// ─── Entries & days ──────────────────────────────────────────────────────────

/** Entries keyed by day, each day's list oldest-first. */
export function entriesByDate(entries: readonly LogEntry[]): Map<string, LogEntry[]> {
  const map = new Map<string, LogEntry[]>();
  for (const e of entries) bucket(map, e.date, e);
  for (const list of map.values()) {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return map;
}

/** The `LogDay` row for each date. If duplicates ever arrive through sync, the
 *  most recently updated wins. */
export function logDayByDate(days: readonly LogDay[]): Map<string, LogDay> {
  const map = new Map<string, LogDay>();
  for (const d of days) {
    const existing = map.get(d.date);
    if (!existing || new Date(d.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) map.set(d.date, d);
  }
  return map;
}

/** "21°C · 55% RH" or null when neither value is recorded. */
export function formatConditions(day: Pick<LogDay, "ambientTempC" | "humidityPct"> | undefined): string | null {
  if (!day) return null;
  const parts: string[] = [];
  if (day.ambientTempC != null) parts.push(`${day.ambientTempC}°C`);
  if (day.humidityPct != null) parts.push(`${day.humidityPct}% RH`);
  return parts.length ? parts.join(" · ") : null;
}

export interface LogDaySummary {
  date: string;
  digest: DayDigest;
  entries: LogEntry[];
  day?: LogDay;
}

export type LogPeriod = "30d" | "90d" | "12mo" | "all";

const PERIOD_DAYS: Record<Exclude<LogPeriod, "all">, number> = { "30d": 30, "90d": 90, "12mo": 365 };

export interface LogListFilter {
  todayISO: string;
  period?: LogPeriod;
  /** Only days that carry at least one written note. */
  notesOnly?: boolean;
  /** Case-insensitive match against note bodies and digest line text/detail. */
  search?: string;
}

/**
 * Every day worth showing in the list — any day with activity, a note, or
 * recorded conditions — newest first. Days after `todayISO` are never listed:
 * the Log is a record of what happened, so an upcoming order's event day only
 * appears once it arrives (the Orders calendar is where the future lives).
 */
export function logDaysForList(
  digests: ReadonlyMap<string, DayDigest>,
  entries: readonly LogEntry[],
  days: readonly LogDay[],
  filter: LogListFilter,
): LogDaySummary[] {
  const byDate = entriesByDate(entries);
  const dayRows = logDayByDate(days);
  const dates = new Set<string>([...digests.keys(), ...byDate.keys(), ...dayRows.keys()]);
  const period = filter.period ?? "all";
  const cutoff = period === "all" ? null : shiftISODate(filter.todayISO, -PERIOD_DAYS[period]);
  const q = filter.search?.trim().toLowerCase() ?? "";

  const out: LogDaySummary[] = [];
  for (const date of dates) {
    if (date > filter.todayISO) continue;
    if (cutoff && date < cutoff) continue;
    const digest = digests.get(date) ?? emptyDigest(date);
    const dayEntries = byDate.get(date) ?? [];
    const day = dayRows.get(date);
    if (filter.notesOnly && dayEntries.length === 0) continue;
    if (q) {
      const hit =
        dayEntries.some((e) => e.body.toLowerCase().includes(q)) ||
        digest.lines.some((l) => l.text.toLowerCase().includes(q) || (l.detail ?? "").toLowerCase().includes(q));
      if (!hit) continue;
    }
    if (digest.lines.length === 0 && dayEntries.length === 0 && !formatConditions(day)) continue;
    out.push({ date, digest, entries: dayEntries, day });
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

export interface LogMonthGroup {
  /** "2026-09" */
  key: string;
  /** "September 2026" */
  label: string;
  days: LogDaySummary[];
}

/** Section a newest-first day list by month, preserving order. */
export function groupLogDaysByMonth(days: readonly LogDaySummary[]): LogMonthGroup[] {
  const groups: LogMonthGroup[] = [];
  for (const d of days) {
    const key = d.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.days.push(d);
    else groups.push({ key, label: monthLabel(d.date), days: [d] });
  }
  return groups;
}

/** Whole-number sanitiser for the conditions inputs: "" → undefined, "21,5" →
 *  21.5, garbage → undefined. */
export function parseConditionValue(raw: string): number | undefined {
  const t = raw.trim().replace(",", ".");
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}
