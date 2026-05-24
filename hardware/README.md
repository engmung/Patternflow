# Patternflow Hardware

Open hardware files for Patternflow.

## Structure

- `case/` — 3D-printable enclosure
  - `source/` — original Blender files (editable)
  - `print-ready/` — STL/3MF files ready for slicing
  - `parts/` — individual component files (if applicable)
- `pcb/` — circuit board
  - `kicad/` — KiCad project files (editable)
  - `gerber/` — production-ready Gerber files (zip — upload to your fab)
  - `schematic.pdf` — circuit schematic (no KiCad required to view)

## Build instructions

Start with the assembly map in [docs/assembly/README.md](../docs/assembly/README.md).

The current full walkthrough for the 3D printed enclosure plus official hand-soldered PCB path is [docs/BUILD.md](../docs/BUILD.md).

## License

CC-BY-SA 4.0 — see the root [LICENSE-CC-BY-SA](../LICENSE-CC-BY-SA) file.
