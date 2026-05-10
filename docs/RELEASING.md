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
3. Update version references in `README.md`, `docs/BUILD.md`, web copy, and firmware docs.
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

## Current release line

- `v1.0.0` -- first public buildable release.
- `v1.1.0` -- unified multi-pattern firmware and browser flasher.
- `v2.0.0` -- GPIO0 cold-boot fix, cleaned silkscreen, custom pattern workflow, and substantially complete web platform.
