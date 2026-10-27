import basicsManifest from "../../../public/packs/basics.json";
import type { LivePreset } from "@/lib/presets/types";

// Pattern packs that ship WITH Patternflow, as opposed to the ones people
// build from their own decks.
//
// A deck's pack is compiled on demand, belongs to whoever made the deck, and
// lives in the database. This is the other kind: a set held in the repo,
// built from `firmware/patternflow/presets/*.h` by
// `firmware/toolchain/make_pack.py`, and committed as a plain file. It has no
// owner row, needs no build queue, and survives a database that has not been
// seeded — which is exactly what a default has to do, because the first
// person to open a board's Patterns page is looking at an empty list and has
// nowhere to get patterns from yet.
//
// Rebuild after changing a preset, the module SDK (firmware/patternflow/abi/)
// or the build recipe (build_module.py):
//   python firmware/toolchain/port_preset.py --out-dir <tmp>/mods --all
//   python firmware/toolchain/build_module.py --out <tmp>/art <tmp>/mods/*
//   python firmware/toolchain/make_pack.py --out web/public/packs/basics.zip \
//     --name Basics --publisher Patternflow \
//     --exclude origin --exclude calibration <tmp>/art
//   python firmware/toolchain/console_demo.py
//
// The last line is the guide's live console demo
// (web/public/guide/console-demo/), which lists the pack's modules and their
// sizes and goes stale with every rebuild.
//
// The two excludes are what makes it 33: Origin is compiled into every
// firmware image, and the calibration pattern is a bench tool with no author
// to credit (make_pack.py refuses it, rightly).
//
// The committed pack is built with the firmware's own compiler - PlatformIO's
// toolchain-xtensa-esp32s3, GCC 8.4.0 - by pointing PF_XTENSA_BIN at its bin/
// (~/.platformio/packages/toolchain-xtensa-esp32s3/bin). Without that,
// build_module.py takes the Arduino core's toolchain first where one is
// installed, and a different compiler is different bytes.
//
// With the same compiler the zip is byte-identical across rebuilds, so an
// unchanged pattern set produces no diff.

export type PatternPack = {
  /** Stable id, and the basename of both files under /public/packs. */
  id: string;
  name: string;
  /** Who publishes the SET. Per-pattern authorship lives in each .json. */
  publisher: string;
  patterns: number;
  authors: string[];
  licenses: string[];
  bytes: number;
  /** Module ABI the pack was built against; a board rejects anything else. */
  abi: number;
  /** Panel the patterns were compiled for. */
  panel: { w: number; h: number };
  /** Module slugs in running order — the order the device cycles them. */
  order: string[];
  /**
   * Module slug → the pattern number it was built from.
   *
   * A pack holds compiled modules, which a browser cannot render. This is how
   * a shipped module finds the JS preset it has a twin in, so the site can
   * show what is actually in the pack. A slug missing here was built outside
   * the repo and simply has no preview.
   */
  presets: Record<string, number | undefined>;
};

export const BASICS_PACK: PatternPack = {
  id: "basics",
  ...basicsManifest,
};

/** Every pack shipped in the repo. */
export const SHIPPED_PACKS: PatternPack[] = [BASICS_PACK];

/**
 * The set a board with nothing on it should be offered first.
 *
 * Named separately from BASICS_PACK so the callers that mean "the default"
 * do not have to be edited if the default ever becomes a different set.
 */
export const DEFAULT_PACK = BASICS_PACK;

/** One cell of a pack's strip: a shipped module, drawn from its JS twin. */
export type PackPreview = { slug: string; code: string; title: string };

/**
 * The first `count` modules of a pack, as previews from their JS twins.
 *
 * Four by default, the same as a deck card's strip (withPreviews). A number
 * with no matching preset renders nothing rather than a wrong pattern, so a
 * pack whose first four include one built outside the repo shows three.
 *
 * The presets are an argument and not an import. The Basics card reads this
 * file in the browser, and the preset list is the source of 48 patterns
 * (174,954 bytes of script on 26 October). The decks page calls this on the
 * server and hands the card the four it draws.
 */
export function packPreviews(
  pack: PatternPack,
  presets: readonly Pick<LivePreset, "num" | "name" | "code">[],
  count = 4,
): PackPreview[] {
  return pack.order
    .slice(0, count)
    .map((slug) => {
      const num = pack.presets[slug];
      const preset = num === undefined ? undefined : presets.find((p) => p.num === num);
      return preset ? { slug, code: preset.code, title: preset.name } : null;
    })
    .filter((entry): entry is PackPreview => entry !== null);
}

/** Site-relative path of a pack's .zip — right for a plain download link. */
export function packZipPath(pack: PatternPack): string {
  return `/packs/${pack.id}.zip`;
}

/**
 * Absolute URL of a pack's .zip.
 *
 * Absolute because the place it ends up is a page served BY a device on the
 * LAN: the board's own Patterns page fetches this cross-origin (see the
 * /packs CORS entry in next.config.ts), and a relative path there would
 * resolve against the board, which has no pack to give.
 *
 * `origin` should be the origin the visitor is actually on. This app is
 * deployed to more than one (the site and the community run separately) and
 * both serve /public, so the copy to hand a board is the one on the page the
 * visitor is already looking at. The default is only the fallback for
 * rendering that happens before an origin is known.
 */
export function packZipUrl(pack: PatternPack, origin = "https://patternflow.work"): string {
  return `${origin}${packZipPath(pack)}`;
}

/**
 * A one-click install link for a board at `host`.
 *
 * The device's Patterns page takes `?src=` and does the ferrying itself: it
 * fetches the pack over https, unpacks it in the browser, and posts the
 * modules to the board over http. The board never needs to reach the
 * internet, which it could not do anyway — a TLS handshake wants more heap
 * than it has.
 */
export function packInstallUrl(
  pack: PatternPack,
  host = "patternflow.local",
  origin?: string,
): string {
  return `http://${host}/patterns?src=${encodeURIComponent(packZipUrl(pack, origin))}`;
}
