import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLabStore } from "@/lib/lab/store";
import { LAB_STORAGE } from "@/lib/lab/persist";
import { listSessions } from "@/lib/lab/sessions";
import { saveProject } from "@/lib/lab/serialize";
import { defaultProject } from "@/lib/lab/store/shared";
import { importCodeIntoLab } from "@/lib/lab/stackShare";
import { clearLabHandoff, readLabHandoff } from "./community";
import { openIncomingPattern } from "./openIncomingPattern";

vi.mock("./community", () => ({ readLabHandoff: vi.fn(), clearLabHandoff: vi.fn() }));
vi.mock("@/lib/lab/stackShare", () => ({ importCodeIntoLab: vi.fn(), stripStackAnnotation: (code: string) => code }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  useLabStore.setState({ ...defaultProject(), hydrated: false, restoredAt: null, saveStatus: "idle" });
  vi.mocked(readLabHandoff).mockReturnValue({
    code: "export function draw() {}", parentId: "community-source", parentTitle: "Incoming", parentLicense: null,
  });
  vi.mocked(importCodeIntoLab).mockImplementation(async (code, title, forkOf) => {
    useLabStore.getState().addCodeLayerFromCode(code, title, forkOf);
    return "single";
  });
});

describe("community open protects work in progress", () => {
  it("leaves the handoff, canvas and saved copies intact when backup fails", async () => {
    useLabStore.setState({ name: "My unfinished work", restoredAt: 1 });
    saveProject(useLabStore.getState());
    useLabStore.getState().parkSnapshot("Earlier work");
    const layers = useLabStore.getState().layers;
    const project = localStorage.getItem(LAB_STORAGE.project);
    const recent = localStorage.getItem(LAB_STORAGE.sessions);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("QuotaExceededError"); });
    expect(await openIncomingPattern()).toContain("could not be backed up");
    expect(importCodeIntoLab).not.toHaveBeenCalled();
    expect(clearLabHandoff).not.toHaveBeenCalled();
    expect(useLabStore.getState().layers).toBe(layers);
    expect(localStorage.getItem(LAB_STORAGE.project)).toBe(project);
    expect(localStorage.getItem(LAB_STORAGE.sessions)).toBe(recent);
  });

  it("opens on a first visit even when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage disabled"); });
    expect(await openIncomingPattern()).toBeNull();
    expect(useLabStore.getState().layers).toHaveLength(1);
    expect(useLabStore.getState().layers[0].name).toBe("Incoming");
    expect(clearLabHandoff).toHaveBeenCalledTimes(1);
  });

  it("backs up an edited first session even before its first autosave", async () => {
    useLabStore.setState({ name: "First edits", saveStatus: "pending" });
    expect(await openIncomingPattern()).toBeNull();
    expect(listSessions()[0]?.title).toBe("First edits");
    expect(useLabStore.getState().layers).toHaveLength(1);
    expect(useLabStore.getState().forkOf?.id).toBe("community-source");
  });

  it("keeps the request available if both stack and flat imports fail", async () => {
    useLabStore.setState({ restoredAt: 1 });
    vi.mocked(importCodeIntoLab).mockRejectedValueOnce(new Error("bad stack"));
    const add = vi.spyOn(useLabStore.getState(), "addCodeLayerFromCode").mockImplementation(() => { throw new Error("bad code"); });
    expect(await openIncomingPattern()).toContain("could not open");
    expect(clearLabHandoff).not.toHaveBeenCalled();
    expect(listSessions()).toHaveLength(1);
    add.mockRestore();
  });

  it("shares a pending import across remounts without clearing a newer handoff", async () => {
    let finish!: () => void;
    vi.mocked(importCodeIntoLab).mockImplementationOnce(() => new Promise((resolve) => {
      finish = () => resolve("single");
    }));
    const first = openIncomingPattern();
    const remount = openIncomingPattern();
    expect(remount).toBe(first);
    vi.mocked(readLabHandoff).mockReturnValue({ code: "// second", parentId: null, parentTitle: "Second", parentLicense: null });
    finish();
    await first;
    expect(clearLabHandoff).not.toHaveBeenCalled();
    expect(importCodeIntoLab).toHaveBeenCalledTimes(1);
  });

  it("opens a newer request only after the pending import finishes", async () => {
    let finish!: () => void;
    vi.mocked(importCodeIntoLab).mockImplementationOnce((code, title) => new Promise((resolve) => {
      finish = () => {
        useLabStore.getState().addCodeLayerFromCode(code, title);
        useLabStore.setState({ saveStatus: "pending" });
        resolve("single");
      };
    }));
    const first = openIncomingPattern();
    vi.mocked(readLabHandoff).mockReturnValue({ code: "// second", parentId: null, parentTitle: "Second", parentLicense: null });
    const second = openIncomingPattern();
    expect(importCodeIntoLab).toHaveBeenCalledTimes(1);
    finish();
    await Promise.all([first, second]);
    expect(importCodeIntoLab).toHaveBeenCalledTimes(2);
    expect(useLabStore.getState().layers).toHaveLength(1);
    expect(useLabStore.getState().layers[0].name).toBe("Second");
    expect(clearLabHandoff).toHaveBeenCalledTimes(1);
    expect(listSessions()[0]?.title).toBe("Incoming");
  });
});
