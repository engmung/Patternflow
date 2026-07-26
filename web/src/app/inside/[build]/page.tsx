import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HomeView from "@/components/HomeView";
import { builds, buildBySlug } from "@/components/sections/InsideGlobe/builds";

const SITE_URL = "https://patternflow.work";

type RouteParams = { params: Promise<{ build: string }> };

// One static page per pin, so every build on the map has its own link.
export function generateStaticParams() {
  return builds.map((build) => ({ build: build.slug }));
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { build: slug } = await params;
  const build = buildBySlug(slug);
  if (!build) return {};

  // A collaboration is not a build of Patternflow, and calling it one in the
  // page title is the sort of thing that gets quoted back at you.
  const title =
    build.kind === 'collaboration'
      ? `${build.maker} × Patternflow — a collaboration in ${build.location.label}`
      : `${build.maker}'s Patternflow build — ${build.location.label}`;
  const url = `${SITE_URL}/inside/${build.slug}`;
  const photo = build.images?.[0];

  return {
    title,
    description: build.description,
    alternates: { canonical: `/inside/${build.slug}` },
    openGraph: {
      title,
      description: build.description,
      url,
      images: photo ? [{ url: `${SITE_URL}${photo.src}`, alt: photo.alt }] : undefined,
    },
  };
}

export default async function InsideBuildPage({ params }: RouteParams) {
  const { build: slug } = await params;
  const build = buildBySlug(slug);
  if (!build) notFound();

  return <HomeView initialTab="inside" initialBuildId={build.id} />;
}
