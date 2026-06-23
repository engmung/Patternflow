import type { Metadata } from "next";
import HomeView from "@/components/HomeView";

export const metadata: Metadata = {
  title: "Live Editor & Patterns — Patternflow",
  description:
    "Browse a preset library of LED matrix patterns and remix them in the browser Live Editor. Generate your own with AI, preview on virtual knobs, and flash to the device.",
  alternates: { canonical: "/pattern" },
  openGraph: {
    title: "Live Editor & Patterns — Patternflow",
    description:
      "Browse and remix LED matrix patterns in the browser, generate your own with AI, and flash them to the device.",
    url: "https://patternflow.work/pattern",
  },
};

export default function PatternPage() {
  return <HomeView initialTab="pattern" />;
}
