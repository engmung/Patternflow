# Web Architecture

The `web/` app is the Patternflow site at [patternflow.work](https://patternflow.work): landing page, Live Editor, browser flasher, journal, and internal pattern tooling in a single Next.js project.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Three.js via react-three-fiber · Zustand · MDX. Deployed on Vercel.

## Route map (`src/app/`)

| Route | What it is |
| :--- | :--- |
| `/` | Landing page (`HomeView` opened on the hero tab) |
| `/build` · `/pattern` · `/inside` | The same `HomeView`, deep-linked to a tab — real URLs for SEO/sharing, not separate pages |
| `/build/breadboard` | Breadboard electronics build path |
| `/journal` · `/journal/[slug]` (+ `/en` variants) | Bilingual (ko/en) MDX journal with per-article OG image generation |
| `/roadmap` | Roadmap rendered from GitHub issues via `/api/roadmap` |
| `/api/roadmap` | Server route that pulls open issues + sub-issue progress (10 min revalidate; optional `GITHUB_TOKEN` for rate limit) |
| `/pattern-lab` | **Internal, noindex.** Pattern authoring/curation workspace: Monaco editor, preset library, BYOK Gemini generation, JS→C++ conversion prompt |
| `/video-baker` | **Internal, noindex.** Bakes video clips into 128×64 PFV loops for the hardware |
| `/business` · `/contact` | Static pages |
| `feed.xml` · `sitemap.ts` · `robots.ts` | Feeds and SEO plumbing |

`src/proxy.ts` (Next.js proxy/middleware) routes journal visitors between ko/en using the `pf-journal-lang` cookie and `Accept-Language`.

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
    ├── PatternPanel.tsx                 ← Live Editor: preset browser, knobs, AI prompts, web flasher
    ├── InsidePanel.tsx + InsideGlobe/   ← concept content + community builds globe
    └── Sponsor.tsx
```

Cross-component state (active tab, virtual knob values, bloom toggle, etc.) lives in the Zustand store `src/store/useAppStore.ts`. Theme is a small React context (`src/context/ThemeContext.tsx`).

## Pattern system

This is the core of the site and mirrors the firmware:

- **`src/lib/presets/`** — JS pattern sources, one file per pattern. **Source of truth** for the firmware preset `.h` files (`firmware/patternflow/presets/` is generated from these — see `firmware/patternflow/README.md`). `_TEMPLATE.ts` is the canonical skeleton; `index.ts` is the registry.
- **`src/lib/patternHarness.ts`** — runs pattern JS in the browser on a 128×64 virtual matrix with 4 virtual encoders (20 detents/turn), matching device semantics (`knobDeltas`, `btnPressed`/`btnHeld`).
- **`src/lib/gemini.ts`** — bring-your-own-key Gemini generation for Pattern Lab. The key lives in `localStorage` and calls go straight from the browser to Google; no server proxy, no bundled key.
- **Flasher** — esp-web-tools driven by `public/flash/manifest.json` + prebuilt binaries in `public/flash/bin/`.
- **`src/lib/serialUpload.ts`** — Web Serial upload of PFV data to a running device (`PFV:<name>:<size>\n` + raw bytes).
- **`src/lib/pfv.ts`** — PFV1 binary LED video format (128×64, RGB565). **`src/lib/ledPipeline.ts`** — fit/crop/dither correction pipeline. **`src/lib/videoDecoder.ts`** — mp4box + WebCodecs decode for the Video Baker.

## Content pipeline

- **Section copy** — `content/build.md`, `content/pattern.md`, `content/inside.md`, parsed with gray-matter via `src/lib/content.ts`. Editing site copy means editing these files, not components.
- **Journal** — `content/journal/<slug>.mdx` (Korean) + `<slug>.en.mdx` (English), loaded by `src/lib/journal.ts`, rendered through `components/journal/` (layout, figures, lightbox, language switch). Images live in `public/journal/<slug>/`.

## Analytics

PostHog (`src/providers/PostHogProvider.tsx`, event helpers in `src/lib/posthogEvents.ts`) plus Vercel Analytics / Speed Insights. All analytics are no-ops when the env vars are absent.

## Environment variables

All optional — the site builds and runs with none set:

| Var | Used by |
| :--- | :--- |
| `NEXT_PUBLIC_POSTHOG_KEY` / `NEXT_PUBLIC_POSTHOG_HOST` | PostHog analytics |
| `GITHUB_TOKEN` | `/api/roadmap` (higher rate limit; works without it on the public repo) |

## Conventions

- Styling: Tailwind v4 (`@import "tailwindcss"` in `globals.css`) + global custom CSS; larger components use CSS Modules (`*.module.css`).
- Adding a preset: add the JS file under `src/lib/presets/`, register it in `index.ts`, then generate the firmware `.h` with the Pattern Lab "Copy C++ prompt" flow.
- CI (`.github/workflows/web-ci.yml`) lints and builds every PR touching `web/`; `next build` must pass to merge.
