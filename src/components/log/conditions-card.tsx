"use client";

import { useEffect, useRef, useState } from "react";
import { SidebarCard, PropertyRow, PROPERTY_NUMBER_CLASS } from "@/components/detail-sidebar";
import { saveLogDayConditions, useLogDay } from "@/lib/hooks";
import { parseConditionValue } from "@/lib/dailyLog";

/**
 * Workshop temperature and humidity for a day — the two numbers that explain
 * most tempering and bloom surprises months later. Both save when you leave
 * the field (or press Enter); clearing a field removes the value.
 */
export function ConditionsCard({ date }: { date: string }) {
  const day = useLogDay(date);
  const [temp, setTemp] = useState("");
  const [humidity, setHumidity] = useState("");
  // Hydrate from the stored row once per day, and again after our own write
  // echoes back — but never while a field is being edited.
  const editing = useRef(false);
  useEffect(() => {
    if (editing.current) return;
    setTemp(day?.ambientTempC != null ? String(day.ambientTempC) : "");
    setHumidity(day?.humidityPct != null ? String(day.humidityPct) : "");
  }, [day?.id, day?.ambientTempC, day?.humidityPct, date]);

  function commit() {
    editing.current = false;
    const next = { ambientTempC: parseConditionValue(temp), humidityPct: parseConditionValue(humidity) };
    const unchanged = next.ambientTempC === day?.ambientTempC && next.humidityPct === day?.humidityPct;
    if (unchanged) return;
    if (next.ambientTempC == null && next.humidityPct == null && !day) return; // nothing to record yet
    void saveLogDayConditions(date, next);
  }

  const inputProps = {
    type: "number" as const,
    inputMode: "decimal" as const,
    step: "0.5",
    className: `${PROPERTY_NUMBER_CLASS} w-24`,
    onFocus: () => { editing.current = true; },
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); },
  };

  return (
    <SidebarCard title="Workshop conditions">
      <PropertyRow label="Temperature">
        <span className="flex items-center gap-1">
          <input {...inputProps} value={temp} onChange={(e) => setTemp(e.target.value)} aria-label="Workshop temperature (°C)" placeholder="—" />
          <span className="text-xs text-muted-foreground w-6">°C</span>
        </span>
      </PropertyRow>
      <PropertyRow label="Humidity">
        <span className="flex items-center gap-1">
          <input {...inputProps} min={0} max={100} value={humidity} onChange={(e) => setHumidity(e.target.value)} aria-label="Workshop humidity (%)" placeholder="—" />
          <span className="text-xs text-muted-foreground w-6">%</span>
        </span>
      </PropertyRow>
    </SidebarCard>
  );
}
