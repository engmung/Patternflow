# Build Patternflow — Assembly Map

> **Which version am I building?** Current hardware is the **v3.9 board** (the v3.0 board with the USB-C footprint removed; same case, same guide): follow **[BUILD_GUIDE.md](../../BUILD_GUIDE.md)** and take the files from the tree — [`hardware/README.md`](../../hardware/README.md) says exactly which Gerber, BOM and STL to use. The [v3.0.0 release](https://github.com/engmung/Patternflow/releases/tag/v3.0.0) bundles the previous revision's files.
> Own a **v2.x board**? Use **[BUILD_GUIDE_v2.md](../../BUILD_GUIDE_v2.md)** and the **[v2.1.0 release](https://github.com/engmung/Patternflow/releases/tag/v2.1.0)** instead. **v2 and v3 parts are not interchangeable** — the boards do not fit each other's cases.

> 🔦 **Buying the LED panel? Read [LED Panel Compatibility](../panel-compatibility.md) first.** Patternflow scans the panel directly from the ESP32-S3, so the **driver IC** decides whether it lights up — "HUB75E" on the listing does not, and a spec-matching panel with S-PWM "video wall" drivers stays completely dark with no firmware fix. Since that part number is almost never in the listing, the practical check is the **buyer reviews**: someone running it off an ESP32 or Raspberry Pi is the best evidence you'll get.

Patternflow is not a single, rigid kit. It is a modular system divided into two core parts:

1. **Enclosure** — how you house the device (3D printed; community remixes welcome).
2. **Electronics** — how you wire the hardware (custom PCB, or breadboard).

Build those two, flash the firmware, and your Patternflow is alive.

## The main route (v3.0.0)

| Enclosure | Electronics | Firmware | Status |
| --- | --- | --- | --- |
| [3D printed enclosure](../../hardware/case/README.md) | [Custom PCB, hand-soldered](../../hardware/pcb/README.md) | [Browser flash](../../BUILD_GUIDE.md#8-firmware) · [your own patterns](../../PATTERN_GUIDE.md) | **Current — fully documented** |

This is the route [BUILD_GUIDE.md](../../BUILD_GUIDE.md) walks start to finish: PLA parts on any 256 mm-bed FDM printer, the hand-soldered v3.9 board (all through-hole — deliberately kept first-timer easy), and firmware flashed from the browser. Two ordering shortcuts are wired straight to it:

- **PCB** — the [PCBWay shared project](https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html): no Gerber upload, and ordering there supports Patternflow development.
- **Case** — the [MakerWorld listing](https://makerworld.com/en/models/3072492-patternflow-open-source-led-synthesizer-case#profileId-3459015): tuned one-click print profiles for Bambu printers (STLs in `hardware/case/` for everyone else).

## All combinations

| Enclosure | Electronics | Status |
| --- | --- | --- |
| 3D printed enclosure | Custom PCB | **Current** — [BUILD_GUIDE.md](../../BUILD_GUIDE.md) |
| 3D printed enclosure | Breadboard / jumper-wire electronics | Available — [Breadboard Build Guide](https://patternflow.work/build/breadboard) |
| Laser-cut or any other enclosure | either | Not an official path. Community variants live in [`hardware/case/remixes/`](../../hardware/case/remixes/README.md); the old acrylic drawings are in [`legacy_lasercut/`](../../hardware/case/legacy_lasercut/README.md) |

The breadboard path exists to make Patternflow easier and cheaper to start. A breadboard build is not just a temporary prototype — if that form is enough for you, it is a valid Patternflow build. Want a more finished object later? Move to the PCB and printed-enclosure path whenever you like.

The custom PCB path is stable. PCBA may become a later electronics path for people who want the same PCB with less hand assembly.

## Firmware & custom patterns

To bring the hardware to life you flash it with firmware, and you can **create and run your own generative patterns with AI coding assistants**.

Custom patterns no longer need a local toolchain or a reflash: a pattern built in the browser installs on the panel over Wi-Fi as a `.pfm` module in seconds (the browser flasher writes the firmware itself over USB once, and sets up Wi-Fi while it is at it). The PlatformIO route remains only for firmware feature development or targeting a different LED matrix resolution.

- **[Make your own patterns](../../PATTERN_GUIDE.md)** — the Pattern Lab, the community, and sending a pattern to your device over Wi-Fi. [`firmware/CUSTOM_PATTERNS.md`](../../firmware/CUSTOM_PATTERNS.md) is the hands-on route.

## Guides & releases

| Version | Guide | Everything bundled |
| --- | --- | --- |
| **v3.9 board** (current; v3.0 is the same board with a USB-C footprint you leave empty) | [BUILD_GUIDE.md](../../BUILD_GUIDE.md) | the files in [`hardware/`](../../hardware/README.md); the [v3.0.0 release](https://github.com/engmung/Patternflow/releases/tag/v3.0.0) bundles the v3.0 revision |
| v2.1.0 (legacy) | [BUILD_GUIDE_v2.md](../../BUILD_GUIDE_v2.md) | [v2.1.0 release](https://github.com/engmung/Patternflow/releases/tag/v2.1.0) |
