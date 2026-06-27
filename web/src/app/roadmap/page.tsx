'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './Roadmap.module.css';

type RoadmapIssue = {
  number: number;
  title: string;
  url: string;
  state: string;
  updatedAt: string;
  comments: number;
  labels: { name: string; color: string }[];
  subIssues: { total: number; completed: number; percent: number } | null;
};

type RoadmapData = { repo?: string; fetchedAt?: string; issues: RoadmapIssue[]; error?: string };

const GITHUB_ISSUES_URL = 'https://github.com/engmung/Patternflow/issues';

export default function RoadmapPage() {
  const [data, setData] = useState<RoadmapData | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/roadmap')
      .then((res) => res.json())
      .then((payload: RoadmapData) => {
        if (active) setData(payload);
      })
      .catch(() => {
        if (active) setData({ issues: [], error: 'Failed to load' });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link className={styles.back} href="/">
          ← Patternflow
        </Link>
        <a className={styles.repoLink} href={GITHUB_ISSUES_URL} target="_blank" rel="noreferrer">
          Live from GitHub
        </a>
      </header>

      <div className={styles.intro}>
        <h1 className={styles.title}>Project status</h1>
        <p className={styles.sub}>
          Open issues pulled straight from the repo — a live view of what is being worked on right
          now, with sub-issue progress where it is tracked. Experimental.
        </p>
      </div>

      {data === null ? (
        <p className={styles.muted}>Loading issues…</p>
      ) : data.issues.length === 0 ? (
        <p className={styles.muted}>
          {data.error ? `Could not load issues (${data.error}).` : 'No open issues right now.'}
        </p>
      ) : (
        <ul className={styles.list}>
          {data.issues.map((issue) => (
            <li key={issue.number}>
              <a className={styles.item} href={issue.url} target="_blank" rel="noreferrer">
                <div className={styles.top}>
                  <span className={styles.num}>#{issue.number}</span>
                  <span className={styles.issueTitle}>{issue.title}</span>
                </div>
                {issue.labels.length > 0 && (
                  <div className={styles.labels}>
                    {issue.labels.map((label) => (
                      <span
                        key={label.name}
                        className={styles.label}
                        style={{ borderColor: `#${label.color}`, color: `#${label.color}` }}
                      >
                        {label.name}
                      </span>
                    ))}
                  </div>
                )}
                {issue.subIssues && (
                  <div className={styles.progress}>
                    <span className={styles.bar}>
                      <span style={{ width: `${issue.subIssues.percent}%` }} />
                    </span>
                    <span className={styles.progressText}>
                      {issue.subIssues.completed}/{issue.subIssues.total}
                    </span>
                  </div>
                )}
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
