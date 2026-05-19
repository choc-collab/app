import type { Brand, BrandSocial } from "@/types";

/**
 * Defensive sanitiser for the `brand` field on UserPreferences when read back
 * from Dexie / Dexie Cloud sync. Every field on `Brand` is typed `string |
 * undefined` (or `BrandSocial[]`), but two distinct things can land a
 * non-string value on read:
 *
 * 1. Actual corruption — a pre-`fix for logo` build could store a Blob or
 *    arbitrary object directly in `logo`. Render those as `<img src="[object
 *    Object]">` and you get a broken-picture icon plus a torn hydration tree.
 *    We coerce these to `undefined` AND set `repaired` so the caller can
 *    self-heal the bad row.
 *
 * 2. Transient Dexie Cloud blob offloading — any string longer than
 *    `largeStringThreshold` (default 32 KB; a downscaled logo data URL
 *    easily clears this) is uploaded as a separate blob during sync. While
 *    the upload is in flight, the field temporarily holds a `BlobRef`
 *    (shape `{ _bt: "string", ref, size }`) or a serialized TSONRef
 *    (`{ type, ref, size }`) until `blobResolveMiddleware` downloads the
 *    blob and restores the original string. These must NOT be treated as
 *    corruption — otherwise the self-heal fires and overwrites the cloud
 *    row's logo before the blob ever resolves, permanently destroying it.
 *    Coerce to `undefined` for display so React doesn't render
 *    `<img src="[object Object]">`, but leave `repaired` untouched so the
 *    underlying row sits intact until the blob resolver completes.
 */
function isDexieCloudBlobRef(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o._bt === "string" && typeof o.ref === "string") return true;
  if (typeof o.type === "string" && typeof o.ref === "string" && typeof o.size === "number") return true;
  return false;
}

export function sanitizeBrand(raw: unknown): { brand: Brand; repaired: boolean } {
  if (raw == null || typeof raw !== "object") {
    return { brand: {}, repaired: raw != null };
  }
  const r = raw as Record<string, unknown>;
  let repaired = false;

  const takeString = (v: unknown): string | undefined => {
    if (v === undefined) return undefined;
    if (typeof v === "string") return v;
    if (isDexieCloudBlobRef(v)) return undefined;
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
