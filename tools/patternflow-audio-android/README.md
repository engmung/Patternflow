# Patternflow Audio — Android

Captures what the phone itself is playing — Instagram Reels, YouTube, any
app that does not DRM-block capture — and drives the panel's knobs with it.
The phone-side twin of the Chrome extension, for filming content: start
this, open Instagram, play a song, shoot the panel reacting to it cleanly,
at any speaker volume, with no room noise in the signal.

Android 10+ only (the AudioPlaybackCapture API is the whole trick). The
capture rides the screen-record consent: if your phone's screen recorder
captures an app's sound, this captures it too; apps that opt out (most DRM
music streamers) arrive silent.

## What the app deliberately is not

There is no mapping UI. Bands, curves, damping — the app fetches all of it
from the panel (`GET /api/audio-in`, refreshed every 5 s) and applies the
same 33-point curves the firmware interpolates. Tune on the panel's own
console page (`http://<panel>/audio-in`); the phone follows. The input
window is always auto-ranged: manual windows are numbers on a specific
level scale, and the phone's scale is neither the extension's nor the
microphone's — envelope normalization is what makes one config portable
across all three sources.

Levels leave over the audio WebSocket (`:81`) as absolute lanes — the
extension's protocol, `docs/audio-ws-spec.md`. No firmware changes were
needed for this app to exist.

## Build

JDK 17+, Android SDK (platform 34). `local.properties` points at the SDK.

AGP refuses non-ASCII project paths on Windows, and this repository lives
under one - the same wall the firmware's xtensa linker hits. Copy the folder
somewhere plain and build there:

    cp -r tools/patternflow-audio-android /c/Users/you/pf-android
    cd /c/Users/you/pf-android && gradle assembleDebug
    # app/build/outputs/apk/debug/app-debug.apk

Sideload the debug APK; this is a personal tool, not a store app.

## Use

1. Panel address (IP is more reliable than `patternflow.local` — Android's
   mDNS is moody), Start, approve the capture prompt.
2. Leave the app; play anything anywhere. The notification's Stop ends it
   and hands the knobs back.
