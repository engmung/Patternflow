#!/usr/bin/env bash
#
# Build a named firmware from this repository.
#
#   ./build.sh                       the default — no features
#   ./build.sh audio                 the audio bundle
#   ./build.sh audio flash <host>    build it, then push it to a panel
#   ./build.sh all                   every composition + a marker scan
#                                    proving each binary carries exactly
#                                    its features — run this before pushing
#                                    anything that touches the core
#
# A bundle is two files. This copies them next to the addon list, builds, and
# takes them away again — the tree is left exactly as it was found, so the
# next build is the default unless you ask for a bundle.
set -euo pipefail
cd "$(dirname "$0")/../.."

SKETCH=firmware/patternflow
ADDONS="$SKETCH/addons"
# xtensa's linker cannot open output files under a path with non-ASCII in it,
# and this repository lives under one. The build tree goes somewhere plain.
BUILD_DIR="${PF_BUILD_DIR:-$HOME/pf-build}"

# ── all: every composition, and proof each binary carries exactly its
# features ────────────────────────────────────────────────────────────────
#
# "Changing the core means building all three" was a rule in prose, and a
# rule in prose gets one of the three. This is that rule as one command:
#
#   ./firmware/bundles/build.sh all
#
# It builds default, audio and performance, then scans each image for one
# marker string per feature — a literal that lives only in that feature's
# sources, verified by grep before it was trusted here. An edition must
# contain its own features' markers and NONE of the others'. That checks the
# composition in the shipped bytes, where addons.h's #error guard cannot see:
# the guard catches a misspelled macro, this catches the right macro building
# the wrong thing. It is how the NETWORK screen fix was proven — "OSC / AUD"
# absent from the default image because the compiler folded the branch away —
# done every time instead of once by hand.
if [ "${1:-}" = "all" ]; then
  declare -A MARK=(
    [osc]='/patternflow/knob'
    [audio]='[AUDIO] Ready'
    [audio_in]='PDM up: CLK'
    [mqtt]='[MQTT] '
    [show]='[SHOW] '
    [weather]='openweathermap'
  )
  declare -A WANT=(
    [default]=''
    [audio]='osc audio audio_in'
    [performance]='mqtt show weather'
  )
  # Outside PF_BUILD_DIR: PlatformIO prunes directories it does not know
  # from its own build root, and it does not know this one.
  OUTDIR="${BUILD_DIR}-editions"
  mkdir -p "$OUTDIR"
  overall=0
  for ed in default audio performance; do
    printf '%-12s building… ' "$ed"
    t0=$(date +%s)
    log="$OUTDIR/$ed.log"
    if [ "$ed" = default ]; then ok=0; "$0" >"$log" 2>&1 || ok=$?
    else ok=0; "$0" "$ed" >"$log" 2>&1 || ok=$?; fi
    if [ "$ok" != 0 ]; then
      echo "build FAILED — last lines of $log:"
      tail -15 "$log"
      exit 1
    fi
    cp "$BUILD_DIR/firmware/firmware.bin" "$OUTDIR/$ed.bin"
    verdict=ok
    detail=""
    for f in osc audio audio_in mqtt show weather; do
      case " ${WANT[$ed]} " in *" $f "*) want=1 ;; *) want=0 ;; esac
      if grep -qaF -- "${MARK[$f]}" "$OUTDIR/$ed.bin"; then have=1; else have=0; fi
      if [ "$want" != "$have" ]; then
        verdict=FAIL
        overall=1
        if [ "$want" = 1 ]; then detail="$detail missing:$f"; else detail="$detail carries:$f"; fi
      fi
    done
    printf '%3ss  %8s bytes  %s%s\n' "$(( $(date +%s) - t0 ))" \
      "$(stat -c%s "$OUTDIR/$ed.bin")" "$verdict" "$detail"
  done
  if [ "$overall" != 0 ]; then
    echo ""
    echo "a binary does not match its composition — do not flash or publish these" >&2
  fi
  exit $overall
fi

BUNDLE="${1:-}"
if [ -n "$BUNDLE" ] && [ "$BUNDLE" != "flash" ]; then
  DIR="firmware/bundles/$BUNDLE"
  [ -d "$DIR" ] || { echo "no such bundle: $BUNDLE" >&2; exit 1; }
  echo "bundle:  $BUNDLE"
  cp "$DIR"/*.h "$ADDONS/"
  # Whatever happens next, the tree goes back to the default. Leaving a
  # bundle's files behind would make the following build silently wrong.
  trap 'rm -f "$ADDONS/addons_local.h" "$ADDONS/overrides.h"' EXIT
  shift
else
  echo "bundle:  (default — no features)"
fi

( cd "$SKETCH" && PLATFORMIO_BUILD_DIR="$BUILD_DIR" python -m platformio run -e firmware )

BIN="$BUILD_DIR/firmware/firmware.bin"
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
