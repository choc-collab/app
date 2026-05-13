/**
 * Curated catalog of social networks supported by the label `socials` field
 * and the settings → Links picker.
 *
 * The catalog is shared by:
 *   - `settings/page.tsx` — the Brand → Links editor renders a dropdown of
 *     these entries (plus a "Custom…" escape hatch for niche networks).
 *   - `labelSvg.ts` — the renderer matches `BrandSocial.label` against this
 *     catalog (and a short alias list) to substitute the matching SVG icon.
 *
 * Adding a network requires:
 *   1) A new entry here.
 *   2) A matching `id` key in `labelSvg.ts`'s `SOCIAL_ICONS` map with the
 *      icon's path data.
 */

export interface SocialNetworkDef {
  /** Stable identifier — also the key used in the renderer's icon map.
   *  Lowercase, no spaces. Changing this in a new release is a migration. */
  id: string;
  /** Display name shown in the settings dropdown and (case-insensitively)
   *  matched at render time. Free to be capitalised / spaced for the user. */
  label: string;
  /** Optional placeholder text for the URL/handle input when this network is
   *  selected — purely a UX nudge, not validated. */
  placeholder?: string;
}

export const SOCIAL_NETWORKS: ReadonlyArray<SocialNetworkDef> = [
  { id: "instagram", label: "Instagram", placeholder: "@yourhandle" },
  { id: "facebook",  label: "Facebook",  placeholder: "facebook.com/yourpage" },
  { id: "x",         label: "X",         placeholder: "@yourhandle" },
  { id: "tiktok",    label: "TikTok",    placeholder: "@yourhandle" },
  { id: "youtube",   label: "YouTube",   placeholder: "youtube.com/@channel" },
  { id: "linkedin",  label: "LinkedIn",  placeholder: "linkedin.com/in/you" },
  { id: "whatsapp",  label: "WhatsApp",  placeholder: "+31 6 12345678" },
  { id: "email",     label: "Email",     placeholder: "hello@example.com" },
  { id: "phone",     label: "Phone",     placeholder: "+31 6 12345678" },
  { id: "globe",     label: "Website",   placeholder: "example.com" },
];

/** Lookup the catalog entry whose label or id matches the given string
 *  (case-insensitive). Used by the settings picker to detect whether a stored
 *  social entry came from the dropdown or is free-form custom text. */
export function findSocialNetwork(label: string | undefined | null): SocialNetworkDef | null {
  if (!label) return null;
  const key = label.trim().toLowerCase();
  return SOCIAL_NETWORKS.find((n) => n.id === key || n.label.toLowerCase() === key) ?? null;
}
