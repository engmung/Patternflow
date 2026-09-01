#!/usr/bin/env bash
#
# Build a shelf image: the thing patternflow.work/variants installs in one
# click. Publishable, which means no Wi-Fi credentials in it.
#
#   ./shelf.sh audio v0.3.0
#   ./shelf.sh performance v0.2.1
#   ./shelf.sh core v3.8.0            (the featureless default)
#
# Stages four files into web/public/flash/bin/<name>-<version>/ and stops.
# Editing variants-data.ts and deploying the site are separate, deliberate
# steps: a staged image nobody has looked at should not become the thing a
# stranger flashes.
#
# ── Why this exists ─────────────────────────────────────────────────────
#
# net_config.h bakes whatever patternflow_secrets.h defines straight into the
# image. A build made with that file present carries the builder's home Wi-Fi
# password in plaintext, and this project has published one — twice. The
# second time was a version everybody had already decided was clean.
#
# Doing it by hand is the failure mode, so it is a script, and the script
# refuses rather than warns.
#
# License: MIT
set -euo pipefail
cd "$(dirname "$0")/../.."

NAME="${1:-}"
VERSION="${2:-}"
if [ -z "$NAME" ] || [ -z "$VERSION" ]; then
  echo "usage: shelf.sh <edition|core> <version>" >&2
  exit 1
fi
case "$VERSION" in
  v*) ;;
  *) echo "version should start with v (got '$VERSION')" >&2; exit 1 ;;
esac

SKETCH=firmware/patternflow
SECRETS="$SKETCH/patternflow_secrets.h"
BUILD_DIR="${PF_BUILD_DIR:-$HOME/pf-build}"
OUT="web/public/flash/bin/$NAME-$VERSION"
CORE_PKG="$HOME/.platformio/packages/framework-arduinoespressif32"
BOOT_APP0="$CORE_PKG/tools/partitions/boot_app0.bin"

# A version-stamped path is never overwritten: the CDN and every browser that
# has seen it will keep serving the old bytes under the same URL, so a
# corrected image published over an existing one reaches nobody.
if [ -d "$OUT" ]; then
  echo "$OUT already exists. Bump the version instead of overwriting it." >&2
  exit 1
fi

# Which build. `core` means the default composition, which takes no bundle.
BUNDLE_ARG=()
if [ "$NAME" != "core" ]; then
  [ -d "firmware/bundles/$NAME" ] || { echo "no such edition: $NAME" >&2; exit 1; }
  BUNDLE_ARG=("$NAME")
fi

# ── The control build ───────────────────────────────────────────────────
#
# Run the scanner against an image that DOES have the credentials first. If
# that one passes, the scanner is broken and a clean result from it means
# nothing. This is the step whose absence let a leaking image ship.
HAVE_SECRETS=0
[ -f "$SECRETS" ] && HAVE_SECRETS=1

# Values to hunt for: every string literal the secrets file defines. Two of
# them (PF_MQTT_USER, PF_MQTT_PREFIX) are the literal `patternflow`, which is
# in every image dozens of times over — mDNS, page titles, OSC paths — so a
# naive scan reports two leaks that are not. A value that also appears in
# public source is not a secret.
collect_secrets() {
  [ -f "$SECRETS" ] || return 0
  grep -oE '^#define[[:space:]]+PF_[A-Z_]+[[:space:]]+"[^"]*"' "$SECRETS" \
    | sed -E 's/.*"([^"]*)"/\1/' \
    | while IFS= read -r v; do
        [ -n "$v" ] || continue
        # in public source? then it is not a secret
        if grep -rqaF -- "$v" "$SKETCH/net_config.h" "$SKETCH/config.h" \
             "$SKETCH/patternflow_secrets.example.h" 2>/dev/null; then
          continue
        fi
        printf '%s\n' "$v"
      done
}

scan() {   # scan <bin> -> 0 clean, 1 leaking
  local bin="$1" leaked=0 v
  while IFS= read -r v; do
    [ -n "$v" ] || continue
    if grep -qaF -- "$v" "$bin"; then
      echo "    LEAK: a secret value is present in the image"
      leaked=1
    fi
  done < <(collect_secrets)
  if ! grep -qa YOUR_WIFI_SSID "$bin"; then
    echo "    the placeholder SSID is missing — this image was not built clean"
    leaked=1
  fi
  return $leaked
}

if [ "$HAVE_SECRETS" = 1 ]; then
  echo "control build (with secrets) — the scanner must FAIL this"
  ./firmware/bundles/build.sh "${BUNDLE_ARG[@]+"${BUNDLE_ARG[@]}"}" >/dev/null
  if scan "$BUILD_DIR/firmware/firmware.bin"; then
    echo "  the scanner passed an image that HAS the credentials. It is broken." >&2
    echo "  Refusing to build a shelf image with a scanner that proves nothing." >&2
    exit 1
  fi
  echo "  scanner correctly rejected it"
  echo ""
fi

# ── The real build ──────────────────────────────────────────────────────
#
# `__has_include` is the switch, so moving the file aside is the whole trick.
# The trap puts it back on any exit, including a failed build or a Ctrl-C:
# it is gitignored and there is no other copy of it anywhere.
if [ "$HAVE_SECRETS" = 1 ]; then
  trap 'mv -f "$SECRETS.shelf-aside" "$SECRETS" 2>/dev/null || true' EXIT
  mv "$SECRETS" "$SECRETS.shelf-aside"
fi

echo "shelf build: $NAME $VERSION"
./firmware/bundles/build.sh "${BUNDLE_ARG[@]+"${BUNDLE_ARG[@]}"}" >/dev/null

BIN="$BUILD_DIR/firmware/firmware.bin"
echo "  built $(stat -c%s "$BIN") bytes"
if ! scan "$BIN"; then
  echo "  refusing to stage it" >&2
  exit 1
fi
echo "  scan clean"

# ── The version the binary believes ─────────────────────────────────────
#
# The version argument only names the folder. What the panel actually reports
# at /api/status is PF_VARIANT_VERSION from the bundle's overrides.h — and
# audio v0.4.0 shipped still believing it was v0.3.1, because nothing tied
# the two together. Editions bake the exact string, so demand it. (Core's
# version lives elsewhere and its release flow already stamps it.)
if [ "$NAME" != "core" ] && ! grep -qaF -- "$VERSION" "$BIN"; then
  echo "  the image does not contain \"$VERSION\" — the binary believes another version." >&2
  echo "  Set PF_VARIANT_VERSION in firmware/bundles/$NAME/overrides.h to $VERSION and rerun." >&2
  exit 1
fi

# ── Stage ───────────────────────────────────────────────────────────────
#
# Four parts, and boot_app0 is the one people forget. It is not a build
# output — it comes from the core and has been byte-identical across every
# release — but without it a panel that has ever taken a wireless update
# boots the OTHER slot, and the flash appears to do nothing.
[ -f "$BOOT_APP0" ] || { echo "boot_app0.bin not found at $BOOT_APP0" >&2; exit 1; }
mkdir -p "$OUT"
cp "$BIN"                              "$OUT/patternflow.ino.bin"
cp "$BUILD_DIR/firmware/bootloader.bin" "$OUT/patternflow.ino.bootloader.bin"
cp "$BUILD_DIR/firmware/partitions.bin" "$OUT/patternflow.ino.partitions.bin"
cp "$BOOT_APP0"                        "$OUT/boot_app0.bin"

echo ""
echo "staged: $OUT"
ls -l "$OUT" | tail -4 | awk '{printf "  %8s  %s\n", $5, $9}'
echo ""
echo "next, by hand and on purpose:"
echo "  - point the card at it in web/src/app/variants/variants-data.ts"
echo "  - deploy the site"
