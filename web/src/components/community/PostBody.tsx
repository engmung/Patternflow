"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { safeHref } from "@/lib/community/markdown";
import styles from "./Community.module.css";

// What a thread post and a comment are written in.
//
// Markdown, but a closed set of it. The board is build logs and test results,
// so lists, headings, inline `code` and the odd table of measurements all earn
// their place — and everything past that is surface area nobody asked for.
//
// THE THREE RULES, none of which are defaults to be relied on quietly:
//
// 1. No raw HTML. react-markdown ignores it unless `rehype-raw` is added, so
//    the guard is simply never adding that plugin. There is no
//    dangerouslySetInnerHTML anywhere in this path — the markdown becomes a
//    React element tree, and React's escaping does the work it always did.
//
// 2. No images. `![](https://somewhere/x.png)` would make every reader's
//    browser fetch a remote file, which is a tracking pixel with the reader's
//    IP attached and a way to hotlink somebody else's bandwidth. Pictures have
//    a path already — attachments, sniffed by magic bytes and served
//    same-origin under a sandbox CSP — and that stays the only one.
//
// 3. http(s) links only, and never same-tab. safeHref drops anything else, so
//    a `javascript:` or `data:` href renders as inert text.

/** Elements react-markdown may produce. Anything not here is dropped, so a new
 *  remark plugin cannot quietly widen what a post can render. */
const ALLOWED = new Set([
  "p", "br", "strong", "em", "del", "code", "pre",
  "a", "blockquote", "hr",
  "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
  // Allowed through only so the component below can turn it into a link. See
  // rule 2: dropping it outright made somebody's ![diagram](url) disappear
  // with nothing to show they had written anything.
  "img",
]);

export default function PostBody({ text }: { text: string }) {
  return (
    <div className={styles.postBody}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Bare URLs autolink through GFM, so the board keeps the one nicety it
        // had before markdown — people paste links far more often than they
        // write [text](url).
        allowedElements={[...ALLOWED]}
        unwrapDisallowed
        components={{
          a: ({ href, children }) => {
            const safe = safeHref(href);
            // Not a link we will follow: render what they typed, as text.
            if (!safe) return <>{children}</>;
            return (
              <a
                href={safe}
                target="_blank"
                // nofollow because anybody with an account can post one.
                rel="noopener noreferrer nofollow"
                className={styles.inlineLink}
              >
                {children}
              </a>
            );
          },
          // An image becomes a link to the image. Nothing is fetched until a
          // reader decides to fetch it, which is the whole point — but the
          // author still sees that what they wrote survived.
          img: ({ src, alt }) => {
            const safe = safeHref(typeof src === "string" ? src : null);
            const label = alt?.trim() || safe || "image";
            if (!safe) return <>{label}</>;
            return (
              <a
                href={safe}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className={styles.inlineLink}
              >
                {label}
                <span className={styles.imageLinkTag}> (image)</span>
              </a>
            );
          },
          pre: ({ children }) => <pre className={styles.codeFence}>{children}</pre>,
          code: ({ children, className }) =>
            // react-markdown hands fenced code a language class and inline code
            // none; only the inline case needs its own chip styling, since the
            // block case is already inside .codeFence.
            className ? (
              <code className={className}>{children}</code>
            ) : (
              <code className={styles.inlineCode}>{children}</code>
            ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
