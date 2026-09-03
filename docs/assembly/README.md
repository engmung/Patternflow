# Build Patternflow — Assembly Map

> **Which version am I building?** Current hardware is **v3.0.0**: follow **[BUILD_GUIDE.md](../../BUILD_GUIDE.md)**, with every file bundled at the **[v3.0.0 release](https://github.com/engmung/Patternflow/releases/tag/v3.0.0)** (STLs, Gerbers, Bambu print project, firmware images).
> Own a **v2.x board**? Use **[BUILD_GUIDE_v2.md](../../BUILD_GUIDE_v2.md)** and the **[v2.1.0 release](https://github.com/engmung/Patternflow/releases/tag/v2.1.0)** instead. **v2 and v3 parts are not interchangeable** — the boards do not fit each other's cases.

> 🔦 **Buying the LED panel? Read [LED Panel Compatibility](../panel-compatibility.md) first.** Patternflow scans the panel directly from the ESP32-S3, so the **driver IC** decides whether it lights up — "HUB75E" on the listing does not, and a spec-matching panel with S-PWM "video wall" drivers stays completely dark with no firmware fix. Since that part number is almost never in the listing, the practical check is the **buyer reviews**: someone running it off an ESP32 or Raspberry Pi is the best evidence you'll get.

Patternflow is not a single, rigid kit. It is a modular system divided into two core parts:

1. **Enclosure** — how you house the device (3D printed today; laser cut in testing).
2. **Electronics** — how you wire the hardware (custom PCB, or breadboard).

Build those two, flash the firmware, and your Patternflow is alive.

## The main route (v3.0.0)

| Enclosure | Electronics | Firmware | Status |
| --- | --- | --- | --- |
| [3D printed enclosure](enclosure/3d-print.md) | [Custom PCB, hand-soldered](electronics/pcb.md) | [Browser flash / custom patterns](firmware/custom-patterns.md) | **Current — fully documented** |

This is the route [BUILD_GUIDE.md](../../BUILD_GUIDE.md) walks start to finish: PLA parts on any 256 mm-bed FDM printer, the hand-soldered v3.0 board (all through-hole — deliberately kept first-timer easy), and firmware flashed from the browser. Two ordering shortcuts are wired straight to it:

- **PCB** — the [PCBWay shared project](https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html): no Gerber upload, and ordering there supports Patternflow development.
- **Case** — the [MakerWorld listing](https://makerworld.com/en/models/3072492-patternflow-open-source-led-synthesizer-case#profileId-3459015): tuned one-click print profiles for Bambu printers (STLs in `hardware/case/` for everyone else).

## All combinations

| Enclosure | Electronics | Status |
| --- | --- | --- |
| 3D printed enclosure | Custom PCB | **Current** — [BUILD_GUIDE.md](../../BUILD_GUIDE.md) |
| 3D printed enclosure | Breadboard / jumper-wire electronics | Available — [Breadboard Build Guide](https://patternflow.work/build/breadboard) |
| Laser-cut enclosure | Custom PCB | In testing — [#123](https://github.com/engmung/Patternflow/issues/123) |
| Laser-cut enclosure | Breadboard / jumper-wire electronics | In testing — [#123](https://github.com/engmung/Patternflow/issues/123) |

The in-testing paths exist to make Patternflow easier and cheaper to start. A breadboard build is not just a temporary prototype — if that form is enough for you, it is a valid Patternflow build. Want a more finished object later? Move to the PCB and printed-enclosure path whenever you like.

The custom PCB path is stable. PCBA may become a later electronics path for people who want the same PCB with less hand assembly.

## Firmware & custom patterns

To bring the hardware to life you flash it with firmware, and you can **create and run your own generative patterns with AI coding assistants**.

Custom patterns no longer need a local toolchain or a reflash: a pattern built in the browser installs on the panel over Wi-Fi as a `.pfm` module in seconds (the browser flasher writes the firmware itself over USB once, and sets up Wi-Fi while it is at it). The PlatformIO route remains only for firmware feature development or targeting a different LED matrix resolution.

- **[Create custom patterns (recommended)](firmware/custom-patterns.md)** — make a pattern in the [Live Editor](https://patternflow.work) or [Pattern Lab](https://patternflow.work/pattern-lab), preview it live, and install it from the browser.

## Guides & releases

| Version | Guide | Everything bundled |
| --- | --- | --- |
| **v3.0.0** (current) | [BUILD_GUIDE.md](../../BUILD_GUIDE.md) | [v3.0.0 release](https://github.com/engmung/Patternflow/releases/tag/v3.0.0) |
| v2.1.0 (legacy) | [BUILD_GUIDE_v2.md](../../BUILD_GUIDE_v2.md) | [v2.1.0 release](https://github.com/engmung/Patternflow/releases/tag/v2.1.0) |
