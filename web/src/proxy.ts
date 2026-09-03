import { NextRequest, NextResponse } from "next/server";

const LANGUAGE_COOKIE = "pf-journal-lang";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const JOURNAL_ASSET_EXTENSION_PATTERN = /\.[a-z0-9]+$/i;

function preferredJournalLang(request: NextRequest) {
  // Cookie only (set when the user picks a language via ?lang=). No
  // Accept-Language guessing: crawlers request with English headers, and
  // auto-redirecting them made every Korean journal URL unindexable.
  // Search engines route languages via hreflang instead.
  const cookieLang = request.cookies.get(LANGUAGE_COOKIE)?.value;
  if (cookieLang === "ko" || cookieLang === "en") return cookieLang;
  return null;
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

// The community API exists only where COMMUNITY_ENABLED=1 (the Pi). Every
// route under /api/community checks that itself, thirty times over — and a
// new route that forgets is open by default. This is the one place that
// closes the door for all of them, whatever any single handler does. Same
// test as lib/community/db.ts's communityEnabled(); duplicated rather than
// imported because the proxy must not pull better-sqlite3 into its bundle.
function communityApiClosed(pathname: string): boolean {
  return pathname.startsWith("/api/community") && process.env.COMMUNITY_ENABLED !== "1";
}

export function proxy(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const pathname = normalizeJournalPath(request.nextUrl.pathname);
  const explicitLang = searchParams.get("lang");

  if (communityApiClosed(pathname)) {
    return NextResponse.json(
      { error: "The community runs on its own host; this deployment does not serve it." },
      { status: 404 },
    );
  }

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
  matcher: ["/journal", "/journal/:path*", "/api/community/:path*"],
};
