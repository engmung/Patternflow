// The shelf. One entry per firmware built on Patternflow core.
//
// This list is hand-curated by the maintainer. There is no application form
// and no automated listing, deliberately: the list is short, and a person
// reading it is about to flash a stranger's binary onto their hardware. What
// it is worth depends entirely on someone having actually looked.
//
// To be listed, a variant agrees to the rules in
// docs/rfc-core-and-variants.md §2.6 — the short version being: it can be
// left again over /update, it does not change the partition layout, it plays
// the same community .pfm modules, it reports its own `variant` string in
// /api/status, and it keeps Wi-Fi credentials where core keeps them so
// switching does not mean re-provisioning.
//
// The site does not mirror or re-host anyone's firmware. Every download link
// points at that maintainer's own releases, and stays their responsibility.

export type VariantStatus =
  // Shipping: there is a binary you can flash today.
  | 'available'
  // Someone has agreed to maintain it and is building it.
  | 'building'
  // Nobody has agreed to anything. This entry is an opening — a variant the
  // split obviously implies, published so the person best placed to own it
  // can see it and say yes or no. Being listed as `proposed` is an
  // invitation, never an announcement, and the page has to read that way:
  // these are real people's names on firmware they have not committed to.
  | 'proposed';

export type Variant = {
  /** The string this firmware reports in /api/status. Also the anchor. */
  id: string;
  name: string;
  /**
   * Who maintains it, as they wish to be credited. On a `proposed` entry
   * this is who it has been SUGGESTED to — they have not agreed, and the
   * page must not imply otherwise. Absent means nobody has been asked: the
   * gap is open to whoever wants it.
   */
  maintainer?: string;
  maintainerHref?: string;
  status: VariantStatus;
  /** One line: what this is FOR. Not a feature list. */
  summary: string;
  /** What it adds on top of core. Short phrases, not sentences. */
  adds: string[];
  /** Where its releases live. Omitted while nothing has shipped. */
  releases?: string;
  /** Its source, if public. */
  source?: string;
  /** The honest paragraph — who should and should not choose this. */
  note: string;
};

export const CORE_NOTE =
  'Core is the one that has to keep working: the panel, the pattern loader, ' +
  'Wi-Fi, sleep, OSC, and the update path out of anything. It is what ships ' +
  'on the board and what you can always return to.';

// The thing people most often assume needs a variant, and does not. Worth
// saying next to core rather than buried in an entry: somebody who came
// here looking for "the Home Assistant firmware" should leave knowing they
// already have it.
export const CORE_ALSO =
  'Home Assistant works against core as it is. Reading the panel was always ' +
  'plain HTTP, and setting the four knobs is POST /api/params \u2014 no broker ' +
  'and no variant in between. OSC is core too, for the same reason: it needs ' +
  'nothing but the network already in the room.';

export const VARIANTS: Variant[] = [
  {
    id: 'simone-pd',
    name: 'Performance Director',
    maintainer: 'Simone Majocchi',
    maintainerHref: 'https://github.com/SimonePDA',
    status: 'proposed',
    summary:
      'For running a panel as part of a show — timed sequences, a schedule, ' +
      'and a broker in the middle of several devices.',
    adds: [
      'show player (.pfs sequences, playlists)',
      'night / wake schedule',
      'MQTT',
      'weather overlay',
      'MatrixLight panel fonts',
    ],
    source: 'https://github.com/SimonePDA',
    note:
      'Nothing to download yet — this is an opening, not an announcement. ' +
      'Firmware 3.6.3 integrated Simone\u2019s whole stack, which makes that ' +
      'release the obvious fork point and him the obvious person to ask: a ' +
      'variant starting from there starts finished rather than empty. He ' +
      'has not agreed to anything. If it happens, choose it when you run ' +
      'shows on a schedule or drive several panels from one place; if you ' +
      'pick a pattern and leave it, core does that with more memory free.',
  },
  {
    id: 'iot',
    name: 'IoT',
    maintainer: 'bendobos',
    maintainerHref: 'https://github.com/bendobos',
    status: 'proposed',
    summary:
      'For a panel that lives inside a home automation setup rather than on ' +
      'a desk.',
    adds: [
      'the IoT integration work already built for Patternflow',
      'home-automation side of the device',
    ],
    note:
      'This one is not a gap somebody has to fill \u2014 bendobos already built ' +
      'it, and the split is asking that it become its own repository rather ' +
      'than living inside core. He has not agreed yet. Worth knowing before ' +
      'you go looking: the Home Assistant integration itself works against ' +
      'plain core, so if that is all you wanted you do not need a variant. ' +
      'Exactly where this ends and Simone\u2019s MQTT begins is for the two of ' +
      'them to settle, not for this page to decide.',
  },
  {
    id: 'radio',
    name: 'Radio',
    status: 'proposed',
    summary:
      'For units in hostile radio conditions — a warehouse, a venue, a room ' +
      'full of competing access points.',
    adds: [
      '8 MHz panel clock (down from the core default)',
      'raised Wi-Fi transmit power',
    ],
    note:
      'This adds no features. It re-tunes two numbers that core keeps ' +
      'conservative on purpose, because the conservative values are the ones ' +
      'that pass EMC and behave on every unit. Nobody is building it. It is ' +
      'listed because the request came from a real person with a real room, ' +
      'core was right to decline it, and that is exactly the disagreement ' +
      'variants exist to hold — rather than a setting core has to defend to ' +
      'everyone. Raising transmit power has regulatory consequences, so ' +
      'whoever builds it owns those too.',
  },
];
