# The Director's .mid export — your show in a DAW

The Pattern Lab's Director authors a show: four knob-automation lanes over
time. The device plays that show natively from a `.pfs` file. The **`.mid`
button exports the same show as a Standard MIDI File**, so the identical
automation can drive things that speak MIDI — an Ableton Live set first of
all. Both files come from the same sampler, sampling the same curves the
lab plays, so what the DAW sees is what the panel does.

This guide assumes you know nothing about MIDI files. That's fine; there is
not much to know.

## What is in the file

| | |
|---|---|
| Format | Standard MIDI File, format 0 (one track), importable by any DAW |
| Lanes | Knob 1 → **CC 20** · Knob 2 → **CC 21** · Knob 3 → **CC 22** · Knob 4 → **CC 23**, all on channel 1 |
| Values | The wire bus (0–1000) scaled to MIDI's 0–127 |
| Timing | PPQ 480 at a fixed **120 BPM** — so **1 second of show = 1 second at 120 BPM** (2 beats; a 4/4 bar = 2 s; a 30 s show = exactly 15 bars) |
| Names | The track is named after the show; four text events record which knob is which (`Glitch = CC20`) |

CC 20–23 are *undefined* controllers in the MIDI spec — nothing listens to
them by accident, which is exactly what you want for mapping.

Two behaviors carry over from the device:

- A **hold** keyframe is a single CC event — the value jumps there and stays.
  A **curve** is a dense ramp of events, one per 7-bit value change.
- A lane is **silent before its first keyframe** (on the device the knob
  keeps its live value there; in the DAW, nothing moves until the show
  says so).

## One thing to check before anything: tempo

MIDI files count **beats, not seconds**. The export is authored at 120 BPM,
where beats and seconds line up. If your Live set runs at 140 BPM the same
clip plays the whole show proportionally faster; at 90, slower.

**Set the set to 120 BPM** and show-time equals wall-clock time — the same
timing the device plays from the `.pfs`. Any other tempo is a legitimate
creative choice (the show stretches with the music), just a deliberate one.

## Ableton Live, step by step

1. In the lab: **Director → `.mid`** — the file downloads.
2. Drag it from your file manager **onto a MIDI track** in Live (Live 11/12).
   A clip appears.
3. Double-click the clip, open its **Envelopes** box (the ⊞-ish toggle at the
   clip panel's bottom-left). In the first chooser pick **MIDI Ctrl**, in the
   second pick **20 Undefined** — there is your knob 1 lane, drawn exactly as
   the Director drew it. CC 21/22/23 are the other knobs.

Now the clip *contains* the automation. To make it *move something*, pick
one of these routes, simplest first:

### Route A — drive a device on that track

Anything sitting on that MIDI track that responds to CC gets it for free:
many VST synths let you MIDI-learn CC to a parameter, and a Max for Live
device can read it with `[ctlin 20]`. Fine when the target lives on one
track.

### Route B — the loopback, to map ANYTHING in Live

Live's own **MIDI-map mode** (Ctrl/Cmd-M) can bind a CC to any knob, macro,
send, or mixer control — but only from an *input port*. So send the track
back into Live:

1. Install a virtual MIDI cable: **loopMIDI** (Windows) or use the built-in
   **IAC Driver** (macOS, enable it in Audio MIDI Setup).
2. On the `.mid` clip's track, set **MIDI To** → the virtual port.
3. Live → Preferences → MIDI: for that port's **Input**, switch **Remote**
   on.
4. Enter MIDI-map mode (Ctrl/Cmd-M), click any parameter — a synth macro, a
   filter cutoff, a return level — then press play so the clip fires its CC.
   The moving CC binds to the clicked parameter. Leave map mode.

Play the clip: the show now turns your sound. Four lanes, four macros — the
same four knobs, just aimed at a synthesizer.

### Route C — freeze it into Live automation

Record the mapped parameters onto their tracks (or record the loopback input
into another MIDI clip) and you have plain Live automation you can edit with
Live's tools, detached from the file.

## Light and sound together

The `.mid` drives the DAW. The **device plays the same show natively**:
export the `.pfs` (the button next to `.mid`), upload it at the device's
`/shows` page, and both are the same automation to the tick — same sampler,
same curves.

So for a synced piece: Live at 120 BPM, `.mid` clip at 1.1.1, start the show
on the device and press play together. For filmed work, the alignment slate
in [`integrations/ableton/docs/recording-sync.md`](../integrations/ableton/docs/recording-sync.md)
is the precise version of "press together".

What this export does **not** do is drive the device from Live: OSC's knob
messages are relative deltas ([`osc-spec.md`](osc-spec.md)), so there is no
absolute-automation path from a DAW to the panel today — the `.pfs` *is* the
device's automation format. The reverse direction exists and is great: the
**Patternflow Bridge** ([`integrations/ableton/`](../integrations/ableton/README.md))
maps the physical knobs to Live parameters over Wi-Fi, which pairs naturally
with a show playing on the device — the show turns the light *and* your
sound rig at once, with the `.mid` as the studio-side copy of the same
gestures.

And to place the third sibling: the **Audio edition** drives the knobs *from*
sound (levels over WebSocket, [`audio-ws-spec.md`](audio-ws-spec.md)) —
reactive, live, inbound. The Director's exports are the opposite direction:
authored, deterministic, outbound. Same four knobs either way.
