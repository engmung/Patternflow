// The shelf. One entry per firmware you can put on a panel.
//
// The first is the default: everything the device does, and what ships on the
// board. It is not a base somebody builds on — the others exist because of
// something IT cannot carry, and each says which. "Everything minus a few
// things" is not a reason to publish a firmware: dropping three features
// leaves the ceiling on loadable patterns exactly where it was (73,716 bytes
// either way) on a board using 45 % of its flash.
//
// Two tiers, and the difference is who to ask when it breaks:
//
//   official   built from the Patternflow repository, published here. A core
//              change has to compile against all of them before it lands, so
//              they cannot silently rot.
//   community  somebody else's firmware, their repository, their schedule.
//              Not a lesser thing. A different one.
//
// Hand-curated either way, and the curation is the point: somebody read it
// before the name went up. There is no application form.
//
// An entry can carry a binary served from here for one-click install, or a
// flasher manifest to read the current one from. A pinned copy goes stale the
// moment its maintainer cuts a release, so the page reads their latest GitHub
// tag in the visitor's browser and stands down when the two have drifted —
// better to admit the gap than to quietly serve last month's firmware.
//
// To be listed, a firmware agrees to the rules in
// docs/rfc-core-and-variants.md §2.6 — the short version being: it can be
// left again over /update, it does not change the partition layout, it plays
// the same community .pfm modules, it reports its own `variant` string and
// version in /api/status, and it keeps Wi-Fi credentials where the default
// keeps them so switching does not mean re-provisioning.

// Where a firmware comes from. The distinction is the whole point of the
// page: one of these is published from this repository and the other is
// somebody else's work on their own terms, and a reader deciding what to
// flash needs to know which they are looking at.
export type Tier =
  // Built from this repository, published here. Its code is in the tree,
  // where the compiler keeps it honest against every core change.
  | 'official'
  // Somebody else's firmware, their repository, their release schedule.
  // Not a lesser thing — a different thing, and the difference is who to
  // ask when it breaks.
  | 'community';

// Why a firmware exists that is not the default. Three different answers,
// and a person choosing needs to know which: picking up something
// unfinished is not the same as picking up something deliberately still.
export type Reason =
  // Experimental, or needs hardware the board does not have yet.
  | 'not-ready'
  // Correct for a situation, wrong as a default.
  | 'not-universal'
  // Pinned and not moving, so a show behaves the same at the next gig.
  | 'frozen';

export type VariantStatus =
  // Shipping: there is a binary you can flash today.
  | 'available'
  // Someone has agreed to maintain it and is building it.
  | 'building'
  // Nobody has agreed to anything. An opening, published so the person best
  // placed to own it can see it and say yes or no. An invitation, never an
  // announcement: these are real people's names on firmware they have not
  // committed to.
  | 'proposed';

export type Variant = {
  /** The string this firmware reports in /api/status. Also the anchor. */
  id: string;
  name: string;
  tier: Tier;
  /** Absent on the default, which needs no reason to exist. */
  reason?: Reason;
  /**
   * As they wish to be credited. On a `proposed` entry this is who it has
   * been SUGGESTED to — they have not agreed, and the page must not imply
   * otherwise. Absent means nobody has been asked.
   */
  maintainer?: string;
  maintainerHref?: string;
  status: VariantStatus;
  /** One line: what this is FOR. Not a feature list. */
  summary: string;
  /** What it adds on top of core. Short phrases — these render as a list. */
  adds: string[];
  /** `owner/repo`, so the page can read the maintainer's latest release. */
  github?: string;
  /** Where its releases live. */
  releases?: string;
  /** Its source, if public. */
  source?: string;
  /**
   * A copy served from here, for one-click install. `version` is what that
   * copy IS — compared against the maintainer's latest, so a stale copy
   * cannot pretend to be current.
   */
  hosted?: { version: string; url: string };
  /**
   * Or: a flasher manifest to read the current version and image from, for a
   * firmware that publishes one. The default does; any firmware could. Wins over
   * `hosted`, because a manifest cannot go stale the way a pinned copy can.
   */
  manifest?: string;
  /** The honest paragraph. Kept short: who should and should not take this. */
  note: string;
};

// One entry, and it is the maintainer's own.
//
// Three stood here for a few hours before it, and every one of them named a
// person — or left a slot open for one — who had never been asked whether
// they wanted to maintain a firmware. That made the split look further along
// than it was, at the expense of people who had not agreed to be on it, and
// it came down the same day.
//
// What replaced it is the same work done to something nobody had to be asked
// about. Whatever anyone else decides is theirs to say, in their own words,
// in their own time; it does not get written down here first.
export const VARIANTS: Variant[] = [
  {
    id: 'core',
    name: 'Patternflow',
    tier: 'official',
    maintainer: 'SeungHun Lee',
    maintainerHref: 'https://github.com/engmung',
    status: 'available',
    summary:
      'Everything the panel does. This is what ships on the board, and what ' +
      'you can always come back to.',
    adds: [
      'Patterns, and the loader for community ones',
      'Sequences, weather, MQTT',
      'OSC and browser audio',
      'Wi-Fi, sleep, and the way out of any firmware',
    ],
    manifest: '/flash/manifest.json',
    source: 'https://github.com/engmung/Patternflow',
    note:
      'Not a starting point you build on — the finished thing. Everything ' +
      'else here exists because of something this cannot carry, not because ' +
      'it is missing anything.',
  },
  {
    id: 'audio',
    name: 'Patternflow Audio',
    tier: 'official',
    reason: 'not-ready',
    maintainer: 'SeungHun Lee',
    maintainerHref: 'https://github.com/engmung',
    status: 'available',
    summary:
      'Everything above, plus a microphone soldered to the board — so the ' +
      'panel hears the room with no computer in it.',
    adds: [
      'On-board PDM microphone (four wires, not yet a part on the board)',
      'Wi-Fi transmit power raised for rooms full of access points',
    ],
    // Served from here, so the panel's own /update page can fetch it. Under
    // /flash/bin, which already sends the CORS header that fetch needs.
    hosted: {
      version: 'v0.1.0',
      url: 'https://patternflow.work/flash/bin/audio-v0.1.0/patternflow.ino.bin',
    },
    source: 'https://github.com/engmung/Patternflow/tree/main/firmware/bundles/audio',
    note:
      'Six of seven people asked for on-board sound and it was the most ' +
      'wanted thing in the survey by a wide margin — but it needs four wires ' +
      'soldered to the DevKit and the radio setting here is not the ' +
      'conformance-tested one, so neither belongs in the firmware everybody ' +
      'gets. When the microphone is a part on the board, this moves into the ' +
      'default and this bundle stops existing.',
  },
];
