# Patternflow Hardware

Open hardware files for Patternflow.

## Structure

- `case/` — 3D-printable enclosure, organized by printer bed size (v3.0 board)
  - `bed_330mm/` — one-piece snap-fit body (H2S-class beds)
  - `bed_256mm/` — divided snap-fit, 5 parts (P1S-class beds)
  - `knobs/` — knob plates (15/20 mm shafts), shared by all options
  - `legacy_v2/` — every v2.x-board case (not compatible with v3.0)
  - `source/` — original Blender files (editable)
- `pcb/` — circuit board
  - `kicad/` — KiCad project files (editable)
  - `gerber/` — production-ready Gerber files (zip — upload to your fab)
  - `schematic.pdf` — circuit schematic (no KiCad required to view)
- `bom/` — machine-readable bill of materials (CSV, per board version)

## Build instructions

Start with the assembly map in [docs/assembly/README.md](../docs/assembly/README.md).

The current full walkthrough for the 3D printed enclosure plus official hand-soldered PCB path is [BUILD_GUIDE.md](../BUILD_GUIDE.md).

## License

CC-BY-SA 4.0 — see the root [LICENSE-CC-BY-SA](../LICENSE-CC-BY-SA) file.
