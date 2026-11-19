import * as THREE from 'three';
import { codeKnobRanges, getKnobValueDelta, LOGICAL_KNOB_TO_WEB_KNOB, normalizeKnob, toEncoderDelta } from '@/lib/pattern/controls';
import { compilePatternCode, describePatternError, type PatternModule, type PatternParams } from '@/lib/pattern/harness';

type WebKnobValues = Record<'c1' | 'c2' | 'c3' | 'c4', number>;

function getLogicalKnobValues(knobValues: WebKnobValues) {
  return LOGICAL_KNOB_TO_WEB_KNOB.map((knobId) => knobValues[knobId]);
}

function getLogicalKnobNormalized(logicalKnobValues: number[], ranges: ReadonlyArray<readonly [number, number]>) {
  return logicalKnobValues.map((value, index) => normalizeKnob(value, ranges[index]));
}

export class LedMatrixTexture {
  public texture: THREE.DataTexture;
  private width: number = 128;
  private height: number = 64;
  private data: Uint8Array;
  
  private userModule: PatternModule | null = null;
  private userParams: PatternParams = {};
  // The code userModule was compiled from, so a throw from update() or draw()
  // can quote its line.
  private source: string | null = null;
  private error: string | null = null;
  /** The running pattern's knob ranges, from its `@knobs` line (codeKnobRanges). */
  public knobRanges: Array<[number, number]> = codeKnobRanges(null);
  
  // Create a display wrapper to match ESP32 API structure
  private displayApi = {
    width: 128,
    height: 64,
    setPixel: (x: number, y: number, r: number | number[], g?: number, b?: number) => {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;

      // Tolerate the array form setPixel(x, y, [r, g, b]) as well as the
      // canonical setPixel(x, y, r, g, b).
      let cr: number;
      let cg: number;
      let cb: number;
      if (Array.isArray(r)) {
        cr = r[0] ?? 0;
        cg = r[1] ?? 0;
        cb = r[2] ?? 0;
      } else {
        cr = r;
        cg = g ?? 0;
        cb = b ?? 0;
      }

      // OpenGL texture origin is bottom-left, but ESP32 display is top-left
      // We flip Y to match ESP32 coordinate system (y=0 is top)
      const texY = this.height - 1 - Math.floor(y);
      const idx = (texY * this.width + Math.floor(x)) * 4;

      this.data[idx] = cr;
      this.data[idx + 1] = cg;
      this.data[idx + 2] = cb;
      this.data[idx + 3] = 255;
    },
    // Value-field patterns (Pattern Lab's setValue API). The landing preview
    // has no color ramp, so render the field as grayscale.
    setValue: (x: number, y: number, v: number) => {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
      const value = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
      const byte = Math.round(value * 255);
      const texY = this.height - 1 - Math.floor(y);
      const idx = (texY * this.width + Math.floor(x)) * 4;
      this.data[idx] = byte;
      this.data[idx + 1] = byte;
      this.data[idx + 2] = byte;
      this.data[idx + 3] = 255;
    }
  };

  /**
   * `onError` hears why the editor's code is not running, with the line it
   * failed on when the stack gives one, and null once new code runs. Only
   * when that changes: a draw() that throws throws on every frame.
   */
  constructor(private readonly onError?: (message: string | null) => void) {
    this.data = new Uint8Array(this.width * this.height * 4);
    this.texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    this.texture.needsUpdate = true;
  }

  private setError(message: string | null) {
    if (message === this.error) return;
    this.error = message;
    this.onError?.(message);
  }

  // Evaluate the custom code and setup the module. Code that will not compile
  // or set up leaves the last pattern that did running: while someone types,
  // most keystrokes leave code that does not parse yet.
  public loadCode(code: string) {
    try {
      const userModule = compilePatternCode(code);
      const userParams: PatternParams = {};
      userModule.setup?.(userParams);

      this.userModule = userModule;
      this.userParams = userParams;
      this.source = code;
      this.knobRanges = codeKnobRanges(code);
      this.setError(null);

      // Clear the screen
      this.data.fill(0);
      this.texture.needsUpdate = true;
    } catch (e) {
      console.error("Failed to load pattern code:", e);
      this.setError(describePatternError(e, code));
    }
  }

  // Call this every frame
  public render(dt: number, time: number, knobValues: WebKnobValues, prevKnobValues: WebKnobValues) {
    if (!this.userModule || !this.userModule.draw) return;

    try {
      const logicalKnobValues = getLogicalKnobValues(knobValues);

      // Prepare input frame
      const input = {
        knobDeltas: LOGICAL_KNOB_TO_WEB_KNOB.map((knobId, logicalIndex) =>
          toEncoderDelta(
            this.knobRanges[logicalIndex],
            getKnobValueDelta(knobId, knobValues[knobId], prevKnobValues[knobId], this.knobRanges[logicalIndex]),
          )
        ),
        knobValues: logicalKnobValues,
        knobNormalized: getLogicalKnobNormalized(logicalKnobValues, this.knobRanges),
        knobRanges: this.knobRanges,
        btnPressed: [false, false, false, false],
        btnHeld: [false, false, false, false]
      };

      // Mirror knob/button state onto params so patterns that read
      // params.knobValues in draw() (rather than input.knobValues in update())
      // still work — input is only passed to update().
      this.userParams.knobValues = input.knobValues;
      this.userParams.knobNormalized = input.knobNormalized;
      this.userParams.knobDeltas = input.knobDeltas;
      this.userParams.knobRanges = input.knobRanges;
      this.userParams.btnPressed = input.btnPressed;
      this.userParams.btnHeld = input.btnHeld;

      // Run update
      if (this.userModule.update) {
        this.userModule.update(dt, input, this.userParams);
      }

      // Clear buffer
      this.data.fill(0);
      
      // Run draw
      this.userModule.draw(this.displayApi, this.userParams, time);
      
      // Update texture
      this.texture.needsUpdate = true;
    } catch (e) {
      // The first throw stays until the code changes. A pattern that throws
      // on some frames only would otherwise flash the message on and off.
      if (this.error !== null) return;
      console.error("Runtime error in pattern code:", e);
      this.setError(describePatternError(e, this.source));
    }
  }
}
