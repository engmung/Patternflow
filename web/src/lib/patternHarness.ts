export const PATTERN_MATRIX_WIDTH = 128;
export const PATTERN_MATRIX_HEIGHT = 64;
export const PATTERN_KNOB_COUNT = 4;
export const PATTERN_DETENTS_PER_TURN = 20;

export type PatternParams = Record<string, unknown>;

export type PatternInput = {
  knobDeltas: number[];
  knobValues?: number[];
  knobNormalized?: number[];
  knobRanges?: Array<[number, number]>;
  btnPressed: boolean[];
  btnHeld: boolean[];
};

export type PatternDisplay = {
  width: number;
  height: number;
  setPixel: (x: number, y: number, r: number, g: number, b: number) => void;
};

export type PatternModule = {
  setup?: (params: PatternParams) => void;
  update?: (dt: number, input: PatternInput, params: PatternParams) => void;
  draw: (display: PatternDisplay, params: PatternParams, time: number) => void;
};

export type PatternRenderResult = {
  ok: boolean;
  error?: string;
};

export type PatternStillOptions = {
  width?: number;
  height?: number;
  seconds?: number;
  fps?: number;
  knobStart?: number[];
  knobTargets?: number[];
  knobRanges?: Array<[number, number]>;
};

function clampByte(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizePatternCode(code: string) {
  return code
    .replace(/^\s*import\s+.*?;?\s*$/gm, "")
    .replace(/\bexport\s+function\b/g, "function");
}

export function compilePatternCode(code: string): PatternModule {
  const normalized = normalizePatternCode(code);
  const wrapper = `
    "use strict";
    ${normalized}
    return {
      setup: typeof setup === "function" ? setup : undefined,
      update: typeof update === "function" ? update : undefined,
      draw: typeof draw === "function" ? draw : undefined
    };
  `;
  const moduleObject = new Function(wrapper)() as Partial<PatternModule>;

  if (typeof moduleObject.draw !== "function") {
    throw new Error("Pattern must export draw(display, params, time).");
  }

  return moduleObject as PatternModule;
}

export class PatternRuntime {
  public readonly width: number;
  public readonly height: number;
  public readonly data: Uint8ClampedArray;

  private module: PatternModule | null = null;
  private params: PatternParams = {};
  private display: PatternDisplay;

  constructor(width = PATTERN_MATRIX_WIDTH, height = PATTERN_MATRIX_HEIGHT) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.display = {
      width,
      height,
      setPixel: (x, y, r, g, b) => {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return;

        const index = (yi * this.width + xi) * 4;
        this.data[index] = clampByte(r);
        this.data[index + 1] = clampByte(g);
        this.data[index + 2] = clampByte(b);
        this.data[index + 3] = 255;
      },
    };
  }

  public loadCode(code: string): PatternRenderResult {
    try {
      this.module = compilePatternCode(code);
      this.params = {};
      this.data.fill(0);
      this.module.setup?.(this.params);
      return { ok: true };
    } catch (error) {
      this.module = null;
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public renderFrame(dt: number, time: number, input: PatternInput): PatternRenderResult {
    if (!this.module) {
      return { ok: false, error: "No pattern loaded." };
    }

    try {
      this.module.update?.(dt, input, this.params);
      this.data.fill(0);
      this.module.draw(this.display, this.params, time);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  public getParamsSnapshot() {
    return JSON.parse(JSON.stringify(this.params)) as PatternParams;
  }
}

export function createIdleInput(
  knobDeltas?: number[],
  options: {
    knobValues?: number[];
    knobNormalized?: number[];
    knobRanges?: Array<[number, number]>;
  } = {},
): PatternInput {
  return {
    knobDeltas: Array.from({ length: PATTERN_KNOB_COUNT }, (_, index) => knobDeltas?.[index] ?? 0),
    knobValues: options.knobValues,
    knobNormalized: options.knobNormalized,
    knobRanges: options.knobRanges,
    btnPressed: [false, false, false, false],
    btnHeld: [false, false, false, false],
  };
}

export function knobTargetToDelta(previous: number, next: number, wrap = false) {
  let delta = next - previous;
  if (wrap) {
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
  }
  return delta * PATTERN_DETENTS_PER_TURN;
}

export function renderPatternStill(
  code: string,
  {
    width = PATTERN_MATRIX_WIDTH,
    height = PATTERN_MATRIX_HEIGHT,
    seconds = 2.4,
    fps = 30,
    knobStart = [0.5, 0.5, 0.5, 0.5],
    knobTargets = [0.5, 0.5, 0.5, 0.5],
    knobRanges,
  }: PatternStillOptions = {},
) {
  const runtime = new PatternRuntime(width, height);
  const loadResult = runtime.loadCode(code);
  if (!loadResult.ok) {
    return { ...loadResult, data: runtime.data };
  }

  const frameCount = Math.max(1, Math.floor(seconds * fps));
  const firstDeltas = knobTargets.map((target, index) =>
    knobTargetToDelta(knobStart[index] ?? 0.5, target, false),
  );
  const knobNormalized = knobTargets.map((target, index) => {
    const range = knobRanges?.[index];
    if (!range) return target;
    const span = Math.max(0.0001, range[1] - range[0]);
    return (target - range[0]) / span;
  });

  for (let frame = 0; frame < frameCount; frame++) {
    const input = createIdleInput(frame === 0 ? firstDeltas : undefined, {
      knobValues: knobTargets,
      knobNormalized,
      knobRanges,
    });
    const result = runtime.renderFrame(1 / fps, frame / fps, input);
    if (!result.ok) {
      return { ...result, data: runtime.data };
    }
  }

  return { ok: true, data: new Uint8ClampedArray(runtime.data) };
}
