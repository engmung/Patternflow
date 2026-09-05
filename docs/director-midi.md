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

### Route D — send it to the panel

The three routes above aim the clip at things inside Live. This one aims it
at the panel itself: the same CC 20–23, out over the network and straight
onto the four knobs. It needs the **Audio edition** on the panel, which is
where the `midi` feature lives.

**Once, to make the panel a MIDI port:**

1. Windows: install [rtpMIDI](https://www.tobias-erichsen.de/software/rtpmidi.html),
   open it, make a session and tick *Enabled*, then find `Patternflow` in the
   Directory and press *Connect*. macOS: *Audio MIDI Setup → Network*, the
   same idea. (The panel can also invite your machine itself, so it comes
   back after a reboot with nobody reopening anything — the host field on the
   device's `/midi` page.)
2. Live → *Preferences → Link, Tempo & MIDI*. On that port's **Output** row,
   switch **Track** on. The **Remote** switch on its *Input* row is the other
   direction, the Bridge's; both can be on at once.

**Then, to send a lane:**

3. Make a MIDI track (Ctrl/Cmd-Shift-T) and **put no instrument on it.** An
   instrument makes the track's output audio, and the chooser you need turns
   from *MIDI To* into *Audio To*. If you want a synth too, that is a second
   track.
4. In that track's In/Out section (Ctrl/Cmd-Alt-I if it is hidden), set
   **MIDI To** to the port and the channel below it to **Ch. 1** — the panel
   listens on channel 1 unless its `/midi` page says otherwise. MIDI carries
   sixteen channels down one wire and ignores the fifteen that are not its
   own; that is all that setting is for.
5. Drop the `.mid` on that track — or draw your own: an empty clip, its
   *Envelopes* box, **MIDI Ctrl** then **20 Undefined**, Draw Mode off (**B**)
   and the grid off (**Ctrl/Cmd-4**) so breakpoints land anywhere. Alt-drag a
   segment between two breakpoints to bend it into a curve. Press play.

Knob 1 follows CC 20, the others follow 21, 22 and 23. The lane's floor is 0
and its ceiling is 127, and that is the whole of that knob's range on the
panel — one MIDI step is about 8 of the device's 1000. A value **holds** until
a hand turns that encoder, so automation and hands share the panel and the
hand always wins.

Loop the clip and that is an LFO: the shape drawn once, the clip's length its
period, tempo-locked for nothing. Draw two cycles into one lane and one into
another and the four knobs drift out of phase, which is most of what makes a
pattern stop looking like a loop.

#### The same curve turning sound as well

A track's *MIDI To* points at one destination, so the track feeding the panel
cannot also feed a synth. Three ways round it, least hassle first.

- **Copy the lane onto the mod wheel.** Select the CC 20 envelope, copy it,
  switch the chooser to **1 (Mod Wheel)** and paste — Live copies envelopes
  between parameters, not just through time. Then put **Expression Control**
  (Core Library) on that same track, source *Mod Wheel*, and *Map* it onto any
  parameter in the set; mapping does not care which track the target is on.
  Its Min/Max decides how far that parameter travels, so the light can swing
  end to end while a filter only breathes — and setting Min above Max inverts
  it, so the same curve that opens the pattern closes the filter. The catch: it is a copy, not a
  link — edit one lane and the other keeps the old shape.
- **A CC-mapping device.** Expression Control reads only Velocity, Mod Wheel,
  Pitch Bend, Aftertouch and Keytrack — never a chosen CC number. The
  community fills that gap (CCMapper, CC map8 and others on maxforlive.com),
  and those are a file you drag in rather than an install.
- **A virtual cable.** loopMIDI (Windows) or the IAC Driver (macOS):
  duplicate the track, aim the copy at the virtual port, switch that port's
  *Input → Remote* on, and MIDI-map (Ctrl/Cmd-M) the moving CC onto anything
  at all. This is Route B pointed at the panel's twin, and it is the only one
  of the three that needs no copying and reaches Live's own instruments.

Whichever you pick, choose the target by what that knob already does. If knob
1 sets a pattern's speed, put it on something that gets faster; if it sets
colour, put it on a filter. Then the eye and the ear are saying the same
thing, which is the whole point of running one curve into both.

## Light and sound together

The `.mid` drives the DAW. The **device plays the same show natively**:
export the `.pfs` (the button next to `.mid`), upload it at the device's
`/shows` page, and both are the same automation to the tick — same sampler,
same curves.

So for a synced piece: Live at 120 BPM, `.mid` clip at 1.1.1, start the show
on the device and press play together. For filmed work, the alignment slate
in [`integrations/ableton/docs/recording-sync.md`](../integrations/ableton/docs/recording-sync.md)
is the precise version of "press together".

Driving the device *from* Live has its own section above (Route D) — this
paragraph used to say there was no way, which was true until the panel became
a MIDI port. CC 20–23 over RTP-MIDI is the absolute-automation path from a DAW
to the panel, and this file plays down it unchanged. OSC's knob messages are
relative deltas ([`osc-spec.md`](osc-spec.md)), which is why MIDI is the
transport that carries a Director lane.

The **Patternflow Bridge** ([`integrations/ableton/`](../integrations/ableton/README.md))
is the other half: it maps the physical knobs to Live parameters over Wi-Fi,
so a hand on the panel plays the rig. Together with Route D the panel is an
ordinary two-way instrument in the set — it plays Live, Live plays it, and a
show can play both.

And to place the third sibling: the **Audio edition** drives the knobs *from*
sound (levels over WebSocket, [`audio-ws-spec.md`](audio-ws-spec.md)) —
reactive, live, inbound. The Director's exports are the opposite direction:
authored, deterministic, outbound. Same four knobs either way.
