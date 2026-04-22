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
import { readFileSync as readSyncRaw } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, normalize, sep } from "node:path";

const PORT = Number(process.env.PORT ?? 3001);
const ROOT = fileURLToPath(new URL("../out/", import.meta.url));

// ---------------------------------------------------------------------------
// Cloudflare _redirects simulator — just enough to reproduce CF's rewrites
// locally. Supports status 200 (rewrite) and 301/302/308 (redirect) with
// `:name` placeholders and `*` splat. First match wins (top to bottom).
// ---------------------------------------------------------------------------

function parseRedirects(file) {
  const rules = [];
  try {
    const text = readSyncRaw(file, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.replace(/#.*/, "").trim();
      if (!line) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const [from, to, status = "200"] = parts;
      rules.push({ from, to, status: Number(status) });
    }
  } catch {
    // No _redirects — return empty rule set.
  }
  return rules;
}

function buildMatcher(from) {
  // Convert `/production/:id/*` → regex with captures for :id and * (splat)
  const placeholders = [];
  let pattern = "";
  let i = 0;
  while (i < from.length) {
    const ch = from[i];
    if (ch === ":") {
      // Capture :name — matches [^/]+
      let j = i + 1;
      while (j < from.length && /[a-zA-Z0-9_]/.test(from[j])) j++;
      const name = from.slice(i + 1, j);
      placeholders.push(name);
      pattern += "([^/]+)";
      i = j;
    } else if (ch === "*") {
      placeholders.push("splat");
      pattern += "(.*)";
      i++;
    } else {
      pattern += ch.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i++;
    }
  }
  return { regex: new RegExp(`^${pattern}$`), placeholders };
}

function substituteTarget(to, captures) {
  // Replace :name and :splat tokens with captured values
  return to.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) =>
    captures[name] ?? `:${name}`,
  );
}

const RULES = parseRedirects(join(ROOT, "_redirects")).map((r) => ({
  ...r,
  matcher: buildMatcher(r.from),
}));

function applyRedirects(urlPath) {
  for (const rule of RULES) {
    const m = rule.matcher.regex.exec(urlPath);
    if (!m) continue;
    const captures = {};
    rule.matcher.placeholders.forEach((name, i) => {
      captures[name] = m[i + 1];
    });
    const target = substituteTarget(rule.to, captures);
    return { target, status: rule.status };
  }
  return null;
}

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

  // Apply _redirects rules *first* — CF Pages consults them before falling
  // back to static assets. First match wins. Only redirect codes (3xx) change
  // the URL; 200 rewrites serve the target file under the original URL.
  let servePath = decoded;
  const hit = applyRedirects(decoded);
  if (hit) {
    if (hit.status >= 300 && hit.status < 400) {
      res.writeHead(hit.status, { location: hit.target });
      res.end();
      return;
    }
    servePath = hit.target;
  }

  // Prevent directory traversal — normalize + reject `..` segments.
  const normalized = normalize(servePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const rel = normalized === sep ? "" : normalized.replace(/^\/+/, "");
  const abs = join(ROOT, rel);

  // 1. If the (maybe-rewritten) path points to an actual file, serve it.
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
  console.log(`serving ${ROOT} on http://localhost:${PORT} (${RULES.length} _redirects rules loaded)`);
});
