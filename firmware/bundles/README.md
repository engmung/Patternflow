# bundles/

Named firmwares, built from this repository.

Everything Patternflow does lives in `patternflow/` — the panel, the pattern
loader, Wi-Fi, sleep, OSC, MQTT, the show player, weather, audio. **A bundle
does not add code.** It is two files saying which of that gets compiled in,
and which settings differ.

```
bundles/audio/
  addons_local.h    which addons this firmware has, and in what order
  overrides.h       what it calls itself, and any setting it changes
```

That is the whole of it. The default build — what ships on the board — needs
no bundle at all, because it is simply everything.

```bash
./firmware/bundles/build.sh          # the default: everything
./firmware/bundles/build.sh audio    # the audio bundle
./firmware/bundles/build.sh audio flash patternflow.local
```

## When a bundle is worth making

Not for "everything minus a few things". That was tried and it is pointless:
dropping three addons saved 280 KB of flash on a board using 45 % of it, and
left the ceiling on loadable patterns *exactly where it was* — 73,716 bytes
either way. Nobody would switch, and they would be right not to.

A bundle earns its place when it carries something the default **cannot**:

| | why not in the default |
|---|---|
| **audio** | an on-board microphone that needs four wires soldered to the DevKit, and a Wi-Fi transmit power that is not the conformance-tested one |

Three shapes of reason, and they are not the same:

- **Not ready.** Experimental, or needs hardware the board does not have.
- **Not universal.** Correct for a situation, wrong as a default — a radio
  setting for a hostile venue, say.
- **Deliberately still.** Somebody building a show around a firmware and
  needing it to behave identically at the next gig, pinned to a core version
  and not moving.

The card on [patternflow.work/variants](https://patternflow.work/variants)
says which of the three each bundle is, because a person choosing needs to
know whether they are picking up something unfinished or something frozen.

## Graduating

A bundle is not a permanent home. When the microphone works and the board has
a footprint for it, that addon joins the default list and the audio bundle
either dissolves or picks up whatever is next. Nothing here is meant to
accumulate.

## Owning one

A bundle can be somebody else's. The two files are small, they conflict with
nothing, and the person who owns a bundle decides what goes in it and when it
cuts a version — without owning a fork, and without the code leaving this
repository where the compiler keeps it honest against every core change.

See [`../patternflow/addons/README.md`](../patternflow/addons/README.md) for
what an addon is and the hooks it can answer.
