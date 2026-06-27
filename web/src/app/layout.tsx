import type { Metadata } from "next";
import { Inter, JetBrains_Mono, DM_Sans, Silkscreen, Newsreader } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/context/ThemeContext";
import { PostHogProvider } from "@/providers/PostHogProvider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const silkscreen = Silkscreen({
  weight: ['400', '700'],
  variable: "--font-silkscreen",
  subsets: ["latin"],
});

const newsreader = Newsreader({
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://patternflow.work"),
  title: "Patternflow — An LED synthesizer",
  description:
    "Play light patterns with your fingertips. An open-source LED synthesizer — a modern reinterpretation of Nam June Paik's Participation TV (1963).",
  keywords: [
    "LED synthesizer",
    "open-source hardware",
    "generative art",
    "creative coding",
    "ESP32",
    "LED matrix",
    "Patternflow",
    "Seung Hun Lee",
    "interactive art",
    "media art",
  ],
  authors: [{ name: "Seung Hun Lee" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    type: "website",
    url: "https://patternflow.work",
    title: "Patternflow — An LED synthesizer",
    description:
      "Play light patterns with your fingertips. An open-source LED synthesizer built with ESP32-S3 and a 128×64 LED matrix.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Patternflow — An LED synthesizer",
    description:
      "Play light patterns with your fingertips. An open-source LED synthesizer.",
    images: ["/og-image.png"],
  },
  alternates: {
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  other: {
    "theme-color": "#000000",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
  },
};

const siteUrl = "https://patternflow.work";

// Structured data (schema.org / JSON-LD) so search engines and AI crawlers can
// resolve Patternflow as an entity: who makes it, what category it belongs to,
// and how the project, person, and work relate.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${siteUrl}/#organization`,
      name: "Patternflow",
      url: siteUrl,
      logo: `${siteUrl}/apple-touch-icon.png`,
      description:
        "Open-source LED synthesizer played with the fingertips — a modern reinterpretation of Nam June Paik's Participation TV (1963).",
      founder: { "@id": `${siteUrl}/#person` },
      sameAs: [
        "https://github.com/engmung/Patternflow",
        "https://www.instagram.com/patternflow.work",
        "https://discord.gg/Vr9QtsxeTk",
      ],
    },
    {
      "@type": "Person",
      "@id": `${siteUrl}/#person`,
      name: "Seung Hun Lee",
      url: siteUrl,
      jobTitle: "Artist",
      worksFor: { "@id": `${siteUrl}/#organization` },
      sameAs: ["https://www.instagram.com/patternflow.work"],
    },
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Patternflow",
      description:
        "Play light patterns with your fingertips. An open-source LED synthesizer built with ESP32-S3 and a HUB75 LED matrix.",
      publisher: { "@id": `${siteUrl}/#organization` },
      inLanguage: "en",
    },
    {
      // CreativeWork (not Product): Patternflow is an open-source media-art
      // instrument, not a priced retail item, so this validates cleanly without
      // requiring offers/review/aggregateRating while keeping entity signals.
      "@type": "CreativeWork",
      "@id": `${siteUrl}/#work`,
      name: "Patternflow — LED Synthesizer",
      url: siteUrl,
      image: `${siteUrl}/og-image.png`,
      description:
        "An open-source LED synthesizer played with four rotary encoders. Reshape generative patterns on an ESP32-S3 driven HUB75 RGB LED matrix in real time.",
      creator: { "@id": `${siteUrl}/#person` },
      publisher: { "@id": `${siteUrl}/#organization` },
      genre: "Interactive media art",
      keywords:
        "LED synthesizer, generative art, creative coding, ESP32, ESP32-S3, HUB75 LED matrix, open-source hardware, interactive media art, reactive light, Nam June Paik",
      license: "https://creativecommons.org/licenses/by-sa/4.0/",
      isAccessibleForFree: true,
      inLanguage: "en",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} ${dmSans.variable} ${silkscreen.variable} ${newsreader.variable} antialiased`}
      >
        <PostHogProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </PostHogProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
