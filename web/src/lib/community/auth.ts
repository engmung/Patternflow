import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { getDb } from "./db";
import * as schema from "./schema";
import { USERNAME_RE } from "./validate";

// Better Auth owns hashing, sessions, and CSRF — never hand-roll any of that.
// Username + password is the primary credential; email is optional and only
// used for recovery (no verification mails are ever sent).
//
// Lazy singleton for the same reason as db.ts: importing this file must be
// side-effect free on deployments where the community is disabled.

let instance: ReturnType<typeof createAuth> | null = null;

function trustedOrigins(): string[] {
  return (process.env.COMMUNITY_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), { provider: "sqlite", schema }),
    // Better Auth checks the Origin header as CSRF protection. The main site
    // (where Pattern Lab also lives) signs in against this deployment, so its
    // origin has to be named explicitly or every cross-origin auth call is
    // rejected. Same list the CORS layer uses — see lib/community/cors.ts.
    trustedOrigins: trustedOrigins(),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    plugins: [
      username({
        minUsernameLength: 3,
        maxUsernameLength: 20,
        usernameValidator: (name) => USERNAME_RE.test(name),
      }),
    ],
  });
}

export function getAuth() {
  if (!instance) instance = createAuth();
  return instance;
}

export type CommunitySession = Awaited<
  ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>
>;
