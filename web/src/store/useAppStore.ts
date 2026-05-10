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
  buildStep: number;
  setBuildStep: (step: number) => void;
  isExploded: boolean;
  setIsExploded: (isExploded: boolean) => void;
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
  customJsCode: `// Patternflow live editor starter.
// Knobs: hue, speed, spread, pulse.

export function setup(params) {
  params.hue = 0;
  params.speed = 2.0;
  params.spread = 1.0;
  params.pulse = 1.0;
  params.time = 0;
}

export function update(dt, input, params) {
  if (input.knobDeltas[0] !== 0) {
    params.hue = (params.hue + input.knobDeltas[0] * 24) % 360;
    if (params.hue < 0) params.hue += 360;
  }

  if (input.knobDeltas[1] !== 0) {
    params.speed = Math.max(0.2, Math.min(8, params.speed + input.knobDeltas[1] * 0.35));
  }

  if (input.knobDeltas[2] !== 0) {
    params.spread = Math.max(0.25, Math.min(4, params.spread + input.knobDeltas[2] * 0.2));
  }

  if (input.knobDeltas[3] !== 0) {
    params.pulse = Math.max(0.2, Math.min(3, params.pulse + input.knobDeltas[3] * 0.18));
  }

  params.time += dt * params.speed;
}

export function draw(display, params, globalTime) {
  for (let y = 0; y < display.height; y++) {
    for (let x = 0; x < display.width; x++) {
      let h = params.hue * 0.017 + x * 0.045 * params.spread + y * 0.035 + params.time;
      let wave = Math.sin(h * 2 + params.time * 1.5) * 0.5 + 0.5;
      let bright = 0.35 + wave * 0.65 * params.pulse;

      display.setPixel(
        x, y,
        (Math.sin(h) * 0.5 + 0.5) * 255 * bright,
        (Math.sin(h + 2.1) * 0.5 + 0.5) * 255 * bright,
        (Math.sin(h + 4.2) * 0.5 + 0.5) * 255 * bright
      );
    }
  }
}`,
  setCustomJsCode: (code) => set({ customJsCode: code }),
  buildStep: 0,
  setBuildStep: (step) => set({ buildStep: step }),
  isExploded: true,
  setIsExploded: (val) => set({ isExploded: val }),
}));
