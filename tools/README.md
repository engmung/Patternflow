# tools/

Clients that Patternflow ships and that run on their own — a browser extension, a phone app, a diagnostic script. The line between this folder and [`integrations/`](../integrations/README.md): a **tool** is a standalone program of ours; an **integration** is a bridge that runs inside or beside someone else's software (a DAW, Max, TouchDesigner, Node-RED). Both talk to the panel only through the contracts in [`docs/`](../docs/README.md#contracts--other-software-is-built-against-these-not-against-the-firmware-source).

| Folder | What it is | Contract |
| :--- | :--- | :--- |
| [`patternflow-audio-extension/`](patternflow-audio-extension/README.md) | Chrome/Edge extension: captures the current tab's audio, splits it into four bands you shape on a response graph, streams the levels to the panel | [`audio-ws-spec.md`](../docs/audio-ws-spec.md) |
| [`patternflow-audio-android/`](patternflow-audio-android/README.md) | The phone-side twin: captures what the phone is playing and drives the knobs with it, for filming | [`audio-ws-spec.md`](../docs/audio-ws-spec.md) |
| [`rtpmidi-probe/`](rtpmidi-probe/README.md) | A plain-Python RTP-MIDI session initiator that walks the MIDI contract against a panel from a machine with no MIDI driver | [`midi-spec.md`](../docs/midi-spec.md) |

## The extension is also firmware source

The band editor in `patternflow-audio-extension/` (`editor.html`, `editor.css`, `editor.js`, `editor-adapter.js`) is the **authoring source of the device's own `/audio-in` console page**: `firmware/toolchain/build_audio_in_page.py` assembles `firmware/patternflow/console/audio-in.html` from those files, and the `console-sync` workflow fails if the two drift. Edit the editor here, never the generated page, and do not move this folder — the build script and the workflow hold its path.

## License

Code in `tools/` is MIT, like the firmware and the site ([`LICENSE-MIT`](../LICENSE-MIT)). Each tool's README says how to build and run it.
