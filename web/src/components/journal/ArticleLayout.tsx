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
  children: ReactNode;
};

export default function ArticleLayout({
  post,
  lang,
  previous,
  next,
  children,
}: ArticleLayoutProps) {
  const indexHref = lang === "en" ? "/journal/en" : "/journal";
  const getPostHref = (slug: string) => lang === "en" ? `/journal/${slug}/en` : `/journal/${slug}`;
  const adjacentPosts = [
    previous ? { label: "Previous", post: previous } : null,
    next ? { label: "Next", post: next } : null,
  ].filter((item): item is { label: string; post: JournalPost } => Boolean(item));

  return (
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
              alt=""
              priority
              sizes="(max-width: 720px) calc(100vw - 48px), 760px"
            />
          </div>
        </figure>
      )}

      <div className="journal-reading">{children}</div>

      <div className="journal-end-mark">
        <span />
        <span>End</span>
        <span />
      </div>

      <footer className="journal-article-footer">
        {adjacentPosts.length > 0 && (
          <section className="journal-more-writing" aria-label="More writing">
            <ol>
              {adjacentPosts.map(({ label, post: adjacentPost }) => (
                <li key={adjacentPost.slug}>
                  <Link href={getPostHref(adjacentPost.slug)}>
                    <span className="journal-more-kicker">{label}</span>
                    <strong>{adjacentPost.title}</strong>
                    <time>{formatJournalDate(adjacentPost.date, lang)}</time>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}
        <Link className="journal-all-writing-link" href={indexHref}>
          All writing
        </Link>
      </footer>
    </article>
  );
}
