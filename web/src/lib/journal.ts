import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import readingTime from "reading-time";

const journalDirectory = path.join(process.cwd(), "content", "journal");

export type JournalLang = "ko" | "en";

export type JournalFrontmatter = {
  title: string;
  date: string;
  excerpt: string;
  cover?: string;
  coverCaption?: string;
  series?: string;
  draft?: boolean;
};

export type JournalPost = JournalFrontmatter & {
  slug: string;
  lang: JournalLang;
  content: string;
  readingTime: string;
};

function isFrontmatter(value: Record<string, unknown>): value is JournalFrontmatter {
  return (
    typeof value.title === "string" &&
    typeof value.date === "string" &&
    typeof value.excerpt === "string"
  );
}

function getPostPath(slug: string, lang: JournalLang) {
  const localizedPath = path.join(journalDirectory, `${slug}.${lang}.mdx`);
  const defaultPath = path.join(journalDirectory, `${slug}.mdx`);

  if (lang === "en" && fs.existsSync(localizedPath)) {
    return localizedPath;
  }

  if (lang === "ko" && fs.existsSync(defaultPath)) {
    return defaultPath;
  }

  if (fs.existsSync(localizedPath)) {
    return localizedPath;
  }

  return defaultPath;
}

function getReadingTime(content: string, lang: JournalLang) {
  if (lang === "ko") {
    const minutes = Math.max(1, Math.ceil(content.replace(/\s+/g, "").length / 500));
    return `${minutes} min`;
  }

  return readingTime(content).text;
}

function readPost(slug: string, lang: JournalLang): JournalPost {
  const fullPath = getPostPath(slug, lang);
  const file = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(file);

  if (!isFrontmatter(data)) {
    throw new Error(`Invalid journal frontmatter: ${slug}`);
  }

  return {
    slug,
    lang,
    title: data.title,
    date: data.date,
    excerpt: data.excerpt,
    cover: data.cover,
    coverCaption: data.coverCaption,
    series: data.series,
    draft: data.draft,
    content,
    readingTime: getReadingTime(content, lang),
  };
}

export function getJournalSlugs() {
  if (!fs.existsSync(journalDirectory)) {
    return [];
  }

  return fs
    .readdirSync(journalDirectory)
    .filter((file) => file.endsWith(".mdx"))
    .map((file) => file.replace(/(\.(ko|en))?\.mdx$/, ""))
    .filter((slug, index, slugs) => slugs.indexOf(slug) === index);
}

export function getAllJournalPosts(
  options: { includeDrafts?: boolean; lang?: JournalLang } = {},
) {
  const lang = options.lang ?? "ko";

  return getJournalSlugs()
    .map((slug) => readPost(slug, lang))
    .filter((post) => options.includeDrafts || !post.draft)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export function getJournalPost(slug: string, lang: JournalLang = "ko") {
  return readPost(slug, lang);
}

export function getAdjacentJournalPosts(slug: string, lang: JournalLang = "ko") {
  const posts = getAllJournalPosts({ lang });
  const index = posts.findIndex((post) => post.slug === slug);

  return {
    previous: index >= 0 ? posts[index + 1] ?? null : null,
    next: index >= 0 ? posts[index - 1] ?? null : null,
  };
}

export function formatJournalDate(date: string, lang: JournalLang = "ko") {
  return new Intl.DateTimeFormat(lang === "ko" ? "ko-KR" : "en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}
