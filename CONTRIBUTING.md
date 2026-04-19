# Contributing to Choc-collab

Thanks for your interest in contributing! 

Choc-collab was initially 100% vibe-coded, but we're excited to welcome contributions from humans too!

This guide will get you up and running.

## Prerequisites

- Node.js 20+
- npm 10+

## Getting started

```bash
git clone https://github.com/choc-collab/choc-collab.git
cd choc-collab
npm install
cp .env.example .env.local   # all vars are optional
npm run dev                   # http://localhost:3000
```

The app runs fully local — no backend or API keys required.

## Development workflow

1. **Create a branch** from `main` for your change
2. **Make your changes** — see the guidelines below
3. **Run tests** before pushing:
   ```bash
   npm test          # unit tests (Vitest)
   npm run build     # production build check
   npm run test:e2e  # end-to-end tests (Playwright)
   ```
4. **Open a pull request** against `main`

## Code guidelines

- **TypeScript** — no `as any` unless absolutely unavoidable (and document why)
- **Tests are mandatory** — every new pure function in `lib/` or `types/` ships with a `.test.ts` file. New pages/flows need E2E coverage in `e2e/`
- **No secrets in source** — use environment variables for anything sensitive
- **Deletion confirmation** — every destructive action requires a two-step inline confirmation
- **Local-first** — all data logic lives in `lib/` as pure, backend-agnostic functions. Don't bake in assumptions about where data lives
- **Performance** — the app targets 300+ products and 1000+ fillings. Avoid O(N^2) loops, unbounded fetches, and loading blobs in list queries

See `AGENT.md` for the full architecture guide, data model, and component patterns.

## What to work on

- Check the open issues before starting something new — someone may already be on it
- For larger changes, open an issue first to discuss the approach

## Project structure

```
src/
  app/        — Next.js App Router pages
  components/ — React components (mostly client-side)
  lib/        — Pure logic, hooks, database
  types/      — TypeScript types and constants
e2e/          — Playwright end-to-end tests
public/       — Static assets, PWA manifest, service worker
```

## Commit messages

Keep them concise — one line describing **what** and **why**, not how. Examples:
- `add shelf-life filter to fillings list`
- `fix cost snapshot not triggering on shell % change`

## Questions?

Open an issue — we're happy to help.


Made with ❤️ for the artisan chocolatier community

