# Patternflow Audio Chrome Extension

Captures audio from the currently active Chrome/Edge tab, shows a live
spectrum, maps editable frequency bands to Patternflow knobs, and streams
the four knob lanes over WebSocket. The wire protocol is a written contract:
[`docs/audio-ws-spec.md`](../../docs/audio-ws-spec.md).

The extension uses the same Patternflow mark as the web app for its toolbar
icon and popup header.

## The mapping editor

**Editor &#8599;** in the popup opens the full editor in its own tab
(`editor.html`): every band is a box drawn on the live spectrum — its width
is the frequencies it listens to, its height the level window it maps — and
a response curve turns position-in-window into knob position. Curves come as
presets (rise, fall, gate, steps, arch) or hand-dragged beziers, and every
shape bakes to a 33-point table the analysis side just interpolates — the
same table the device firmware will consume, which is the point: the editor
module (`editor.js`) is adapter-isolated (`editor-adapter.js`) and ports to
the device console by swapping the adapter only. Auto range makes the boxes
breathe with the room; grabbing a breathing edge takes manual control.
Opened outside the extension (plain http), it runs a synthesized demo
source — the fast way to iterate on the editor itself.

## Install for local testing

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `tools/patternflow-audio-extension`.
5. Open a tab that is playing audio.
6. Click the Patternflow Audio extension button.
7. Set the device host to `patternflow.local` or the board IP address.
8. Press **Start**.

Use the extension for YouTube, Spotify Web, browser games, or any other tab
or system audio. The built-in `http://patternflow.local/` page remains useful
for microphone input and audio-file experiments, but browser tab/system capture
is often blocked there because the ESP32 serves normal HTTP.

For WebSocket-only debugging, press **WS Test** instead of **Start** and move
the K1-K4 sliders. This bypasses tab capture and audio analysis completely.

## Controls

- `Spectrum`: live frequency strength display. Drag across it to set the active band's range.
- `Add Band`: starts with one band, then adds more bands as needed.
- `Output`: min/max Patternflow knob output from 0.0 to 1.0.
- `Clamp / gain`: optional input low/high clamp and sensitivity.
- `K`: target Patternflow knob index.
- `Smoothing`: global response smoothing.
- `WS Test`: connect to the device and send manual K1-K4 movements.

The extension sends delta messages like `d=0,v=0.125` to `ws://<device>:81`.

## Next: Audio Console

Future direction: expand the popup into a larger controller page for live
performance and mapping.

- Real-time spectrum and waveform visualizers.
- Drag-to-select frequency bands on the spectrum.
- Per-band mapping curves, invert, gate, attack, release, and smoothing.
- Pattern-specific presets saved in Chrome storage.
- Larger K1-K4 output meters and connection diagnostics.
- Beat/transient helpers for kick-style triggers or preset stepping.
