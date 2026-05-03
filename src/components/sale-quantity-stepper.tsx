"use client";

import { useEffect, useState } from "react";

/** Compact pill stepper for picking how many identical prepared boxes to
 *  sell at once. Used by the /shop Ready tab and the /today dashboard's
 *  Sell · Quick grid — both flows want the same affordance and ceiling
 *  logic so behaviour stays consistent across surfaces.
 *
 *  The component keeps a local text buffer so the user can type any
 *  positive integer (handy for "sell 30 of 40 prepped"). Out-of-range
 *  feedback ("Only N available") is the caller's job — this just clamps
 *  buttons but lets typed values pass through so callers can surface the
 *  ceiling explicitly.
 */
export function SaleQuantityStepper({
  value,
  max,
  disabled,
  onChange,
  testIdPrefix,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
  /** Optional prefix for `data-testid` attributes — `${prefix}-dec`,
   *  `${prefix}-value`, `${prefix}-inc`. Lets call sites give the
   *  steppers distinct identifiers in playwright/E2E. */
  testIdPrefix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const decDisabled = disabled || value <= 1;
  const incDisabled = disabled || value >= max;

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1) onChange(n);
  }

  function handleBlur() {
    const n = parseInt(text, 10);
    if (Number.isNaN(n) || n < 1) setText(String(value));
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-border bg-card px-0.5"
      role="group"
      aria-label="Sell quantity"
    >
      <button
        type="button"
        aria-label="Decrease sell quantity"
        disabled={decDisabled}
        onClick={() => onChange(value - 1)}
        className="w-6 h-6 flex items-center justify-center rounded-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        data-testid={testIdPrefix ? `${testIdPrefix}-dec` : undefined}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={text}
        onChange={handleInputChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="font-mono text-xs tabular-nums text-center bg-transparent border-0 focus:outline-none w-8 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:text-muted-foreground"
        aria-label="Sell quantity"
        data-testid={testIdPrefix ? `${testIdPrefix}-value` : undefined}
      />
      <button
        type="button"
        aria-label="Increase sell quantity"
        disabled={incDisabled}
        onClick={() => onChange(value + 1)}
        className="w-6 h-6 flex items-center justify-center rounded-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        data-testid={testIdPrefix ? `${testIdPrefix}-inc` : undefined}
      >
        +
      </button>
    </div>
  );
}
