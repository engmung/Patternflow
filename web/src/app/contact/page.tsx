import type { Metadata } from "next";
import ContactPage from "@/components/contact/ContactPage";

export const metadata: Metadata = {
  title: "Contact / Patternflow",
  description:
    "Partnership, installation, distribution, and custom AV inquiries for Patternflow.",
};

export default function ContactRoute() {
  return <ContactPage />;
}
