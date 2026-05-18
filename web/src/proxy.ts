import { NextRequest, NextResponse } from "next/server";

const LANGUAGE_COOKIE = "pf-journal-lang";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const JOURNAL_ASSET_EXTENSION_PATTERN = /\.[a-z0-9]+$/i;

function preferredJournalLang(request: NextRequest) {
  const cookieLang = request.cookies.get(LANGUAGE_COOKIE)?.value;
  if (cookieLang === "ko" || cookieLang === "en") return cookieLang;

  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const languages = acceptLanguage
    .split(",")
    .map((item) => {
      const [tag, qPart] = item.trim().split(";q=");
      return {
        tag: tag.toLowerCase(),
        quality: qPart ? Number(qPart) : 1,
      };
    })
    .filter(({ tag }) => tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  const primaryLanguage = languages[0]?.tag;

  if (primaryLanguage === "en" || primaryLanguage?.startsWith("en-")) {
    return "en";
  }

  return "ko";
}

function cleanLangQuery(request: NextRequest, responsePathname: string, lang: "ko" | "en") {
  const url = request.nextUrl.clone();
  url.pathname = responsePathname;
  url.searchParams.delete("lang");

  const response = NextResponse.redirect(url);
  response.cookies.set(LANGUAGE_COOKIE, lang, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
  });
  return response;
}

function normalizeJournalPath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function collapseDuplicateEnglishSuffix(pathname: string) {
  const normalizedPathname = normalizeJournalPath(pathname);

  if (normalizedPathname.startsWith("/journal/") && normalizedPathname.endsWith("/en/en")) {
    return normalizedPathname.slice(0, -3);
  }

  return normalizedPathname;
}

function koPathFromEnglish(pathname: string) {
  const normalizedPathname = collapseDuplicateEnglishSuffix(pathname);

  if (normalizedPathname === "/journal/en") return "/journal";
  if (normalizedPathname.startsWith("/journal/") && normalizedPathname.endsWith("/en")) {
    return normalizedPathname.slice(0, -3);
  }
  return normalizedPathname;
}

function enPathFromKorean(pathname: string) {
  const normalizedPathname = collapseDuplicateEnglishSuffix(pathname);

  if (normalizedPathname === "/journal") return "/journal/en";
  if (normalizedPathname === "/journal/en" || normalizedPathname.endsWith("/en")) {
    return normalizedPathname;
  }
  if (normalizedPathname.startsWith("/journal/")) {
    return `${normalizedPathname}/en`;
  }
  return normalizedPathname;
}

export function proxy(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const pathname = normalizeJournalPath(request.nextUrl.pathname);
  const explicitLang = searchParams.get("lang");

  if (JOURNAL_ASSET_EXTENSION_PATTERN.test(pathname)) {
    return NextResponse.next();
  }

  if (explicitLang === "ko") {
    return cleanLangQuery(request, koPathFromEnglish(pathname), "ko");
  }

  if (explicitLang === "en") {
    return cleanLangQuery(request, enPathFromKorean(pathname), "en");
  }

  const collapsedPathname = collapseDuplicateEnglishSuffix(pathname);
  if (collapsedPathname !== pathname) {
    const url = request.nextUrl.clone();
    url.pathname = collapsedPathname;
    return NextResponse.redirect(url);
  }

  const isJournalIndex = pathname === "/journal";
  const isKoreanJournalPost = pathname.startsWith("/journal/") && !pathname.endsWith("/en");
  if (!isJournalIndex && !isKoreanJournalPost) {
    return NextResponse.next();
  }

  if (preferredJournalLang(request) !== "en") {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = enPathFromKorean(pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/journal", "/journal/:path*"],
};
