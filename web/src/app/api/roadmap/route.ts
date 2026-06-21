import { NextResponse } from "next/server";

// Read-only roadmap feed. Pulls open issues (and their sub-issue progress)
// from the public repo on the server, so no token is exposed to the browser
// and the result is cached/shared across visitors. A GITHUB_TOKEN env var is
// used when present (higher rate limit) but is optional for a public repo.
//
// This is the "server route + cache" prototype. A later iteration can swap to
// a GitHub Action that writes a static JSON snapshot instead.

const REPO = "engmung/PatternFlow";
const PER_PAGE = 30;

// Revalidate at most every 10 minutes.
export const revalidate = 600;

type RawLabel = { name: string; color: string } | string;

type RawIssue = {
  number: number;
  title: string;
  html_url: string;
  state: string;
  updated_at: string;
  comments: number;
  pull_request?: unknown;
  labels: RawLabel[];
  sub_issues_summary?: {
    total: number;
    completed: number;
    percent_completed: number;
  };
};

export type RoadmapIssue = {
  number: number;
  title: string;
  url: string;
  state: string;
  updatedAt: string;
  comments: number;
  labels: { name: string; color: string }[];
  subIssues: { total: number; completed: number; percent: number } | null;
};

export async function GET() {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "patternflow-web",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO}/issues?state=open&per_page=${PER_PAGE}&sort=updated&direction=desc`,
      { headers, next: { revalidate } },
    );

    if (!res.ok) {
      return NextResponse.json(
        { repo: REPO, issues: [], error: `GitHub responded ${res.status}` },
        { status: 200 },
      );
    }

    const raw = (await res.json()) as RawIssue[];
    const issues: RoadmapIssue[] = raw
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
        subIssues: item.sub_issues_summary && item.sub_issues_summary.total > 0
          ? {
              total: item.sub_issues_summary.total,
              completed: item.sub_issues_summary.completed,
              percent: item.sub_issues_summary.percent_completed,
            }
          : null,
      }));

    return NextResponse.json({ repo: REPO, fetchedAt: new Date().toISOString(), issues });
  } catch (error) {
    return NextResponse.json(
      { repo: REPO, issues: [], error: error instanceof Error ? error.message : "Fetch failed" },
      { status: 200 },
    );
  }
}
