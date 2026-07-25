import styles from "./Community.module.css";

// Renders user-submitted plain text with bare URLs turned into working links.
//
// The text stays plain text. We never build an HTML string and never use
// dangerouslySetInnerHTML — the string is split into segments and React
// renders each one, so escaping still does the work it always did and there is
// nothing to inject. Only http(s) is ever linked: a `javascript:` or `data:`
// URL simply doesn't match, so it renders as the literal text someone typed.
//
// Newlines are preserved by CSS (`white-space: pre-wrap` on .linkedText), so a
// post keeps the shape its author gave it.

// Stops at whitespace and at the bracket/quote characters that normally
// surround a URL rather than belong to it.
const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

/**
 * Sentence punctuation that follows a URL is almost never part of it. Closing
 * brackets are only trimmed when unmatched, so a link ending in one — plenty
 * of wiki and docs URLs do — survives.
 */
function splitTrailingPunctuation(url: string): [string, string] {
  let end = url.length;
  while (end > 0) {
    const char = url[end - 1];
    if (".,;:!?".includes(char)) {
      end -= 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      const open = char === ")" ? "(" : char === "]" ? "[" : "{";
      const slice = url.slice(0, end);
      const opens = slice.split(open).length - 1;
      const closes = slice.split(char).length - 1;
      if (closes > opens) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return [url.slice(0, end), url.slice(end)];
}

export default function LinkedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const [href, trailing] = splitTrailingPunctuation(match[0]);
    if (!href) continue;

    if (start > cursor) nodes.push(text.slice(cursor, start));
    nodes.push(
      <a
        key={`link-${key++}`}
        href={href}
        target="_blank"
        // noopener/noreferrer for the usual reasons; nofollow because these are
        // links anyone with an account can post.
        rel="noopener noreferrer nofollow"
        className={styles.inlineLink}
      >
        {href}
      </a>,
    );
    if (trailing) nodes.push(trailing);
    cursor = start + match[0].length;
  }

  if (cursor < text.length) nodes.push(text.slice(cursor));

  return (
    <span className={className ? `${styles.linkedText} ${className}` : styles.linkedText}>
      {nodes}
    </span>
  );
}
