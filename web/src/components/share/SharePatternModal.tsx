"use client";

import { useState } from "react";
import { captureEvent } from "@/lib/posthogEvents";
import {
  DEFAULT_LICENSE_ID,
  DISCORD_PATTERNS_CHANNEL,
  DISCORD_PATTERNS_URL,
  LICENSE_OPTIONS,
  buildShareCaption,
  buildSharedHeaderFile,
  buildSharedPatternFile,
  cppNamingInstruction,
  licenseById,
  loadShareAuthor,
  saveShareAuthor,
  slugifyName,
  todayIso,
  type ShareMeta,
} from "@/lib/sharePattern";
import styles from "./SharePatternModal.module.css";

type Props = {
  onClose: () => void;
  // Current pattern source (clean editor code — no licence wrapping).
  code: string;
  // The page's existing JS→C++ conversion prompt for the current code.
  cppConvertPrompt: string;
};

function downloadFile(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function SharePatternModal({ onClose, code, cppConvertPrompt }: Props) {
  const [title, setTitle] = useState("");
  // Remembered author name. The modal only mounts client-side (behind a click),
  // so reading localStorage in the initializer can't cause a hydration mismatch.
  const [author, setAuthor] = useState(() => loadShareAuthor());
  const [licenseId, setLicenseId] = useState(DEFAULT_LICENSE_ID);
  const [hasVideo, setHasVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [cppInput, setCppInput] = useState("");

  const [jsDone, setJsDone] = useState(false);
  const [captionDone, setCaptionDone] = useState(false);
  const [cppCopied, setCppCopied] = useState(false);
  const [hDone, setHDone] = useState(false);

  const meta: ShareMeta = {
    title: title.trim(),
    author: author.trim(),
    license: licenseById(licenseId),
    date: todayIso(),
  };

  const flash = (setter: (value: boolean) => void) => {
    setter(true);
    window.setTimeout(() => setter(false), 1500);
  };

  const downloadJs = () => {
    downloadFile(
      `patternflow_${slugifyName(meta.title)}.js`,
      buildSharedPatternFile(code, meta),
      "text/javascript;charset=utf-8",
    );
    saveShareAuthor(meta.author);
    captureEvent("pattern_share_download_js", { hasAuthor: Boolean(meta.author), license: meta.license.spdx });
    flash(setJsDone);
  };

  const copyCaption = async () => {
    try {
      await navigator.clipboard.writeText(
        buildShareCaption({
          title: meta.title,
          author: meta.author,
          videoUrl: hasVideo ? videoUrl.trim() : "",
        }),
      );
      flash(setCaptionDone);
    } catch {
      // clipboard may be blocked
    }
  };

  const copyCppPrompt = async () => {
    try {
      await navigator.clipboard.writeText(`${cppConvertPrompt}\n${cppNamingInstruction(meta)}`);
      flash(setCppCopied);
    } catch {
      // ignore
    }
  };

  const downloadH = () => {
    if (!cppInput.trim()) return;
    downloadFile(
      `patternflow_${slugifyName(meta.title)}.h`,
      buildSharedHeaderFile(cppInput, meta),
      "text/plain;charset=utf-8",
    );
    saveShareAuthor(meta.author);
    captureEvent("pattern_share_download_h", { hasAuthor: Boolean(meta.author), license: meta.license.spdx });
    flash(setHDone);
  };

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Share pattern to Discord"
      onClick={onClose}
    >
      <div className={styles.card} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <span>Share to Discord</span>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={styles.body}>
          <p>
            Title and credit your pattern, then share it in the Discord{" "}
            <strong>{DISCORD_PATTERNS_CHANNEL}</strong> channel. The licence header and credit are
            added to every exported file automatically.
          </p>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="share-title">
              Pattern title
            </label>
            <input
              id="share-title"
              className={styles.field}
              type="text"
              placeholder="e.g. Ripple Bloom"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="share-author">
              Your name (credit)
            </label>
            <input
              id="share-author"
              className={styles.field}
              type="text"
              placeholder="kept as the attribution"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
            />
          </div>

          <div className={styles.row}>
            <label className={styles.label} htmlFor="share-license">
              Licence
            </label>
            <select
              id="share-license"
              className={styles.field}
              value={licenseId}
              onChange={(event) => setLicenseId(event.target.value)}
            >
              {LICENSE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={hasVideo}
              onChange={(event) => setHasVideo(event.target.checked)}
            />
            I have a video of it
          </label>
          {hasVideo && (
            <input
              className={styles.field}
              type="url"
              placeholder="https://…  (YouTube, etc.)"
              value={videoUrl}
              onChange={(event) => setVideoUrl(event.target.value)}
            />
          )}

          <p className={styles.note}>
            Today&apos;s date is added automatically. Nothing is posted for you — you paste it
            into Discord yourself.
          </p>

          <div className={styles.section}>
            <h4>1 · Share in {DISCORD_PATTERNS_CHANNEL}</h4>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={downloadJs}>
                {jsDone ? "Downloaded ✓" : "Download .js"}
              </button>
              <button type="button" className={styles.secondary} onClick={copyCaption}>
                {captionDone ? "Copied ✓" : "Copy Discord caption"}
              </button>
            </div>
            <p className={styles.note} style={{ marginTop: 8 }}>
              Drag the <code>.js</code> into the channel and paste the caption.
            </p>
            <div className={styles.actions}>
              <a
                className={styles.secondary}
                href={DISCORD_PATTERNS_URL}
                target="_blank"
                rel="noreferrer"
              >
                Open Discord ↗
              </a>
            </div>
          </div>

          <div className={styles.section}>
            <h4>2 · Hardware version (.h) — optional</h4>
            <p className={styles.note} style={{ marginTop: 0 }}>
              The board runs C++. Copy the conversion prompt, paste it into any AI assistant, then
              paste the C++ it returns below to download a ready <code>.h</code> file — same title
              and licence header baked in.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} onClick={copyCppPrompt}>
                {cppCopied ? "Copied ✓" : "Copy C++ conversion prompt"}
              </button>
            </div>
            <textarea
              className={styles.field}
              style={{ marginTop: 10, minHeight: 84, padding: "8px 10px", resize: "vertical" }}
              placeholder="Paste the C++ the AI returns here…"
              value={cppInput}
              onChange={(event) => setCppInput(event.target.value)}
            />
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.primary}
                onClick={downloadH}
                disabled={!cppInput.trim()}
                style={cppInput.trim() ? undefined : { opacity: 0.45, cursor: "not-allowed" }}
              >
                {hDone ? "Downloaded ✓" : "Download .h"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
