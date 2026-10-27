"use client";

import { useDeviceHost } from "@/lib/community/deviceHost";
import {
  buildingNote,
  includedSummary,
  skipReasonLabel,
  ZIP_DEADLINE_MIN,
  type ZipKind,
  type ZipPhase,
  type ZipStatus,
} from "@/lib/community/zipDownload";
import styles from "./Community.module.css";

// The two pieces of "Download .zip" that look the same wherever it appears:
// what the download is doing right now, and how to install the file after.
// The polling itself is useZipDownload (lib/community/zipDownload.ts).

/**
 * Progress, failure and "what got left out", for whichever zip was asked for.
 * Renders nothing while idle, so it can sit permanently under a row of buttons.
 */
export function ZipProgress({
  kind,
  phase,
  status,
  error,
  detail,
  waited = 0,
  expectedS = 0,
}: {
  kind: ZipKind;
  phase: ZipPhase;
  status: ZipStatus | null;
  error: string | null;
  detail: string | null;
  /** Whole seconds since the download was asked for (useZipDownload). */
  waited?: number;
  /** What this compile was told to expect, in seconds; 0 before it knows. */
  expectedS?: number;
}) {
  // Only a SETTLED answer describes a pack: "3 of 10 included" from the last
  // "building" poll is a pack that does not exist yet, and after a deadline
  // or a dropped connection it would read as what the failed download held.
  const settled = status?.state === "ready" || status?.state === "empty";
  const summary = settled ? includedSummary(status) : null;
  const skipped = settled ? (status?.skipped ?? []) : [];
  const busy = phase === "checking" || phase === "building";
  if (!busy && !error && !summary && skipped.length === 0) return null;
  // Past the promise the spinner alone looks like a hang, and on 26 October
  // it kept "usually a few seconds" up for three minutes with the build
  // server stopped. So it says what may be wrong, and how long it will wait.
  const slow = phase === "building" && expectedS > 0 && waited >= expectedS;

  return (
    <div className={styles.zipStatus} aria-live="polite">
      {busy && (
        <p className={styles.buildStatusLine}>
          <span className={styles.buildSpinner} aria-hidden="true" />
          {phase === "building" ? (
            <>
              {buildingNote(kind, status)}
              {slow
                ? " (longer than usual)"
                : expectedS > 0 && ` (usually under ${expectedS} s)`}
              {waited > 0 && ` · ${waited} s`}
            </>
          ) : (
            "Checking…"
          )}
        </p>
      )}
      {slow && (
        <span>
          The build server may be busy, or stopped. This keeps checking for up to{" "}
          {ZIP_DEADLINE_MIN} minutes.
        </span>
      )}
      {error && <div className={styles.formError}>{error}</div>}
      {detail && <pre className={styles.buildLog}>{detail}</pre>}
      {/* Only once the answer is in: a skip list that grows while the pack is
          still compiling would read as things failing one by one. */}
      {!busy && (summary || skipped.length > 0) && (
        <>
          {summary && <span>{summary}</span>}
          {skipped.length > 0 && (
            <ul className={styles.zipSkipList}>
              {skipped.map((skip) => (
                <li key={`${skip.position}-${skip.title}`}>
                  Slot {skip.position + 1} · {skip.title || "Untitled"} — {skipReasonLabel(skip.reason)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// Installing from a file — the way in that does not need the board and this
// page on the same network.
//
// "Install to my board" hands the board an address to fetch from, which only
// works when the browser can reach the board. Someone on a VPN cannot: the
// board is on their home network and the browser is, as far as routing goes,
// somewhere else. For them the .zip is the whole feature, so the steps are
// written out on the page instead of assumed — the first time through it is
// not obvious that the Patterns page takes the archive as it is.
//
// The board address field is the same remembered value every other handoff
// uses (deviceHost.ts), so the link in step 2 is the one they will actually
// type. Changing it here changes it everywhere.

export function ZipInstallNote({ kind }: { kind: ZipKind }) {
  const { deviceHost, host, changeDeviceHost } = useDeviceHost();
  const patternsPage = `http://${host}/patterns`;

  return (
    <div className={styles.zipNote}>
      <span className={styles.zipNoteTitle}>Install from a file</span>
      <ol className={styles.zipSteps}>
        <li>Download the .zip here.</li>
        <li>
          Open your board&rsquo;s Patterns page —{" "}
          <a href={patternsPage} target="_blank" rel="noreferrer">
            {patternsPage}
          </a>{" "}
          (on a VPN? turn it off first: the board is on your home network).
        </li>
        <li>
          Drop the .zip on <strong>Upload</strong>, or tap Upload and choose it — don&rsquo;t unzip
          it.
        </li>
      </ol>
      <span className={styles.zipNoteLine}>
        {kind === "deck"
          ? "A deck's .zip also carries its running order: its patterns go first in the board's list."
          : "A single pattern's .zip leaves the board's order as it is."}
      </span>
      <label className={styles.zipNoteLine}>
        Board address:{" "}
        <input
          type="text"
          className={styles.zipHostField}
          value={deviceHost}
          onChange={(event) => changeDeviceHost(event.target.value)}
          spellCheck={false}
          aria-label="Board address"
        />{" "}
        — Android can&rsquo;t resolve <code>.local</code>; use the IP from the board&rsquo;s NETWORK
        screen (hold K2).
      </label>
    </div>
  );
}
