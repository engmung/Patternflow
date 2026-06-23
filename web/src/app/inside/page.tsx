import type { Metadata } from "next";
import HomeView from "@/components/HomeView";

export const metadata: Metadata = {
  title: "Inside Patternflow — How It's Built",
  description:
    "How Patternflow works: an ESP32-S3 driving a HUB75 RGB LED matrix, four rotary encoders, and a modular C++ pattern architecture — a modern take on Nam June Paik's Participation TV.",
  alternates: { canonical: "/inside" },
  openGraph: {
    title: "Inside Patternflow — How It's Built",
    description:
      "ESP32-S3, a HUB75 RGB LED matrix, four rotary encoders, and a modular C++ pattern architecture.",
    url: "https://patternflow.work/inside",
  },
};

export default function InsidePage() {
  return <HomeView initialTab="inside" />;
}
