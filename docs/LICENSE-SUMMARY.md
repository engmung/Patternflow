# License Summary

**The SPDX header inside a file is the authority.** Folders are not license
boundaries — the pattern presets live under `web/` and `firmware/`, which are
otherwise MIT, and each preset file carries its own `SPDX-License-Identifier:
CC-BY-SA-4.0`. That header wins. This page describes the layout; it does not
override it.

| Asset | License | What you can do |
|---|---|---|
| Firmware code (`firmware/`) | MIT | Use, modify, distribute freely. Keep the copyright notice. |
| Web code (`web/`) | MIT | Same as above. |
| Hardware designs (`hardware/`) | CC BY-SA 4.0 | Modify and share — derivatives use the same license, and credit the author. |
| Docs & build guides (`docs/`, `BUILD_GUIDE*.md`) | CC BY-SA 4.0 | Same as above. |
| Journal (`web/content/journal/`) | CC BY-SA 4.0 | Same as above. |
| **Bundled patterns** (`web/src/lib/presets/`, `firmware/patternflow/presets/`) | CC BY-SA 4.0 | Per-file SPDX headers. They sit in code folders but they are artwork, not code. |
| **Community patterns** | **Chosen by their author** — see below | Read the header in the pattern itself. |

## Community patterns

Patterns published to the [Community](https://patternflow.work/community) are
**not repository contributions**. Each one is licensed by the person who made
it, from two options:

| SPDX | What it means |
|---|---|
| **`CC-BY-SA-4.0`** (default) | Free to use and adapt, including commercially, with credit. **Adaptations must carry the same license.** |
| `CC-BY-4.0` | Free to use and adapt, including commercially, with credit. Adaptations may use any license. |

Both allow commercial use. Putting a community pattern on a club wall, a shop
display or a signboard is permitted, as long as the author is credited.

A few older patterns are under **MIT** or **CC0-1.0**. Those options have been
retired from the picker, but a license grant cannot be withdrawn — those
patterns keep the terms they were published under. Always read the header in
the pattern itself.

**Forks** cannot loosen what they came from: a fork of a CC BY-SA 4.0 pattern
must also be CC BY-SA 4.0, and every fork keeps a `Based on:` line crediting
the original author in its source.

## Contributing vs publishing

These are different things and are governed by different documents.

| | Repository contribution | Community publishing |
|---|---|---|
| Where | GitHub PR / issue / Discord | The community site |
| License | Inbound = outbound (CC BY-SA 4.0) | The author's choice, above |
| Governed by | [CONTRIBUTING.md](../CONTRIBUTING.md) | Terms of use *(not yet written)* |

## Trademark

"Patternflow" and the Patternflow logo are trademarks of Seunghun Lee.

The open-source licenses grant you rights to use the code and designs, but do
not grant permission to use the name or branding for your own commercial
products.
