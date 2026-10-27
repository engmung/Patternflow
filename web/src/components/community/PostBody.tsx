"use client";

import { useId } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { opensHere, safeHref } from "@/lib/community/markdown";
import styles from "./Community.module.css";

// What a comment is written in. The workshop's threads were too, until it came
// down on 26 October 2026.
//
// Markdown, but a closed set of it. Comments are build notes and test results,
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
//    IP attached and a way to hotlink somebody else's bandwidth. The one path
//    a picture had was a workshop attachment, sniffed by magic bytes and
//    served same-origin, and it went with the workshop.
//
// 3. http(s) links only. safeHref drops anything else, so a `javascript:` or
//    `data:` href renders as inert text. A link off the site opens a new tab.
//    A footnote, an anchor or a path on this site stays in this one.

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
  // A footnote's ids come from its label, so two comments on one page that
  // both write [^1] would both hold id="user-content-fn-1", and the second
  // one's link would land on the first one's note. Each body gets its own
  // prefix. useId gives the server and the browser the same one.
  const prefix = `user-content-${useId()}-`;
  return (
    <div className={styles.postBody}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Bare URLs autolink through GFM, so the board keeps the one nicety it
        // had before markdown — people paste links far more often than they
        // write [text](url).
        allowedElements={[...ALLOWED]}
        unwrapDisallowed
        remarkRehypeOptions={{ clobberPrefix: prefix }}
        components={{
          a: ({
            href,
            children,
            id,
            "aria-label": label,
            "aria-describedby": describedBy,
          }) => {
            const safe = safeHref(href);
            // Not a link we will follow: render what they typed, as text.
            if (!safe) return <>{children}</>;
            if (opensHere(safe)) {
              // A footnote and its way back carry an id and a label. The
              // "Footnotes" heading that describes them takes the prefix below.
              return (
                <a
                  href={safe}
                  id={id}
                  aria-label={label}
                  aria-describedby={describedBy && prefix + describedBy}
                  className={styles.inlineLink}
                >
                  {children}
                </a>
              );
            }
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
          // The one heading with an id is the footnotes' own, which
          // clobberPrefix leaves as plain "footnote-label".
          h2: ({ id, className, children }) => (
            <h2 id={id && prefix + id} className={className}>
              {children}
            </h2>
          ),
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
