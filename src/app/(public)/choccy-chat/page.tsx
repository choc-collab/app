import Link from "next/link";
import type { Metadata } from "next";
import data from "@/data/chocolatiers.json";
import type { Chocolatier } from "./types";
import { Directory } from "./directory";

export const metadata: Metadata = {
  title: "Choccy Chat — find your fellow chocolate makers",
  description:
    "A fan-run directory of home and small-batch chocolatiers who hang out around James Parsons' Friday Choccy Chat lives. Find each other on the map.",
};

const ENTRIES: Chocolatier[] = (data.entries as Chocolatier[]).slice().sort(
  (a, b) => a.country.localeCompare(b.country) || a.city.localeCompare(b.city),
);

export default function ChoccyChatPage() {
  return (
    <div className="max-w-5xl mx-auto px-6">
      <section className="pt-16 sm:pt-24 pb-8 max-w-3xl">
        <h1
          className="text-4xl sm:text-5xl font-[450] tracking-tight leading-[1.05] mb-5"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
        >
          Choccy Chat,
          <br />
          on a map.
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl mb-4">
          Every Friday,{" "}
          <a
            href="https://www.instagram.com/sosase_chocolat?igsh=YTZoMDhvZ2dycGd3"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            James Parsons (SoSaSe Chocolat)
          </a>{" "}
          goes live on Instagram for Choccy Chat — and over time a small,
          generous community of home and small-batch chocolatiers has grown up
          around it. This is a hand-curated map of the people who hang out
          there, so we can find each other.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Made by a fan, not affiliated with James or SoSaSe Chocolat. If
          you&apos;re a Choccy Chat regular,{" "}
          <Link
            href="/choccy-chat/join"
            className="text-foreground underline underline-offset-2"
          >
            add yourself
          </Link>
          .
        </p>
      </section>

      <Directory initialEntries={ENTRIES} />

      <section className="pb-24">
        <Link
          href="/choccy-chat/join"
          className="group flex items-center justify-between gap-4 bg-card border border-border rounded-lg p-6 transition-shadow hover:shadow-md hover:border-primary/30"
        >
          <div>
            <div
              className="mono-label mb-2"
              style={{ color: "var(--accent-terracotta-ink)" }}
            >
              Add yourself
            </div>
            <h2
              className="text-xl font-[450] tracking-tight mb-1"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Put your workshop on the map
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
              Each entry is reviewed by hand before it appears. Tell us who you
              are, where you make chocolate, and how people can find you.
            </p>
          </div>
          <span
            aria-hidden
            className="shrink-0 text-foreground group-hover:translate-x-0.5 transition-transform font-mono"
          >
            →
          </span>
        </Link>
      </section>
    </div>
  );
}
