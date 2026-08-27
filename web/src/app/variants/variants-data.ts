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

// Empty, and that is the honest state.
//
// Three entries stood here for a few hours, and every one of them named a
// person — or left a slot open for one — who had never been asked whether
// they wanted to maintain a firmware. A shelf of variants nobody had
// committed to build made the split look further along than it was, and it
// did that at the expense of people who had not agreed to be on it.
//
// Whatever any of them decides is theirs to say, in their own words, in
// their own time. It does not get written down here first.
//
// So: no entries until somebody says yes. The rest of this page describes
// what a variant IS and how you move between firmwares, which is true today
// and useful to anyone thinking about building one. Adding a variant back is
// one object in this array.
export const VARIANTS: Variant[] = [];
