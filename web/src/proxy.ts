import { NextRequest, NextResponse } from "next/server";

const LANGUAGE_COOKIE = "pf-journal-lang";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

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

  return languages.some(({ tag }) => tag === "ko" || tag.startsWith("ko-")) ? "ko" : "en";
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

function koPathFromEnglish(pathname: string) {
  if (pathname === "/journal/en") return "/journal";
  if (pathname.startsWith("/journal/") && pathname.endsWith("/en")) {
    return pathname.slice(0, -3);
  }
  return pathname;
}

function enPathFromKorean(pathname: string) {
  if (pathname === "/journal") return "/journal/en";
  if (pathname.startsWith("/journal/") && !pathname.endsWith("/en")) {
    return `${pathname}/en`;
  }
  return pathname;
}

export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  const explicitLang = searchParams.get("lang");

  if (explicitLang === "ko") {
    return cleanLangQuery(request, koPathFromEnglish(pathname), "ko");
  }

  if (explicitLang === "en") {
    return cleanLangQuery(request, enPathFromKorean(pathname), "en");
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
