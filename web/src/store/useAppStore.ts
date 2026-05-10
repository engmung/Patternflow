import { create } from 'zustand';

export type SectionType = 'hero' | 'case' | 'pcb' | 'assembly' | 'firmware' | 'inside';

interface AppState {
  activeSection: SectionType;
  setActiveSection: (section: SectionType) => void;
  knobValues: {
    c1: number;
    c2: number;
    c3: number;
    c4: number;
  };
  setKnobValue: (knobId: 'c1' | 'c2' | 'c3' | 'c4', value: number) => void;
  isDraggingKnob: boolean;
  setIsDraggingKnob: (isDragging: boolean) => void;
  activeKnobId: 'c1' | 'c2' | 'c3' | 'c4' | null;
  setActiveKnobId: (id: 'c1' | 'c2' | 'c3' | 'c4' | null) => void;
  isBloomEnabled: boolean;
  setIsBloomEnabled: (enabled: boolean) => void;
  activePatternId: string;
  setActivePatternId: (id: string) => void;
  customJsCode: string;
  setCustomJsCode: (code: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeSection: 'hero',
  setActiveSection: (section) => set({ activeSection: section }),
  knobValues: {
    c1: 0.00, // Hue
    c2: 2.00, // Speed
    c3: 0.06, // Freq/Offset
    c4: 0.00, // Mode
  },
  setKnobValue: (knobId, value) =>
    set((state) => ({
      knobValues: {
        ...state.knobValues,
        [knobId]: value,
      },
    })),
  isDraggingKnob: false,
  setIsDraggingKnob: (isDragging) => set({ isDraggingKnob: isDragging }),
  activeKnobId: null,
  setActiveKnobId: (id) => set({ activeKnobId: id }),
  isBloomEnabled: true,
  setIsBloomEnabled: (enabled) => set({ isBloomEnabled: enabled }),
  activePatternId: 'patternFlowOriginal',
  setActivePatternId: (id) => set({ activePatternId: id }),
  customJsCode: `// This code runs every frame in the web simulator.
// It matches the ESP32 C++ structure so AI can easily convert it.

export function setup(params) {
  params.hue = 0;
  params.speed = 2.0;
  params.time = 0;
}

export function update(dt, input, params) {
  // input.knobDeltas: [hue, speed, mode, freq]
  if (input.knobDeltas[0] !== 0) {
    params.hue = (params.hue + input.knobDeltas[0] * 10) % 360;
    if (params.hue < 0) params.hue += 360;
  }
  
  if (input.knobDeltas[1] !== 0) {
    params.speed = Math.max(0, Math.min(5.0, params.speed + input.knobDeltas[1] * 0.1));
  }
  
  params.time += dt * params.speed;
}

export function draw(display, params, globalTime) {
  // display.width (128), display.height (64)
  for (let y = 0; y < display.height; y++) {
    for (let x = 0; x < display.width; x++) {
      let r = (x / display.width) * 255;
      let g = (y / display.height) * 255;
      let b = (Math.sin(params.time + params.hue * 0.01) * 0.5 + 0.5) * 255;
      
      display.setPixel(x, y, r, g, b);
    }
  }
}`,
  setCustomJsCode: (code) => set({ customJsCode: code }),
}));
