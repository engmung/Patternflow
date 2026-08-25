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
  /** Parent's SPDX id, so the publish picker only offers compatible licences. */
  parentLicense: string | null;
  /**
   * Set INSTEAD of the parent fields when the visitor owns the pattern: the
   * lab reopens it to be revised, and Share updates that post rather than
   * publishing a fork of it. Its own author is the one person for whom "open
   * this in the lab" means "keep working on it", not "start something new".
   *
   * Absent on handoffs written before in-place editing existed.
   */
  edit?: {
    id: string;
    title: string;
    description: string | null;
    visibility: string;
    /** Ships a .h that a code change will detach — the modal says so. */
    hasCpp: boolean;
    /** Community ports a code change would send stale, for the same warning. */
    portCount: number;
  } | null;
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
    const edit = parsed.edit;
    return {
      code: parsed.code,
      parentId: typeof parsed.parentId === "string" ? parsed.parentId : null,
      parentTitle: typeof parsed.parentTitle === "string" ? parsed.parentTitle : null,
      parentLicense: typeof parsed.parentLicense === "string" ? parsed.parentLicense : null,
      edit:
        edit && typeof edit.id === "string" && typeof edit.title === "string"
          ? {
              id: edit.id,
              title: edit.title,
              description: typeof edit.description === "string" ? edit.description : null,
              visibility: typeof edit.visibility === "string" ? edit.visibility : "public",
              hasCpp: edit.hasCpp === true,
              portCount: Number.isFinite(edit.portCount) ? Number(edit.portCount) : 0,
            }
          : null,
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
