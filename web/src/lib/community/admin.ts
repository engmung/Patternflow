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
