# Filming Patternflow with synced sound

Goal: film the device (hands + LEDs) while the mapped Ableton sound is recorded cleanly, and end up with video and audio locked together in the edit — with as little ceremony as possible, so it actually happens every time.

## The v1 workflow (no custom tools)

**Principle: the camera records scratch audio of the same sound the room hears; Live records the clean version; the editor aligns them by waveform.**

1. **Live set**: keep a dedicated **Record bus** — one audio track whose input is *Resampling*, armed. Everything you hear goes to it.
2. Play the speakers out loud (or at least a click/tone at the start) so the camera mic picks up *something* correlated with the clean audio.
3. Roll camera → hit Live's global record → perform (turn knobs, switch patterns) → stop both.
4. Export the Record bus clip as WAV, drop camera file + WAV into **DaVinci Resolve** → select both in the media pool → right-click → **Auto Sync Audio → Based on Waveform**. Resolve aligns them; mute the camera track.

That's the whole system. Premiere ("Synchronize → Audio") and Final Cut ("Synchronize Clips") do the same thing.

### Make it foolproof

- **One take = one Live recording.** Don't pause Live's transport mid-take; a single continuous WAV per camera file keeps sync trivial.
- **Clap once on camera** before performing if the speaker level is low — a transient gives the waveform matcher (and you, as manual fallback) an anchor.
- **Name by take**: `pf-take03.wav` next to `pf-take03.mp4`. Future-you will thank present-you.
- Camera and Live sample clocks drift ~1 frame per several minutes at worst; for takes under ~10 minutes, ignore it.

## v2 (planned): the device as its own clapperboard

The plan on the firmware roadmap (see [osc-spec.md](../../../docs/osc-spec.md), planned addresses):

1. A **Slate** button in the M4L bridge sends `/patternflow/slate`.
2. The firmware flashes the full matrix white for one frame; simultaneously the bridge plays a short tone into the Record bus and starts Live's transport recording via the Live API.
3. The video then contains a single white-flash frame and the audio a tone burst — an exact alignment pair. A small ffmpeg/python script (planned under `tools/`) finds both and muxes automatically.

Until then, Resolve's waveform sync covers 100% of the need with zero maintenance — which is the point of v1.
