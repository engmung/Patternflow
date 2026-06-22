export type LivePreset = {
  /** Stable id for analytics — never change once shipped (PostHog history). */
  id: string;
  /** Instagram pattern number. Drives ordering and the display name. */
  num: number;
  /** Display label shown on the chip, e.g. "Pattern 2". */
  name: string;
  /** One-line description, shown as the chip tooltip. */
  desc: string;
  /** Complete standalone pattern source (setup/update/draw). */
  code: string;
  /** Optional ISO date the pattern was made (YYYY-MM-DD). */
  date?: string;

  // ── Provenance & licensing ──────────────────────────────────────────────
  // The JS pattern is the source of truth; the firmware .h is generated from
  // it. These fields travel with the pattern (web object + code header + the
  // generated C++ header) so attribution and license are never lost.
  /** "preset" = curated showcase shipped by the project. "custom" = community/user pattern. Defaults to "preset". */
  kind?: 'preset' | 'custom';
  /** Author handle/name. Defaults to the project owner for the built-in set. */
  author?: string;
  /** SPDX license id. Defaults to "CC-BY-SA-4.0" (same as the project commons). */
  license?: string;
  /** Where it came from — Instagram/Discord/PR URL, if any. */
  source?: string;
  /** Remix lineage, e.g. "remixed from @someone's Wave Saw". "original" if none. */
  lineage?: string;
};
