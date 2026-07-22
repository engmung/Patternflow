"use client";

import { createAuthClient } from "better-auth/react";
import { usernameClient } from "better-auth/client/plugins";

// Same-origin client — baseURL defaults to the current origin, which is what
// we want on both the dev server and the Pi deployment.
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

/** Dummy recovery address for users who skip the optional email field. */
export function dummyEmailFor(username: string): string {
  return `${username.toLowerCase()}@patternflow.local`;
}
