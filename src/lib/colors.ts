/**
 * Map of cocoa butter / food color names to CSS hex values.
 * Covers names that are NOT valid CSS named colors, or where the CSS named
 * color doesn't match the chocolatier's expectation (e.g. "gold" in CSS is
 * #FFD700 but cocoa butter gold is darker/warmer).
 */
export const COLOR_CSS: Record<string, string> = {
  // Neutrals
  black: "#1c1917",
  white: "#faf9f7",
  ivory: "#fffff0",
  cream: "#fffdd0",
  silver: "#a8a9ad",
  charcoal: "#36454f",

  // Metallics
  gold: "#d4a017",
  copper: "#b87333",
  bronze: "#cd7f32",
  champagne: "#f7e7ce",
  platinum: "#e5e4e2",

  // Warm tones
  red: "#c0392b",
  ruby: "#9b111e",
  burgundy: "#800020",
  raspberry: "#e30b5c",
  cherry: "#de3163",
  rose: "#e8a0bf",
  pink: "#e91e8a",
  blush: "#de5d83",
  ginger: "#b06500",
  amber: "#cf8a00",
  caramel: "#a0522d",
  cinnamon: "#d2691e",
  rust: "#b7410e",
  terracotta: "#cc5533",

  // Cool tones
  blue: "#2980b9",
  navy: "#1b2a4a",
  teal: "#008080",
  turquoise: "#40e0d0",
  cobalt: "#0047ab",
  sky: "#87ceeb",

  // Greens
  green: "#27ae60",
  pistachio: "#93c572",
  olive: "#808000",
  mint: "#98fb98",
  emerald: "#50c878",
  sage: "#9caf88",

  // Warm accent
  orange: "#e67e22",
  tangerine: "#ff9966",
  peach: "#ffcba4",
  apricot: "#fbceb1",
  coral: "#ff6f61",
  sunset: "#fad6a5",

  // Purples
  purple: "#8e44ad",
  lavender: "#b57edc",
  plum: "#8e4585",
  violet: "#7f00ff",
  mauve: "#e0b0ff",
  lilac: "#c8a2c8",
  fuchsia: "#ff00ff",
  magenta: "#ff0090",

  // Yellows
  yellow: "#f1c40f",
  lemon: "#fff44f",
  saffron: "#f4c430",
  mustard: "#e1ad01",
  honey: "#eb9605",

  // Browns / chocolate
  brown: "#6d4c30",
  chocolate: "#3b1f0b",
  cocoa: "#5c3317",
  espresso: "#3c1414",
  hazelnut: "#9b7653",
  walnut: "#5b3a29",
  coffee: "#6f4e37",
  mocha: "#967969",
  mahogany: "#c04000",
  chestnut: "#954535",
};

/** CSS named colors — the browser can render these directly. */
const CSS_NAMED_COLORS = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige",
  "bisque", "black", "blanchedalmond", "blue", "blueviolet", "brown",
  "burlywood", "cadetblue", "chartreuse", "chocolate", "coral",
  "cornflowerblue", "cornsilk", "crimson", "cyan", "darkblue", "darkcyan",
  "darkgoldenrod", "darkgray", "darkgreen", "darkkhaki", "darkmagenta",
  "darkolivegreen", "darkorange", "darkorchid", "darkred", "darksalmon",
  "darkseagreen", "darkslateblue", "darkslategray", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dodgerblue",
  "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
  "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki",
  "lavender", "lavenderblush", "lawngreen", "lemonchiffon", "lightblue",
  "lightcoral", "lightcyan", "lightgoldenrodyellow", "lightgray",
  "lightgreen", "lightpink", "lightsalmon", "lightseagreen",
  "lightskyblue", "lightslategray", "lightsteelblue", "lightyellow",
  "lime", "limegreen", "linen", "magenta", "maroon", "mediumaquamarine",
  "mediumblue", "mediumorchid", "mediumpurple", "mediumseagreen",
  "mediumslateblue", "mediumspringgreen", "mediumturquoise",
  "mediumvioletred", "midnightblue", "mintcream", "mistyrose",
  "moccasin", "navajowhite", "navy", "oldlace", "olive", "olivedrab",
  "orange", "orangered", "orchid", "palegoldenrod", "palegreen",
  "paleturquoise", "palevioletred", "papayawhip", "peachpuff", "peru",
  "pink", "plum", "powderblue", "purple", "rebeccapurple", "red",
  "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown",
  "seagreen", "seashell", "sienna", "silver", "skyblue", "slateblue",
  "slategray", "snow", "springgreen", "steelblue", "tan", "teal",
  "thistle", "tomato", "turquoise", "violet", "wheat", "white",
  "whitesmoke", "yellow", "yellowgreen",
]);

/** Resolve a cocoa butter color name to a CSS color value. */
export function colorToCSS(name: string): string {
  const key = name.toLowerCase().trim();
  // 1. Exact match in our custom map (chocolatier-tuned)
  if (COLOR_CSS[key]) return COLOR_CSS[key];
  // 2. Partial match: "ivory white" → "ivory"
  for (const [k, v] of Object.entries(COLOR_CSS)) {
    if (key.includes(k)) return v;
  }
  // 3. Valid CSS named color — return as-is, the browser will handle it
  if (CSS_NAMED_COLORS.has(key)) return key;
  // 4. Check if any word in a multi-word name is a CSS named color
  for (const word of key.split(/\s+/)) {
    if (CSS_NAMED_COLORS.has(word)) return word;
  }
  return "#9ca3af"; // neutral gray fallback
}
