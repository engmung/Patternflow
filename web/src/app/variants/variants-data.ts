// The shelf. One entry per firmware built on Patternflow core.
//
// Hand-curated, and the curation is the point: somebody read the code before
// the name went up. There is no application form.
//
// Two tiers, and the difference is visible on the page:
//
//   listed          name, what it adds and drops, a link to the maintainer's
//                   own releases. You download and flash it yourself.
//   listed + hosted a copy of the binary is served from here, so a panel can
//                   be updated in one click. That copy is vouched for —
//                   somebody built it, ran it, and put it there.
//
// Hosting somebody's binary means distributing it, so `hosted` is only ever
// set for a firmware whose maintainer agreed and whose build was checked.
// Everything else links out, and linking out is not a lesser tier — it is
// the normal one.
//
// A hosted copy goes stale the moment its maintainer cuts a release, so the
// page reads the latest tag from GitHub in the visitor's browser and says so
// when the two have drifted. Better to admit the gap than to quietly serve
// last month's firmware.
//
// To be listed, a variant agrees to the rules in
// docs/rfc-core-and-variants.md §2.6 — the short version being: it can be
// left again over /update, it does not change the partition layout, it plays
// the same community .pfm modules, it reports its own `variant` string and
// version in /api/status, and it keeps Wi-Fi credentials where core keeps
// them so switching does not mean re-provisioning.

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
  /** The honest paragraph. Kept short: who should and should not take this. */
  note: string;
};

export const CORE_NOTE =
  'Core is the one that has to keep working: the panel, the pattern loader, ' +
  'Wi-Fi, sleep, and the update path out of anything. It is what ships on ' +
  'the board and what you can always return to.';

// The thing people most often assume needs a variant, and does not.
export const CORE_ALSO =
  'Home Assistant works against core as it is. Reading the panel was always ' +
  'plain HTTP, and setting the four knobs is POST /api/params — no broker ' +
  'and no variant in between.';

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
    id: 'audio',
    name: 'Audio',
    maintainer: 'SeungHun Lee',
    maintainerHref: 'https://github.com/engmung',
    status: 'available',
    summary:
      'For pointing sound at a panel — a laptop running Ableton, a tab ' +
      'playing something, or the room itself.',
    adds: [
      'OSC (Max, TouchDesigner, Ableton)',
      'Browser audio + Chrome extension',
      'On-board microphone',
    ],
    github: 'engmung/patternflow-audio',
    releases: 'https://github.com/engmung/patternflow-audio/releases',
    source: 'https://github.com/engmung/patternflow-audio',
    hosted: {
      version: 'v0.1.0',
      url: 'https://community.patternflow.work/api/variant-bin/audio/firmware.bin',
    },
    note:
      'The first variant, and the one the split was tested on rather than ' +
      'argued about — OSC left the core to get here, and it was the ' +
      'maintainer’s own favourite thing in the firmware. Take it if a ' +
      'computer or a microphone drives your panel. If you pick a pattern and ' +
      'leave it, core does that and this adds nothing you would notice.',
  },
];
