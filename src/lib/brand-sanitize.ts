import type { Brand, BrandSocial } from "@/types";

/**
 * Defensive sanitiser for the `brand` field on UserPreferences when read back
 * from Dexie / Dexie Cloud sync. Every field on `Brand` is typed `string |
 * undefined` (or `BrandSocial[]`), but a pre-`fix for logo` build could land
 * a row with `logo` as a non-string when the FileReader-derived data URL
 * exceeded Dexie Cloud's per-row size limit and the partial write replicated
 * down to other devices. Once a bad row exists on the server it re-syncs to
 * every signed-in device — so we coerce non-string values to `undefined` on
 * read rather than letting React stringify them into `<img src="[object
 * Object]">` (which both shows a broken-picture icon and tears the page's
 * hydration tree).
 *
 * Returns the cleaned brand plus a `repaired` flag so the caller can fire a
 * one-shot self-heal `setBrand(cleaned)` to overwrite the bad row in
 * Dexie Cloud and stop the bug spreading further.
 */
export function sanitizeBrand(raw: unknown): { brand: Brand; repaired: boolean } {
  if (raw == null || typeof raw !== "object") {
    return { brand: {}, repaired: raw != null };
  }
  const r = raw as Record<string, unknown>;
  let repaired = false;

  const takeString = (v: unknown): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v === "string") return v;
    repaired = true;
    return undefined;
  };

  const cleaned: Brand = {};
  const name = takeString(r.name);
  if (name !== undefined) cleaned.name = name;
  const address = takeString(r.address);
  if (address !== undefined) cleaned.address = address;
  const contact = takeString(r.contact);
  if (contact !== undefined) cleaned.contact = contact;
  const logo = takeString(r.logo);
  if (logo !== undefined) cleaned.logo = logo;
  const vatNumber = takeString(r.vatNumber);
  if (vatNumber !== undefined) cleaned.vatNumber = vatNumber;

  if (r.socials !== undefined) {
    if (Array.isArray(r.socials)) {
      const socials: BrandSocial[] = [];
      for (const entry of r.socials) {
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          const labelOk = typeof e.label === "string";
          const urlOk = typeof e.url === "string";
          if (!labelOk || !urlOk) repaired = true;
          socials.push({
            label: labelOk ? (e.label as string) : "",
            url: urlOk ? (e.url as string) : "",
          });
        } else {
          repaired = true;
        }
      }
      cleaned.socials = socials;
    } else {
      repaired = true;
    }
  }

  return { brand: cleaned, repaired };
}
