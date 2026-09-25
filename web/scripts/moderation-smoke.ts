/**
 * Moderation smoke test — `npm run check:moderation`.
 *
 * The admin check is a security boundary built out of environment-variable
 * string parsing, which is exactly where a silent mistake lives: get it wrong
 * one way and nobody can moderate, get it wrong the other and everybody can.
 */
import {
  adminUsernames,
  isAdminUsername,
  moderatorHeaderPatchOnly,
  moderatorVisibilityChange,
  moderatorVisibilityPatchOnly,
} from "../src/lib/community/server/admin";
import {
  COMMENT_MAX,
  REPORT_REASONS,
  cleanModerationReason,
  cleanReportDetail,
  isReportTargetType,
} from "../src/lib/community/validate";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

function withEnv(value: string | undefined, run: () => void) {
  const previous = process.env.COMMUNITY_ADMIN_USERNAMES;
  if (value === undefined) delete process.env.COMMUNITY_ADMIN_USERNAMES;
  else process.env.COMMUNITY_ADMIN_USERNAMES = value;
  try {
    run();
  } finally {
    if (previous === undefined) delete process.env.COMMUNITY_ADMIN_USERNAMES;
    else process.env.COMMUNITY_ADMIN_USERNAMES = previous;
  }
}

console.log("\n── nobody is a moderator by default ──");
// This is the state every clone of this repo runs in. If it ever flips open,
// any deployment of the community hands out removal rights to whoever asks.
withEnv(undefined, () => {
  check("unset env grants nobody", adminUsernames(), []);
  check("unset env rejects a real handle", isAdminUsername("engmung"), false);
});
withEnv("", () => check("empty env grants nobody", isAdminUsername("engmung"), false));
withEnv("   ", () => check("whitespace env grants nobody", isAdminUsername("engmung"), false));
withEnv(",,,", () => check("commas-only env grants nobody", isAdminUsername("engmung"), false));

console.log("\n── who is a moderator ──");
withEnv("engmung", () => {
  check("the listed handle is admin", isAdminUsername("engmung"), true);
  check("someone else is not", isAdminUsername("someone"), false);
  // Better Auth stores `username` lowercased, but nothing forces the env var to
  // match that casing — a capitalised entry must still work.
  check("comparison ignores case", isAdminUsername("ENGMUNG"), true);
  check("null handle is not admin", isAdminUsername(null), false);
  check("empty handle is not admin", isAdminUsername(""), false);
  // A near-miss must not pass: no prefix or substring matching anywhere.
  check("a longer handle does not match", isAdminUsername("engmung2"), false);
  check("a shorter handle does not match", isAdminUsername("engmun"), false);
});
withEnv(" engmung , Second-Mod ", () => {
  check("entries are trimmed", isAdminUsername("engmung"), true);
  check("second entry works", isAdminUsername("second-mod"), true);
  check("list is exactly two", adminUsernames(), ["engmung", "second-mod"]);
});

console.log("\n── what a moderator may change, not just remove ──");
// A moderator may edit somebody else's firmware header and NOTHING else. This
// predicate is the whole of that boundary — every field it lets through is a
// field a moderator can rewrite under another person's name, so the negative
// cases matter more than the positive ones.
check("the header alone passes", moderatorHeaderPatchOnly({ codeCpp: "#pragma once" }), true);
check("clearing the header passes", moderatorHeaderPatchOnly({ codeCpp: null }), true);
check(
  "a reason line rides along",
  moderatorHeaderPatchOnly({ codeCpp: "#pragma once", reason: "did not build" }),
  true,
);
// The JavaScript is the pattern. If this ever passes, a moderator can rewrite
// somebody's work and leave their name on it.
check("the pattern source is refused", moderatorHeaderPatchOnly({ code: "// js" }), false);
check(
  "the source smuggled in beside the header is refused",
  moderatorHeaderPatchOnly({ codeCpp: "#pragma once", code: "// js" }),
  false,
);
check(
  "retitling is refused",
  moderatorHeaderPatchOnly({ codeCpp: "#pragma once", title: "Renamed" }),
  false,
);
// Taking a pattern down is its own request (below), never a passenger on
// a header fix — each act gets its own mark and its own alert.
check(
  "a take-down riding in on a header fix is refused",
  moderatorHeaderPatchOnly({ codeCpp: "#pragma once", visibility: "private" }),
  false,
);
check("relicensing is refused", moderatorHeaderPatchOnly({ license: "MIT" }), false);
// No header in the body means the edit is about something else entirely.
check("an empty body is refused", moderatorHeaderPatchOnly({}), false);
check("a reason on its own is refused", moderatorHeaderPatchOnly({ reason: "because" }), false);

console.log("\n── what a take-down may carry ──");
// The other thing a moderator may change on somebody else's pattern or deck:
// its visibility. Same shape of boundary as the header's — the negative cases
// are the ones that matter, because anything this lets through rides along
// with a take-down under the author's name.
check("visibility alone passes", moderatorVisibilityPatchOnly({ visibility: "private" }), true);
check(
  "a reason line rides along",
  moderatorVisibilityPatchOnly({ visibility: "private", reason: "posted twice" }),
  true,
);
check("restoring passes the same way", moderatorVisibilityPatchOnly({ visibility: "public" }), true);
check(
  "retitling alongside is refused",
  moderatorVisibilityPatchOnly({ visibility: "private", title: "Renamed" }),
  false,
);
check(
  "the source alongside is refused",
  moderatorVisibilityPatchOnly({ visibility: "private", code: "// js" }),
  false,
);
check(
  "a header alongside is refused",
  moderatorVisibilityPatchOnly({ visibility: "private", codeCpp: "#pragma once" }),
  false,
);
check(
  "a deck's running order alongside is refused",
  moderatorVisibilityPatchOnly({ visibility: "private", patternIds: ["a"] }),
  false,
);
check("a reason on its own is refused", moderatorVisibilityPatchOnly({ reason: "because" }), false);
check("an empty body is refused", moderatorVisibilityPatchOnly({}), false);

console.log("\n── what a take-down does ──");
const then = new Date(Date.UTC(2026, 8, 25, 12, 0, 0));
const takeDown = moderatorVisibilityChange({ visibility: "public", hiddenAt: null }, "private", "pattern", then);
check("public comes down, marked", takeDown, { ok: true, visibility: "private", hiddenAt: then });
check(
  "restoring a take-down puts it back as it was",
  moderatorVisibilityChange({ visibility: "private", hiddenAt: then }, "public", "pattern"),
  { ok: true, visibility: "public", hiddenAt: null },
);
// The privacy half of the rule. A moderator can open a private pattern; if
// they could also publish one, "private" would mean "private unless staff".
const authorsOwn = moderatorVisibilityChange({ visibility: "private", hiddenAt: null }, "public", "pattern");
check("what its author made private is not a moderator's to publish", authorsOwn.ok, false);
check("and that is a 403", authorsOwn.ok ? null : authorsOwn.status, 403);
const alreadyPrivate = moderatorVisibilityChange({ visibility: "private", hiddenAt: null }, "private", "deck");
// Marking it would lock the author out of publishing their own private
// work, which nobody asked for — and "restore" would then publish it.
check("nor marked, by taking it down again", alreadyPrivate.ok, false);
check("which is a 409", alreadyPrivate.ok ? null : alreadyPrivate.status, 409);
check(
  "a second take-down is a 409 too",
  (() => {
    const verdict = moderatorVisibilityChange({ visibility: "private", hiddenAt: then }, "private", "deck");
    return verdict.ok ? null : verdict.status;
  })(),
  409,
);
check(
  "restoring something already public is a 409",
  (() => {
    const verdict = moderatorVisibilityChange({ visibility: "public", hiddenAt: null }, "public", "deck");
    return verdict.ok ? null : verdict.status;
  })(),
  409,
);

console.log("\n── the reason line ──");
check("no reason is fine", cleanModerationReason(undefined), null);
check("null is no reason", cleanModerationReason(null), null);
check("blank is no reason", cleanModerationReason("   "), null);
check("it is trimmed", cleanModerationReason("  posted twice  "), "posted twice");
// On a pattern it becomes a comment, so it is held to a comment's length.
check("a comment's length passes", cleanModerationReason("x".repeat(COMMENT_MAX)), "x".repeat(COMMENT_MAX));
check("over a comment's length is rejected", cleanModerationReason("x".repeat(COMMENT_MAX + 1)), undefined);
check("a non-string is rejected", cleanModerationReason(42), undefined);

console.log("\n── report input ──");
check("pattern is a valid target", isReportTargetType("pattern"), true);
check("post is a valid target", isReportTargetType("post"), true);
check("comment is a valid target", isReportTargetType("comment"), true);
check("user is not a target", isReportTargetType("user"), false);
check("non-string is not a target", isReportTargetType(42), false);
// Strobing joined the list with the dark-room redesign — it leads the modal
// because it is the one reason where the harm is to whoever is looking.
check("reasons are the six expected", REPORT_REASONS.length, 6);
check("strobing is offered first", REPORT_REASONS[0], "strobing");
check("blank detail becomes null", cleanReportDetail("   "), null);
check("missing detail becomes null", cleanReportDetail(undefined), null);
check("over-long detail is rejected", cleanReportDetail("x".repeat(2001)), undefined);
check("non-string detail is rejected", cleanReportDetail(123), undefined);
check("normal detail is trimmed", cleanReportDetail("  stolen from X  "), "stolen from X");

console.log(failures === 0 ? "\nAll moderation checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
