"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Chocolatier } from "./types";

type Props = { chocolatiers: Chocolatier[] };

export function WorldMap({ chocolatiers }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    type LMap = { remove: () => void };
    let map: LMap | null = null;

    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (cancelled || !containerRef.current) return;

        const initialBounds = boundsForEntries(chocolatiers);
        const m = L.map(containerRef.current, {
          minZoom: 2,
          maxZoom: 12,
          worldCopyJump: true,
          scrollWheelZoom: false,
          zoomControl: true,
          attributionControl: true,
        });

        if (initialBounds) {
          m.fitBounds(initialBounds, { padding: [40, 40], maxZoom: 5 });
        } else {
          m.setView([25, 10], 2);
        }

        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 19,
          },
        ).addTo(m);

        chocolatiers.forEach((c) => {
          const marker = L.circleMarker([c.lat, c.lng], {
            radius: 7,
            color: "#ffffff",
            weight: 2,
            fillColor: "#7a3e1e", // accent-terracotta-ink
            fillOpacity: 1,
          }).addTo(m);

          const el = marker.getElement();
          if (el) {
            el.setAttribute("role", "button");
            el.setAttribute("tabindex", "0");
            el.setAttribute(
              "aria-label",
              `${c.name}, ${c.city}, ${c.country}`,
            );
            el.setAttribute("data-chocolatier-id", c.id);
          }

          marker.bindPopup(renderPopupHtml(c), {
            closeButton: true,
            autoPan: true,
            className: "choc-popup",
            maxWidth: 260,
          });
        });

        map = m as unknown as LMap;
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      }
    })();

    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [chocolatiers]);

  return (
    <div
      className="relative w-full"
      style={{ aspectRatio: "2 / 1", background: "var(--accent-taupe-bg)" }}
    >
      <div
        ref={containerRef}
        data-testid="chocolatier-map"
        data-ready={ready ? "1" : "0"}
        className="absolute inset-0 rounded-lg overflow-hidden"
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground p-6 text-center">
          Map failed to load: {error}. The list below shows the same chocolatiers.
        </div>
      )}
    </div>
  );
}

function boundsForEntries(
  entries: Chocolatier[],
): [[number, number], [number, number]] | null {
  if (entries.length === 0) return null;
  let minLat = entries[0].lat;
  let maxLat = entries[0].lat;
  let minLng = entries[0].lng;
  let maxLng = entries[0].lng;
  for (const e of entries) {
    if (e.lat < minLat) minLat = e.lat;
    if (e.lat > maxLat) maxLat = e.lat;
    if (e.lng < minLng) minLng = e.lng;
    if (e.lng > maxLng) maxLng = e.lng;
  }
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ];
}

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch]);
}

function renderPopupHtml(c: Chocolatier): string {
  const links: string[] = [];
  if (c.instagram) {
    const handle = escapeHtml(c.instagram);
    links.push(
      `<a href="https://instagram.com/${handle}" target="_blank" rel="noreferrer">@${handle}</a>`,
    );
  }
  if (c.website) {
    links.push(
      `<a href="${escapeHtml(c.website)}" target="_blank" rel="noreferrer">Website</a>`,
    );
  }
  const linksRow = links.length
    ? `<div class="choc-popup__links">${links.join("<span aria-hidden> · </span>")}</div>`
    : "";
  const blurb = c.blurb
    ? `<p class="choc-popup__blurb">${escapeHtml(c.blurb)}</p>`
    : "";
  return `
    <div class="choc-popup__inner">
      <div class="choc-popup__loc">${escapeHtml(c.city)}, ${escapeHtml(c.country)}</div>
      <div class="choc-popup__name">${escapeHtml(c.name)}</div>
      ${blurb}
      ${linksRow}
    </div>
  `;
}
