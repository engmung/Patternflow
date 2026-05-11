---
name: release-version
description: Use when releasing a new version (v1.x or v2.x) of Patternflow. Triggers on requests like "release v1.1", "tag a new version", "publish a release".
---

# Release Version Skill

Follow these steps to finalize and tag a new release:

1. **Verify** all changes since the last tag are committed and pushed.
2. **Update `CHANGELOG.md`:** 
   - Add a new version entry at the top.
   - Follow the "Keep a Changelog" format.
   - Use sections: `Added`, `Changed`, `Fixed`, `Known Issues`.
3. **Reference** closed GitHub issues, if any.
4. **Bump version references** across the repository:
   - `README.md` (if a specific v-string is mentioned).
   - `docs/BUILD.md` (if the version is mentioned in the header or text).
   - `firmware/patternflow/` directory name (ONLY if the update introduces major, hardware-incompatible changes).
5. **Commit** the changes with the message: `release: v1.x.0` (replace `x` with target version).
6. **Tag** the release: `git tag -a v1.x.0 -m "Release v1.x.0"`.
7. **Push tags:** `git push --tags`.
8. **Remind the user** to create a GitHub Release from the tag manually in their browser.

