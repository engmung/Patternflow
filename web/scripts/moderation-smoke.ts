/**
 * Moderation smoke test — `npm run check:moderation`.
 *
 * The admin check is a security boundary built out of environment-variable
 * string parsing, which is exactly where a silent mistake lives: get it wrong
 * one way and nobody can moderate, get it wrong the other and everybody can.
 */
import { adminUsernames, isAdminUsername } from "../src/lib/community/admin";
import {
  REPORT_REASONS,
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

console.log("\n── report input ──");
check("pattern is a valid target", isReportTargetType("pattern"), true);
check("post is a valid target", isReportTargetType("post"), true);
check("comment is a valid target", isReportTargetType("comment"), true);
check("user is not a target", isReportTargetType("user"), false);
check("non-string is not a target", isReportTargetType(42), false);
check("reasons are the five expected", REPORT_REASONS.length, 5);
check("blank detail becomes null", cleanReportDetail("   "), null);
check("missing detail becomes null", cleanReportDetail(undefined), null);
check("over-long detail is rejected", cleanReportDetail("x".repeat(2001)), undefined);
check("non-string detail is rejected", cleanReportDetail(123), undefined);
check("normal detail is trimmed", cleanReportDetail("  stolen from X  "), "stolen from X");

console.log(failures === 0 ? "\nAll moderation checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
