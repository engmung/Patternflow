/**
 * "Edit my published pattern" smoke test — `npm run check:labedit`.
 *
 * The round trip that makes revising a post possible instead of deleting and
 * reposting it: the community page hands the lab an `edit` reference, the lab
 * carries it as `editOf`, and Share turns into Update. Three ways that breaks
 * quietly, all of them costing somebody their post:
 *
 *   - the reference is dropped in transit (handoff) or on reload (persistence),
 *     so Update silently reverts to publishing a NEW pattern
 *   - fork and edit end up set at once, and the same Share both forks and
 *     updates
 *   - parking the opened version clears the canvas, taking the edit with it
 *
 * Both modules are browser-only by design (sessionStorage, localStorage), so
 * the storage they reach for is stubbed here rather than mocked away.
 */

// Only dynamic imports below (the stub has to be in place first), so this
// needs a marker to be a MODULE — without it every top-level name here lands
// in the global scope and collides with the DOM lib and the other scripts.
export {};

class MemStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

const sessionStore = new MemStorage();
const localStore = new MemStorage();
Object.assign(globalThis, {
  window: {
    sessionStorage: sessionStore,
    localStorage: localStore,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  },
  localStorage: localStore,
  sessionStorage: sessionStore,
});

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? "  ok  " : "FAIL  "}${label}${ok ? "" : `\n        got ${JSON.stringify(actual)}\n        want ${JSON.stringify(expected)}`}`,
  );
}

const EDIT = {
  id: "p-mine",
  title: "My Pattern",
  description: "as published",
  visibility: "public",
  hasCpp: true,
  portCount: 2,
};

async function main() {
  const { readLabHandoff, writeLabHandoff, clearLabHandoff } = await import(
    "../src/lib/community/handoff"
  );
  const { deserializeProject, serializeProject } = await import("../src/lib/lab/serialize");
  const { emptyShow } = await import("../src/lib/lab/director/types");
  const { codeLayerFromSource, useLabStore } = await import("../src/lib/lab/store");
  const { listSessions } = await import("../src/lib/lab/sessions");

  console.log("\n── the community → lab handoff ──");
  writeLabHandoff({
    code: "// js",
    parentId: null,
    parentTitle: null,
    parentLicense: null,
    edit: EDIT,
  });
  check("an owner's open carries the whole edit reference", readLabHandoff()?.edit, EDIT);
  check("and no fork lineage with it", readLabHandoff()?.parentId, null);

  writeLabHandoff({
    code: "// js",
    parentId: "p-theirs",
    parentTitle: "Theirs",
    parentLicense: "CC-BY-4.0",
    edit: null,
  });
  check("a stranger's open still forks", readLabHandoff()?.parentId, "p-theirs");
  check("and carries no edit reference", readLabHandoff()?.edit, null);

  // Handoffs written by the build before in-place editing existed have no
  // `edit` key at all — they must read as forks, not crash the lab on boot.
  sessionStore.setItem(
    "patternflow.community.labHandoff",
    JSON.stringify({ code: "// js", parentId: "p-old", parentTitle: "Old", parentLicense: null }),
  );
  check("an older handoff reads as a plain fork", readLabHandoff()?.edit, null);
  // Anything can be in the slot; a broken reference loses edit mode, nothing more.
  sessionStore.setItem(
    "patternflow.community.labHandoff",
    JSON.stringify({ code: "// js", edit: { title: "no id" } }),
  );
  check("a malformed edit reference is refused", readLabHandoff()?.edit, null);
  clearLabHandoff();
  check("clearing leaves nothing behind", readLabHandoff(), null);

  console.log("\n── it survives a reload ──");
  const layer = codeLayerFromSource("// pattern", "Code 1").layer;
  const project = {
    matrix: { width: 128, height: 64 },
    layers: [layer],
    activeLayerId: layer.id,
    knobs: [0.5, 0.5, 0.5, 0.5],
    ranges: [[0, 1], [0, 1], [0, 1], [0, 1]] as [number, number][],
    knobLabels: ["A", "B", "C", "D"],
    forkOf: null,
    editOf: EDIT,
    gen: { count: 5, thinking: "LOW" as const, refs: 6, colorMode: "vfield" as const },
    director: emptyShow(),
    name: "Edit Smoke",
  };
  const json = serializeProject(project);
  check("the project serializes", typeof json, "string");
  check("and comes back still editing that post", deserializeProject(json!)?.editOf, EDIT);

  const legacy = JSON.parse(json!) as Record<string, unknown>;
  delete legacy.editOf;
  check(
    "a project saved before edit mode restores as a draft",
    deserializeProject(JSON.stringify(legacy))?.editOf,
    null,
  );
  const broken = JSON.parse(json!) as Record<string, unknown>;
  broken.editOf = { id: 5, title: null };
  check(
    "a corrupted reference restores as a draft too",
    deserializeProject(JSON.stringify(broken))?.editOf,
    null,
  );

  console.log("\n── fork and edit are mutually exclusive ──");
  const store = useLabStore.getState();
  store.setEditOf(EDIT);
  check("editing is set", useLabStore.getState().editOf?.id, "p-mine");
  store.setForkOf({ id: "p-theirs", title: "Theirs", license: null });
  check("forking replaces it", useLabStore.getState().editOf, null);
  check("and the fork stands", useLabStore.getState().forkOf?.id, "p-theirs");
  store.setEditOf(EDIT);
  check("editing replaces the fork in turn", useLabStore.getState().forkOf, null);
  // Detaching one must not silently arm the other.
  store.setEditOf(null);
  check("detaching leaves a plain draft", useLabStore.getState().forkOf, null);

  console.log("\n── parking the opened version keeps the canvas ──");
  store.setEditOf(EDIT);
  const layerCountBefore = useLabStore.getState().layers.length;
  check("something is on the canvas to park", layerCountBefore > 0, true);
  check("it parks", useLabStore.getState().parkSnapshot("My Pattern · published"), true);
  check("the canvas is untouched", useLabStore.getState().layers.length, layerCountBefore);
  check("and so is edit mode", useLabStore.getState().editOf?.id, "p-mine");
  check("the ring has it, under the given name", listSessions()[0]?.title, "My Pattern · published");
  // The parked copy is what you get back if the update was a mistake, so it
  // has to come back still pointed at the post it can be re-published to.
  check(
    "restoring it returns to editing that post",
    (() => {
      const id = listSessions()[0]?.id;
      useLabStore.getState().restoreSession(id!);
      return useLabStore.getState().editOf?.id;
    })(),
    "p-mine",
  );
}

main()
  .then(() => {
    console.log(failures === 0 ? "\nAll lab-edit checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
