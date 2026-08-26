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
  // Announced and being built, but nothing to download yet.
  | 'building'
  // Agreed in principle, owner confirmed, work not started.
  | 'planned';

export type Variant = {
  /** The string this firmware reports in /api/status. Also the anchor. */
  id: string;
  name: string;
  /** Who maintains it, as they wish to be credited. */
  maintainer: string;
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

export const VARIANTS: Variant[] = [
  {
    id: 'simone-pd',
    name: 'Performance Director',
    maintainer: 'Simone Majocchi',
    maintainerHref: 'https://github.com/SimonePDA',
    status: 'building',
    summary:
      'For running a panel as part of a show — timed sequences, a schedule, ' +
      'and a broker in the middle of several devices.',
    adds: [
      'show player (.pfs sequences, playlists)',
      'night / wake schedule',
      'MQTT, including FlowLocal',
      'weather overlay',
      'MatrixLight panel fonts',
    ],
    source: 'https://github.com/SimonePDA',
    note:
      'This is where the sequence player and MQTT went when core stopped ' +
      'carrying them, and it starts finished rather than empty: firmware ' +
      '3.6.3 shipped all of it, and this variant forks from that point. ' +
      'Choose it if you run shows on a schedule or drive several panels ' +
      'from one place. If you only ever pick a pattern and leave it, core ' +
      'does that with more memory free.',
  },
  {
    id: 'iot',
    name: 'IoT',
    maintainer: 'to be confirmed',
    status: 'planned',
    summary:
      'For a panel that lives inside a home automation setup rather than on ' +
      'a desk.',
    adds: [
      'MQTT publisher and bridge roles',
      'FlowLocal',
      'the broker half of the Home Assistant integration',
    ],
    note:
      'Worth knowing before you go looking for this: the Home Assistant ' +
      'integration works against plain core. Reading state was always core ' +
      'HTTP, and writing the four knobs moved to POST /api/params — so if ' +
      'Home Assistant is all you wanted, you do not need a variant at all. ' +
      'This one is for the cases core deliberately does not cover: acting as ' +
      'a broker publisher, or bridging panels to each other.',
  },
  {
    id: 'radio',
    name: 'Radio',
    maintainer: 'to be confirmed',
    status: 'planned',
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
      'that pass EMC and behave on every unit. If your panel drops off the ' +
      'network in a specific difficult room, this exists for you — and it is ' +
      'exactly the kind of disagreement variants are for, rather than a ' +
      'setting core has to defend to everyone.',
  },
];
