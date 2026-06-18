# `.agents/` — AI Agent Harness

This directory contains the AI agent harness for Patternflow. It configures how AI coding agents (Antigravity, Cursor, Claude Code) understand and work on this project.

It is version-controlled and public — part of the open-source release.

## Why this exists

Patternflow extends Nam June Paik's *Participation TV* by opening up not just the artwork but the methods of making it. The hardware is open, the firmware is open, and the development workflow is open too. If you fork this project and use an AI coding agent, your agent picks up the same conventions, skills, and project context that the author uses.

## Structure

- `rules/project-context.md` — Detailed project context loaded when agents need deep understanding of the codebase. Architecture, tech stack, conventions, license structure.
- `skills/` — Specialized capabilities the agent loads on demand based on your request:
  - `update-bom/` — Sync the BOM in `BUILD_GUIDE.md` against the schematic
  - `release-version/` — Tag and document a new release
  - `add-pattern/` — Add a new generative pattern to the firmware
  - `firmware-cleanup/` — Prepare firmware code for public release
- `workflows/` — Slash commands invoked manually:
  - `release.md` → `/release`
  - `update-build-doc.md` → `/update-build-doc`

## How agents use this

The root `AGENTS.md` (at the repository root) is loaded in every session. Files in `.agents/` are loaded selectively based on the task. Skills auto-trigger when their `description` field matches your request; workflows are explicit slash commands.

## Compatibility

- **Antigravity** — Full native support (`.agents/` is the canonical format).
- **Cursor / Claude Code** — Read `AGENTS.md` at the root via the cross-tool standard. Skills are not auto-loaded but can be invoked manually by referencing the relevant `.agents/skills/<name>/SKILL.md`.

## Contributing to the harness

If you find yourself repeatedly explaining the same thing to your agent while working on Patternflow, that's a candidate for a new skill. PRs that add or improve skills are welcome.