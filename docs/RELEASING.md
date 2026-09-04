# Releasing Patternflow

Patternflow uses one unified semantic version for the public project.

The project version covers firmware, PCB, case files, web, and docs together. Use tags like `v2.0.0`, not separate public `fw-*`, `hw-*`, or `web-*` release tags.

## Version rules

- **PATCH** (`v2.0.1`) -- documentation fixes, small firmware/web bug fixes, no user-facing build change.
- **MINOR** (`v2.1.0`) -- new patterns, new web features, compatible case or PCB improvements.
- **MAJOR** (`v3.0.0`) -- hardware-incompatible changes, major interaction changes, or a new build path.

## Two commands

Since 3.9.3 the checklist below is a script. On `dev`, with a clean tree and
the `[Unreleased]` section of `CHANGELOG.md` written:

```bash
python firmware/toolchain/release.py cut v3.9.4 --audio v0.5.4 --performance v0.2.4 --utility v0.1.1
```

bumps the versions, dates the changelog section, updates `AGENTS.md`, runs
`shelf.sh` for the core and each named edition, points the flasher manifest
and the `/editions` cards at the new images, runs the web checks, commits
`release: v3.9.4` and tags it. Name only the editions that should be re-cut;
the others keep their image. Then write the release notes and

```bash
python firmware/toolchain/release.py publish v3.9.4 --notes notes.md
```

pushes, opens the dev → main pull request from the changelog section, waits
for its checks, merges, creates the GitHub release from the notes, attaches
the edition images under their release names, and waits for the workflow
that attaches the core images. `README.md`'s *Moving fast* note is prose and
stays yours. `cut --no-build --no-commit` is the dry run.

## Release checklist

What the two commands do, step by step - and the way to do it by hand.

1. Make sure all intended changes are committed, and `./firmware/bundles/build.sh all` is green if anything under `firmware/` moved.
2. Bump the version the firmware reports: `PF_IMPROV_FW_VERSION` in `firmware/patternflow/net_config.h` (written `X.Y.Z`, no `v`). `shelf.sh` refuses a core image whose define disagrees with the version it is being shelved as.
3. Turn `CHANGELOG.md`'s `[Unreleased]` into `## [X.Y.Z] - YYYY-MM-DD` and open a fresh `[Unreleased]` above it.
4. Update the version the docs claim: the "current" line in `AGENTS.md`, the *Moving fast* note in `README.md`, and any guide that names a release.
5. If hardware changed: confirm `BUILD_GUIDE.md`'s parts table, `hardware/bom/bom_v*.csv` and the schematic agree.
6. Stage the images the site serves:

   ```bash
   ./firmware/bundles/shelf.sh core vX.Y.Z
   ```

   then point `web/public/flash/manifest.json` at the new folder. An edition that also moved gets its own `shelf.sh <edition> vA.B.C` and a card update in `web/src/app/editions/editions-data.ts`. The shelf retires the previous folder of the same name — older images stay on their tags.
7. Run the web checks from `web/`: `npm run lint && npm run typecheck && npm run check:ci && npm run build`.
8. Commit and tag:

   ```bash
   git commit -m "release: vX.Y.Z"
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   git push origin dev && git push --tags
   ```

9. Create the GitHub Release from the tag. Publishing it triggers **Firmware release assets**, which attaches the four flash images from the tag plus a generated `FLASHING.md` with offsets and hashes.
10. Confirm it went green before announcing; re-run it with `workflow_dispatch` if it did not fire.

## Current release line

`CHANGELOG.md` is the record — one section per release, newest first — and the [releases page](https://github.com/engmung/Patternflow/releases) carries the notes and the flashable images. The shape of the line, for orientation:

- `v1.x` -- first public buildable release, then the multi-pattern firmware and browser flasher.
- `v2.x` -- the v2.0 board (GPIO0 cold-boot fix, cleaned silkscreen), custom pattern workflow, the web platform. `v2.1.0` is the last release for v2.x hardware.
- `v3.0.0` -- the v3.0 board. Every later `v3.x` is firmware/web on unchanged hardware: `.pfm` modules over Wi-Fi (3.2), shows and the Director (3.6), the feature seam (3.7), editions (3.8).
- Editions (`audio`, `performance`, `utility`) carry their own version lines, independent of the project version — see `docs/EDITIONS.md`.
