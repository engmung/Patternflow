#!/usr/bin/env bash
#
# Build a named firmware from this repository.
#
#   ./build.sh                       the default — no features
#   ./build.sh audio                 the audio bundle
#   ./build.sh audio flash <host>    build it, then push it to a panel
#   ./build.sh one audio             build ONE composition and scan its image
#                                    (what CI runs, one job per composition)
#   ./build.sh all                   every composition + a marker scan
#                                    proving each binary carries exactly
#                                    its features — run this before pushing
#                                    anything that touches the core
#
# A bundle is two files. This copies them next to the feature list, builds, and
# takes them away again — the tree is left exactly as it was found, so the
# next build is the default unless you ask for a bundle.
#
# A bundle may add a third file, `env`, naming the PlatformIO env it builds
# in (default: firmware). The MIDI edition needs one: its USB port has to be
# the OTG controller, which is a build flag, not a setting - see
# platformio.ini. The build tree is per env, so the outputs move with it.

set -euo pipefail
cd "$(dirname "$0")/../.."

SKETCH=firmware/patternflow
FEATURES="$SKETCH/features"

# xtensa's linker cannot open output files under a path with non-ASCII in it,
# and this repository lives under one. The build tree goes somewhere plain.
BUILD_DIR="${PF_BUILD_DIR:-$HOME/pf-build}"
# Outside PF_BUILD_DIR: PlatformIO prunes directories it does not know
# from its own build root, and it does not know this one.
OUTDIR="${BUILD_DIR}-editions"

# The PlatformIO env a bundle builds in: `env` beside its two files, else the
# default. PlatformIO writes each env's outputs under its own name.
env_of() {
  local f="firmware/bundles/$1/env"
  if [ -f "$f" ]; then tr -d '[:space:]' < "$f"; else echo firmware; fi
}

# ── The compositions, and proof each binary carries exactly its features ──
#
# "Changing the core means building every composition" was a rule in prose,
# and a rule in prose gets one of them. `all` is that rule as one command, and
# `one` is the same thing for a single composition, so CI can run them in
# parallel, one job each, instead of in a row:
#
#   ./firmware/bundles/build.sh all
#   ./firmware/bundles/build.sh one clock
#
# Each image is scanned for one marker string per feature — a literal that
# lives only in that feature's sources, verified by grep before it was trusted
# here. A composition must contain its own features' markers and NONE of the
# others'. That checks the composition in the shipped bytes, where features.h's
# #error guard cannot see: the guard catches a misspelled macro, this catches
# the right macro building the wrong thing. It is how the NETWORK screen fix
# was proven — "OSC / AUD" absent from the default image because the compiler
# folded the branch away — done every time instead of once by hand.
#
# Not every composition is on the shelf. `clock` and `midi` are bundles the
# tree keeps buildable so a core change cannot break them silently; the shelf
# (release.py's EDITIONS) is the maintainer's shorter list.
COMPOSITIONS="default audio performance clock midi"
declare -A MARK=(
  [osc]='/patternflow/knob'
  [audio]='[AUDIO] Ready'
  [audio_in]='PDM up: CLK'
  [mqtt]='[MQTT] '
  [show]='[SHOW] '
  [weather]='openweathermap'
  [midi]='[MIDI] rtp listening'
  [midi_usb]='[MIDI] usb device'
  [ble]='[BLE] setup advertising'
  [clock]='[CLOCK] /clock ready'
)
declare -A WANT=(
  [default]=''
  [audio]='osc audio audio_in midi'
  [performance]='mqtt show weather clock'
  [clock]='clock'
  [midi]='midi midi_usb'
)

known_composition() { [ -n "${1:-}" ] && [ -n "${WANT[$1]+x}" ]; }

# stage <composition>: the env's outputs, copied under OUTDIR as <composition>.bin/.elf.
# The elf as well, because the bin cannot answer the question that actually
# governs this product. A .bin's size is flash, and flash is not scarce here:
# internal DRAM is, and the module code budget is whatever is left of it once
# .data, .bss and IRAM have taken their share. check_footprint.py reads these.
stage() {
  local ed="$1" env
  env="$(env_of "$ed")"
  mkdir -p "$OUTDIR"
  cp "$BUILD_DIR/$env/firmware.bin" "$OUTDIR/$ed.bin"
  cp "$BUILD_DIR/$env/firmware.elf" "$OUTDIR/$ed.elf"
}

# scan_image <composition> <bin>: prints the verdict; fails unless the image
# carries exactly its composition's markers.
scan_image() {
  local ed="$1" bin="$2" verdict=ok detail="" f want have
  for f in osc audio audio_in mqtt show weather midi midi_usb ble clock; do
    case " ${WANT[$ed]} " in *" $f "*) want=1 ;; *) want=0 ;; esac
    if grep -qaF -- "${MARK[$f]}" "$bin"; then have=1; else have=0; fi
    if [ "$want" != "$have" ]; then
      verdict=FAIL
      if [ "$want" = 1 ]; then detail="$detail missing:$f"; else detail="$detail carries:$f"; fi
    fi
  done
  printf '%-12s %8s bytes  %s%s\n' "$ed" "$(stat -c%s "$bin")" "$verdict" "$detail"
  [ "$verdict" = ok ]
}

if [ "${1:-}" = "all" ]; then
  mkdir -p "$OUTDIR"
  overall=0
  for ed in $COMPOSITIONS; do
    printf '%-12s building… ' "$ed"
    t0=$(date +%s)
    log="$OUTDIR/$ed.log"
    # Through bash, not by executing "$0": the checkout on a CI runner does
    # not carry the executable bit this file has at a desk.
    if [ "$ed" = default ]; then ok=0; bash "$0" >"$log" 2>&1 || ok=$?
    else ok=0; bash "$0" "$ed" >"$log" 2>&1 || ok=$?; fi
    if [ "$ok" != 0 ]; then
      echo "build FAILED — last lines of $log:"
      tail -15 "$log"
      exit 1
    fi
    stage "$ed"
    printf '%3ss  ' "$(( $(date +%s) - t0 ))"
    scan_image "$ed" "$OUTDIR/$ed.bin" || overall=1
  done
  if [ "$overall" != 0 ]; then
    echo ""
    echo "a binary does not match its composition — do not flash or publish these" >&2
  fi
  exit $overall
fi

if [ "${1:-}" = "one" ]; then
  ed="${2:-}"
  if ! known_composition "$ed"; then
    echo "usage: build.sh one <$(echo "$COMPOSITIONS" | tr ' ' '|')>" >&2
    exit 2
  fi
  # In the foreground: on a CI runner the compiler's own output is the log.
  if [ "$ed" = default ]; then bash "$0"; else bash "$0" "$ed"; fi
  stage "$ed"
  echo ""
  scan_image "$ed" "$OUTDIR/$ed.bin"
  exit $?
fi

BUNDLE="${1:-}"
ENV=firmware
if [ -n "$BUNDLE" ] && [ "$BUNDLE" != "flash" ]; then
  DIR="firmware/bundles/$BUNDLE"
  [ -d "$DIR" ] || { echo "no such bundle: $BUNDLE" >&2; exit 1; }
  echo "bundle:  $BUNDLE"
  ENV="$(env_of "$BUNDLE")"
  [ "$ENV" = firmware ] || echo "env:     $ENV"
  cp "$DIR"/*.h "$FEATURES/"
  # Whatever happens next, the tree goes back to the default. Leaving a
  # bundle's files behind would make the following build silently wrong.
  # Both spellings: a legacy bundle carries addons_local.h, features.h
  # accepts it, and a trap that only knows the new name leaves it behind -
  # which turns every later "default" build into that bundle, silently.
  # That happened once, and the leftover reached a commit before the next
  # marker scan would have caught it.
  trap 'rm -f "$FEATURES/features_local.h" "$FEATURES/addons_local.h" "$FEATURES/overrides.h"' EXIT
  shift
else
  echo "bundle:  (default — no features)"
fi

# The vendored libraries that toolchain/sync_ino_to_src.py clones into lib/
# have to exist before PlatformIO resolves lib_deps - and it resolves them
# before any extra script runs. At a desk lib/ is there from the first build;
# on a fresh checkout (a CI runner) the order is the difference between a
# build and "Could not find the package with 'lib/WebSockets'". Same repos,
# same depth as the script, which then finds them and only writes its
# library.json.
for pair in \
  "HUB75 https://github.com/mrfaptastic/ESP32-HUB75-MatrixPanel-DMA.git" \
  "Adafruit_GFX https://github.com/adafruit/Adafruit-GFX-Library.git" \
  "Adafruit_BusIO https://github.com/adafruit/Adafruit_BusIO.git" \
  "WebSockets https://github.com/Links2004/arduinoWebSockets.git"; do
  read -r name url <<< "$pair"
  [ -d "$SKETCH/lib/$name" ] || git clone -q --depth 1 "$url" "$SKETCH/lib/$name"
done

( cd "$SKETCH" && PLATFORMIO_BUILD_DIR="$BUILD_DIR" python -m platformio run -e "$ENV" )

BIN="$BUILD_DIR/$ENV/firmware.bin"
echo ""
echo "built: $BIN  ($(stat -c%s "$BIN") bytes)"

# net_config.h bakes whatever patternflow_secrets.h defines straight into the
# image, so a build made with that file present carries the builder's home
# Wi-Fi password in plaintext. Fine on your own desk; a disaster in a release,
# and this project has shipped one before.
if [ -f "$SKETCH/patternflow_secrets.h" ]; then
  echo ""
  echo "  NOTE: built WITH patternflow_secrets.h — your Wi-Fi credentials are in"
  echo "        this image. Fine for your own panel. Do NOT publish it."
elif ! grep -qa YOUR_WIFI_SSID "$BIN"; then
  echo ""
  echo "  WARNING: no secrets file, but the placeholder SSID is missing from the"
  echo "           image too. Something changed — check before publishing."
  exit 1
fi

if [ "${1:-}" = "flash" ]; then
  DEV="${2:-patternflow.local}"
  echo "flashing $DEV ..."
  # Stop any playing show first: OTA fails silently while one is running.
  curl -s --max-time 5 -X POST "http://$DEV/api/shows/control" -d "op=stop" >/dev/null || true
  curl -s --max-time 180 -F "firmware=@$BIN" "http://$DEV/update?size=$(stat -c%s "$BIN")"
  echo ""
fi
