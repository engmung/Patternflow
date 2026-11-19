# The firmware in Rust: what it would buy and what it would cost

*Researched on 15 November 2026 at `2bff9e9` on `dev`. The web sources were read
that day and are numbered at the end. One thing was run, on a PC: the stock
Rust 1.97.0 compiler against the ESP32-S3 target. Nothing was built for a board,
so every claim about a Rust build on this panel is from documentation and source,
and is marked where it is an inference. Nothing in the tree changes.*

The firmware should stay in C++ for now. A port is possible, and this page
names the route for each part. It is not worth it today, for four reasons in
the order they weigh.

The record does not ask for it. The tree records 104 firmware bugs. Rust would
have stopped eight of them outright and nine more under conditions. The other 87
are RAM budgets, radio and panel behaviour, logic and release mistakes, which no
language catches.

The panel is the hard part. The one Rust crate that drives HUB75 by DMA on the
S3 shows 8 bits at about 15 Hz on a 128×64 panel. This firmware shows 8 bits at
300 Hz.

The ground is still moving. In esp-hal the panel's peripheral, DMA, PSRAM, I2S
and USB are all behind the `unstable` feature, and Wi-Fi is a beta. The compiler
is a fork, and its newest builds have an open miscompile on the S3.

The other Rust route, on ESP-IDF, needs ESP-IDF 5.3 or later. This board was
measured on that generation in August: 15,320 bytes of internal heap free after
services, against 98,708 on the ESP-IDF 4.4 the firmware ships on.

## What there is to move

Counted with `wc -l` at `2bff9e9`.

| part | lines | where |
| --- | --- | --- |
| the core | 13,211 | `patternflow.ino` (2,084) and `src/core_*.h` (11,127) |
| features | 23,349 | nine directories under `features/` |
| the HUB75 driver, vendored | 5,587 | `src/hub75/`, with a 948-line `patternflow.patch` |
| the web server, vendored | 2,327 | `src/webserver/` |
| the MQTT client, vendored | 959 | `src/pubsubclient/` |
| curated presets | 5,451 | 36 files in `presets/` |
| host tests | 5,140 | `firmware/toolchain/tests/*.cpp` |
| tooling | 8,375 | `firmware/toolchain/*.py` |

It builds with PlatformIO `espressif32@7.0.1`: Arduino core 2.0.17, ESP-IDF 4.4,
GCC 8.4. The core image for v3.12.0 is 1,102,784 bytes in a 3 MB slot. The first
public release was in April 2026, and `CHANGELOG.md` lists 30 releases up to
3.12.0 on 27 October.

ESP-IDF 4.4 reached end of life in July 2024 [12]. The firmware stays on it for
the heap, and [`platformio.ini`](../../firmware/patternflow/platformio.ini) says
why in its first twenty lines. That pin is the reason the ESP-IDF version comes
up again and again below.

Three things outside the firmware are built against it and would have to keep
working:

- Every `.pfm` already installed on a panel. A `.pfm` is a relocatable Xtensa
  object compiled from C++ by GCC, and the device links it at load time against
  the frozen structs in [`abi/pf_abi.h`](../../firmware/patternflow/abi/pf_abi.h)
  and 112 host symbols from newlib and libgcc.
- The settings in NVS and the pattern library on the `ffat` partition, on every
  panel that updates over the air.
- The five wire contracts in `docs/`. These carry over for free. Their vectors
  quote the spec and replay against the virtual panel, not the firmware, so they
  would test a Rust firmware the day it answered on port 80.

## What Rust would have caught

One reading of the tree sorted every firmware bug it records into six classes.
The sources were the firmware sections of `CHANGELOG.md` from 3.2.0 to 3.12.0,
the header of `patternflow.ino`, the August investigations, the September
runtime report, `src/webserver/VENDORED.md`, and the comments in the core and the
features that record a bug. The comments were found by keyword, so some are
missing. The full list, one row a bug, is
[`2026-11-firmware-bugs-by-class.csv`](2026-11-firmware-bugs-by-class.csv).

| class | bugs | Rust stops | under conditions | not |
| --- | --- | --- | --- | --- |
| memory safety or undefined behaviour | 14 | 6 | 4 | 4 |
| a slip a stricter type system catches | 7 | 2 | 5 | 0 |
| a RAM, stack or CPU budget | 17 | 0 | 0 | 17 |
| hardware, radio or SDK behaviour | 10 | 0 | 0 | 10 |
| logic | 46 | 0 | 0 | 46 |
| build and release | 10 | 0 | 0 | 10 |
| all | 104 | 8 | 9 | 87 |

The eight:

- The input frame that was never initialised (3.8.0), the first regression in
  the `patternflow.ino` header. Rust will not build a struct with fields
  missing.
- The plain `POST` that read a null upload, and the stack array sized from a
  9,000-character multipart boundary (both 3.10.5). Both were in the vendored
  Arduino `WebServer`.
- The ELF range that wrapped in 32 bits, the ELF name read past its string
  table, and the load error that read a symbol name after freeing the image
  (all 3.10.0).
- `addNetwork` overwriting its own arguments (3.7.0). The borrow checker rejects
  that call.
- The `poll()` inserted into a brace-less wait loop, which became the loop's
  whole body (3.10.1).

The nine depend on how the Rust is written. The UPDATE card that tore because
two tasks flipped one DMA buffer (3.9.5) is a compile error only if the display
has a single owner, and a `static mut` like today's global compiles. The feature
loop that was never dispatched in 3.7.0 becomes a `dead_code` warning. The
ignored NVS write (3.10.1) becomes an unused-`Result` warning.

Three of the four that Rust does not reach are at the module boundary:
`api->alloc()` losing its zero fill, a relocation that zeroed literal pointers,
and constructors running before the host API was set. The fourth is NimBLE
freeing a static object. All four are in code that is `unsafe` in Rust as well.
The module loader has more entries than any other area, 15 of the 104. Rust
stops three of them and cannot reach three others.

Some of this protection is already here. CI runs twelve host suites under
`-fsanitize=address,undefined` with `-Werror`
([`firmware-checks.yml`](../../.github/workflows/firmware-checks.yml)). The
parser suite found both `WebServer` bugs on a PC before a panel saw them, and
the ELF suite holds the two range checks. Two gaps show in the same record. No
suite runs under ThreadSanitizer, and the build for the board sets no warning
flags.

## Where Rust on the ESP32-S3 stands

### The compiler is still a fork

The S3 is an Xtensa chip, and stock Rust does not build for it. This is the
stable compiler of July 2026 on a Linux PC, asked to build `core` for the S3:

```sh
$ rustc -vV | grep -E 'release|LLVM'
release: 1.97.0
LLVM version: 22.1.6
$ rustc --print target-list | grep esp32s3
xtensa-esp32s3-espidf
xtensa-esp32s3-none-elf
$ rustc --target xtensa-esp32s3-none-elf --print target-cpus
'esp32s3' is not a recognized processor for this target (ignoring processor)
Available CPUs for this target:
    esp32
    esp8266
    generic
$ rustup component add rust-src
$ RUSTC_BOOTSTRAP=1 rustc --edition 2024 --crate-name core --crate-type rlib \
    --target xtensa-esp32s3-none-elf -C target-cpu=esp32 -C opt-level=2 \
    -C panic=abort -C embed-bitcode=no -Z force-unstable-if-unmarked -A warnings \
    $(rustc --print sysroot)/lib/rustlib/src/rust/library/core/src/lib.rs --out-dir out
error: data-layout for target `xtensa-esp32s3-none-elf`, `e-m:e-p:32:32-v1:8:8-i64:64-i128:128-n32`,
differs from LLVM target's `xtensa-none-elf` default layout, `e-m:e-p:32:32-i8:8:32-i16:16:32-i64:64-n32`
```

Given a copy of the target spec with LLVM's layout and the `esp32` CPU, the
same build stops inside LLVM, in `core`'s float parsing:
`rustc-LLVM ERROR: Cannot select: ... i32 = fp_to_fp16`.

The target is Tier 3, and the rustc book says to install "the Xtensa enabled
Rust channel" [1]. The fork's maintainer wrote on 12 June 2026 that a nightly
"can now build core" and that the rest waits on LLVM patches [2]. No date is
given.

The fork follows each stable Rust within days. Its release page marks 1.97.0.0
of 8 July as Latest and every build since as a pre-release [3]. An issue opened
on 30 September reports that 1.98.1.0 miscompiles a release build for
`xtensa-esp32s3-none-elf`, that 1.97.0.0 and 1.98.0.0 fail to compile the same
code, and that 1.93.0.0 is the last known good. It is still open [4].

### Two stacks, and Espressif pays for one

esp-hal is the bare-metal stack with no ESP-IDF under it, and it is the one
Espressif staffs. 1.0.0 shipped on 30 October 2025 with GPIO, UART, SPI and I2C
stable, and "everything else in `esp-hal` is now feature-gated behind the
`unstable` feature" [5]. At 1.2.2 of 18 September 2026 the unstable set still
holds `lcd_cam`, `dma`, `i2s`, `psram` and `usb` [6]. In this firmware those are
the panel, the microphone, the PSRAM that modules run from and USB MIDI.
Unstable APIs change in minor releases. esp-radio, the Wi-Fi and BLE crate, is
at 0.18.0, with 1.0.0-beta.1 from 16 September and a yanked beta.2 [7]. Its
docs give a station 47 to 57 KB of heap [8].

The esp-idf crates wrap ESP-IDF, so Rust code calls the same C this firmware
calls now. Their README says "all `esp-idf-*` crates are a community effort, in
that Espressif puts little to no paid developer time in these" [9]. esp-idf-sys
deprecated ESP-IDF 4.4 in June 2024 and everything below 5.3.0 in March
2026 [10], and the project template offers 5.3.6 to 6.1 [11].

That last line meets a measurement this repository already has. On 18 August the
same board gave 98,708 bytes free after services on Arduino core 2.0.17 and
15,320 on core 3.3.8, which is ESP-IDF 5.5
([the investigation](2026-08-core2-heap-and-the-5s-stall.md)). A Rust image
would not carry the Arduino core, so its number would differ. Nobody has
measured it, and this search turned up no published comparison of a Rust Wi-Fi
image and a C one on any ESP32.

## Part by part

"On ESP-IDF" is the esp-idf crates. "Bare metal" is esp-hal with esp-radio.

| part | on ESP-IDF | bare metal |
| --- | --- | --- |
| the panel | keep the C++ driver behind a C shim | no driver matches; see below |
| `.pfm` modules | port the loader or keep it in C++ | the same, and newlib's maths is lost |
| Wi-Fi, hotspot, captive DNS | wrapped, with edge-captive for the DNS | esp-radio and edge-net |
| mDNS | wrapped | edge-mdns 0.8.0 |
| NetBIOS name | raw FFI | not found |
| Improv over serial | one crate, UART only, 419 downloads [20] | two unpublished repositories |
| HTTP server and WebSocket | wrapped | picoserve 0.21.0, which warns of breaking changes |
| multipart upload | not found | not found |
| OTA slots and rollback | wrapped | esp-hal-ota 0.7.2 |
| ArduinoOTA (espota) | not found | not found |
| HTTPS client | wrapped, same mbedTLS | reqwless over mbedtls-rs, first released 25 June 2026 |
| NVS settings | wrapped, same format | esp-nvs 0.6.3, which reads ESP-IDF's format |
| FAT with wear levelling | wrapped, with an `unsafe` mount | not found |
| MQTT, OSC, NTP | wrapped or plain sockets | crates exist |
| RTP-MIDI session | not found | not found |
| BLE peripheral | wrapped NimBLE | trouble-host 0.8.0 |
| USB MIDI with CDC | raw FFI to TinyUSB | embassy-usb 0.6.0 has both classes |
| PDM microphone over I2S | wrapped | esp-hal, unstable |
| core dump to flash | ESP-IDF's own | not found |

"Not found" means a search of crates.io and the web on 15 November returned
nothing usable. The one RTP-MIDI crate, `rtpmidi` 0.4.4, is GPL-3.0 and built on
tokio [20].

### The panel

The vendored driver spends twelve buffers of 128 words on a row pair at 8 bits,
because it weights the low planes by the width of the OE window. That is
325.5 Hz at 16 MHz, padded to exactly 300
([`VENDORED.md`](../../firmware/patternflow/src/hub75/VENDORED.md)).

esp-hub75 0.17.0 is the Rust crate that drives HUB75 through LCD_CAM and DMA on
the S3 [13]. It repeats each plane by its binary weight, so 8 planes cost 255
passes where the C++ driver spends twelve. Its README says "a 64x64 panel with 8
planes at 10 MHz refreshes at only ~19 Hz". By the same arithmetic a 128×64 at
16 MHz gives:

| planes | clocks a frame | refresh |
| --- | --- | --- |
| 8 | 255 × 32 × 128 | 15 Hz |
| 6 | 63 × 32 × 128 | 62 Hz |
| 5 | 31 × 32 × 128 | 126 Hz |
| 4 | 15 × 32 × 128 | 260 Hz |

Its own examples run 4 to 6 planes. Its source has no brightness call and no
init sequence for the FM6124 or DP3246 driver ICs, which `PANEL_PROFILE` in
`config.h` selects here. Pixels go in one at a time, where this firmware blits
a whole frame through its colour tables. It pins `esp-hal ~1.2.0` with unstable
features. One person wrote 258 of its 261 commits, and no crate on crates.io
depends on it.

So a bare-metal port writes its own driver: the OE-window scheme, the 300 Hz
padding, the panel profiles and the blit, on a DMA API that is still unstable.
`patternflow.patch` and the pages of `VENDORED.md` are the record of how long
that took in C++.

On ESP-IDF the C++ driver can stay. One project, matrix-hub, runs an S3 panel
from Rust that way, with an `extern "C"` wrapper around a C++ HUB75 library
built as an extra component [14]. It wraps esphome's library, and nobody
turned up wrapping this one. As a plain ESP-IDF component the upstream library
asks for ESP-IDF 5.4 or later [15], and the tree vendors 3.0.13, two tags
behind 3.1.0.

### The modules

No existing loader in either language reads a `.pfm`. Espressif's `elf_loader`
component loads `-fPIC -shared` objects and handles four dynamic relocation
types. A `.pfm` uses `R_XTENSA_32` and `R_XTENSA_SLOT0_OP`, which that component
rejects [16]. So the 1,388 lines of `core_module_loader.h` are ported by hand or
stay C++ beside a Rust host.

The structs in `pf_abi.h` are plain C and Rust can declare them. One function
needs care. Modules call `vlogf(const char*, va_list)` and pass the `va_list` by
value. Rust has had a stable `VaList` since 1.99.0 on 1 October 2026 [17], but
on Xtensa rustc passes it by pointer, so a Rust `vlogf` would probably misread
what an installed module hands it. This is an inference from the two compilers'
sources and it was not tested. Leaving the three lines of `hostVlogf` in C
avoids the question.

The harder constraint is the maths. A module leaves `sinf` and `powf`
undefined and the host supplies newlib's. The project checks that a pattern
draws the same frame on the site and on the panel, and `pf_libm.h` matches
newlib to the last bit. A bare-metal Rust host has no newlib, and the `libm`
crate is a separate implementation. On ESP-IDF the functions are still C, but
ESP-IDF 6.0 changed its default C library to picolibc [18]. Any move is a
determinism question that `check_libm.py` would have to answer again.

### Updating a panel in place

On ESP-IDF a Rust image is an ESP-IDF app. The bootloader, the OTA slots, NVS
and the FAT partition are read by the code that reads them now, so an update
over the air should keep a panel's settings and patterns. Bare metal has an NVS
reader and OTA crates. It has no Rust port of ESP-IDF's wear-levelling layer
that this search could find, and without one the pattern library on every
panel is unreadable. No report turned up of an esp-hal image booting under an
ESP-IDF 4.4 bootloader.

## Three ways to do it

A rewrite on esp-hal is the route Espressif backs, and the only one that leaves
ESP-IDF and its heap behind. It is also the route with the most to write: the
panel driver, the wear-levelling layer, ArduinoOTA, RTP-MIDI, multipart, crash
dumps, and maths that matches newlib. All of it sits on unstable APIs and a
beta radio.

A rewrite on the esp-idf crates has the fewest gaps, because most of it is the
C the firmware already runs. For the same reason it buys the least. It moves
the firmware to ESP-IDF 5.3 or later, onto crates Espressif does not pay for,
and USB MIDI, NetBIOS, the FAT mount and the panel stay C behind `unsafe`.

A Rust library inside today's build keeps everything. esp-rs's `cargo-pio` has
a mode where PlatformIO "calls into Cargo to build the Rust library crate" [19],
and its generator has an Arduino template. A `no_std` static library for
`xtensa-esp32s3-none-elf` could replace one leaf that has host tests already,
such as the checks in `core_module_elf.h`. No report turned up of this on
Arduino core 2.0.x for the S3, and no measurement of what a Rust library adds
to flash or RAM there. Its price is the fork compiler on every contributor's
machine and in each of the five compositions CI builds, to protect code the
sanitizers already cover. If Rust is wanted in the tree for its own sake, this
is the way to try it: one leaf, with the flash and RAM it adds measured in the
first pull request.

## What others found

Google's numbers are for new code. Android estimates 0.2 memory-safety
vulnerabilities per million lines of Rust against about 1,000 for C and
C++ [22]. The same team's argument is that old code does not have to be
rewritten, because the vulnerabilities are in new code [21]. Its advice for
firmware is to add Rust piece by piece, starting with new code and the code
most exposed to attack [23].

STMicroelectronics and Inria had two teams write the same sensor firmware for
six weeks, one in C and one in Rust. Flash came to 76,744 bytes against 84,100,
both reached the same data rate, and the paper finds "no strong reason to
prefer C over Rust" [24]. That is a result about starting a firmware, not about
moving one.

On the ESP32 itself:

- STABL Energy replaced a C firmware that forwarded UART to MQTT with Rust on
  the esp-idf crates. It "ended up much more reliable than the C
  implementation". It also took longer to write, and hiring one Rust developer
  for a project that small was "not viable" [27].
- A Bootlin engineer ported an ESP32-C3 buzzer from ESP-IDF C to bare-metal
  Rust and showed it at FOSDEM in February 2026. esp-hal's own Wi-Fi example
  panicked on his board, and Espressif found the cause "in a bit less than two
  weeks". The binary came to 1.3 MB. His slide asks "Will the firmware become
  safe and bug-free ?" and answers no [28].
- Meshtastic is ESP32 firmware in C++ on PlatformIO with a maker audience. Asked
  to consider Rust in March 2025, a maintainer answered that "one of the biggest
  challenges is a lack of a library ecosystem for the device platforms we use",
  and pointed at the project's investment in PlatformIO [26].
- A senior software manager at Espressif wrote in April 2026: "Yet, we see
  little adoption of Rust." [29]

Nothing translates C++ firmware to Rust by machine. Cpp2Rust, from June 2026,
calls itself the first system to translate C++ at all, and its list of
unsupported constructs includes `volatile`, unions and multi-threaded code [31].
The one volunteer port of this size with public numbers is the fish shell:
57,000 lines of C++, estimated at half a year, finished in almost two, with
seven people doing most of it [25].

Agents edit this firmware, and `patternflow.ino` has a section addressed to
them. One benchmark validated on hardware gave an agent 42 tasks on real
boards. It passed 88.1% at the first attempt on Arduino and 61.9% on
ESP-IDF, and on ESP-IDF the failures that compiled and then misbehaved
outnumbered the compile failures 11 to 5 [30]. It has no Rust arm. Espressif's
own account of building a Rust app with an agent lists "Methods that do not
exist on the version being used" [29].

## When to look again

Any one of these changes the answer:

- LCD_CAM and DMA leave `unstable` in esp-hal, and esp-radio ships 1.0.
- A Rust HUB75 driver holds 8 bits near 300 Hz on a 128×64 panel.
- Stock rustc builds for the S3, or the board moves to a RISC-V chip, where the
  targets are already upstream.
- The firmware has to leave ESP-IDF 4.4 for another reason. Then the choice is
  between this C++ on ESP-IDF 5, which built in August, and Rust on bare
  metal.

One measurement would settle the largest unknown in an afternoon: esp-radio as a
station on this board, with the free internal heap read beside 98,708 and
15,320. If bare-metal Rust leaves more room than ESP-IDF 5 does, the fourth
case has a different answer.

## Sources

All read on 15 November 2026.

1. [rustc book, `xtensa-*-none-elf`](https://doc.rust-lang.org/nightly/rustc/platform-support/xtensa.html)
2. [esp-rs/rust #89, "Merge into main branch rust-lang/rust?"](https://github.com/esp-rs/rust/issues/89), comment of 12 June 2026
3. [esp-rs/rust-build releases](https://github.com/esp-rs/rust-build/releases)
4. [esp-rs/rust #283](https://github.com/esp-rs/rust/issues/283), opened 30 September 2026
5. [esp-hal 1.0.0 release announcement](https://developer.espressif.com/blog/2025/10/esp-hal-1/), 30 October 2025
6. [`esp-hal/src/lib.rs` at `esp-hal-v1.2.2`](https://github.com/esp-rs/esp-hal/blob/esp-hal-v1.2.2/esp-hal/src/lib.rs), the `unstable_module!` and `unstable_driver!` blocks
7. [esp-radio versions on crates.io](https://crates.io/crates/esp-radio/versions)
8. [esp-radio 1.0.0-beta.1, `wifi`, "Expected heap memory usage"](https://docs.espressif.com/projects/rust/esp-radio/1.0.0-beta.1/esp32s3/esp_radio/wifi/index.html)
9. [esp-rs/esp-idf README](https://github.com/esp-rs/esp-idf/blob/master/README.md)
10. [esp-idf-sys CHANGELOG](https://github.com/esp-rs/esp-idf-sys/blob/master/CHANGELOG.md), 0.35.0 and 0.37.0
11. [esp-idf-template README](https://github.com/esp-rs/esp-idf-template/blob/master/README.md)
12. [ESP-IDF v4.4.8 release notes](https://github.com/espressif/esp-idf/releases/tag/v4.4.8)
13. [liebman/esp-hub75](https://github.com/liebman/esp-hub75) at 0.17.0: `README.md`, `Cargo.toml`, `src/`, `examples/`
14. [thekeenant/matrix-hub](https://github.com/thekeenant/matrix-hub), `Cargo.toml` and `components/hub75_wrapper/`
15. [mrcodetastic/ESP32-HUB75-MatrixPanel-DMA](https://github.com/mrcodetastic/ESP32-HUB75-MatrixPanel-DMA), `idf_component.yml` and tags
16. [espressif/esp-iot-solution, `elf_loader`](https://github.com/espressif/esp-iot-solution/tree/master/components/elf_loader), `src/arch/esp_elf_xtensa.c`
17. [Announcing Rust 1.99.0](https://blog.rust-lang.org/2026/10/01/Rust-1.99.0/), 1 October 2026
18. [ESP-IDF 6.0 migration guide, System](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/migration-guides/release-6.x/6.0/system.html)
19. [esp-rs/embuild, `cargo-pio` README](https://github.com/esp-rs/embuild/blob/master/cargo-pio/README.md)
20. crates.io, for each version and date in the table: [esp-idf-svc](https://crates.io/crates/esp-idf-svc), [esp-idf-improv-wifi](https://crates.io/crates/esp-idf-improv-wifi), [picoserve](https://crates.io/crates/picoserve), [esp-hal-ota](https://crates.io/crates/esp-hal-ota), [mbedtls-rs](https://crates.io/crates/mbedtls-rs), [esp-nvs](https://crates.io/crates/esp-nvs), [edge-mdns](https://crates.io/crates/edge-mdns), [trouble-host](https://crates.io/crates/trouble-host), [embassy-usb](https://crates.io/crates/embassy-usb), [rtpmidi](https://crates.io/crates/rtpmidi)
21. [Google Security Blog, "Eliminating Memory Safety Vulnerabilities at the Source"](https://security.googleblog.com/2024/09/eliminating-memory-safety-vulnerabilities-Android.html), 25 September 2024
22. [Google, "Rust in Android: move fast and fix things"](https://blog.google/security/rust-in-android-move-fast-fix-things/), 13 November 2025
23. [Google Security Blog, "Deploying Rust in Existing Firmware Codebases"](https://security.googleblog.com/2024/09/deploying-rust-in-existing-firmware.html), 4 September 2024
24. [Thapa et al., "Embedded Rust or C Firmware? Lessons from an Industrial Microcontroller Use Case with Ariel OS"](https://arxiv.org/abs/2604.25679), April 2026; the byte counts as tabled by [CNX Software](https://www.cnx-software.com/2026/05/06/study-compares-rust-and-c-languages-for-embedded-firmware-development/)
25. [fish shell, "Fish 4.0: The Fish Of Theseus"](https://fishshell.com/blog/rustport/), 28 December 2024
26. [meshtastic/firmware discussion #6225](https://github.com/meshtastic/firmware/discussions/6225), March 2025
27. [STABL Energy, embedded Rust in production](https://blog.lohr.dev/embedded-rust)
28. [Alexis Lothoré, "From C to Rust on the ESP32: A Developer's Journey into no_std"](https://bootlin.com/pub/conferences/2026/fosdem/lothore-rust-no-std.pdf), FOSDEM, 1 February 2026
29. [Espressif Developer Portal, "Developing a Rust IoT app with AI"](https://developer.espressif.com/blog/2026/04/developing-a-rust-iot-app-with-ai/), 20 April 2026
30. [Li et al., "Skilled AI Agents for Embedded and IoT Systems Development"](https://arxiv.org/abs/2603.19583), 20 March 2026, tables 1 and 2
31. [Cpp2Rust, PLDI 2026](https://web.ist.utl.pt/nuno.lopes/pubs/cpp2rust-pldi26.pdf)
