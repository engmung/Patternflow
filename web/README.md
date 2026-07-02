# Patternflow Web

The Next.js app behind [patternflow.work](https://patternflow.work) — landing page, Live Editor, browser flasher, journal, and roadmap.

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

- `src/app/` — routes (App Router). `/pattern-lab` and `/video-baker` are internal noindex tools.
- `src/components/` — 3D viewer, landing sections, journal renderer.
- `src/lib/presets/` — JS pattern library; **source of truth** for the firmware preset headers.
- `content/` — markdown/MDX site copy and journal articles. Editing copy means editing these files.
- `public/flash/` — esp-web-tools manifest + firmware binaries for the browser flasher.

## Contributing

See the repo-level [CONTRIBUTING.md](../CONTRIBUTING.md). Web changes go through a PR into `main`; CI runs lint and `next build` on anything under `web/`.

Code in `web/` is MIT licensed ([LICENSE-MIT](../LICENSE-MIT)).
