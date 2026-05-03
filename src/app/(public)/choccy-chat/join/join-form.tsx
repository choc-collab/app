"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { COUNTRY_NAMES } from "@/lib/countries";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const SUBMIT_ENDPOINT = "/api/choccy-chat/submit";

declare global {
  interface Window {
    turnstile?: {
      render: (selector: string | HTMLElement, opts: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

export function JoinForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const turnstileRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  // Render Turnstile widget once the api.js script is on the page.
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    const tryRender = () => {
      if (cancelled) return;
      if (!window.turnstile || !turnstileRef.current) {
        window.setTimeout(tryRender, 150);
        return;
      }
      if (turnstileWidgetId.current) return;
      turnstileWidgetId.current = window.turnstile.render(turnstileRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
      });
    };
    tryRender();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;
    setState({ kind: "submitting" });

    const fd = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    fd.forEach((value, key) => {
      payload[key] = value;
    });

    try {
      const res = await fetch(SUBMIT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 201) {
        window.location.href = "/choccy-chat/join/thanks";
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setState({
        kind: "error",
        message:
          body.error ??
          `Submission failed (${res.status}). Please try again or email lizi.vermaas@gmail.com.`,
      });
      // Reset the Turnstile token so the user can re-challenge.
      if (window.turnstile && turnstileWidgetId.current) {
        window.turnstile.reset(turnstileWidgetId.current);
      }
    } catch (err) {
      setState({
        kind: "error",
        message: `Could not reach the server (${
          err instanceof Error ? err.message : "network error"
        }). Please try again.`,
      });
    }
  }

  return (
    <>
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          async
          defer
        />
      )}
      {!TURNSTILE_SITE_KEY && (
        <div
          className="rounded-lg border border-border p-4 mb-6 text-sm"
          style={{
            background: "var(--color-status-warn-bg)",
            color: "var(--color-status-warn)",
            borderColor: "var(--color-status-warn-edge)",
          }}
        >
          <strong className="font-semibold">Form not yet configured.</strong>{" "}
          Set <code className="font-mono">NEXT_PUBLIC_TURNSTILE_SITE_KEY</code> in
          your environment to your Cloudflare Turnstile site key.
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="flex flex-col gap-5"
        noValidate={false}
      >
        {/* Honeypot — bots fill this; humans never see it */}
        <input
          type="text"
          name="_gotcha"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />

        <Fieldset legend="On the map (public)">
          <Field
            label="Workshop or business name"
            name="business_name"
            required
            maxLength={120}
            placeholder="e.g. My Choccy Business"
          />
          <Row>
            <Field label="City" name="city" required maxLength={80} placeholder="City" />
            <CountryField />
          </Row>
          <Field
            label="Instagram handle (optional)"
            name="instagram"
            maxLength={250}
            placeholder="sosase_chocolat"
            hint="Username, @handle, or full instagram.com URL — we'll clean it up."
          />
          <Field
            label="Website (optional)"
            name="website"
            type="url"
            maxLength={250}
            placeholder="https://example.com"
          />
          <FieldTextarea
            label="One-line blurb (optional)"
            name="blurb"
            maxLength={200}
            placeholder="Small-batch bonbons inspired by James Parsons."
            hint="200 characters max — appears under your pin."
          />
        </Fieldset>

        <Fieldset legend="For approval correspondence (private)">
          <Field
            label="Your name"
            name="contact_name"
            required
            maxLength={120}
            placeholder="Jane Smith"
          />
          <Field
            label="Email"
            name="email"
            type="email"
            required
            maxLength={200}
            placeholder="you@example.com"
            hint="We'll only use this to confirm your submission."
          />
          <FieldTextarea
            label="Anything else?"
            name="notes"
            placeholder="Optional — questions, context, etc."
            maxLength={1000}
          />
        </Fieldset>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="consent"
            value="1"
            required
            className="mt-0.5"
          />
          <span className="text-muted-foreground leading-relaxed">
            I agree to my workshop name, location, and chosen links being
            displayed publicly on the Choccy Chat map. I can request removal at
            any time using the link emailed to me on approval, or by emailing
            the maintainer.
          </span>
        </label>

        {TURNSTILE_SITE_KEY && (
          <div ref={turnstileRef} data-testid="turnstile-widget" className="my-2" />
        )}

        {state.kind === "error" && (
          <div
            role="alert"
            className="rounded-md border p-3 text-sm"
            style={{
              background: "var(--color-status-alert-bg)",
              color: "var(--color-status-alert)",
              borderColor: "var(--color-status-alert-edge)",
            }}
          >
            {state.message}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="submit"
            className="btn-primary"
            disabled={state.kind === "submitting" || !TURNSTILE_SITE_KEY}
            style={{
              background: "var(--accent-terracotta-bg)",
              color: "var(--accent-terracotta-ink)",
            }}
          >
            {state.kind === "submitting" ? "Sending…" : "Send for review"}
          </button>
          <Link href="/choccy-chat" className="btn-secondary">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}

function Fieldset({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="bg-card border border-border rounded-lg p-5 flex flex-col gap-4">
      <legend className="mono-label px-2" style={{ color: "var(--accent-cocoa-ink)" }}>
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  hint,
  maxLength,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}{" "}
        {required && (
          <span aria-hidden style={{ color: "var(--accent-terracotta-ink)" }}>
            *
          </span>
        )}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        className="input"
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function CountryField() {
  const id = "field-country";
  return (
    <div>
      <label className="label" htmlFor={id}>
        Country{" "}
        <span aria-hidden style={{ color: "var(--accent-terracotta-ink)" }}>
          *
        </span>
      </label>
      <input
        id={id}
        name="country"
        list="country-options"
        required
        maxLength={80}
        autoComplete="country-name"
        placeholder="Start typing…"
        className="input"
      />
      <datalist id="country-options">
        {COUNTRY_NAMES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <p className="text-xs text-muted-foreground mt-1">
        Pick from the list — we standardise spellings (e.g. UK → United Kingdom).
      </p>
    </div>
  );
}

function FieldTextarea({
  label,
  name,
  placeholder,
  hint,
  maxLength,
}: {
  label: string;
  name: string;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={3}
        className="input"
      />
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
