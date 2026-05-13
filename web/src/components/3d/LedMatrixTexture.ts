import * as THREE from 'three';
import { getKnobValueDelta, LOGICAL_KNOB_TO_WEB_KNOB, toEncoderDelta } from '@/lib/patternflowControls';
import { compilePatternCode, type PatternModule, type PatternParams } from '@/lib/patternHarness';

type WebKnobValues = Record<'c1' | 'c2' | 'c3' | 'c4', number>;

const LOGICAL_KNOB_RANGES: Array<[number, number]> = [
  [0, 1],
  [0.1, 10],
  [0, 4.9],
  [0, 1],
];

function getLogicalKnobValues(knobValues: WebKnobValues) {
  return LOGICAL_KNOB_TO_WEB_KNOB.map((knobId) => knobValues[knobId]);
}

function getLogicalKnobNormalized(logicalKnobValues: number[]) {
  return logicalKnobValues.map((value, index) => {
    const [min, max] = LOGICAL_KNOB_RANGES[index];
    return (value - min) / Math.max(0.0001, max - min);
  });
}

export class LedMatrixTexture {
  public texture: THREE.DataTexture;
  private width: number = 128;
  private height: number = 64;
  private data: Uint8Array;
  
  private userModule: PatternModule | null = null;
  private userParams: PatternParams = {};
  
  // Create a display wrapper to match ESP32 API structure
  private displayApi = {
    width: 128,
    height: 64,
    setPixel: (x: number, y: number, r: number, g: number, b: number) => {
      if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
      
      // OpenGL texture origin is bottom-left, but ESP32 display is top-left
      // We flip Y to match ESP32 coordinate system (y=0 is top)
      const texY = this.height - 1 - Math.floor(y);
      const idx = (texY * this.width + Math.floor(x)) * 4;
      
      this.data[idx] = r;
      this.data[idx + 1] = g;
      this.data[idx + 2] = b;
      this.data[idx + 3] = 255;
    }
  };

  constructor() {
    this.data = new Uint8Array(this.width * this.height * 4);
    this.texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
    this.texture.needsUpdate = true;
  }

  // Evaluate the custom code and setup the module
  public loadCode(code: string) {
    try {
      this.userModule = compilePatternCode(code);
      this.userParams = {};
      
      this.userModule.setup?.(this.userParams);
      
      // Clear the screen
      this.data.fill(0);
      this.texture.needsUpdate = true;
    } catch (e) {
      console.error("Failed to load pattern code:", e);
    }
  }

  // Call this every frame
  public render(dt: number, time: number, knobValues: WebKnobValues, prevKnobValues: WebKnobValues) {
    if (!this.userModule || !this.userModule.draw) return;

    try {
      const logicalKnobValues = getLogicalKnobValues(knobValues);

      // Prepare input frame
      const input = {
        knobDeltas: LOGICAL_KNOB_TO_WEB_KNOB.map((knobId) =>
          toEncoderDelta(knobId, getKnobValueDelta(knobId, knobValues[knobId], prevKnobValues[knobId]))
        ),
        knobValues: logicalKnobValues,
        knobNormalized: getLogicalKnobNormalized(logicalKnobValues),
        knobRanges: LOGICAL_KNOB_RANGES,
        btnPressed: [false, false, false, false],
        btnHeld: [false, false, false, false]
      };

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
      console.error("Runtime error in pattern code:", e);
    }
  }
}
