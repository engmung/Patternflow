"use client";

import { useState } from "react";
import { useAutoGrow } from "@/lib/hooks/useAutoGrow";
import PostBody from "./PostBody";
import styles from "./Community.module.css";

// The body field, wherever a post is written — new thread, or editing one.
//
// Markdown you cannot see is markdown you find out about after posting, so
// Write/Preview is part of the field rather than a nicety bolted on later.
// Preview renders through the SAME component the thread does, so what it shows
// is what will be there; a preview built from a second renderer is a preview
// that eventually lies.

export default function BodyComposer({
  value,
  onChange,
  maxLength,
  placeholder,
  label,
  /** How tall it may grow — see the [data-grow] caps in the stylesheet. */
  grow = "page",
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength: number;
  placeholder?: string;
  label: string;
  grow?: "page" | "modal" | "comment";
  autoFocus?: boolean;
}) {
  const [previewing, setPreviewing] = useState(false);
  const ref = useAutoGrow<HTMLTextAreaElement>(previewing ? "" : value);

  return (
    <div className={styles.bodyComposer}>
      <div className={styles.composerTabs} role="tablist" aria-label={`${label} — write or preview`}>
        <button
          type="button"
          role="tab"
          aria-selected={!previewing}
          data-active={!previewing}
          onClick={() => setPreviewing(false)}
        >
          Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={previewing}
          data-active={previewing}
          // Nothing to preview is worth saying out loud rather than showing an
          // empty box that looks like a broken renderer.
          disabled={value.trim().length === 0}
          onClick={() => setPreviewing(true)}
        >
          Preview
        </button>
        <span className={styles.headerSpacer} />
        <span className={styles.composerHint}>
          Markdown: **bold**, `code`, - lists, ``` fences, | tables |
        </span>
      </div>

      {previewing ? (
        <div className={styles.previewPane} data-grow={grow}>
          <PostBody text={value} />
        </div>
      ) : (
        <textarea
          ref={ref}
          className={styles.postBodyInput}
          data-grow={grow}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          aria-label={label}
          autoFocus={autoFocus}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}
