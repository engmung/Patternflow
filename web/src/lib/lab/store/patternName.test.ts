// The `// Pattern:` line names the piece. Until 11 November 2026 a pattern
// pasted into the lab stayed "Code 1", and To hardware wrote that into the
// NAME of the .h and into the .pfm built from it.

import { beforeEach, describe, expect, it } from "vitest";

import { useLabStore } from "../store";

const store = () => useLabStore.getState();
const BODY = "export function draw(display) {}\n";
const named = (line: string, body = BODY) => `// Pattern: ${line}\n// Author: didusee\n${body}`;

function codeId(): string {
  const layer = store().layers.find((entry) => entry.type === "code");
  if (!layer) throw new Error("no code layer");
  return layer.id;
}

beforeEach(() => {
  store().discardProject();
  store().setName("");
  store().updateLayerCode(codeId(), BODY);
});

describe("pasting a pattern", () => {
  it("names an unnamed piece after its // Pattern: line", () => {
    store().updateLayerCode(codeId(), named("Patternflow Clock"));
    expect(store().name).toBe("Patternflow Clock");
    expect(store().layers.find((entry) => entry.type === "code")?.name).toBe("Code 1");
  });

  it("keeps a name typed into the field", () => {
    store().setName("My Clock");
    store().updateLayerCode(codeId(), named("Patternflow Clock"));
    expect(store().name).toBe("My Clock");
  });

  it("renames when the next pasted pattern replaces one the lab named", () => {
    store().updateLayerCode(codeId(), named("Felt Dots"));
    store().updateLayerCode(codeId(), named("Wet Florals"));
    expect(store().name).toBe("Wet Florals");
  });
});

describe("typing", () => {
  it("follows the line past its first letter", () => {
    for (const line of ["F", "Fe", "Felt", "Felt Dots"]) store().updateLayerCode(codeId(), named(line));
    expect(store().name).toBe("Felt Dots");
  });

  it("leaves the name alone while only the body changes", () => {
    store().updateLayerCode(codeId(), named("Felt Dots"));
    store().setName("Felt");
    store().updateLayerCode(codeId(), named("Felt Dots", `${BODY}// more\n`));
    expect(store().name).toBe("Felt");
  });
});

describe("a new code layer", () => {
  it("names an unnamed piece", () => {
    store().addCodeLayerFromCode(named("Wet Florals"));
    expect(store().name).toBe("Wet Florals");
  });

  it("leaves the piece unnamed when the caller names the layer", () => {
    store().addCodeLayerFromCode(named("Wet Florals"), "Shared title");
    expect(store().name).toBe("");
  });
});
