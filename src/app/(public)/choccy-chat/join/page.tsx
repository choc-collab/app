import Link from "next/link";
import type { Metadata } from "next";
import { JoinForm } from "./join-form";

export const metadata: Metadata = {
  title: "Add yourself to Choccy Chat",
  description:
    "Submit your workshop to be added to the Choccy Chat friends map. Submissions are reviewed by hand.",
};

export default function JoinPage() {
  return (
    <div className="max-w-3xl mx-auto px-6">
      <section className="pt-16 sm:pt-24 pb-6">
        <div className="mono-label text-muted-foreground mb-4">
          <Link href="/choccy-chat" className="hover:text-foreground">
            ← Back to the map
          </Link>
        </div>
        <h1
          className="text-3xl sm:text-4xl font-[450] tracking-tight leading-[1.05] mb-4"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
        >
          Add yourself to the map.
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
          Tell us who you are and where you make chocolate. Submissions are
          reviewed by hand before they appear. Your email and personal name
          stay private — only your workshop name, location, and chosen links go
          on the public map.
        </p>
      </section>

      <section className="pb-24">
        <JoinForm />
      </section>
    </div>
  );
}
