import Link from "next/link";
import type { ReactNode } from "react";
import { formatJournalDate, type JournalLang, type JournalPost } from "@/lib/journal";
import LanguageSwitch from "./LanguageSwitch";
import JournalLightbox from "./JournalLightbox";
import JournalImage from "./JournalImage";

type ArticleLayoutProps = {
  post: JournalPost;
  lang: JournalLang;
  previous: JournalPost | null;
  next: JournalPost | null;
  allPosts: JournalPost[];
  children: ReactNode;
};

export default function ArticleLayout({
  post,
  lang,
  allPosts,
  children,
}: ArticleLayoutProps) {
  const indexHref = lang === "en" ? "/journal/en" : "/journal";
  const getPostHref = (slug: string) => lang === "en" ? `/journal/${slug}/en` : `/journal/${slug}`;

  // Stable post numbers, oldest = 01, matching the journal index page.
  const postNumbers = new Map(
    [...allPosts]
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      .map((p, index) => [p.slug, String(index + 1).padStart(2, "0")]),
  );

  // Build a 5-item window centered on the current post
  const currentIndex = allPosts.findIndex((p) => p.slug === post.slug);
  const totalPosts = allPosts.length;

  let windowStart: number;
  if (currentIndex <= 1) {
    windowStart = 0;
  } else if (currentIndex >= totalPosts - 2) {
    windowStart = Math.max(0, totalPosts - 5);
  } else {
    windowStart = currentIndex - 2;
  }
  const windowPosts = allPosts.slice(windowStart, windowStart + 5);

  return (
    <>
      <article className="journal-article">
        <JournalLightbox />
        <LanguageSwitch lang={lang} slug={post.slug} />
        <div className="journal-back-link">
          <Link href={indexHref}>All writing</Link>
        </div>

        <header className="journal-article-header">
          <h1>{post.title}</h1>
          <p>{post.excerpt}</p>
          <div className="journal-dateline">
            <span>{formatJournalDate(post.date, lang)}</span>
            <span>{post.readingTime}</span>
          </div>
        </header>

        {post.cover && (
          <figure className="journal-hero-cover">
            <div className="journal-cover-slot">
              <JournalImage
                src={post.cover}
                alt={post.coverCaption || ""}
                priority
                sizes="(max-width: 720px) calc(100vw - 48px), 760px"
              />
            </div>
            {post.coverCaption && (
              <figcaption>{post.coverCaption}</figcaption>
            )}
          </figure>
        )}

        <div className="journal-reading">{children}</div>

        <div className="journal-end-mark">
          <span />
          <span>End</span>
          <span />
        </div>
      </article>

      <footer className="journal-article-footer">
        <ol className="journal-context-list">
          {windowPosts.map((p) => {
            const globalNum = postNumbers.get(p.slug);
            const isCurrent = p.slug === post.slug;
            return (
              <li key={p.slug} className={isCurrent ? "is-current" : ""}>
                {isCurrent ? (
                  <span className="pf-row is-current-row">
                    <span className="pf-ghost">{globalNum}</span>
                    <span className="journal-list-body">
                      <strong className="pf-row-t">{p.title}</strong>
                    </span>
                    <span className="journal-list-meta">
                      {formatJournalDate(p.date, lang)}
                    </span>
                  </span>
                ) : (
                  <Link className="pf-row" href={getPostHref(p.slug)}>
                    <span className="pf-ghost">{globalNum}</span>
                    <span className="journal-list-body">
                      <strong className="pf-row-t">{p.title}</strong>
                    </span>
                    <span className="journal-list-meta">
                      {formatJournalDate(p.date, lang)}
                    </span>
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
        <Link className="journal-all-writing-link" href={indexHref}>
          All writing
        </Link>
      </footer>
    </>
  );
}

