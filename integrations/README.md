# integrations/

Bridges that run inside or beside someone else's software and connect it to a Patternflow: a Max for Live device today, a TouchDesigner component or a Node-RED flow tomorrow. (A standalone program of ours is a *tool* and lives in [`tools/`](../tools/README.md).)

An integration is built against the **contracts** in `docs/`, never against the firmware source, and it never imports code from `firmware/` or `web/`. That is what lets it keep working across firmware releases: the panel promises the wire, not the implementation.

| Contract | Spec | Use it when |
| :--- | :--- | :--- |
| HTTP | [`rest-api.md`](../docs/rest-api.md) | one-shot commands and status; also the table for choosing between all four |
| OSC over UDP | [`osc-spec.md`](../docs/osc-spec.md) | Max, TouchDesigner, Resolume, Processing; both directions, rich payloads |
| Network MIDI | [`midi-spec.md`](../docs/midi-spec.md) | any DAW: the panel is a MIDI port |
| MQTT | [`mqtt-spec.md`](../docs/mqtt-spec.md) | home and venue buses, Home Assistant, Node-RED, boards following each other |

OSC, MIDI and audio-react ship in the **Audio** edition and MQTT in the **Performance** edition, installed from [the shelf](https://patternflow.work/editions) in one click; no firmware rebuild is needed on the user's side.

## In this folder

| Folder | Host | Contract | Status |
| :--- | :--- | :--- | :--- |
| [`ableton/`](ableton/README.md) | Ableton Live, via a Max for Live device | OSC | in-tree, maintained |

The Home Assistant integration (custom component and dashboard card, by [@bendobos](https://github.com/bendobos)) left this repository on 2026-09-03 and is maintained by its author separately. A link will be added here when there is one to add.

## Contributing one

One folder per host, `integrations/<host>/`, containing the source and a `README.md` with these headings, in this order: **What it does · Contract it uses · Requirements · Install · Connect · Troubleshooting · Tested with** (firmware and edition versions) **· License**. [`ableton/README.md`](ableton/README.md) is the reference shape. Add a row to the table above in the same pull request. Code is MIT unless the README says otherwise; a `.maxpat`, `.tox` or flow file that cannot carry a header takes the license its README states.

There is no build step in CI for integrations. A pull request is checked for the README and for naming at least one contract; the maintainer tries it against a panel when they can, so say which firmware you tested with.
