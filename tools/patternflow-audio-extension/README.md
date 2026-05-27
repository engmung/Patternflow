# Patternflow Audio Chrome Extension

Captures audio from the currently active Chrome/Edge tab, analyzes four FFT
bands, and sends normalized knob values to Patternflow over WebSocket.

## Install for local testing

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder: `tools/patternflow-audio-extension`.
5. Open a tab that is playing audio.
6. Click the Patternflow Audio extension button.
7. Set the device host to `patternflow.local` or the board IP address.
8. Press **Start**.

For WebSocket-only debugging, press **WS Test** instead of **Start** and move
the K1-K4 sliders. This bypasses tab capture and audio analysis completely.

## Controls

- `Hz min` / `Hz max`: frequency range analyzed for the band.
- `Offset`: base knob value when the band is quiet.
- `Range`: amount and direction of audio modulation.
- `Gain`: sensitivity before smoothing.
- `Knob`: target Patternflow knob index.
- `Smoothing`: global response smoothing.
- `WS Test`: connect to the device and send manual K1-K4 values.

The extension sends messages like `k=0,v=0.735` to `ws://<device>:81`.
