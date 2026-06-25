// Fetches open issues from the public repo and writes a static snapshot to
// web/public/roadmap.json. Shape matches the old /api/roadmap response so the
// /roadmap page can read the static file with no runtime token or rate limit.
//
// Run in CI (uses the built-in GITHUB_TOKEN) or locally:
//   GITHUB_TOKEN=ghp_xxx node .github/scripts/build-roadmap.mjs
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const REPO = process.env.ROADMAP_REPO || "engmung/PatternFlow";
const PER_PAGE = 30;
const OUT = resolve(process.cwd(), "web/public/roadmap.json");

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "patternflow-roadmap-snapshot",
};
if (process.env.GITHUB_TOKEN) {
  headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
}

const res = await fetch(
  `https://api.github.com/repos/${REPO}/issues?state=open&per_page=${PER_PAGE}&sort=updated&direction=desc`,
  { headers },
);
if (!res.ok) {
  throw new Error(`GitHub responded ${res.status}: ${await res.text()}`);
}

const raw = await res.json();
const issues = raw
  // The issues endpoint also returns pull requests — drop them.
  .filter((item) => !item.pull_request)
  .map((item) => ({
    number: item.number,
    title: item.title,
    url: item.html_url,
    state: item.state,
    updatedAt: item.updated_at,
    comments: item.comments,
    labels: (item.labels ?? [])
      .map((label) =>
        typeof label === "string"
          ? { name: label, color: "888888" }
          : { name: label.name, color: label.color || "888888" },
      )
      .filter((label) => label.name),
    subIssues:
      item.sub_issues_summary && item.sub_issues_summary.total > 0
        ? {
            total: item.sub_issues_summary.total,
            completed: item.sub_issues_summary.completed,
            percent: item.sub_issues_summary.percent_completed,
          }
        : null,
  }));

const payload = { repo: REPO, fetchedAt: new Date().toISOString(), issues };

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(payload, null, 2) + "\n");
console.log(`Wrote ${issues.length} issues to ${OUT}`);
