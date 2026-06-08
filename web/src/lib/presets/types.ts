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
};
