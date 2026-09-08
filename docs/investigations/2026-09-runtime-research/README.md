# Runtime research evidence

Companion to [the findings](../2026-09-firmware-runtime.md).
These are bench-specific research tools, not firmware build dependencies.
They are never included by a normal firmware build.

- `measurements.json`: aggregate counters, stage distributions and timings.
  Raw status dumps containing network/client information are excluded.
- `probe.h`, `instrument.py`: temporary instrumentation of the September 7
  working tree. Exact replacement guards reject a changed source layout;
  restoration checks hashes before restoring original bytes.
- `measure.py`: downloads three original modules or runs steady/preview tests.
- `warmup_probe.py`: creates two separately named loop-count variants, runs
  upload overlap and A–B–B–A comparisons, or deletes those two variants.

Run from the repository root with Python. Pass `--host DEVICE_IP` to the HTTP
tools. All intermediate data, source backups and module binaries go into
ignored `_tmp/fw_research/`. The original module binaries are not distributed
with this report. The warm-up patches only apply to the exact binaries below:

| File | SHA-256 |
|---|---|
| `branched_flow.pfm` | `965e2179edabe71eb7571639f455fb84950b69de1efbcfc7a40407a69e1908e7` |
| `two_stream_phase_space_vortices.pfm` | `10ea8572f22f0afeefbfb1cffc8501f3c4eabcfdf34c1826afe9a674e1286d89` |

Reproduction sequence:

1. Retain a known-good image for the device's edition. Verify its active OTA
   partition before any serial flash; this bench used app1 at `0x310000`,
   which is not a universal instruction for another device.
2. Run `instrument.py apply`, then `firmware/bundles/build.sh all`. Save the
   instrumented image for the chosen edition before another composition build
   replaces the common output. Restore source with `instrument.py restore`.
3. Flash the instrumented image. Run `measure.py download --host DEVICE_IP`,
   verify the original hashes above, then `measure.py measure --host DEVICE_IP`.
4. Run `warmup_probe.py make --host DEVICE_IP`, then
   `warmup_probe.py run --host DEVICE_IP`. The patch assertions check the
   expected instructions, and upload refuses already occupied research names.
   This experiment needs the original eleven-entry bench catalog and names.
5. Run `warmup_probe.py cleanup --host DEVICE_IP`. If a run failed before both
   uploads, inspect the catalog and remove only the research names actually
   added; the cleanup helper assumes both exist. Never delete original modules.
6. Restore the known-good image, original selection and settings. Verify module
   hashes, catalog and normal operation. The probe endpoint is temporary.

Use one HTTP experiment at a time: this device serves one connection. The
helpers intentionally pace requests. A/B modifies the initial simulated state,
so the test modules are not visually equivalent release replacements.

The profiler's `setup` slot is unused; setup timings come from the existing
`status.load.setup` field. Percentile keys are histogram upper bounds. Mean
draw includes present, and housekeeping includes synchronization. Do not sum
overlapping stages or interpret mixed loading/running samples as physical
encoder latency percentiles.
