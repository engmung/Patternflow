"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";
import { crossOriginCommunityBase } from "./apiBase";

// Sessions live on the community deployment, so auth calls have to go there
// even when the page was served by the main site. Same-origin resolves to null
// and Better Auth falls back to the current origin. See lib/community/apiBase.
export const authClient = createAuthClient({
  baseURL: crossOriginCommunityBase() ?? undefined,
  fetchOptions: { credentials: "include" },
  plugins: [usernameClient()],
});

/** Dummy recovery address for users who skip the optional email field. */
export function dummyEmailFor(username: string): string {
  return `${username.toLowerCase()}@patternflow.local`;
}
