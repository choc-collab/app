import next from "eslint-config-next";

const config = [
  { ignores: [".next/**", "out/**", "node_modules/**", "test-results/**", "tmp/**", "next-env.d.ts"] },
  ...next,
  {
    rules: {
      // Static export with `images.unoptimized: true` (next.config.ts) — `next/image`
      // provides no optimization in this configuration, so raw `<img>` is the
      // intentional choice.
      "@next/next/no-img-element": "off",

      // New eslint-plugin-react-hooks v7 rule. Most hits are legitimate
      // post-mount hydration (reading localStorage / DOM attributes that aren't
      // available during SSR). Migrating them to useSyncExternalStore is a
      // separate workstream — keep visible as warnings rather than blocking CI.
      "react-hooks/set-state-in-effect": "warn",

      // The lint script never ran before this PR, so existing dep arrays are
      // unaudited. Some are intentional "run once" effects. Surface as warnings
      // and triage case-by-case in follow-ups.
      "react-hooks/exhaustive-deps": "warn",
    },
  },
];

export default config;
