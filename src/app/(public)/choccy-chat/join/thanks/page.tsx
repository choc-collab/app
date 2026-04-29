import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thanks · Choccy Chat",
  description: "Your Choccy Chat directory submission has been received.",
};

export default function ThanksPage() {
  return (
    <div className="max-w-2xl mx-auto px-6">
      <section className="pt-24 sm:pt-32 pb-20">
        <div className="mono-label text-muted-foreground mb-4">Submission received</div>
        <h1
          className="text-3xl sm:text-4xl font-[450] tracking-tight leading-[1.05] mb-5"
          style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
        >
          Thank you.
          <br />
          We&apos;ll be in touch.
        </h1>
        <p className="text-base text-muted-foreground leading-relaxed mb-8">
          Your details are on the way to the maintainer for review. You&apos;ll
          get a short email when your workshop is added to the map. Replies
          come from a real human, so feel free to write back.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/choccy-chat" className="btn-secondary">
            Back to the map
          </Link>
        </div>
      </section>
    </div>
  );
}
