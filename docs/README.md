# docs/

What is here, and what is not. The rule for the split: **a guide somebody follows start to finish lives at the repository root** (`BUILD_GUIDE.md`, `BUILD_GUIDE_v2.md`, `PATTERN_GUIDE.md`, `FEATURE_GUIDE.md`, `AUDIO_GUIDE.md`); **a contract, a reference or a record lives here.**

## Contracts — other software is built against these, not against the firmware source

- [`rest-api.md`](rest-api.md) — the device's HTTP API (`/api/*`), the console pages, and how to choose between HTTP, OSC and MQTT
- [`osc-spec.md`](osc-spec.md) — OSC over UDP (DAWs, Max, TouchDesigner)
- [`midi-spec.md`](midi-spec.md) — the panel as a network MIDI port
- [`audio-ws-spec.md`](audio-ws-spec.md) — the audio-react WebSocket the browser extension and the phone app speak
- [`pfst-v2-spec.md`](pfst-v2-spec.md) — the `.pfs` show table, with test vectors in [`pfst-v2-vectors/`](pfst-v2-vectors/)
- [`panel-compatibility.md`](panel-compatibility.md) — which HUB75 panels work, and what to change for other sizes

## How the firmware is put together

- [`EDITIONS.md`](EDITIONS.md) — features, compositions, editions: the seam, the rule that the core names no feature, the vocabulary. **Read before touching firmware.**
- [`rfc-core-and-variants.md`](rfc-core-and-variants.md) and its [progress log](rfc-core-and-variants-progress.md) — the 2026-08 RFC that produced the seam. Historical: it says *addon* and *variant* where the tree says *feature* and *edition*.
- [`director-midi.md`](director-midi.md) — how a Director show becomes a MIDI clip
- [`midi-ableton.md`](midi-ableton.md) — the Ableton walk-through

## Building it

- [`assembly/`](assembly/README.md) — the assembly map: electronics paths, enclosure paths, firmware. The full guide is [`../BUILD_GUIDE.md`](../BUILD_GUIDE.md).
- [`build-guide/images/`](build-guide/images/) — photos for the build guides (`images/` is the v2 set, `images/v3/` the current board)
- [`LICENSE-SUMMARY.md`](LICENSE-SUMMARY.md) — MIT for code, CC-BY-SA 4.0 for hardware and bundled patterns, and what that means for a pattern you publish

## Running the project

- [`RELEASING.md`](RELEASING.md) — cutting a release: version, changelog, tag, what the workflows attach
- [`SERVICES.md`](SERVICES.md) — the production hosts (community, build worker) and their systemd units. Korean.

## Records

- [`investigations/`](investigations/) — dated post-mortems
- [`releases/`](releases/) — long-form notes for particular releases; `CHANGELOG.md` at the root is the complete record
- [`manifesto.md`](manifesto.md) — why Patternflow exists
- [`images/`](images/), [`media/`](media/) — assets the guides and the site reference
