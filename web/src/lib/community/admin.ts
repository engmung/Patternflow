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
