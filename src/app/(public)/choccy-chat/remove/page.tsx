import type { Metadata } from "next";
import { RemovalForm } from "./removal-form";

export const metadata: Metadata = {
  title: "Remove yourself · Choccy Chat",
  description: "Remove your workshop from the Choccy Chat directory.",
  robots: { index: false, follow: false },
};

export default function RemovePage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-24">
      <div className="mono-label text-muted-foreground mb-4">
        Choccy Chat · self-removal
      </div>
      <h1
        className="text-3xl sm:text-4xl font-[450] tracking-tight leading-[1.05] mb-4"
        style={{ fontFamily: "var(--font-display)", letterSpacing: "-0.035em" }}
      >
        Remove yourself from the map.
      </h1>
      <p className="text-base text-muted-foreground leading-relaxed mb-8">
        Use the button below to remove your workshop from the Choccy Chat
        directory. This is immediate and cannot be undone — but you can always
        re-submit later.
      </p>
      <RemovalForm />
    </div>
  );
}
