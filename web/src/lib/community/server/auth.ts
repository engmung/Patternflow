import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { username } from "better-auth/plugins";
import { getDb } from "./db";
import * as schema from "./schema";
import { USERNAME_RE } from "../validate";

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

/**
 * True when `shown` is `own` with only its capitals changed. `displayUsername`
 * is what every card, comment and licence header prints after the @, so it
 * may not spell anyone else's name, and USERNAME_RE keeps out the letters
 * that lowercase into ASCII (the Kelvin sign is a K that way).
 */
function isOwnDisplayName(shown: unknown, own: unknown): boolean {
  return (
    typeof shown === "string" &&
    typeof own === "string" &&
    USERNAME_RE.test(shown) &&
    shown.toLowerCase() === own.toLowerCase()
  );
}

// Better Auth's username plugin takes any string as `displayUsername`, at
// sign-up and on /update-user, and its `displayUsernameValidator` is shown the
// name alone, never whose it is. So this runs before the plugin's own hooks
// and holds the two together. eve could otherwise set hers to "ada", and the
// code she published next carried "// Author:   @ada".
const displayNameIsOwn = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-up/email" && ctx.path !== "/update-user") return;
  const body = ctx.body as Record<string, unknown> | undefined;
  if (!body || typeof body !== "object") return;

  let own = body.username;
  if (ctx.path === "/sign-up/email") {
    // The plugin signs up a bare display name as the username itself.
    own ??= body.displayUsername;
  } else {
    const user = (await getSessionFromCtx<{ username?: string | null; displayUsername?: string | null }>(ctx))
      ?.user;
    if (own === undefined) {
      own = user?.username;
    } else if (body.displayUsername === undefined) {
      // A new username takes the display name with it. Left behind, the old
      // name would stay on the cards while it is free to sign up as.
      body.displayUsername = isOwnDisplayName(user?.displayUsername, own) ? user?.displayUsername : own;
    }
  }

  // Missing on sign-up is fine: the plugin copies the username in after this.
  if (body.displayUsername === undefined) return;
  if (!isOwnDisplayName(body.displayUsername, own)) {
    throw new APIError("BAD_REQUEST", {
      message: "Your display name is your username. Only its capitals can change.",
    });
  }
});

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
    // a guess budget: left alone it allows about 26,000 attempts a day on
    // each sign-in path, and the floor here is an 8-character password.
    //
    // The window goes to an hour, which turns the same rule into a budget: 10
    // wrong passwords an hour per IP on each path. There are two,
    // /sign-in/username and /sign-in/email, and each counts on its own. A
    // person who mistypes theirs twice never meets this; someone working a
    // list gets 480 guesses a day instead of 52,000. `enabled` is forced on
    // because the default only switches it on in production, and a staging
    // box with real accounts on it is exactly where nobody is watching.
    rateLimit: {
      enabled: true,
      customRules: {
        "/sign-in/*": { window: 3600, max: 10 },
        "/sign-up/*": { window: 3600, max: 10 },
        "/change-password": { window: 3600, max: 10 },
        "/change-email": { window: 3600, max: 10 },
      },
    },
    // The limits above count per IP, so the IP has to be the visitor's.
    // Behind Cloudflare it is in CF-Connecting-IP, which Cloudflare sets at
    // the edge. Better Auth's default reads X-Forwarded-For instead, which the
    // client can start: Cloudflare appends to a chain the client sent, Better
    // Auth will not pick an address out of two entries, and every such request
    // lands in one shared bucket per path that anyone can fill. The production
    // log showed that fallback on 2026-10-19. A host with no Cloudflare in
    // front has to change this header, because there the client writes
    // CF-Connecting-IP itself and gets a fresh bucket for every value it sends.
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    hooks: { before: displayNameIsOwn },
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
