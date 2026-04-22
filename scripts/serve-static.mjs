#!/usr/bin/env node
/**
 * Minimal static file server for the `out/` directory, used by the production-build
 * hydration smoke tests (see playwright.prod.config.ts). Kept as a local script so
 * the project doesn't pick up a new runtime dependency just to serve static files.
 *
 * Mimics the path-rewrite behaviour Cloudflare Pages uses:
 *   - `/foo/bar` → serve `out/foo/bar/index.html` if it exists
 *   - otherwise serve `out/404.html` with a 404 status
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, sep } from "node:path";

const PORT = Number(process.env.PORT ?? 3001);
const ROOT = fileURLToPath(new URL("../out/", import.meta.url));

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json",
};

function contentType(path) {
  const ext = path.slice(path.lastIndexOf("."));
  return MIME[ext] ?? "application/octet-stream";
}

async function tryServe(res, absPath) {
  try {
    const s = await stat(absPath);
    if (!s.isFile()) return false;
    const body = await readFile(absPath);
    res.writeHead(200, { "content-type": contentType(absPath), "cache-control": "no-cache" });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  // Strip query string; decode path.
  const rawPath = (req.url ?? "/").split("?")[0];
  const decoded = decodeURIComponent(rawPath);
  // Prevent directory traversal — normalize + reject `..` segments.
  const normalized = normalize(decoded).replace(/^(\.\.(\/|\\|$))+/, "");
  const rel = normalized === sep ? "" : normalized.replace(/^\/+/, "");
  const abs = join(ROOT, rel);

  // 1. If the path points to an actual file, serve it.
  if (await tryServe(res, abs)) return;
  // 2. Otherwise try `<path>/index.html` (directory-style routing).
  if (await tryServe(res, join(abs, "index.html"))) return;
  // 3. Fall back to `out/404.html` with a 404 status.
  try {
    const body = await readFile(join(ROOT, "404.html"));
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("Not found");
  }
});

server.listen(PORT, () => {
  const here = dirname(fileURLToPath(import.meta.url));
  console.log(`serving ${ROOT} (from ${here}) on http://localhost:${PORT}`);
});
