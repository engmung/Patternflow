#!/usr/bin/env bash
#
# Write the FLASHING.md that ships beside a release's firmware images.
#
#   .github/scripts/flashing-md.sh <image-dir> <tag> [date] > FLASHING.md
#
# A file rather than a heredoc inside the workflow, for one reason: this can
# be run locally against a real image directory and read before it is ever
# published. Shell embedded in YAML cannot.
set -euo pipefail

DIR="${1:?usage: flashing-md.sh <image-dir> <tag> [date]}"
TAG="${2:?usage: flashing-md.sh <image-dir> <tag> [date]}"
DATE="${3:-}"

[ -d "$DIR" ] || { echo "no such directory: $DIR" >&2; exit 1; }
[ -f "$DIR/patternflow.ino.bin" ] || {
  echo "no patternflow.ino.bin in $DIR" >&2; exit 1
}

have() { [ -f "$DIR/$1" ]; }

echo "# Patternflow $TAG"
echo
if [ -n "$DATE" ]; then
  echo "Published $DATE. These are the exact images the browser flasher serves"
else
  echo "These are the exact images the browser flasher serves"
fi
echo "for this version — the same bytes, not a rebuild."
echo
echo "## Over Wi-Fi, if the panel already runs Patternflow"
echo
echo 'Open `http://patternflow.local/update` and drop `patternflow.ino.bin` on'
echo 'it. That is the app image only; the others do not change between releases'
echo "and are not rewritten."
echo
echo "## Over USB"
echo
echo '```'
echo 'esptool.py --chip esp32s3 --baud 921600 write_flash \'
# Only the parts that exist, and the last one never gets a trailing backslash
# — a continuation with nothing after it makes the shell swallow whatever the
# reader types next, and this block exists to be pasted.
LINES=""
for pair in "0x0     patternflow.ino.bootloader.bin" \
            "0x8000  patternflow.ino.partitions.bin" \
            "0xe000  boot_app0.bin" \
            "0x10000 patternflow.ino.bin"; do
  file="${pair##* }"
  have "$file" && LINES="${LINES}  ${pair}"$'\n'
done
printf '%s' "$LINES" | sed '$ !s/$/ \\/'
echo '```'
echo
echo 'Or use the browser flasher at <https://patternflow.work/flash>, which'
echo "does the same thing with no toolchain."
echo
if have boot_app0.bin; then
  echo '**`boot_app0.bin` at 0xe000 matters more than it looks.** A wireless'
  echo "update writes the *passive* app slot and flips otadata to it, so a"
  echo "later USB write to 0x10000 lands in the slot the board is no longer"
  echo "booting from and appears to do nothing. Writing boot_app0 resets that."
else
  echo '**This release predates `boot_app0.bin`.** If the board has ever taken'
  echo "a wireless update, a USB write to 0x10000 may land in the slot it is no"
  echo "longer booting from and appear to do nothing. Take boot_app0.bin from a"
  echo "later release and write it at 0xe000 to reset that."
fi
echo
echo "## What these are"
echo
echo "| file | offset | |"
echo "|---|---|---|"
have patternflow.ino.bootloader.bin &&
  echo '| `patternflow.ino.bootloader.bin` | 0x0 | second-stage bootloader |'
have patternflow.ino.partitions.bin &&
  echo '| `patternflow.ino.partitions.bin` | 0x8000 | partition table — **never changes between releases**, and a firmware that changes it strands every pattern already on the board |'
have boot_app0.bin &&
  echo '| `boot_app0.bin` | 0xe000 | which app slot to boot; comes from the ESP32 core, not a build output |'
echo '| `patternflow.ino.bin` | 0x10000 | the firmware itself |'
echo
echo "## Checksums"
echo
echo "If this version is ever re-cut, these are what say so."
echo
echo '```'
( cd "$DIR" && sha256sum ./*.bin | sed 's|\./||' )
echo '```'
