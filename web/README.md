# Patternflow Web

The Next.js app behind [patternflow.work](https://patternflow.work) — landing page, Live Editor, Pattern Lab, the pattern community (on the community host only), browser flasher, edition shelf, device update handoff, journal, and roadmap.

For how the app is put together (routes, pattern system, content pipeline), see **[ARCHITECTURE.md](./ARCHITECTURE.md)**.

## Development

```bash
npm install
npm run dev     # http://localhost:3000
```

Other scripts:

```bash
npm run build   # production build — must pass before merging (CI hard gate)
npm run lint    # eslint
npm start       # serve the production build
```

Requires Node 20+ (matches CI).

## Environment variables

None are required — the site runs fully without them.

| Var | Purpose |
| :--- | :--- |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | PostHog analytics (no-op when absent) |
| `GITHUB_TOKEN` | Higher GitHub rate limit for `/api/roadmap` (optional) |

## Where things live

- `src/app/` — routes (App Router). `/pattern-lab` is the pattern workspace (noindex, not internal). The breadboard build guide is `src/app/build/breadboard/page.tsx` — React, not markdown.
- `src/components/` — 3D viewer, landing sections, journal renderer, the community UI. The build map's pins are `src/components/sections/InsideGlobe/builds.ts` plus photos in `public/builds/<slug>/`.
- `src/lib/presets/` — JS pattern library; **source of truth** for the firmware preset headers (`firmware/toolchain/check_presets.py` keeps the two in step).
- `content/` — markdown/MDX site copy (`build.md`, `pattern.md`, `inside.md`) and the journal. The journal is the maintainer's own writing.
- `public/flash/` — esp-web-tools manifest + firmware binaries for the browser flasher. `public/packs/` — the Basics pack.
- `scripts/` — build-time helpers (`build-sandbox.ts`, `import-patterns.ts`, ...); `test/` — the `check:*` suites (vitest); `drizzle/` — community DB migrations; `.env.example` — every variable the community host reads.
- `AGENTS.md` here is a block `next dev` writes for AI agents; `CLAUDE.md` is a one-line shim to it. The project's own agent context is the root `AGENTS.md`.

## Contributing

See the repo-level [CONTRIBUTING.md](../CONTRIBUTING.md). Web changes go through a PR into `main`; CI runs lint, typecheck, the `check:*` suites and `next build` on anything under `web/`.

Code in `web/` is MIT licensed ([LICENSE-MIT](../LICENSE-MIT)).
