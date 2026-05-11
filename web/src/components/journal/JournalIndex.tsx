import Link from "next/link";
import { formatJournalDate, type JournalLang, type JournalPost } from "@/lib/journal";
import LanguageSwitch from "./LanguageSwitch";
import JournalImage from "./JournalImage";

type JournalIndexProps = {
  posts: JournalPost[];
  lang: JournalLang;
};

const featuredSlug = "v1-30-days";

export default function JournalIndex({ posts, lang }: JournalIndexProps) {
  const hero = posts.find((post) => post.slug === featuredSlug) ?? posts[0];
  const archive = posts;
  const newestSlug = posts[0]?.slug;
  const getPostHref = (slug: string) => lang === "en" ? `/journal/${slug}/en` : `/journal/${slug}`;

  return (
    <main className="journal-index">
      <header className="journal-masthead">
        <Link className="journal-lockup" href="/">
          Patternflow
        </Link>
        <div className="journal-entry-count">Blog</div>
      </header>

      <div className="journal-panel">
        <LanguageSwitch lang={lang} />

        {hero && (
          <Link
            className={`journal-featured${hero.cover ? "" : " journal-featured-text-only"}`}
            href={getPostHref(hero.slug)}
          >
            <div className="journal-featured-copy">
              <h1>{hero.title}</h1>
              <p>{hero.excerpt}</p>
              <div className="journal-featured-meta">
                <span>{formatJournalDate(hero.date, lang)}</span>
                <span>{hero.readingTime}</span>
              </div>
            </div>
            {hero.cover && (
              <div className="journal-index-thumb">
                <JournalImage
                  src={hero.cover}
                  alt=""
                  priority
                  sizes="(max-width: 720px) 260px, 180px"
                />
              </div>
            )}
          </Link>
        )}

        {archive.length > 0 && (
          <>
            <div className="journal-archive-label">Archive</div>
            <ol className="journal-post-list">
              {archive.map((post, index) => (
                <li key={post.slug}>
                  <Link className="pf-row" href={getPostHref(post.slug)}>
                    <span className="pf-ghost">{String(index + 1).padStart(2, "0")}</span>
                    <span className="journal-list-body">
                      <strong className="pf-row-t">
                        {post.title}
                        {post.slug === newestSlug && post.slug !== hero?.slug && (
                          <span className="journal-new-badge">NEW</span>
                        )}
                      </strong>
                      <span className="pf-row-d">{post.excerpt}</span>
                    </span>
                    <span className="journal-list-meta">
                      {formatJournalDate(post.date, lang)}
                    </span>
                    <span className="journal-list-meta">{post.readingTime}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </>
        )}

      </div>

      <footer className="journal-index-footer">
        <span>Patternflow <span aria-hidden="true">·</span> 2026</span>
        <a href="/feed.xml">RSS feed</a>
      </footer>
    </main>
  );
}
