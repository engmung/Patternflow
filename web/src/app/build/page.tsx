import type { Metadata } from "next";
import HomeView from "@/components/HomeView";

export const metadata: Metadata = {
  title: "Build Your Own — Patternflow",
  description:
    "Build the open-source Patternflow LED synthesizer from scratch: ESP32-S3 firmware, custom PCB, 3D-printed enclosure, and a browser flasher. All files and the full build guide.",
  alternates: { canonical: "/build" },
  openGraph: {
    title: "Build Your Own — Patternflow",
    description:
      "Build the open-source Patternflow LED synthesizer from scratch — firmware, PCB, enclosure, and browser flasher.",
    url: "https://patternflow.work/build",
  },
};

export default function BuildPage() {
  return <HomeView initialTab="build" />;
}
