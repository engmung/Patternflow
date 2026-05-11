import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleLayout from "@/components/journal/ArticleLayout";
import MdxContent from "@/components/journal/MdxContent";
import {
  getAdjacentJournalPosts,
  getAllJournalPosts,
  getJournalPost,
  getJournalSlugs,
} from "@/lib/journal";

type EnglishJournalPostPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getJournalSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: EnglishJournalPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getAllJournalPosts({ includeDrafts: true, lang: "en" }).find(
    (item) => item.slug === slug,
  );

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} / Patternflow Journal`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: "article",
      publishedTime: post.date,
      url: `/journal/${post.slug}/en`,
      images: [{ url: `/journal/${post.slug}/opengraph-image` }],
    },
  };
}

export default async function EnglishJournalPostPage({
  params,
}: EnglishJournalPostPageProps) {
  const { slug } = await params;
  const lang = "en";
  const post = getJournalPost(slug, lang);

  if (!post || post.draft) {
    notFound();
  }

  const { previous, next } = getAdjacentJournalPosts(slug, lang);

  return (
    <ArticleLayout post={post} lang={lang} previous={previous} next={next}>
      <MdxContent source={post.content} />
    </ArticleLayout>
  );
}
