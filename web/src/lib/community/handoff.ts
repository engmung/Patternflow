"use client";

// sessionStorage handoff between the community detail page and Pattern Lab.
// "Open in Pattern Lab" writes it, the lab consumes (and clears) it on mount.
// Code can be up to 100KB, so a URL query param is not an option.

const KEY = "patternflow.community.labHandoff";

export type LabHandoff = {
  code: string;
  /** Community pattern this code came from — becomes parent_id if re-shared. */
  parentId: string | null;
  parentTitle: string | null;
};

export function writeLabHandoff(handoff: LabHandoff): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(handoff));
  } catch {
    // Private mode / storage disabled — the lab just opens without the code.
  }
}

export function readLabHandoff(): LabHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LabHandoff>;
    if (typeof parsed.code !== "string" || parsed.code.length === 0) return null;
    return {
      code: parsed.code,
      parentId: typeof parsed.parentId === "string" ? parsed.parentId : null,
      parentTitle: typeof parsed.parentTitle === "string" ? parsed.parentTitle : null,
    };
  } catch {
    return null;
  }
}

export function clearLabHandoff(): void {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
