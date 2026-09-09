import { beforeEach, describe, expect, it } from "vitest";
import { bakeShowV2, continuousLaneValue } from "./director/bake";
import { DEFAULT_CURVE_CP, emptyShow, type DirectorKeyframe } from "./director/types";
import { PROJECT_STORAGE, deserializeProject, saveProject, serializeProject } from "./serialize";
import { DEFAULT_RAMP_STATE, cloneRampState, type CodeLayer, type LabProject } from "./types";

function projectFixture(): LabProject {
  const layer: CodeLayer = {
    id: "pattern",
    type: "code",
    name: "My pattern",
    visible: true,
    opacity: 1,
    blend: "normal",
    role: "paint",
    maskInvert: false,
    code: "function draw() {}",
    ramp: cloneRampState(DEFAULT_RAMP_STATE),
    recolor: false,
    knobsAnnotationRaw: null,
    matrixAnnotationRaw: null,
  };
  return {
    name: "My piece",
    matrix: { width: 128, height: 64 },
    layers: [layer],
    activeLayerId: layer.id,
    knobs: [0.5, 0.5, 0.5, 0.5],
    ranges: [[0, 1], [0, 1], [0, 1], [0, 1]],
    knobLabels: ["A", "B", "C", "D"],
    forkOf: null,
    editOf: null,
    gen: { count: 5, thinking: "LOW", refs: 6, colorMode: "vfield" },
    director: emptyShow(),
  };
}

function key(id: string, t: number, v: number, h?: DirectorKeyframe["h"]): DirectorKeyframe {
  return { id, t, v, mode: "curve", ...(h ? { h } : {}), cp: [...DEFAULT_CURVE_CP] };
}

function roundTrip(project: LabProject): LabProject {
  const json = serializeProject(project);
  expect(json).not.toBeNull();
  const restored = deserializeProject(json!);
  expect(restored).not.toBeNull();
  return restored!;
}

beforeEach(() => localStorage.clear());

describe("project Director persistence", () => {
  it("keeps auto/manual curves, fractional times and imported pattern switches on reload", () => {
    const project = projectFixture();
    const show = project.director;
    show.length = 12.3;
    show.loop = true;
    show.lanes[0] = [key("a", 0, 0, "auto"), key("b", 2, 400, "auto"), key("c", 5, 1000, "auto")];
    show.lanes[1] = [key("d", 0.1, 200, "manual"), { ...key("e", 3.4, 900), mode: "hold" }];
    show.lanes[1][0].cp = [0.2, -0.3, 0.7, 1.2];
    show.messages = [{ id: "message", t: 1.7, text: "Hello" }];
    show.patternCues = [{ id: "origin", t: 0, name: "Origin" }, { id: "wave", t: 10.1, name: "Wave" }];

    const restored = roundTrip(project).director;
    expect(restored).toEqual(show);
    for (const t of [0.1, 0.5, 1, 1.5, 2.4, 3.2, 4.9]) {
      for (let lane = 0; lane < 4; lane++) {
        expect(continuousLaneValue(restored.lanes[lane], t)).toBe(continuousLaneValue(show.lanes[lane], t));
      }
    }
    // Verify the device-facing show as well as the editor fields: restoring
    // an automatic segment as manual used to change its emitted cue values.
    expect(bakeShowV2(restored)).toEqual(bakeShowV2(show));
  });

  it("preserves sub-second show length", () => {
    const project = projectFixture();
    project.director.length = 0.2;
    expect(roundTrip(project).director.length).toBe(0.2);
  });

  it("keeps absent legacy handle modes manual and ignores malformed new metadata", () => {
    const project = projectFixture();
    project.director.lanes[0] = [key("a", 0, 0), key("b", 2, 400), key("c", 5, 1000)];
    const raw = JSON.parse(serializeProject(project)!);
    raw.director.lanes[0][0].h = "unknown";
    raw.director.patternCues = [null, false, "broken", {}, { name: 123 }, { name: "" }];
    const restored = deserializeProject(JSON.stringify(raw))!;
    expect(restored.director.lanes[0].every((entry) => entry.h === undefined)).toBe(true);
    expect(restored.director.patternCues).toEqual([]);
    expect(bakeShowV2(restored.director)).toEqual(bakeShowV2(project.director));
  });
});

describe("defensive project restore", () => {
  it("skips malformed layer entries while still recovering legacy per-layer knobs", () => {
    const raw = JSON.parse(serializeProject(projectFixture())!);
    delete raw.knobs;
    raw.layers[0].knobs = [0.1, 0.2, 0.3, 0.4];
    raw.layers[0].ranges = [[0, 1], [0, 2], [0, 3], [0, 4]];
    raw.layers[0].knobLabels = ["Speed", "Scale", "Shape", "Mix"];
    raw.layers.unshift(null, false, 7, "broken", [], {});
    const restored = deserializeProject(JSON.stringify(raw));
    expect(restored?.layers).toHaveLength(1);
    expect(restored?.layers[0].id).toBe("pattern");
    expect(restored?.knobs).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(restored?.ranges).toEqual([[0, 1], [0, 2], [0, 3], [0, 4]]);
    expect(restored?.knobLabels).toEqual(["Speed", "Scale", "Shape", "Mix"]);
  });

  it("returns no project when every layer is malformed", () => {
    expect(deserializeProject(JSON.stringify({ version: 2, layers: [null, 7, false, [], {}] }))).toBeNull();
  });
});

describe("lossless authoring save limits", () => {
  it("restores all layers and code at the supported boundaries", () => {
    const project = projectFixture();
    const layer = project.layers[0] as CodeLayer;
    layer.code = "x".repeat(200_000);
    project.layers = Array.from({ length: 24 }, (_, i) => ({ ...layer, id: `layer-${i}`, code: i === 0 ? layer.code : "// pattern" }));
    const restored = roundTrip(project);
    expect(restored.layers).toHaveLength(24);
    expect((restored.layers[0] as CodeLayer).code).toBe(layer.code);
    expect(restored.layers[23].id).toBe("layer-23");
  });

  it.each(["layers", "code"] as const)("refuses excessive %s without replacing the previous autosave", (limit) => {
    const project = projectFixture();
    expect(saveProject(project)).toBe(true);
    const previousSave = localStorage.getItem(PROJECT_STORAGE);
    const layer = project.layers[0] as CodeLayer;
    if (limit === "layers") {
      project.layers = Array.from({ length: 25 }, (_, i) => ({ ...layer, id: `layer-${i}` }));
    } else {
      layer.code = "x".repeat(200_001);
    }
    expect(serializeProject(project)).toBeNull();
    expect(saveProject(project)).toBe(false);
    expect(localStorage.getItem(PROJECT_STORAGE)).toBe(previousSave);
    expect(project.layers).toHaveLength(limit === "layers" ? 25 : 1);
    if (limit === "code") expect(layer.code).toHaveLength(200_001);
  });
});
