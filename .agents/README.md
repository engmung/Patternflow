# `.agents/` — AI Agent Harness

This directory is the Antigravity harness folder for Patternflow. It is version-controlled and public — part of the open-source release.

## What is here

Nothing an agent needs to read first. The root `AGENTS.md` is the single context file, loaded in every session by Antigravity, Cursor and Claude Code alike; it carries the repository map, the hard rules, the build commands and the versioning conventions.

The skills and workflows that used to live here (`add-pattern`, `update-bom`, `release-version`, `firmware-cleanup`, `/release`, `/update-build-doc`) were retired on 2026-09-03. They were written against the v1/v2 firmware and board — patterns as functions inside `patternflow.ino`, an SMD BOM, version numbers in folder names — and an agent following them today would edit the firmware core (which `AGENTS.md` forbids) or "correct" the v3 BOM back to v2. The procedures they described now live where they are kept current:

- releasing → `docs/RELEASING.md` and `.github/workflows/firmware-release.yml`
- writing a pattern → `firmware/CUSTOM_PATTERNS.md`, `PATTERN_GUIDE.md`
- writing a feature or an edition → `FEATURE_GUIDE.md`, `docs/EDITIONS.md`
- the BOM → `hardware/bom/README.md` (the CSV is the source of truth)

## Contributing to the harness

If you find yourself repeatedly explaining the same thing to your agent while working on Patternflow, that is a candidate for a new skill under `skills/<name>/SKILL.md`. Write it against the current tree, and name the file it derives its facts from, so the next reader can tell when it has gone stale.
