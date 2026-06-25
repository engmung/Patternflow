# Contributing to Patternflow

Patternflow is moving from a single public build guide toward a set of build paths, pattern tools, and community contributions.

This file is intentionally a starting point. The contribution process will become more detailed as more people build, test, and modify Patternflow.

## Ways to Help

- Build Patternflow and share photos, problems, and notes.
- Improve the build documentation when a step is unclear.
- Test alternate build paths, especially breadboard electronics and future laser-cut enclosure files.
- Suggest better sourcing options for parts.
- Share custom patterns with the community.
- Report firmware, web, or documentation issues.

## Pattern Contributions

Custom patterns are welcome as community work, but official bundled firmware patterns will be curated for now. If you make something interesting, share it in the Discord **patterns** channel (follow the post guidelines there) or open an issue with the source.

**Licensing — inbound = outbound.** By sharing a pattern (Discord, issue, or PR) you agree to license it under **CC-BY-SA 4.0** — the same commons as the rest of Patternflow — with attribution kept in the code header (`// Author:` and `// SPDX-License-Identifier: CC-BY-SA-4.0`). There is no copyright assignment (no CLA): you keep authorship, and the project just gets the right to bundle and redistribute it. You may set a different license in the header as long as it still lets the project bundle and redistribute the pattern.

## Commit messages

Keep it simple: start with the area, then a short summary in plain present tense.

```
area: short summary

web: collapse the preset list on mobile
firmware: fix reversed encoder direction
docs: clarify the breadboard wiring step
```

Common areas: `web`, `firmware`, `pcb`, `enclosure`, `docs`, `pattern`. Use
`wip(area): …` for work that isn't finished yet. That's the whole rule — no
tooling enforces it, it just keeps the history (and the Discord dev-log)
readable.

## Development workflow

Work happens on `dev`, then lands on `main` through a pull request.

```
work on dev  →  commit early and often  →  open a PR into main  →  merge
```

- **Commit freely on `dev`.** Commits are cheap save points; small and frequent
  is good. Keep throwaway `wip:` commits here rather than on `main`.
- **Code changes go through a PR** (anything under `web/` or `firmware/`). A PR
  runs CI (`web/` PRs must pass `next build`) and groups the change into one
  clean Discord dev-log post. Trivial doc/typo fixes can be committed directly.
- **Bigger or riskier work** gets its own branch (`feat/…`, `fix/…`) off `dev`.
- **After a PR merges**, pull `main` back into `dev` so the branches don't
  drift apart over time:

  ```
  git checkout dev && git merge origin/main && git push origin dev
  ```

Releases are published from `main` (GitHub → Releases → *Generate release
notes*), which posts an announcement to Discord.

## Project Rules

Project rules and guidelines are currently under consideration and will be finalized in the future.

## Where to Start

- Assembly map: [docs/assembly/README.md](docs/assembly/README.md)
- Current full build guide: [BUILD_GUIDE.md](BUILD_GUIDE.md)
- Custom patterns: [firmware/CUSTOM_PATTERNS.md](firmware/CUSTOM_PATTERNS.md)
- Discord: [discord.gg/Vr9QtsxeTk](https://discord.gg/Vr9QtsxeTk)
