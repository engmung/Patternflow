import type { Metadata } from "next";
import PatternLabClient from "./PatternLabClient";

export const metadata: Metadata = {
  title: "Pattern Lab / Patternflow",
  description: "Local pattern preview and curation workspace for Patternflow.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function PatternLabPage() {
  return <PatternLabClient />;
}
