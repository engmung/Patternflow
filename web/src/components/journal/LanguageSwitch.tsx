import type { JournalLang } from "@/lib/journal";

type LanguageSwitchProps = {
  lang: JournalLang;
  slug?: string;
};

export default function LanguageSwitch({ lang, slug }: LanguageSwitchProps) {
  const koPath = slug ? `/journal/${slug}` : "/journal";
  const enPath = slug ? `/journal/${slug}/en` : "/journal/en";
  const koHref = lang === "ko" ? koPath : `${koPath}?lang=ko`;
  const enHref = lang === "en" ? enPath : `${enPath}?lang=en`;

  return (
    <nav className="journal-lang-switch" aria-label="Journal language">
      <a
        className={lang === "ko" ? "active" : ""}
        href={koHref}
        aria-current={lang === "ko" ? "page" : undefined}
      >
        ko
      </a>
      <a
        className={lang === "en" ? "active" : ""}
        href={enHref}
        aria-current={lang === "en" ? "page" : undefined}
      >
        en
      </a>
    </nav>
  );
}
