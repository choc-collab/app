import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface UsedInItem {
  id: string;
  name: string;
  href: string;
  /** base64 photo — displayed as a rounded thumbnail when provided */
  photo?: string;
  /** icon element shown in place of a photo thumbnail (e.g. <Fillings />) */
  icon?: React.ReactNode;
  /** optional names shown as smaller sub-labels beneath the item name */
  subItems?: string[];
}

interface UsedInPanelProps {
  /** Singular noun for the item type, e.g. "filling" */
  singular: string;
  /** Plural noun for the item type, e.g. "fillings" */
  plural: string;
  items: UsedInItem[];
  /** Message shown when there are no items */
  emptyMessage?: string;
  className?: string;
}

/**
 * Reusable "Used in …" panel for pantry detail pages.
 *
 * Used on:
 *   - Ingredient detail  → "Used in N fillings"  (icon variant + product sub-labels)
 *   - Filling detail       → "Used in N products" (photo/avatar variant)
 *   - Decoration detail  → "Used in N products" (photo/avatar variant)
 */
export function UsedInPanel({ singular, plural, items, emptyMessage, className }: UsedInPanelProps) {
  const count = items.length;
  const heading =
    count === 0
      ? `Used in no ${plural}`
      : `Used in ${count} ${count === 1 ? singular : plural}`;

  return (
    <div className={className}>
      <h2 className="text-sm font-medium text-muted-foreground mb-2">{heading}</h2>

      {count > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="flex items-center gap-3 rounded-lg border border-border bg-card p-3"
              >
                {/* Thumbnail: photo > icon > initial-letter avatar */}
                {item.photo ? (
                  <img
                    src={item.photo}
                    alt={item.name}
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-md object-cover shrink-0"
                  />
                ) : item.icon ? (
                  <span className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5 flex items-center">
                    {item.icon}
                  </span>
                ) : (
                  <div className="w-8 h-8 rounded-md bg-muted shrink-0 flex items-center justify-center text-muted-foreground text-sm font-medium">
                    {item.name.charAt(0)}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  {item.subItems && item.subItems.length > 0 && (
                    <div className="mt-1 space-y-0.5">
                      {item.subItems.map((sub, i) => (
                        <p key={i} className="text-xs text-muted-foreground truncate">
                          · {sub}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                <ChevronRight aria-hidden="true" className="w-4 h-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      {count === 0 && emptyMessage && (
        <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
      )}
    </div>
  );
}
