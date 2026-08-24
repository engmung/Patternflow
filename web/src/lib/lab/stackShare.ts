// ── @stack annotation: layered projects that survive the community ───────────
// Publishing flattens a composition into one standalone JS pattern — which
// runs everywhere but loses the layers. This module rides the FULL project
// (layers, ramps, masks, pixel art, knobs) along inside that same code string
// as one comment line:
//
//   // @stack v1 d:<base64 deflate-raw of the project JSON>
//
// The sandbox and every other consumer ignore the comment; Pattern Lab spots
// it on handoff/paste and restores the layer stack, so a shared composition
// forks back into a fully editable project instead of a flattened blob.
//
// Size matters: the community handoff caps around 100 KB, so the payload is
// deflate-compressed (pixel art crushes well) and the embed is skipped
// entirely past the guard below — the pattern still publishes, it just
// reopens flattened.

import type { ForkRef, LabProject } from "./types";
import { deserializeProject, serializeProject } from "./serialize";
import { useLabStore } from "./store";

const STACK_LINE_RE = /^[ \t]*\/\/[ \t]*@stack[ \t]+v1[ \t]+(d|r):([A-Za-z0-9+/=]+)[ \t]*$/m;

/** Keep the whole published code string comfortably under the handoff cap. */
const MAX_LINE_CHARS = 90_000;

function bytesToB64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function b64ToBytes(base64: string): Uint8Array | null {
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function pipe(
  bytes: Uint8Array,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function hasStackAnnotation(code: string): boolean {
  return STACK_LINE_RE.test(code);
}

export function stripStackAnnotation(code: string): string {
  return code.replace(STACK_LINE_RE, "").replace(/\n{3,}$/g, "\n");
}

/**
 * Build the annotation line for a project, or null when it cannot be embedded
 * (serialization failure, no compression support producing an oversized line).
 */
export async function buildStackAnnotation(project: LabProject): Promise<string | null> {
  const json = serializeProject(project);
  if (!json) return null;
  const raw = new TextEncoder().encode(json);

  let mode: "d" | "r" = "r";
  let payload: Uint8Array = raw;
  if (typeof CompressionStream !== "undefined") {
    try {
      payload = await pipe(raw, new CompressionStream("deflate-raw"));
      mode = "d";
    } catch {
      payload = raw;
      mode = "r";
    }
  }

  const line = `// @stack v1 ${mode}:${bytesToB64(payload)}`;
  if (line.length > MAX_LINE_CHARS) return null;
  return line;
}

/** Parse + decompress an embedded stack. Null when absent or unreadable. */
export async function extractStackAnnotation(
  code: string,
): Promise<(LabProject & { savedAt: number }) | null> {
  const match = code.match(STACK_LINE_RE);
  if (!match) return null;
  const bytes = b64ToBytes(match[2]);
  if (!bytes) return null;

  let jsonBytes = bytes;
  if (match[1] === "d") {
    if (typeof DecompressionStream === "undefined") return null;
    try {
      jsonBytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
    } catch {
      return null;
    }
  }

  try {
    return deserializeProject(new TextDecoder().decode(jsonBytes));
  } catch {
    return null;
  }
}

/**
 * One entry point for code arriving from outside (community handoff, paste):
 * an embedded @stack restores the whole layer stack on top of the current
 * project; anything else lands as a single new code layer.
 */
export async function importCodeIntoLab(
  code: string,
  name?: string,
  forkOf?: ForkRef,
): Promise<"stack" | "single"> {
  const stack = await extractStackAnnotation(code).catch(() => null);
  const store = useLabStore.getState();
  if (stack) {
    // Stacks shared before the piece had a name carry none — the community
    // post's title is that identity, so it rides in as the fallback.
    if (!stack.name && name) stack.name = name.slice(0, 60);
    store.importStackLayers(stack);
    if (forkOf !== undefined) store.setForkOf(forkOf);
    return "stack";
  }
  // Whatever the @stack line was (unreadable here, or absent), it must not
  // travel on inside a code layer — re-exported, the first @stack wins.
  store.addCodeLayerFromCode(stripStackAnnotation(code), name, forkOf);
  return "single";
}
