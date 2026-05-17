import Link from "next/link";
import type { JournalLang } from "@/lib/journal";

type LanguageSwitchProps = {
  lang: JournalLang;
  slug?: string;
};

export default function LanguageSwitch({ lang, slug }: LanguageSwitchProps) {
  const koHref = slug ? `/journal/${slug}?lang=ko` : "/journal?lang=ko";
  const enHref = slug ? `/journal/${slug}/en?lang=en` : "/journal/en?lang=en";

  return (
    <nav className="journal-lang-switch" aria-label="Journal language">
      <Link
        className={lang === "ko" ? "active" : ""}
        href={koHref}
      >
        ko
      </Link>
      <Link
        className={lang === "en" ? "active" : ""}
        href={enHref}
      >
        en
      </Link>
    </nav>
  );
}
