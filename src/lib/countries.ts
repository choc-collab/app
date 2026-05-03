/**
 * ISO 3166-1 country list with common aliases, used by:
 *   - The Choccy Chat join form (datalist of canonical names)
 *   - The admin edit drawer (same datalist)
 *   - The Worker submit/update endpoints (server-side normalisation)
 *
 * The Worker has its own copy at worker/src/countries.ts because it lives in a
 * separate package; if you change anything here, mirror it there too.
 *
 * "Canonical name" = what we store in the database. Aliases (case-insensitive)
 * map to the canonical name on submit.
 */

export type Country = {
  /** Canonical display name. Stored verbatim in D1. */
  name: string;
  /** ISO 3166-1 alpha-2 code. */
  code: string;
  /**
   * Lowercase alternate spellings / abbreviations / informal names that should
   * normalise to {@link name}. The canonical name and code are added implicitly.
   */
  aliases?: string[];
};

export const COUNTRIES: readonly Country[] = [
  { name: "Afghanistan", code: "AF" },
  { name: "Albania", code: "AL" },
  { name: "Algeria", code: "DZ" },
  { name: "Andorra", code: "AD" },
  { name: "Angola", code: "AO" },
  { name: "Antigua and Barbuda", code: "AG" },
  { name: "Argentina", code: "AR" },
  { name: "Armenia", code: "AM" },
  { name: "Australia", code: "AU", aliases: ["aus"] },
  { name: "Austria", code: "AT" },
  { name: "Azerbaijan", code: "AZ" },
  { name: "Bahamas", code: "BS", aliases: ["the bahamas"] },
  { name: "Bahrain", code: "BH" },
  { name: "Bangladesh", code: "BD" },
  { name: "Barbados", code: "BB" },
  { name: "Belarus", code: "BY" },
  { name: "Belgium", code: "BE" },
  { name: "Belize", code: "BZ" },
  { name: "Benin", code: "BJ" },
  { name: "Bhutan", code: "BT" },
  { name: "Bolivia", code: "BO" },
  { name: "Bosnia and Herzegovina", code: "BA", aliases: ["bosnia"] },
  { name: "Botswana", code: "BW" },
  { name: "Brazil", code: "BR", aliases: ["bra"] },
  { name: "Brunei", code: "BN", aliases: ["brunei darussalam"] },
  { name: "Bulgaria", code: "BG" },
  { name: "Burkina Faso", code: "BF" },
  { name: "Burundi", code: "BI" },
  { name: "Cambodia", code: "KH" },
  { name: "Cameroon", code: "CM" },
  { name: "Canada", code: "CA", aliases: ["can"] },
  { name: "Cape Verde", code: "CV", aliases: ["cabo verde"] },
  { name: "Central African Republic", code: "CF" },
  { name: "Chad", code: "TD" },
  { name: "Chile", code: "CL" },
  { name: "China", code: "CN", aliases: ["prc", "people's republic of china"] },
  { name: "Colombia", code: "CO" },
  { name: "Comoros", code: "KM" },
  { name: "Congo", code: "CG", aliases: ["republic of the congo", "congo-brazzaville"] },
  {
    name: "Democratic Republic of the Congo",
    code: "CD",
    aliases: ["dr congo", "drc", "congo-kinshasa", "zaire"],
  },
  { name: "Costa Rica", code: "CR" },
  { name: "Côte d'Ivoire", code: "CI", aliases: ["cote d'ivoire", "ivory coast"] },
  { name: "Croatia", code: "HR" },
  { name: "Cuba", code: "CU" },
  { name: "Cyprus", code: "CY" },
  { name: "Czechia", code: "CZ", aliases: ["czech republic"] },
  { name: "Denmark", code: "DK" },
  { name: "Djibouti", code: "DJ" },
  { name: "Dominica", code: "DM" },
  { name: "Dominican Republic", code: "DO" },
  { name: "Ecuador", code: "EC" },
  { name: "Egypt", code: "EG" },
  { name: "El Salvador", code: "SV" },
  { name: "Equatorial Guinea", code: "GQ" },
  { name: "Eritrea", code: "ER" },
  { name: "Estonia", code: "EE" },
  { name: "Eswatini", code: "SZ", aliases: ["swaziland"] },
  { name: "Ethiopia", code: "ET" },
  { name: "Fiji", code: "FJ" },
  { name: "Finland", code: "FI" },
  { name: "France", code: "FR", aliases: ["fra"] },
  { name: "Gabon", code: "GA" },
  { name: "Gambia", code: "GM", aliases: ["the gambia"] },
  { name: "Georgia", code: "GE" },
  { name: "Germany", code: "DE", aliases: ["deu", "ger", "deutschland"] },
  { name: "Ghana", code: "GH" },
  { name: "Greece", code: "GR" },
  { name: "Grenada", code: "GD" },
  { name: "Guatemala", code: "GT" },
  { name: "Guinea", code: "GN" },
  { name: "Guinea-Bissau", code: "GW" },
  { name: "Guyana", code: "GY" },
  { name: "Haiti", code: "HT" },
  { name: "Honduras", code: "HN" },
  { name: "Hong Kong", code: "HK", aliases: ["hong kong sar"] },
  { name: "Hungary", code: "HU" },
  { name: "Iceland", code: "IS" },
  { name: "India", code: "IN", aliases: ["ind"] },
  { name: "Indonesia", code: "ID" },
  { name: "Iran", code: "IR" },
  { name: "Iraq", code: "IQ" },
  { name: "Ireland", code: "IE", aliases: ["republic of ireland", "eire"] },
  { name: "Israel", code: "IL" },
  { name: "Italy", code: "IT", aliases: ["ita", "italia"] },
  { name: "Jamaica", code: "JM" },
  { name: "Japan", code: "JP", aliases: ["jpn", "nihon", "nippon"] },
  { name: "Jordan", code: "JO" },
  { name: "Kazakhstan", code: "KZ" },
  { name: "Kenya", code: "KE" },
  { name: "Kiribati", code: "KI" },
  { name: "Kuwait", code: "KW" },
  { name: "Kyrgyzstan", code: "KG" },
  { name: "Laos", code: "LA" },
  { name: "Latvia", code: "LV" },
  { name: "Lebanon", code: "LB" },
  { name: "Lesotho", code: "LS" },
  { name: "Liberia", code: "LR" },
  { name: "Libya", code: "LY" },
  { name: "Liechtenstein", code: "LI" },
  { name: "Lithuania", code: "LT" },
  { name: "Luxembourg", code: "LU" },
  { name: "Madagascar", code: "MG" },
  { name: "Malawi", code: "MW" },
  { name: "Malaysia", code: "MY" },
  { name: "Maldives", code: "MV" },
  { name: "Mali", code: "ML" },
  { name: "Malta", code: "MT" },
  { name: "Marshall Islands", code: "MH" },
  { name: "Mauritania", code: "MR" },
  { name: "Mauritius", code: "MU" },
  { name: "Mexico", code: "MX" },
  { name: "Micronesia", code: "FM" },
  { name: "Moldova", code: "MD" },
  { name: "Monaco", code: "MC" },
  { name: "Mongolia", code: "MN" },
  { name: "Montenegro", code: "ME" },
  { name: "Morocco", code: "MA" },
  { name: "Mozambique", code: "MZ" },
  { name: "Myanmar", code: "MM", aliases: ["burma"] },
  { name: "Namibia", code: "NA" },
  { name: "Nauru", code: "NR" },
  { name: "Nepal", code: "NP" },
  {
    name: "Netherlands",
    code: "NL",
    aliases: ["the netherlands", "holland", "nl", "nld"],
  },
  { name: "New Zealand", code: "NZ", aliases: ["aotearoa", "nz"] },
  { name: "Nicaragua", code: "NI" },
  { name: "Niger", code: "NE" },
  { name: "Nigeria", code: "NG" },
  { name: "North Korea", code: "KP", aliases: ["dprk"] },
  { name: "North Macedonia", code: "MK", aliases: ["macedonia"] },
  { name: "Norway", code: "NO" },
  { name: "Oman", code: "OM" },
  { name: "Pakistan", code: "PK" },
  { name: "Palau", code: "PW" },
  { name: "Palestine", code: "PS", aliases: ["state of palestine"] },
  { name: "Panama", code: "PA" },
  { name: "Papua New Guinea", code: "PG" },
  { name: "Paraguay", code: "PY" },
  { name: "Peru", code: "PE" },
  { name: "Philippines", code: "PH", aliases: ["the philippines"] },
  { name: "Poland", code: "PL" },
  { name: "Portugal", code: "PT" },
  { name: "Qatar", code: "QA" },
  { name: "Romania", code: "RO" },
  { name: "Russia", code: "RU", aliases: ["russian federation"] },
  { name: "Rwanda", code: "RW" },
  { name: "Saint Kitts and Nevis", code: "KN" },
  { name: "Saint Lucia", code: "LC" },
  { name: "Saint Vincent and the Grenadines", code: "VC" },
  { name: "Samoa", code: "WS" },
  { name: "San Marino", code: "SM" },
  { name: "Sao Tome and Principe", code: "ST" },
  { name: "Saudi Arabia", code: "SA" },
  { name: "Senegal", code: "SN" },
  { name: "Serbia", code: "RS" },
  { name: "Seychelles", code: "SC" },
  { name: "Sierra Leone", code: "SL" },
  { name: "Singapore", code: "SG" },
  { name: "Slovakia", code: "SK" },
  { name: "Slovenia", code: "SI" },
  { name: "Solomon Islands", code: "SB" },
  { name: "Somalia", code: "SO" },
  { name: "South Africa", code: "ZA", aliases: ["rsa"] },
  { name: "South Korea", code: "KR", aliases: ["korea", "republic of korea"] },
  { name: "South Sudan", code: "SS" },
  { name: "Spain", code: "ES", aliases: ["esp", "españa", "espana"] },
  { name: "Sri Lanka", code: "LK" },
  { name: "Sudan", code: "SD" },
  { name: "Suriname", code: "SR" },
  { name: "Sweden", code: "SE", aliases: ["swe", "sverige"] },
  {
    name: "Switzerland",
    code: "CH",
    aliases: ["che", "swiss", "schweiz", "suisse", "svizzera"],
  },
  { name: "Syria", code: "SY" },
  { name: "Taiwan", code: "TW", aliases: ["roc"] },
  { name: "Tajikistan", code: "TJ" },
  { name: "Tanzania", code: "TZ" },
  { name: "Thailand", code: "TH" },
  { name: "Timor-Leste", code: "TL", aliases: ["east timor"] },
  { name: "Togo", code: "TG" },
  { name: "Tonga", code: "TO" },
  { name: "Trinidad and Tobago", code: "TT" },
  { name: "Tunisia", code: "TN" },
  { name: "Turkey", code: "TR", aliases: ["türkiye", "turkiye"] },
  { name: "Turkmenistan", code: "TM" },
  { name: "Tuvalu", code: "TV" },
  { name: "Uganda", code: "UG" },
  { name: "Ukraine", code: "UA" },
  { name: "United Arab Emirates", code: "AE", aliases: ["uae"] },
  {
    name: "United Kingdom",
    code: "GB",
    aliases: [
      "uk",
      "great britain",
      "britain",
      "england",
      "scotland",
      "wales",
      "northern ireland",
      "u.k.",
    ],
  },
  {
    name: "United States",
    code: "US",
    aliases: [
      "usa",
      "united states of america",
      "america",
      "u.s.",
      "u.s.a.",
    ],
  },
  { name: "Uruguay", code: "UY" },
  { name: "Uzbekistan", code: "UZ" },
  { name: "Vanuatu", code: "VU" },
  { name: "Vatican City", code: "VA", aliases: ["holy see"] },
  { name: "Venezuela", code: "VE" },
  { name: "Vietnam", code: "VN", aliases: ["viet nam"] },
  { name: "Yemen", code: "YE" },
  { name: "Zambia", code: "ZM" },
  { name: "Zimbabwe", code: "ZW" },
];

const LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const c of COUNTRIES) {
    m.set(c.name.toLowerCase(), c.name);
    m.set(c.code.toLowerCase(), c.name);
    for (const a of c.aliases ?? []) m.set(a.toLowerCase(), c.name);
  }
  return m;
})();

/**
 * Map any reasonable spelling/abbreviation to the canonical country name.
 * Returns null if nothing matches — caller should reject the input.
 */
export function normalizeCountryInput(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const key = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

/** Just the canonical names — used to populate the join form's <datalist>. */
export const COUNTRY_NAMES: readonly string[] = COUNTRIES.map((c) => c.name);
