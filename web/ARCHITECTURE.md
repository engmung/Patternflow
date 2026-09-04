# Web Architecture

The `web/` app is the Patternflow site at [patternflow.work](https://patternflow.work): landing page, Pattern Lab, the pattern community, browser flasher, edition shelf, journal and roadmap in a single Next.js project. One codebase, two deployments: **Vercel** serves the public site, and a **Raspberry Pi** at community.patternflow.work runs the same build with `COMMUNITY_ENABLED=1`, which switches on the SQLite-backed community, the build worker and the hosted edition images. Everything else is static or client-side.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Three.js via react-three-fiber · Zustand · dockview · MDX · Drizzle + better-sqlite3 · Better Auth.

## Route map (`src/app/`)

| Route | What it is |
| :--- | :--- |
| `/` | Landing page (`HomeView` opened on the hero tab) |
| `/build` · `/pattern` · `/inside` | The same `HomeView`, deep-linked to a tab — real URLs for SEO/sharing, not separate pages |
| `/build/breadboard` | Breadboard electronics build path |
| `/inside/[build]` | One community build's page |
| `/pattern-lab` | The pattern workspace — see below |
| `/community/**` | The community: feed, pattern pages (`/p/[id]`), profiles (`/u/[username]`), decks (`/d/[id]`, `/decks`), the Workshop (`/workshop/[code]`), territories and the atlas, notifications, featured, reports. Renders a pointer to the community host unless `COMMUNITY_ENABLED=1` |
| `/editions` | The edition shelf: every firmware you can put on a panel, official and community, with one-click install. `/variants` (the URL until 2026-09, baked into shipped console pages) redirects here permanently |
| `/update` | The device's firmware-update handoff: the browser downloads an image and POSTs it to the panel over the LAN, because the panel cannot fetch over TLS |
| `/flash` (static) | esp-web-tools flasher driven by `public/flash/manifest.json` + the images in `public/flash/bin/` — only the currently served ones are committed |
| `/journal` · `/journal/[slug]` (+ `/en`) | Bilingual (ko/en) MDX journal with per-article OG image generation |
| `/roadmap` | Roadmap rendered from `roadmap-data.ts` plus GitHub issue progress via `/api/roadmap` |
| `/compliance` | Printed on the box — never move, redirect or noindex it |
| `/terms` · `/business` · `/contact` | Static pages |
| `/api/community/**` | The community's JSON API (30-odd routes: patterns, decks, posts, comments, builds, workshop, moderation…). Every route guards on `communityEnabled()`, and `src/proxy.ts` closes the whole prefix with a 404 on a deployment without the community, so a route that forgets is still closed |
| `/api/auth/[...all]` | Better Auth |
| `/api/variant-bin/[...path]` | Serves hosted edition images from `VARIANT_BIN_DIR` with the CORS headers `/update` needs |
| `/api/roadmap` | Open issues + sub-issue progress (10 min revalidate; optional `GITHUB_TOKEN`) |
| `feed.xml` · `sitemap.ts` · `robots.ts` | Feeds and SEO plumbing |

`src/proxy.ts` (Next.js proxy/middleware) routes journal visitors between ko/en using the `pf-journal-lang` cookie, and answers 404 for `/api/community/*` wherever `COMMUNITY_ENABLED` is not set.

## Landing page composition

```
HomeView (src/components/HomeView.tsx)
├── ViewerPanel (components/3d/)         ← sticky 3D panel
│   ├── HeroScene.tsx                    ← Canvas, GLB loader (public/3dforweb.glb), LED ShaderMaterial
│   ├── LedMatrixTexture.ts              ← renders JS patterns into a texture for the 3D LED mesh
│   └── patterns/                        ← GLSL pattern ports (common.ts = shared vertex shader + registry)
└── RightPanel (components/sections/)    ← tabbed content panel
    ├── Hero.tsx / Deck.tsx              ← hero copy + panel open/close orchestration
    ├── BuildPanel.tsx                   ← build paths, flasher entry
    ├── PatternPanel.tsx                 ← preset browser + knobs; every CTA leads to /pattern-lab
    ├── InsidePanel.tsx + InsideGlobe/   ← concept content + community builds globe
    └── Sponsor.tsx
```

Cross-component landing state (active tab, virtual knob values, bloom toggle) lives in the Zustand store `src/store/useAppStore.ts`.

## Pattern system

Mirrors the firmware; the same JS runs in the browser, in the community's sandbox iframe and in the lab's worker.

- **`src/lib/presets/`** — JS pattern sources, one file per pattern. **Source of truth** for the firmware preset `.h` files (`firmware/patternflow/presets/`; the web has more presets than the firmware — the cut list is in `firmware/patternflow/README.md`). `_TEMPLATE.ts` is the skeleton; `index.ts` the registry.
- **`src/lib/pattern/harness.ts`** — runs pattern JS on a 128×64 virtual matrix with 4 virtual encoders (24 detents/turn), matching device semantics (`knobDeltas`, `btnPressed`/`btnHeld`); also the OKLab/OKLCH colour ramp math and the LUT builders. `public/pattern-sandbox.html` is **built from it** — `scripts/build-sandbox.ts` bundles `src/sandbox/sandbox.ts` (the canvas, the live loop, the postMessage protocol) with the runtime it imports, and `check:sandbox-sync` fails when the committed page is not that build. It was a hand-kept ES5 port until 3.9.4, and it drifted (`next.config.ts` records one such bug; another was 20 detents a turn against the lab's 24).
- **Annotations** — a pattern's frame, ramp, knob ranges and layer stack travel *inside its code* as one-line comments so they survive every copy: `@matrix` (`src/lib/pattern/matrix.ts`), `@ramp` (`src/lib/pattern/ramp.ts`), `@knobs` (`src/lib/pattern/knobs.ts` — the lab's knob state in `src/lib/lab/annotations.ts` and the community's card reader in `src/lib/community/knobs.ts` both build on it), `@stack` (`src/lib/lab/stackShare.ts`).
- **`src/lib/pattern/controls.ts`** — knob-scale constants shared with the firmware.
- **`src/lib/pattern/share.ts`** — licence header + attribution footer, injected at export time only.
- **`src/lib/pattern/packs.ts`** — the Basics pack that ships with the firmware (`public/packs/`, built by `firmware/toolchain/make_pack.py`).
- **`src/lib/ai/gemini.ts`** — bring-your-own-key Gemini generation. The key lives in `localStorage` and calls go straight from the browser to Google; no server proxy, no bundled key.

## Pattern Lab (`src/app/pattern-lab/` + `src/lib/lab/`)

A layered, dockable workspace: nine panels over a layer-stack project. A panel is one entry in `panels/registry.tsx` (id, title, component, where it docks by default) plus its component file — the shell derives the dockview component map, the Panels menu and the default layout from that list, and the four heavy editors load on demand. The project is one Zustand store, `src/lib/lab/store.ts`, which the render engine (`engine.ts`) reads imperatively each frame and the panels subscribe to; its actions are composed from one slice per concern under `src/lib/lab/store/` (project, layers, knobs, ramp, director, gallery), with the helpers they share in `store/shared.ts`. Everything the lab keeps in `localStorage` is listed in `src/lib/lab/persist.ts`, with the read/write helpers every persistence site uses. Pixel undo stacks are `src/lib/lab/pixelHistory.ts`.

| Panel | Where | What |
| :--- | :--- | :--- |
| Preview, Layers, Code, Knobs, Color Ramp | `panels/` | The editor proper. Layers are code (JS) or pixel (RGBA buffer, edited in place and versioned by `rev`); ramps are per layer, knobs are one shared set |
| Pixel | `panels/PixelPanel.tsx` + `panels/pixel/` + `lib/lab/pixelTools.ts` | Pixel-art editor. The panel composes one hook per concern (`usePixelToolState`, `usePixelSelection`, `usePixelViewport`, `usePixelCanvases`, `usePixelPointer`, `usePixelKeyboard`) and two toolbar components; `pixelToCode.ts` turns a sprite into standalone pattern code |
| Gallery | `panels/GalleryPanel.tsx` | Gemini variant generation queue |
| Graphic Export | `panels/CapturePanel.tsx` + `lib/lab/capture/` | Stills and clips at print sizes, rendered by a second engine in a Web Worker (WebCodecs + `mediabunny`, all client-side), plus a GLSL shader twin for posters. `probe.ts` decides whether a pattern can be re-rendered at another size or must be upscaled |
| Director | `panels/DirectorPanel.tsx` + `panels/director/` + `lib/lab/director/` | Knob automation over time — keyframes, bezier eases — baked to `.pfs` show files (`src/lib/pattern/pfst.ts` is the codec) and exported as MIDI. The panel composes `useTransportView`, `useTimelineZoom`, `useShowEditing`, the file helpers and two bars; the lanes are `DirectorLanes.tsx` |

Each panel owns its stylesheet (`panels/<Panel>.module.css`); `PatternLab.module.css` keeps only what two or more files draw with, and `LabPanels.module.css` the dock chrome. The lab reaches the community through exactly one file, `community.ts` (the publish and send modals, the configured switches, the handoff, the `.pfs` reader) — ESLint refuses any other import of `@/components/community` or `@/lib/community` from under the lab.

Exports flatten the visible stack to one standalone pattern (`flatten.ts`); `hExport.ts` writes the C++ header; `HardwareModal.tsx` sends it to the build service or the panel. Persistence is `localStorage`: the project (`serialize.ts`, `patternflow_lab_project_v2`), the dock layout, a ring of parked sessions (`sessions.ts`), capture settings and shaders under their own keys, and the legacy v1 draft/gallery keys read by `src/lib/lab/legacyDraft.ts`.

## Community (`src/lib/community/` + `src/components/community/`)

SQLite via Drizzle (`server/schema.ts`; migrations in `web/drizzle/`, applied on first open by `server/db.ts`), Better Auth (`server/auth.ts`), reads in `server/queries/` — one file per domain (patterns, decks, workshop, moderation, users, notifications, plus the shared sub-selects), re-exported by `server/queries.ts` — attachments and thumbnails on disk under `communityDataDir()` (default `web/data/`, gitignored — set `COMMUNITY_DB_PATH` on a real deployment). **`lib/community/server/` is the server side** — everything that touches SQLite, the filesystem or a session — and ESLint refuses a value import of it from `components/` or a `*Client.tsx` (type imports are fine; a value crosses through an API route). The rest of `lib/community/` is either `"use client"` (`auth-client`, `deviceHost`, `download`, `handoff`, `knobs`, `thumbs`) or pure and usable anywhere (`validate`, `license`, `deck`, `workshop`, `cors`, …).

Patterns render in a sandboxed iframe (`public/pattern-sandbox.html`, driven by `components/community/SandboxPreview.tsx`). Pattern Lab hands off to the community through `handoff.ts` (fork vs. edit-in-place), and publishes through `components/community/PublishModal.tsx`.

The **firmware build service** (`/api/community/builds` + `scripts/build-worker.ts` + `src/lib/firmware/moduleRunner.ts`) compiles a submitted header into a `.pfm` module with the firmware toolchain. It is gated behind `BUILD_ENABLED` and off by default: compiling submitted C++ is arbitrary code execution at compile time.

## Content pipeline

- **Section copy** — `content/build.md`, `content/pattern.md`, `content/inside.md`, parsed with gray-matter via `src/lib/content.ts`.
- **Journal** — `content/journal/<slug>.mdx` (Korean) + `<slug>.en.mdx` (English), loaded by `src/lib/journal.ts`, rendered through `components/journal/`. Images in `public/journal/<slug>/`.
- **Static data in code** — `src/app/roadmap/roadmap-data.ts`, `src/app/variants/variants-data.ts` (the shelf), `src/lib/atlas/data.ts` (the pattern-exploration map). Hand-curated; edit the file.

## Analytics

PostHog (`src/providers/PostHogProvider.tsx`, event helpers in `src/lib/posthogEvents.ts`) plus Vercel Analytics / Speed Insights. All no-ops when the env vars are absent.

## Environment variables

`web/.env.example` is the complete, commented list. The site builds and runs with none set; each group switches on one deployment concern:

| Group | Vars |
| :--- | :--- |
| Analytics | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` |
| Roadmap | `GITHUB_TOKEN` |
| Community host | `COMMUNITY_ENABLED`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `COMMUNITY_DB_PATH`, `COMMUNITY_ALLOWED_ORIGINS`, `COMMUNITY_ADMIN_USERNAMES` |
| Every deployment with a community | `NEXT_PUBLIC_COMMUNITY_URL` |
| Build service | `BUILD_ENABLED`, `NEXT_PUBLIC_BUILD_ENABLED`, `FIRMWARE_SRC_DIR`, `BUILD_WORK_DIR`, `BUILD_ARTIFACT_DIR`, `ARDUINO_CLI_PATH`, `BUILD_FQBN`, `PYTHON_PATH`, `WORKER_ID`, `BUILD_POLL_MS` |
| Edition images | `VARIANT_BIN_DIR` |
| Local dev | `NEXT_DEV_ORIGINS` |

## Conventions

- Styling: Tailwind v4 (`@import "tailwindcss"` in `globals.css`) + global custom CSS; larger components use CSS Modules (`*.module.css`).
- **Layering:** `lib/` is the bottom. `app/` and `components/` import from it; it never imports from them (ESLint enforces it). A type a component and a serializer share belongs in `lib/` — `lib/community/cardTypes.ts` is the precedent.
- Adding a preset: add the JS file under `src/lib/presets/`, register it in `index.ts`, then generate the firmware `.h` with the Pattern Lab "Copy C++ prompt" flow.
- Tests are the `check:*` scripts in `package.json` — bespoke smoke suites under `scripts/*-smoke.ts`, one per subsystem — plus `check:panels`, a Vitest + jsdom + Testing Library harness (`vitest.config.ts`, `test/setup.ts`) for the Pattern Lab panels, where pointer gestures, keyboard shortcuts, undo and the Director's keyframes need a DOM. Those tests live beside the panels (`panels/*.test.tsx`) and read the store's buffers rather than the canvas, which jsdom does not have. `npm run check:ci` runs every one that needs nothing a CI runner lacks; `check:module` wants the Xtensa toolchain and stays local.
- CI (`.github/workflows/web-ci.yml`) lints, typechecks (`npm run typecheck`), builds and runs `check:ci` on every PR touching `web/`.
