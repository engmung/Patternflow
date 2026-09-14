# docs/

What is here, and what is not. The rule for the split: **a guide somebody follows start to finish lives at the repository root** (`BUILD_GUIDE.md`, `BUILD_GUIDE_v2.md`, `PATTERN_GUIDE.md`, `FEATURE_GUIDE.md`, `AUDIO_GUIDE.md`); **a contract, a reference, a walk-through for one task, or a record lives here**; and a folder explains itself in its own README. The folder-by-folder map of the whole repository is [`REPOSITORY.md`](REPOSITORY.md).

## Contracts — other software is built against these, not against the firmware source

- [`rest-api.md`](rest-api.md) — the device's HTTP API (`/api/*`), the console pages, and the table for choosing between HTTP, OSC, MIDI and MQTT
- [`osc-spec.md`](osc-spec.md) — OSC over UDP (DAWs, Max, TouchDesigner)
- [`midi-spec.md`](midi-spec.md) — the panel as a network MIDI port
- [`mqtt-spec.md`](mqtt-spec.md) — MQTT topics, both directions, the roles, and why the channel decides whether a write sticks
- [`audio-ws-spec.md`](audio-ws-spec.md) — the audio-react WebSocket the browser extension and the phone app speak
- [`pfst-v2-spec.md`](pfst-v2-spec.md) — the `.pfs` show table, with test vectors in [`pfst-v2-vectors/`](pfst-v2-vectors/)
- [`panel-compatibility.md`](panel-compatibility.md) — a buying guide first (which HUB75 panels light up and which stay dark), then the reference for other sizes

## How the firmware is put together

- [`EDITIONS.md`](EDITIONS.md) — features, compositions, editions: the seam, the rule that the core names no feature, the vocabulary. **Read before touching firmware.**
- [`rfc-core-and-variants.md`](rfc-core-and-variants.md) and its [progress log](rfc-core-and-variants-progress.md) — the 2026-08 RFC that produced the seam. Historical: it says *addon* and *variant* where the tree says *feature* and *edition*, and its listing rules have been superseded by `EDITIONS.md`.

## Walk-throughs — one task, start to finish

- [`midi-ableton.md`](midi-ableton.md) — the panel as a MIDI port in Ableton Live, with screenshots
- [`director-midi.md`](director-midi.md) — how a Director show becomes a MIDI clip
- [`assembly/`](assembly/README.md) — the assembly map: which enclosure with which electronics, and where each route is documented
- [`../firmware/CUSTOM_PATTERNS.md`](../firmware/CUSTOM_PATTERNS.md) — the hands-on pattern route (the everyday one is [`PATTERN_GUIDE.md`](../PATTERN_GUIDE.md))
- [`../firmware/patternflow/console/README.md`](../firmware/patternflow/console/README.md) — editing or adding a device console page

## Building it

- [`assembly/`](assembly/README.md) — the map. The full guide is [`../BUILD_GUIDE.md`](../BUILD_GUIDE.md); the files to order are described in [`../hardware/README.md`](../hardware/README.md)
- [`build-guide/images/`](build-guide/images/) — photos for the build guides (`images/` is the v2 set, `images/v3/` the current board)
- [`LICENSE-SUMMARY.md`](LICENSE-SUMMARY.md) — MIT for code, CC BY-SA 4.0 for hardware, docs and bundled patterns, and what that means for a pattern you publish or a remix you share

## Contributing

- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — one table: what you have → where it goes → what CI runs on it
- [`../SUPPORT.md`](../SUPPORT.md) — where to ask what
- [`REPOSITORY.md`](REPOSITORY.md) — the folder-by-folder map, and the list of files that outside things link to

## Running the project

- [`RELEASING.md`](RELEASING.md) — the `dev` → `main` routine, cutting a release, what the workflows attach
- [`SERVICES.md`](SERVICES.md) — the production hosts (community, build worker) and their systemd units. Korean.

## Records

- [`investigations/`](investigations/) — dated post-mortems
- [`releases/`](releases/) — long-form notes for three July 2026 releases, kept as written; notes since 3.2 are on [GitHub Releases](https://github.com/engmung/Patternflow/releases), and `CHANGELOG.md` at the root is the complete record
- [`manifesto.md`](manifesto.md) — why Patternflow exists, and (section 6) how we treat each other
- [`images/`](images/), [`media/`](media/) — assets the guides and the site reference
