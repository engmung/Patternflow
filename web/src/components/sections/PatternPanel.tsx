import { useState } from 'react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { SectionContent } from '@/lib/content';
import Script from 'next/script';
import { useAppStore } from '@/store/useAppStore';
import Editor from '@monaco-editor/react';
import { analyzeEsp32Cost } from '@/lib/esp32CostAnalyzer';
import { captureEvent } from '@/lib/posthogEvents';
import styles from './PatternPanel.module.css';

const createPrompt = `I am writing a custom LED pattern in JavaScript for Patternflow's 128x64 LED matrix web preview.

Output rules:
- Put the complete JavaScript pattern in one single code block labeled \`javascript\`.
- Do not write any text before or after the code block.
- Do not include nested triple backticks inside the code block.
- The code block must contain only executable JavaScript for the Patternflow live editor.

Required API:
- \`export function setup(params) {}\`
- \`export function update(dt, input, params) {}\` where \`input.knobValues\` is the primary control API: an array of 4 absolute, calibrated raw knob values in firmware logical order. Use \`input.knobValues\` for every target parameter by default.
- \`input.knobNormalized\` is also available when a 0.0-1.0 value is explicitly useful. \`input.knobDeltas\` is compatibility-only hardware-like rotary encoder click delta input; do not build the main parameter mapping around it unless the user specifically asks for incremental hardware behavior.
- \`export function draw(display, params, time) {}\` where \`display.setPixel(x, y, r, g, b)\` draws a pixel.
- Use \`display.width\` and \`display.height\` in loops. Do not hardcode 128 or 64 inside \`draw()\`.
- Use only plain JavaScript and \`Math.*\`. Do not use browser APIs, DOM APIs, arrays that grow every frame, async code, imports, external libraries, or dynamic code evaluation.
- Include small helper functions such as \`hsvToRgb()\` or \`clamp()\` if needed.

Knob behavior:
- Do not assume fixed meanings such as hue/speed/mode/frequency unless the user asks for them. Choose 4 meaningful controls for this specific pattern and keep their roles consistent.
- In \`update()\`, read \`input.knobValues[0]\` through \`input.knobValues[3]\` as absolute target values. Do not clamp these values back to 0.0-1.0 unless you intentionally use \`input.knobNormalized\`.
- Apply knob value changes immediately. Do not smooth, lerp, damp, or ease knob-controlled parameters unless the user explicitly asks for glide or inertia.
- Keep \`input.knobDeltas\` only as a fallback for older runtimes. The web preview and Pattern Lab are knobValues-first.
- Preview raw knob ranges are: knob 1 = 0.0-1.0 wrap, knob 2 = 0.1-10.0 clamp, knob 3 = 0.0-4.9 clamp, knob 4 = 0.0-1.0 wrap.
- One full web knob rotation equals one physical encoder turn, approximately 20 detents. Default raw step sizes are: knob 1 = 0.05 per detent, knob 2 = 0.10 per detent, knob 3 = 0.05 per detent, knob 4 = 0.05 per detent.
- If you need a designer-friendly range such as 4-24, read \`input.knobNormalized[i]\` and map it inside the pattern, while keeping the raw knob calibration intact for ESP32 conversion.

Brightness:
- Use bright LED output by default. At least some pixels should regularly reach near-full intensity, around 230-255 per RGB channel after color conversion, while dark areas may remain dark for contrast.
- The web preview does not artificially boost custom pattern brightness, so make the actual pixel values bright enough in the JavaScript code itself.
- Avoid formulas that make everything dim, such as \`Math.pow(v, 2.5)\` followed by no gain. If you sharpen a signal with \`Math.pow()\`, compensate with a small base brightness and gain, for example \`let val = clamp(0.10 + shaped * 1.25, 0, 1);\`.

ESP32-friendly math balance:
- The pattern will later be converted to ESP32 C++, so keep the inner pixel loop reasonably light.
- Good and cheap inside the pixel loop: addition, subtraction, multiplication, comparisons, \`Math.abs()\`, \`Math.floor()\`, \`Math.min()\`, \`Math.max()\`, simple \`if\` branches, and helper functions made from those operations.
- Use with care inside the pixel loop: \`Math.sin()\` and \`Math.cos()\`. Aim for about 2-3 trig calls per pixel when possible. More can be beautiful, but it may need lookup-table optimization later.
- Avoid or minimize inside the pixel loop: \`Math.pow()\`, \`Math.sqrt()\`, \`Math.atan2()\`, division-heavy formulas, nested loops, random/noise functions with multiple octaves, and allocations such as creating arrays per pixel.
- Prefer cheap alternatives: use \`v * v\` instead of \`Math.pow(v, 2)\`; compare squared distances instead of using \`Math.sqrt()\`; use approximate distance like \`max(abs(x), abs(y)) + min(abs(x), abs(y)) * 0.375\` when exact radius is not essential.
- Precompute values outside the pixel loop when possible, especially time constants, scale factors, center coordinates, and row/column-only terms.
- A good target is LOW or MEDIUM in the ESP32 cost display. HIGH is allowed for exploration, but expect the C++ conversion to need optimization.

Visual direction:
- Prefer refining the user's existing pattern idea over inventing a completely different visual style. Preserve the core composition, motion, and parameter meanings unless the user explicitly asks for a new direction.
- Create a pattern that will still read clearly on a real 128x64 HUB75 LED matrix, not only on a high-resolution screen.`;

const getConvertPrompt = (code: string) => `Convert the following JavaScript LED pattern into one complete Arduino-compatible C++ header for the Patternflow ESP32-S3 firmware.

Output rules:
- Put the complete header in one single code block labeled \`cpp\`.
- Do not write any text before or after the code block.
- The code block content itself must start with \`#pragma once\`.
- The code block content itself must end with the namespace closing brace comment, for example \`} // namespace ExamplePattern\`.
- Do not include nested triple backticks inside the code block.
- Do not output explanations, registry edits, .ino edits, mock declarations, placeholder comments, or separate .cpp files.
- Do not include stray HTML/XML-like tokens such as \`</Arduino.h>\`.
- The file will be copied directly into \`firmware/patternflow/\`.

Required header structure:
- Start with \`#pragma once\`.
- Use only these includes:
  \`#include <Arduino.h>\`
  \`#include <math.h>\`
  \`#include <stdint.h>\`
  \`#include "config.h"\`
  \`#include "core_display.h"\`
  \`#include "core_encoders.h"\`
- Do not use \`<algorithm>\`, \`<cmath>\`, \`<cstdint>\`, \`std::clamp\`, \`std::round\`, \`std::vector\`, \`std::string\`, dynamic allocation, exceptions, file IO, external libraries, or placeholder declarations like \`extern Display*\` or mock \`InputFrame\`.
- Use Arduino/math functions: \`constrain()\`, \`roundf()\`, \`sinf()\`, \`cosf()\`, \`floorf()\`, \`fmodf()\`, \`powf()\`.
- Use \`PANEL_RES_W\` and \`PANEL_RES_H\`; never hardcode 128 or 64.
- Avoid names that may collide with macros from \`config.h\`, such as \`MAX_HUE\`, \`MAX_SPEED\`, \`SPEED_STEP\`, \`MAX_FREQ\`, or \`FREQ_STEP\`.
- Prefix all pattern constants with the uppercase pattern name, for example \`VECTOR_FIELD_SPEED_STEP\`, not \`SPEED_STEP\`.

ESP32 optimization:
- If the JavaScript pattern has HIGH ESP32 cost, do not translate expensive pixel-loop math literally.
- Avoid \`sinf()\`, \`cosf()\`, \`powf()\`, \`sqrtf()\`, and \`atan2f()\` inside the inner pixel loop when possible.
- For repeated sine/cosine, build a small sine lookup table in \`setup()\` and use \`fastSin()\` / \`fastCos()\`.
- Replace \`pow(x, 2.0)\` with \`x * x\`; replace non-integer \`pow()\` with a cheap polynomial approximation when visual fidelity allows.
- Replace \`sqrt(x*x + y*y)\` with an approximate length such as \`max(abs(x), abs(y)) + min(abs(x), abs(y)) * 0.375f\` when exact distance is not essential.
- Precompute coordinate arrays such as normalized x/y values in \`setup()\`.
- Precompute row-only and column-only warp terms once per frame outside the inner pixel loop.
- Preserve the visual structure, but prefer a faster approximation over a literal slow translation.

Required namespace interface:
- Choose a stable PascalCase namespace ending in \`Pattern\`.
- Inside the namespace, define:
  \`const char* NAME = "Short Display Name";\`
  \`const char* const KNOB_LABELS[4] = {"KNOB 1", "KNOB 2", "KNOB 3", "KNOB 4"};\`
  \`struct Params { ... };\`
  one global \`Params params;\`
  \`void setup();\`
  \`void update(float dt, const InputFrame& input);\`
  \`void draw();\`
- \`draw()\` must write pixels with \`dma_display->drawPixelRGB888(x, y, r, g, b)\`.

Conversion fidelity:
- Preserve the JavaScript pattern's setup defaults exactly unless a value would break Arduino compilation.
- Preserve parameter ranges, formulas, color logic, and animation timing from the JavaScript preview.
- If the JavaScript uses \`input.knobValues[i]\`, treat those as absolute target parameter values. In C++, maintain equivalent target params and update them from encoder deltas using Patternflow's calibrated hardware steps unless the JavaScript clearly defines another scale.
- If the JavaScript uses \`input.knobNormalized[i]\`, do not store that normalized value directly as the firmware knob state. First maintain the same raw knob state as the web preview, then compute normalized values from that raw state.
- Do not collapse absolute JavaScript knob ranges back to 0.0-1.0. Preserve ranges such as 0.2-8.0, 4-24, or -2.0-2.0 as named min/max constants.
- Do not invent different defaults such as changing \`turbScale = 0.05\` to \`0.15\`.
- Treat the JavaScript code as the source of truth. Make only the minimal changes needed for Arduino compatibility, safe brightness, and Patternflow's required namespace interface.

Knob mapping:
- JavaScript preview code is knobValues-first, but firmware receives encoder deltas. Convert absolute \`input.knobValues\` mappings into firmware params by storing the current target value and adding \`input.knobDeltas[i] * STEP\`.
- Match the web preview's raw logical knob state exactly:
  - knob 1 raw range \`0.0f..1.0f\`, wrap, \`STEP = 0.05f\`.
  - knob 2 raw range \`0.1f..10.0f\`, clamp, \`STEP = 0.10f\`.
  - knob 3 raw range \`0.0f..4.9f\`, clamp, \`STEP = 0.05f\`.
  - knob 4 raw range \`0.0f..1.0f\`, wrap, \`STEP = 0.05f\`.
- If the JavaScript reads \`input.knobNormalized[i]\`, compute it in C++ from the raw state above: \`(raw - min) / (max - min)\`, with wrap/clamp behavior matching the web.
- Preserve named min/max constants as clamps and UI intent, but do not automatically use \`(MAX - MIN) / 20.0f\` unless the JavaScript clearly intends one turn to sweep the entire range.
- Put named min/max/step constants near the top of the namespace, for example \`const float VECTOR_FIELD_SCALE_MIN = 4.0f;\`, \`VECTOR_FIELD_SCALE_MAX = 24.0f;\`, and \`VECTOR_FIELD_SCALE_STEP = 0.05f;\`.
- Do not make one detent jump across a whole parameter range.

Brightness:
- Generate bright output suitable for a real HUB75 LED matrix, not a dim screen-only preview.
- At least some pixels should regularly reach near-full intensity, around 230-255 in one or more RGB channels.
- Do not cap final brightness below 0.9 unless the pattern intentionally has dark contrast.
- Prefer \`float val = constrain(base + signal * gain, 0.0f, 1.0f);\` with a small base brightness and enough gain to use the full 0-255 range.
- If the JavaScript preview is dim because it uses values like \`pow(v, 2.0)\` followed by \`v * 0.9\`, preserve the visual formula but raise output safely with a small base and gain, for example \`constrain(0.12f + v * 1.35f, 0.0f, 1.0f)\`.

Here is the JavaScript code to convert:

${code}`;


type EspWebInstallButtonProps = {
  children: React.ReactNode;
  manifest: string;
};

const EspWebInstallButton = 'esp-web-install-button' as unknown as React.ElementType<EspWebInstallButtonProps>;

interface PatternPanelProps {
  content: SectionContent;
}

type BuiltInPatternId = 'patternFlowOriginal' | 'patternWaveSaw';
type PatternMode = 'flash' | 'create';

interface PresetPattern {
  id: BuiltInPatternId;
  name: string;
  desc: string;
  link?: { label: string; href: string };
  values: { c1: number; c2: number; c3: number; c4: number };
}

const presetPatterns: PresetPattern[] = [
  {
    id: 'patternFlowOriginal',
    name: 'Origin',
    desc: 'Radial sine waves inside tiled grids, with a hue-mapped color ramp.',
    link: { label: 'View original source', href: 'https://origin.patternflow.work' },
    values: { c1: 0.00, c2: 2.00, c3: 0.06, c4: 0.00 },
  },
  {
    id: 'patternWaveSaw',
    name: 'Wave Saw',
    desc: 'Directional saw-tooth wave bands with a 3-step constant color ramp.',
    values: { c1: 0.00, c2: 3.00, c3: 0.15, c4: 0.00 },
  },
];



const costClassByLevel = {
  LOW: styles.costLow,
  MEDIUM: styles.costMedium,
  HIGH: styles.costHigh,
} as const;

const EDITOR_LINE_HEIGHT = 20;
const EDITOR_VERTICAL_CHROME = 24;
const EDITOR_MIN_HEIGHT = 400;
const INSTAGRAM_URL = 'https://www.instagram.com/patternflow.work/';

export default function PatternPanel({ content }: PatternPanelProps) {
  const [mode, setMode] = useState<PatternMode>('flash');
  const activePatternId = useAppStore(state => state.activePatternId);
  const customJsCode = useAppStore(state => state.customJsCode);
  const setCustomJsCode = useAppStore(state => state.setCustomJsCode);
  const esp32Cost = analyzeEsp32Cost(customJsCode);
  const editorLineCount = Math.max(1, customJsCode.split('\n').length);
  const editorHeight = Math.max(
    EDITOR_MIN_HEIGHT,
    editorLineCount * EDITOR_LINE_HEIGHT + EDITOR_VERTICAL_CHROME,
  );

  const selectBuiltInPattern = (pattern: PresetPattern, track = true) => {
    const store = useAppStore.getState();
    store.setActivePatternId(pattern.id);
    store.setKnobValue('c1', pattern.values.c1);
    store.setKnobValue('c2', pattern.values.c2);
    store.setKnobValue('c3', pattern.values.c3);
    store.setKnobValue('c4', pattern.values.c4);

    if (track) {
      captureEvent('pattern_preset_selected', {
        pattern_id: pattern.id,
        pattern_name: pattern.name,
        surface: 'pattern_panel',
      });
    }
  };

  const handleModeChange = (nextMode: PatternMode) => {
    if (nextMode === 'create' && mode !== 'create') {
      captureEvent('live_editor_opened', {
        surface: 'pattern_panel',
      });
    }

    setMode(nextMode);
    if (nextMode === 'create') {
      useAppStore.getState().setActivePatternId('custom');
      return;
    }

    const currentPreset = presetPatterns.find((pattern) => pattern.id === activePatternId);
    selectBuiltInPattern(currentPreset ?? presetPatterns[0], false);
  };
  
  const handleCopyCreatePrompt = () => {
    navigator.clipboard.writeText(createPrompt);
    captureEvent('copy_creation_prompt_clicked', {
      surface: 'live_editor',
    });
    alert('AI Prompt copied to clipboard! Paste it in ChatGPT/Claude to generate a pattern.');
  };

  const handleCopyConvertPrompt = () => {
    navigator.clipboard.writeText(getConvertPrompt(customJsCode));
    captureEvent('copy_cpp_prompt_clicked', {
      esp32_cost_level: esp32Cost.level,
      esp32_cost_score: esp32Cost.score,
      surface: 'live_editor',
    });
    alert('C++ Conversion Prompt copied to clipboard! Paste it in ChatGPT/Claude to get your ESP32 C++ code.');
  };

  return (
    <div className="panel-content pf-section-panel" id="pattern">
      <div className="panel-header">
        <h2 className="pf-h2">{content.title}</h2>
        <p className="pf-sub">{content.subtitle}</p>
      </div>
      <div className="panel-body">
        {content.meta && content.meta.length > 0 && (
          <div className={`pf-block ${styles.metaRows}`}>
            <span className="pf-kicker">Details</span>
            {content.meta.map((item, idx) => (
              <div key={idx} className="pf-row">
                <span className="pf-ghost">{String(idx + 1).padStart(2, '0')}</span>
                <div className="pf-row-t">{item.value}</div>
                <div className="pf-row-d">{item.label}</div>
              </div>
            ))}
          </div>
        )}
        
        {content.content.trim().length > 0 && (
          <div className={`prose ${styles.introCopy}`}>
            <ReactMarkdown>{content.content}</ReactMarkdown>
          </div>
        )}

        <Script
          type="module"
          src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"
          strategy="lazyOnload"
        />

        <div className={styles.workspace}>
          <div className={styles.modeSwitch} role="tablist" aria-label="Pattern workflows">
            <button
              type="button"
              className={mode === 'flash' ? styles.active : ''}
              onClick={() => handleModeChange('flash')}
            >
              Flash presets
            </button>
            <button
              type="button"
              className={mode === 'create' ? styles.active : ''}
              onClick={() => handleModeChange('create')}
            >
              Live Editor
            </button>
          </div>

          {mode === 'flash' && (
            <div>
              <div className={styles.block}>
                <div className={styles.lead}>
                  <p className={styles.flashDesktopCopy}>
                    Connect Patternflow over USB, then click the button to flash the current firmware from the browser.
                  </p>
                  <p className={styles.flashMobileCopy}>
                    Browser flashing is available on desktop Chrome or Edge. On mobile, preview the built-in patterns below.
                  </p>
                </div>

                <div className={styles.flashAction}>
                  <EspWebInstallButton manifest="/flash/manifest.json">
                    <button
                      slot="activate"
                      className={styles.primaryAction}
                      onClick={() => captureEvent('flash_patternflow_clicked', {
                        manifest: '/flash/manifest.json',
                        surface: 'pattern_panel',
                      })}
                    >
                      Flash Patternflow
                    </button>
                    <div slot="unsupported" className={styles.unsupported}>
                      Browser flashing works in desktop Chrome or Edge.
                    </div>
                  </EspWebInstallButton>
                </div>
              </div>

              <div className={styles.block}>
                <p className={styles.previewNote}>
                  Pick a preset below to change the 3D preview.
                </p>

                <div className={styles.presetList} aria-label="Preset patterns">
                  {presetPatterns.map((pattern, idx) => (
                    <button
                      key={pattern.id}
                      type="button"
                      className={activePatternId === pattern.id ? `${styles.presetItem} ${styles.active}` : styles.presetItem}
                      onClick={() => selectBuiltInPattern(pattern)}
                    >
                      <span className={styles.presetIndex}>{idx + 1}</span>
                      <span className={styles.presetName}>
                        {pattern.name}
                        {pattern.link && (
                          <a
                            className={styles.presetLink}
                            href={pattern.link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {pattern.link.label} ↗
                          </a>
                        )}
                      </span>
                      <span className={styles.presetDesc}>{pattern.desc}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === 'create' && (
            <div className={styles.liveEditor}>
              <div className={styles.editorHeader}>
                <div>
                  <span className={styles.editorTitle}>JavaScript Pattern Editor</span>
                  <div className={`${styles.costMeter} ${costClassByLevel[esp32Cost.level]}`}>
                    ESP32 cost: {esp32Cost.level} · score {esp32Cost.score} · per pixel: trig {esp32Cost.perPixel.trig}, pow {esp32Cost.perPixel.pow}, sqrt {esp32Cost.perPixel.sqrt}, atan2 {esp32Cost.perPixel.atan2}
                  </div>
                </div>
                <div className={styles.editorActions}>
                  <button type="button" onClick={handleCopyCreatePrompt}>
                    Copy creation prompt
                  </button>
                  <button type="button" className={styles.dark} onClick={handleCopyConvertPrompt}>
                    Copy C++ prompt
                  </button>
                </div>
              </div>
              <Editor
                height={editorHeight}
                defaultLanguage="javascript"
                theme="vs-dark"
                value={customJsCode}
                onChange={(val) => setCustomJsCode(val || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineHeight: EDITOR_LINE_HEIGHT,
                  scrollBeyondLastLine: false,
                  scrollbar: {
                    vertical: 'hidden',
                    horizontal: 'auto',
                    handleMouseWheel: false,
                  },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  automaticLayout: true,
                }}
              />
              <div className={styles.editorFootnote}>
                <strong>Estimate:</strong>{' '}
                per frame: trig {esp32Cost.perFrame.trig.toLocaleString()}, pow {esp32Cost.perFrame.pow.toLocaleString()}, sqrt {esp32Cost.perFrame.sqrt.toLocaleString()}, atan2 {esp32Cost.perFrame.atan2.toLocaleString()}.{' '}
                {esp32Cost.notes.join(' ')}
              </div>
              <div className={styles.sourceRow}>
                <div className={styles.applyGuide}>
                  <h3>Use it on hardware</h3>
                  <ol>
                    <li>Download the firmware source and open it in Arduino IDE.</li>
                    <li>Add your generated pattern header to <code>firmware/patternflow</code>.</li>
                    <li>Add the pattern namespace to <code>pattern_registry.h</code>.</li>
                    <li>Upload the sketch to your ESP32-S3.</li>
                  </ol>
                  <p>
                    Want to share a pattern? Send it through Discord, GitHub, or{' '}
                    <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
                      Instagram DM
                    </a>
                    .
                  </p>
                  <div className={styles.applyLinks}>
                    <a href="https://github.com/engmung/PatternFlow/tree/main/firmware" className={styles.secondaryLink}>
                      Firmware source
                    </a>
                    <a href="https://discord.gg/Vr9QtsxeTk" className={styles.secondaryLink}>
                      Discord
                    </a>
                    <a href="https://github.com/engmung/PatternFlow/issues" className={styles.secondaryLink}>
                      GitHub issues
                    </a>
                  </div>
                  <div className={styles.toolLinks}>
                    <span className={styles.toolLabel}>Pattern tools</span>
                    <Link href="/pattern-lab" className={styles.toolLink}>
                      Pattern Lab
                    </Link>
                    <Link href="/video-baker" className={styles.toolLink}>
                      Video Baker
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {content.cta && (
          <div className="pf-block">
            <span className="pf-kicker">Links</span>
            <div className={styles.ctaLinks}>
            {content.cta.primary && (
              <a href={content.cta.primary.href} className="pf-link">
                {content.cta.primary.label}
              </a>
            )}
            {content.cta.secondary && (
              <a href={content.cta.secondary.href} className="pf-link">
                {content.cta.secondary.label}
              </a>
            )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
