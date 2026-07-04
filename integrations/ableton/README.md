# Patternflow ⇄ Ableton Live (Max for Live)

Turn a knob on Patternflow and hear the sound change: this folder connects the device's four encoders to any four parameters in your Live set, over Wi-Fi, using OSC and a small Max for Live device — the **Patternflow Bridge**.

The wire protocol is documented in [docs/osc-spec.md](../../docs/osc-spec.md). The firmware side is built in (see below); everything in this folder runs on the computer.

```
integrations/ableton/
├── max/
│   ├── patternflow-bridge.maxpat   # the M4L device patch (open in Max, save as .amxd)
│   └── patternflow.bridge.js       # all device logic (loaded by the patch)
└── docs/
    ├── m4l-osc-guide.md            # OSC in Max for Live: the parts that bite
    └── recording-sync.md           # filming with synced sound
```

## Requirements

- Ableton Live Suite (or Live + Max for Live), Live 11/12
- Patternflow flashed with OSC enabled (below) on the **same Wi-Fi network** as the computer
- First run on Windows: allow Max through the firewall when prompted (UDP 9000 must be able to reach Max)

## 1. Enable OSC in the firmware (one-time)

Copy `firmware/patternflow/patternflow_secrets.example.h` to `patternflow_secrets.h` and set:

```cpp
#define PF_WIFI_SSID "your-wifi-name"
#define PF_WIFI_PASS "your-wifi-password"
#define PF_OSC_ENABLED 1
```

You do **not** need to set your computer's IP — the device learns it from the bridge's ping. Flash, then check the K2-longpress info screen: OSC should read `READY` or `WAIT HOST`.

## 2. Install the bridge device

The device ships as a `.maxpat` (plain text, diff-able) rather than a binary `.amxd`, so you build the `.amxd` once locally:

1. In Live, drag a **Max Audio Effect** onto any audio track (the pass-through default is fine).
2. Click its **edit button** (the leftmost icon on the device title bar) — Max opens.
3. In Max: **File → Open** → `integrations/ableton/max/patternflow-bridge.maxpat`. Select all (Ctrl/Cmd-A), copy, close it, and paste into the Max Audio Effect patcher (replace its default contents but keep nothing — our patch already includes `plugin~`/`plugout~`).
4. Copy `patternflow.bridge.js` into the same folder where you'll save the device (Max looks for it next to the `.amxd`), or add its folder to Max's search path (Options → File Preferences).
5. **Save** the device as `Patternflow Bridge.amxd`. Close the Max editor.

## 3. Connect and map

1. The bridge pings `patternflow.local` automatically on load. Status shows **connected · P0 …** when the device answers. If not, type the device's IP (shown on the K2 info screen) into the host field and press Enter, or click **Connect**.
2. Click any parameter in your Live set (a synth macro, a filter cutoff…), then click **Map 1**. Knob K1 on Patternflow now drives it.
3. **Sweep** = how many encoder clicks cover the parameter's full range. 24 clicks = one physical turn; default 48 = two turns. Lower is more sensitive.
4. Mappings, sweep values, and the host name are saved with your Live set.

Notes:

- A mapped parameter is taken over by `live.remote~`: it appears greyed out in Live and can't be moved by mouse until you click **Clear**. This is normal M4L behavior.
- The status line shows the current pattern (index + name) and goes **offline** if the heartbeat stops (device off, Wi-Fi drop). It re-pings by itself every few seconds.

## Troubleshooting

Work through [docs/m4l-osc-guide.md](docs/m4l-osc-guide.md) — it covers every failure mode we've hit ourselves (firewall, mDNS on Windows, greyed parameters, float-vs-int OSC args, port conflicts).

## Roadmap

- Per-pattern mapping banks (the device already broadcasts pattern changes)
- Button → clip launch mapping
- `/patternflow/slate`: one-frame white flash + audio tone for automatic video/audio alignment (see [docs/recording-sync.md](docs/recording-sync.md))
