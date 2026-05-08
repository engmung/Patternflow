import * as THREE from 'three';
import { getKnobValueDelta, LOGICAL_KNOB_TO_WEB_KNOB, toEncoderDelta } from '@/lib/patternflowControls';

export class LedMatrixTexture {
  public texture: THREE.DataTexture;
  private width: number = 128;
  private height: number = 64;
  private data: Uint8Array;
  
  private userModule: any = null;
  private userParams: any = {};
  
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
      // Remove 'export ' so it becomes valid inside a function body
      const cleanedCode = code.replace(/export\s+function/g, 'function');
      
      const wrapper = `
        ${cleanedCode}
        return {
          setup: typeof setup !== 'undefined' ? setup : null,
          update: typeof update !== 'undefined' ? update : null,
          draw: typeof draw !== 'undefined' ? draw : null
        };
      `;
      
      const moduleObj = new Function(wrapper)();
      
      this.userModule = moduleObj;
      this.userParams = {};
      
      if (this.userModule.setup) {
        this.userModule.setup(this.userParams);
      }
      
      // Clear the screen
      this.data.fill(0);
      this.texture.needsUpdate = true;
    } catch (e) {
      console.error("Failed to load pattern code:", e);
    }
  }

  // Call this every frame
  public render(dt: number, time: number, knobValues: any, prevKnobValues: any) {
    if (!this.userModule || !this.userModule.draw) return;

    try {
      // Prepare input frame
      const input = {
        knobDeltas: LOGICAL_KNOB_TO_WEB_KNOB.map((knobId) =>
          toEncoderDelta(knobId, getKnobValueDelta(knobId, knobValues[knobId], prevKnobValues[knobId]))
        ),
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
