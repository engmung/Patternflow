# Releasing Patternflow

Patternflow uses one unified semantic version for the public project.

The project version covers firmware, PCB, case files, web, and docs together. Use tags like `v2.0.0`, not separate public `fw-*`, `hw-*`, or `web-*` release tags.

## Version rules

- **PATCH** (`v2.0.1`) -- documentation fixes, small firmware/web bug fixes, no user-facing build change.
- **MINOR** (`v2.1.0`) -- new patterns, new web features, compatible case or PCB improvements.
- **MAJOR** (`v3.0.0`) -- hardware-incompatible changes, major interaction changes, or a new build path.

## Release checklist

1. Make sure all intended changes are committed.
2. Update `CHANGELOG.md` with the new version at the top.
3. Update version references in `README.md`, `BUILD_GUIDE.md`, web copy, and firmware docs.
4. Confirm the build guide matches the current PCB schematic and BOM.
5. Run the web production build from `web/`:

   ```bash
   npm run build
   ```

6. Commit the release docs:

   ```bash
   git commit -m "release: vX.Y.Z"
   ```

7. Tag the release:

   ```bash
   git tag -a vX.Y.Z -m "Release vX.Y.Z"
   ```

8. Push branch and tags:

   ```bash
   git push origin dev
   git push --tags
   ```

9. Create the GitHub Release from the tag and attach stable firmware/build artifacts.
10. Confirm the **Home Assistant Release** workflow went green and `patternflow-homeassistant.zip`
    is attached, before announcing. HACS points at the newest release of the whole repository
    regardless of what the release changed, so a release without that asset is one HACS offers
    and then fails to download. Re-run it with `workflow_dispatch` if it did not fire.

## Current release line

`CHANGELOG.md` is the record — one section per release, newest first — and the [releases page](https://github.com/engmung/Patternflow/releases) carries the notes and the flashable images. The shape of the line, for orientation:

- `v1.x` -- first public buildable release, then the multi-pattern firmware and browser flasher.
- `v2.x` -- the v2.0 board (GPIO0 cold-boot fix, cleaned silkscreen), custom pattern workflow, the web platform. `v2.1.0` is the last release for v2.x hardware.
- `v3.0.0` -- the v3.0 board. Every later `v3.x` is firmware/web on unchanged hardware: `.pfm` modules over Wi-Fi (3.2), shows and the Director (3.6), the feature seam (3.7), editions (3.8).
- Editions (`audio`, `performance`) carry their own version lines, independent of the project version — see `docs/EDITIONS.md`.
