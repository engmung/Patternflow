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
    // Better Auth throttles by default — but its default for the credential
    // endpoints is 3 tries per 10 seconds, which is a burst brake rather than
    // a guess budget: left alone it allows about 26,000 attempts a day against
    // one account, and the floor here is an 8-character password.
    //
    // The window goes to an hour, which turns the same rule into a budget: 10
    // wrong passwords an hour per IP. A person who mistypes theirs twice never
    // meets this; someone working a list gets 240 guesses a day instead of
    // 26,000. `enabled` is forced on because the default only switches it on
    // in production, and a staging box with real accounts on it is exactly
    // where nobody is watching.
    rateLimit: {
      enabled: true,
      customRules: {
        "/sign-in/*": { window: 3600, max: 10 },
        "/sign-up/*": { window: 3600, max: 10 },
        "/change-password": { window: 3600, max: 10 },
        "/change-email": { window: 3600, max: 10 },
      },
    },
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
