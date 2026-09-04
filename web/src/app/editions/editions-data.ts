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

export type EditionStatus =
  // Shipping: there is a binary you can flash today.
  | 'available'
  // Someone has agreed to maintain it and is building it.
  | 'building'
  // Nobody has agreed to anything. An opening, published so the person best
  // placed to own it can see it and say yes or no. An invitation, never an
  // announcement: these are real people's names on firmware they have not
  // committed to.
  | 'proposed';

export type Edition = {
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
  status: EditionStatus;
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

// ── On 3.8.0 ────────────────────────────────────────────────────────────
//
// All three images report firmware 3.8.0: built clean, scanned, and the
// thing the one-click install hands people. Promoted from provisional to
// the regular offering on 2026-08-31 — the community banner points here,
// and the browser flasher installs the same core image.
//
// The GitHub release write-up (tag, changelog) follows separately; the
// number is real and the notes will catch up to it, not the other way
// around.

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
export const EDITIONS: Edition[] = [
  {
    id: 'core',
    name: 'Patternflow',
    tier: 'official',
    // Deliberately no `maintainer`. The default is not one person's firmware —
    // the show player, MQTT and weather in it are Simone Majocchi's work, and
    // a byline naming only the maintainer reads as a claim over it.
    //
    // The browser flasher installs this too: flash/manifest.json points at the
    // same image, so a new board and this card now arrive at the same place.
    // They disagreed for a while — the flasher was still on v3.7.1, the old
    // composition with every feature compiled in — which was the last thing
    // left over from the split.
    //
    // Each edition has its own one-click path from its own card, so this stays
    // the plain gateway and does not need to know what anybody is running.
    status: 'available',
    summary:
      'The instrument. Patterns, four knobs, and the most room on the board ' +
      'for the patterns you install.',
    adds: [
      'Patterns, and the loader for community ones',
      'Four encoders, and the panel they drive',
      'Wi-Fi, sleep, and the way out of any firmware',
      'The largest block a pattern can claim — 92 KB, against 74 KB elsewhere',
    ],
    hosted: {
      version: 'v3.9.4',
      url: 'https://patternflow.work/flash/bin/core-v3.9.4/patternflow.ino.bin',
    },
    source: 'https://github.com/engmung/Patternflow',
    note:
      'Patternflow is a device that loads interactive patterns and runs them ' +
      'under four knobs, and this is exactly that and nothing else. Because ' +
      'nothing else is loaded, a pattern gets more contiguous memory here ' +
      'than in any other build — which matters for the big ones. Everything ' +
      'below is a way of driving the panel from somewhere else. Switching is ' +
      'a click, and so is switching back: your patterns, networks and ' +
      'settings do not move.',
  },
  {
    id: 'performance',
    name: 'Patternflow Performance',
    tier: 'official',
    reason: 'not-universal',
    // Credited because it is his work — the client in every role, FlowLocal,
    // and the Director inside it. He offered to co-own a bundle on this tree
    // rather than keep a fork (#349), which is exactly what this is.
    maintainer: 'Simone Majocchi',
    maintainerHref: 'https://github.com/SimonePDA',
    status: 'available',
    summary:
      'A panel that runs a room: sequences on a timeline, a broker driving ' +
      'the knobs, two panels in step, and the weather turning up as light.',
    adds: [
      'Sequences — cue lists, timelines, the night/wake scheduler',
      'MQTT in every role — publisher, subscriber, bridge',
      'FlowLocal and the Director',
      'Weather — temperature and wind mapped onto the knobs',
    ],
    hosted: {
      version: 'v0.2.3',
      url: 'https://patternflow.work/flash/bin/performance-v0.2.3/patternflow.ino.bin',
    },
    source: 'https://github.com/engmung/Patternflow/tree/main/firmware/bundles/performance',
    note:
      'For a panel that has to behave the same way twice — an installation, ' +
      'a set, a room that opens at seven. Sequences play a timeline the ' +
      'panel keeps on its own; MQTT is the way in that stays in step across ' +
      'a reconnect and keeps two panels together. Knob state and pattern ' +
      'selection are reachable over plain HTTP on any edition, so this is ' +
      'for when you want the panel to be part of something larger.',
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
      'Sound, and nothing else in the way — a microphone soldered to the ' +
      'board, so the panel hears the room with no computer in it. And the ' +
      'panel as a MIDI port in any DAW.',
    adds: [
      'MIDI over Wi-Fi — a MIDI port in Ableton, Logic or Bitwig; knobs and ' +
        'buttons map with Ctrl-M, a clip drives the panel back, per-knob ' +
        'sensitivity on the console, the session reconnects itself',
      'OSC — Ableton, Max and TouchDesigner, both directions',
      'Browser and tab audio through the Chrome extension',
      'On-board PDM microphone — four wires to GPIO43/44, no computer needed',
      'The mapping editor: bands as boxes on the live spectrum, response ' +
        'curves from rise to gate to hand-drawn',
      'Wi-Fi transmit power raised for rooms full of access points',
    ],
    // Served from here, so the panel's own /update page can fetch it. Under
    // /flash/bin, which already sends the CORS header that fetch needs.
    hosted: {
      version: 'v0.5.3',
      url: 'https://patternflow.work/flash/bin/audio-v0.5.3/patternflow.ino.bin',
    },
    source: 'https://github.com/engmung/Patternflow/tree/main/firmware/bundles/audio',
    note:
      'Six of seven people asked for on-board sound and it was the most ' +
      'wanted thing in the survey by a wide margin — but it needs four wires ' +
      'soldered to the DevKit and the radio setting here is not the ' +
      'conformance-tested one, so neither belongs in the firmware everybody ' +
      'gets. It is also where that work happens, which is why it carries ' +
      'nothing else: no sequences, no weather, no MQTT. Take this to ' +
      'experiment with sound, not to run a room. When the microphone is a ' +
      'part on the board, on-board audio moves into the default. ' +
      'Installing this without the microphone is safe: the panel can tell a ' +
      'missing mic from a quiet room, says so on the Mic page, and lets ' +
      'nothing drive the knobs until you turn it on.',
  },
  {
    id: 'clock',
    name: 'Patternflow Clock',
    tier: 'official',
    reason: 'not-universal',
    maintainer: 'SeungHun Lee',
    maintainerHref: 'https://github.com/engmung',
    status: 'available',
    summary:
      'A panel that tells the time: the hours and minutes cut out of ' +
      'whatever pattern is running, in a choice of faces.',
    adds: [
      'Huge digits the pattern shows through — hours over minutes upright, ' +
        'four across on a wide panel — or solid digits over the pattern, or ' +
        'a plain clock on a colour of your choosing',
      'Seven faces, every one open-licensed; adding your own is a TTF and ' +
        'one line in the generator',
      'A live preview on the panel\'s own console page that draws the same ' +
        'glyphs the panel does, and sends every change as you make it',
      'Time zones with their summer-time rule, so the clock moves itself in ' +
        'spring and autumn',
    ],
    hosted: {
      version: 'v0.1.1',
      url: 'https://patternflow.work/flash/bin/clock-v0.1.1/patternflow.ino.bin',
    },
    source: 'https://github.com/engmung/Patternflow/tree/main/firmware/bundles/clock',
    note:
      'For a panel on a shelf or a desk that you glance at. It carries ' +
      'nothing but the clock — no broker, no sequences, no sound, no ' +
      'weather — because a clock should not need any of that to exist. ' +
      'The digits are cut into the frame on its way to the panel, so the ' +
      'edges stay soft and the pattern keeps moving inside them; the clock ' +
      'stays off while the panel\'s own menus are up. It was a request ' +
      'from outside, and this is the edition made for it.',
  },
];
