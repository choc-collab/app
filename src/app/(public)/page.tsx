import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Choc-collab — your workshop, in one small quiet app",
  description:
    "A local-first, open-source PWA for artisan chocolatiers. Ingredients, fillings, products, production, stock, and margins — all in one place.",
};

export default function LandingPage() {
  return (
    <div className="max-w-5xl mx-auto px-6">
      <section className="pt-16 sm:pt-24 pb-10 max-w-3xl">
        <div className="mono-label text-muted-foreground mb-4">
          Open source · Local-first · Built by a chocolatier
        </div>
        <h1
          className="text-4xl sm:text-5xl font-[450] tracking-tight leading-[1.05] mb-5"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
        >
          Make chocolate.
          <br />
          Not spreadsheets.
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
          Choc-collab sits on your iPad, phone, or laptop and keeps your entire
          chocolate workshop in one place: ingredients, fillings, products,
          production plans, stock, collections, and a little bit of business
          intelligence. Your data lives in your browser — no account, no
          server, no lock-in.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 pb-20">
        <Link
          href="/app"
          className="group flex flex-col justify-between bg-card border border-border rounded-lg p-6 min-h-[220px] transition-shadow hover:shadow-md hover:border-primary/30 focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-offset-2"
        >
          <div>
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-lg mb-4"
              style={{
                background: "var(--accent-terracotta-bg)",
                color: "var(--accent-terracotta-ink)",
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4" />
              </svg>
            </div>
            <h2 className="text-xl font-[450] tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
              Open the app
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Jump straight in. Your pantry, your batches, your cost history —
              all waiting.
            </p>
          </div>
          <div className="mt-4 text-sm text-foreground group-hover:translate-x-0.5 transition-transform">
            Open <span className="font-mono">→</span>
          </div>
        </Link>

        <Link
          href="/getting-started"
          className="group flex flex-col justify-between bg-card border border-border rounded-lg p-6 min-h-[220px] transition-shadow hover:shadow-md hover:border-primary/30 focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-offset-2"
        >
          <div>
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-lg mb-4"
              style={{
                background: "var(--accent-cocoa-bg)",
                color: "var(--accent-cocoa-ink)",
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h2 className="text-xl font-[450] tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
              Getting started
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              A fifteen-minute walkthrough: install as a PWA, load demo data,
              add your first ingredient, filling, product, and production run.
            </p>
          </div>
          <div className="mt-4 text-sm text-foreground group-hover:translate-x-0.5 transition-transform">
            Read the guide <span className="font-mono">→</span>
          </div>
        </Link>

        <Link
          href="/getting-started#faq"
          className="group flex flex-col justify-between bg-card border border-border rounded-lg p-6 min-h-[220px] transition-shadow hover:shadow-md hover:border-primary/30 focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-offset-2"
        >
          <div>
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-lg mb-4"
              style={{
                background: "var(--accent-blue-bg)",
                color: "var(--accent-blue-ink)",
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <h2 className="text-xl font-[450] tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
              FAQs
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Why this app is free, how to contribute, what to do if data
              disappears, and other honest answers.
            </p>
          </div>
          <div className="mt-4 text-sm text-foreground group-hover:translate-x-0.5 transition-transform">
            Read the FAQs <span className="font-mono">→</span>
          </div>
        </Link>

        <a
          href="https://github.com/choc-collab/app"
          target="_blank"
          rel="noreferrer"
          className="group flex flex-col justify-between bg-card border border-border rounded-lg p-6 min-h-[220px] transition-shadow hover:shadow-md hover:border-primary/30 focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-offset-2"
        >
          <div>
            <div
              className="inline-flex items-center justify-center w-11 h-11 rounded-lg mb-4"
              style={{
                background: "var(--accent-taupe-bg)",
                color: "var(--accent-taupe-ink)",
              }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" aria-hidden="true">
                <path d="M12 .5C5.648.5.5 5.648.5 12c0 5.082 3.292 9.393 7.862 10.918.575.106.785-.25.785-.555 0-.274-.01-1-.016-1.962-3.196.695-3.872-1.54-3.872-1.54-.522-1.327-1.275-1.68-1.275-1.68-1.043-.713.079-.698.079-.698 1.154.081 1.762 1.185 1.762 1.185 1.025 1.756 2.69 1.248 3.345.954.104-.742.402-1.248.73-1.535-2.552-.29-5.235-1.276-5.235-5.68 0-1.254.448-2.28 1.184-3.084-.119-.29-.513-1.46.112-3.043 0 0 .965-.309 3.165 1.178A11.01 11.01 0 0 1 12 6.844c.977.004 1.962.132 2.882.388 2.198-1.487 3.162-1.178 3.162-1.178.627 1.583.232 2.753.114 3.043.738.804 1.183 1.83 1.183 3.084 0 4.415-2.688 5.386-5.25 5.67.413.355.78 1.056.78 2.13 0 1.538-.014 2.778-.014 3.156 0 .307.207.666.79.553C20.21 21.39 23.5 17.082 23.5 12 23.5 5.648 18.352.5 12 .5Z" />
              </svg>
            </div>
            <h2 className="text-xl font-[450] tracking-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
              GitHub
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Source code, issues, and pull requests. File a bug, request a
              feature, or help build the shared ingredient and mould libraries.
            </p>
          </div>
          <div className="mt-4 text-sm text-foreground group-hover:translate-x-0.5 transition-transform">
            View on GitHub <span className="font-mono">→</span>
          </div>
        </a>
      </section>
    </div>
  );
}
