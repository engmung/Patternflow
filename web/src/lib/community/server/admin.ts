import type { Visibility } from "../visibility";
import type { CommunitySession } from "./auth";

// ─────────────────────────────────────────────────────────────────────────────
// Moderator identity.
//
// Env var, not a database column: the community is run by one person on one
// box, and a `role` column would need a UI to grant it, an audit trail for who
// granted it, and a story for what happens when the row is edited by hand. A
// list in the environment has none of that, and changing it needs shell access
// to the server — which is a stronger control than anything we would build.
//
// Usernames rather than user ids so the value is legible to the person editing
// it. Better Auth's `username` column is the normalised (lowercased) handle, so
// comparison is lowercase on both sides.
//
//   COMMUNITY_ADMIN_USERNAMES=engmung,someone-else
//
// Unset means nobody is a moderator — the safe default, and what every other
// deployment of this repo gets.
// ─────────────────────────────────────────────────────────────────────────────

export function adminUsernames(): string[] {
  return (process.env.COMMUNITY_ADMIN_USERNAMES ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return adminUsernames().includes(username.toLowerCase());
}

/** Whether the signed-in user may remove other people's content. */
export function isAdminSession(session: CommunitySession): boolean {
  if (!session) return false;
  const handle = (session.user as { username?: string | null }).username ?? null;
  return isAdminUsername(handle);
}

// ─────────────────────────────────────────────────────────────────────────────
// What a moderator may CHANGE, as opposed to remove.
//
// The rule everywhere else is: moderators take things down, they do not edit
// them — rewriting someone's comment or description and leaving their name on
// it is putting words in their mouth (see comments/[id]/route.ts).
//
// The firmware header is the one exception, because it is not speech. It is
// the artefact other people flash to their own board, it arrives unverified
// (we cannot compile ESP32 C++ here), and a header that does not build is a
// broken download for everybody who tries it. "Delete the whole pattern" is
// the wrong remedy for it — the JavaScript is usually fine.
//
// So a moderator may edit exactly the .h and nothing else, and every such edit
// is marked on the row (`cpp_moderated_at` / `moderated_at`) and notified to
// the person whose name is on it. `reason` rides along into that notification.
// ─────────────────────────────────────────────────────────────────────────────

const MODERATOR_PATCH_FIELDS = ["codeCpp", "reason"];

/**
 * Whether this PATCH body is one a moderator may apply to somebody else's
 * pattern: it has to carry the header and nothing beyond the reason line.
 * A body with no `codeCpp` at all is refused too — it would be an edit to
 * fields the moderator is not allowed near.
 */
export function moderatorHeaderPatchOnly(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body);
  return keys.includes("codeCpp") && keys.every((key) => MODERATOR_PATCH_FIELDS.includes(key));
}

// ─────────────────────────────────────────────────────────────────────────────
// Taking something off the wall.
//
// A moderator may make somebody else's public pattern or deck private. That
// is a removal, not an edit — the softer one. Nothing about the work changes
// and its author keeps it (they can still open it, edit it, take it into the
// lab, download it); it just stops being shown to everybody else. Deleting is
// the same verb at full strength, and a lot of what needs taking down — the
// same pattern posted for the fifth time — does not deserve that.
//
// Three rules keep it moderation rather than a setting somebody else flipped:
//   - it is marked on the row (`hidden_at`) and the author is told, with the
//     moderator's reason when there is one — on a pattern that reason is also
//     posted under it as the moderator's comment, where it can be answered;
//   - while the mark stands the author cannot make it public again. A
//     take-down its subject can undo in one click is a request;
//   - a moderator never makes public what its author did not. Restoring works
//     only on something a moderator hid — which was public when they hid it —
//     and puts it back as it was. Private by the author's own choice is theirs.
//
// The mark is also the only private thing a moderator can open (canView in
// lib/community/visibility.ts): what they took down stays in reach so they
// can answer under it and restore it. Private work its author chose to keep
// that way is closed to moderators like everybody else.
// ─────────────────────────────────────────────────────────────────────────────

const MODERATOR_VISIBILITY_FIELDS = ["visibility", "reason"];

/**
 * Whether this PATCH body is a moderator's take-down (or restore): the
 * visibility, and nothing beyond the reason line. Anything else in the body
 * would be an edit riding in on it.
 */
export function moderatorVisibilityPatchOnly(body: Record<string, unknown>): boolean {
  const keys = Object.keys(body);
  return keys.includes("visibility") && keys.every((key) => MODERATOR_VISIBILITY_FIELDS.includes(key));
}

export type ModeratorVisibilityChange =
  | { ok: true; visibility: Visibility; hiddenAt: Date | null }
  | { ok: false; status: 403 | 409; error: string };

/**
 * What a moderator asking for `requested` does to a pattern or deck that is
 * not theirs — or why it is refused. The row's new `visibility` and
 * `hiddenAt` on success.
 */
export function moderatorVisibilityChange(
  current: { visibility: string; hiddenAt: Date | null },
  requested: Visibility,
  noun: "pattern" | "deck",
  now = new Date(),
): ModeratorVisibilityChange {
  if (requested === "private") {
    if (current.visibility === "private") {
      return {
        ok: false,
        status: 409,
        error: current.hiddenAt
          ? `This ${noun} is already off the wall.`
          : `This ${noun} is already private — its author made it so.`,
      };
    }
    return { ok: true, visibility: "private", hiddenAt: now };
  }
  if (!current.hiddenAt) {
    return current.visibility === "public"
      ? { ok: false, status: 409, error: `This ${noun} is already public.` }
      : { ok: false, status: 403, error: `Its author made this ${noun} private — only they can publish it.` };
  }
  return { ok: true, visibility: "public", hiddenAt: null };
}

/** What the author hears when they try to put a take-down back themselves. */
export function hiddenLockError(noun: "pattern" | "deck"): string {
  return `A moderator made this ${noun} private, so it stays off the wall until a moderator restores it.`;
}
