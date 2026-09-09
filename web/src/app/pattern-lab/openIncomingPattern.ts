import { clearLabHandoff, readLabHandoff } from "./community";
import { importCodeIntoLab, stripStackAnnotation } from "@/lib/lab/stackShare";
import { useLabStore } from "@/lib/lab/store";

let opening: { key: string; task: Promise<string | null> } | null = null;

/** Share one in-flight open across remounts; queue a newer community request. */
export function openIncomingPattern(): Promise<string | null> {
  const handoff = readLabHandoff();
  if (!handoff) return Promise.resolve(null);
  const key = JSON.stringify(handoff);
  if (opening) {
    if (opening.key === key) return opening.task;
    return opening.task.then(() => openIncomingPattern());
  }
  const task = consume(handoff);
  opening = { key, task };
  const release = () => { if (opening?.task === task) opening = null; };
  void task.then(release, release);
  return task;
}

/** Consume a community handoff only after protecting the current work. */
async function consume(handoff: NonNullable<ReturnType<typeof readLabHandoff>>): Promise<string | null> {
  const current = useLabStore.getState();
  // A first visit has only the untouched built-in example, even when browser
  // storage is disabled. It must not prevent opening a community pattern.
  const untouchedExample = current.restoredAt === null && current.saveStatus === "idle";
  if (current.layers.length > 0 && !untouchedExample) {
    if (!current.stashCurrent()) {
      return "The incoming pattern could not open because your current work could not be backed up. Your canvas is intact. Keep this tab open, copy your code, then free browser storage or reduce the project size and reload to retry.";
    }
  } else if (untouchedExample) {
    useLabStore.setState({ layers: [], activeLayerId: "" });
  }

  const editing = handoff.edit ?? null;
  const forkOf = !editing && handoff.parentId
    ? { id: handoff.parentId, title: handoff.parentTitle ?? "a community pattern", license: handoff.parentLicense }
    : undefined;
  const title = editing?.title ?? handoff.parentTitle ?? undefined;
  try {
    await importCodeIntoLab(handoff.code, title, forkOf);
  } catch {
    try {
      // A damaged @stack can still carry a usable flattened code pattern.
      useLabStore.getState().addCodeLayerFromCode(stripStackAnnotation(handoff.code), title, forkOf);
    } catch {
      return "The incoming pattern could not open. Your previous work is under Recent. Reload to retry.";
    }
  }
  // A different pattern may have been requested while a large stack was
  // decompressing. Its handoff belongs to the next open, not this one.
  if (JSON.stringify(readLabHandoff()) === JSON.stringify(handoff)) clearLabHandoff();
  if (editing) {
    const store = useLabStore.getState();
    store.setEditOf(editing);
    if (!store.parkSnapshot(`${editing.title} · published`)) {
      return "The pattern opened, but its published version could not be backed up to Recent. Copy the code before editing; browser storage may be full or this project may be too large.";
    }
  }
  return null;
}
