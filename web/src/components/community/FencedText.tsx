import LinkedText from "./LinkedText";
import styles from "./Community.module.css";

// Plain text plus exactly ONE piece of markup: ``` fences render as code
// blocks. This board's long posts are build logs, compiler output and JS
// fragments — prose markup would be ceremony, but a log squashed into a
// paragraph is unreadable. Everything stays escaped-by-React, same as ever;
// a fence changes the font, never the trust model.

type Segment = { fence: boolean; text: string };

/**
 * Split on lines that are exactly a fence marker (``` plus an optional
 * language tag, which is dropped). An unclosed fence runs to the end — people
 * forget the closing marker, and rendering their log as the code they meant
 * beats punishing the omission.
 */
export function splitFences(text: string): Segment[] {
  const lines = text.split("\n");
  const segments: Segment[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    if (current.length === 0) return;
    const joined = current.join("\n");
    // Whitespace-only prose between fences is layout residue, not content.
    if (inFence || joined.trim().length > 0) segments.push({ fence: inFence, text: joined });
    current = [];
  };

  for (const line of lines) {
    if (/^```[\w+-]*\s*$/.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    current.push(line);
  }
  flush();

  return segments;
}

export default function FencedText({ text }: { text: string }) {
  const segments = splitFences(text);
  return (
    <>
      {segments.map((segment, index) =>
        segment.fence ? (
          <pre key={index} className={styles.codeFence}>
            {segment.text}
          </pre>
        ) : (
          <LinkedText key={index} text={segment.text} />
        ),
      )}
    </>
  );
}
