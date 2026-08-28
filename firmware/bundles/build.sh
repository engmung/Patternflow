#!/usr/bin/env bash
#
# Build a named firmware from this repository.
#
#   ./build.sh                       the default — no features
#   ./build.sh audio                 the audio bundle
#   ./build.sh audio flash <host>    build it, then push it to a panel
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
