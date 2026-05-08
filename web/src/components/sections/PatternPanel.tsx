import { useEffect, useState } from 'react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import { SectionContent } from '@/lib/content';
import PretextText from '../ui/PretextText';
import Script from 'next/script';
import { useAppStore } from '@/store/useAppStore';
import Editor from '@monaco-editor/react';
import { analyzeEsp32Cost } from '@/lib/esp32CostAnalyzer';

const createPrompt = `I am writing a custom LED pattern in JavaScript for Patternflow's 128x64 LED matrix web preview.

Output rules:
- Put the complete JavaScript pattern in one single code block labeled \`javascript\`.
- Do not write any text before or after the code block.
- Do not include nested triple backticks inside the code block.
- The code block must contain only executable JavaScript for the Patternflow live editor.

Required API:
- \`export function setup(params) {}\`
- \`export function update(dt, input, params) {}\` where \`input.knobDeltas\` is an array of 4 hardware-like rotary encoder click deltas (Hue, Speed, Mode, Freq). One physical knob detent is about 1.0. A full knob turn is about 20.0.
- \`export function draw(display, params, time) {}\` where \`display.setPixel(x, y, r, g, b)\` draws a pixel.
- Use \`display.width\` and \`display.height\` in loops. Do not hardcode 128 or 64 inside \`draw()\`.
- Use only plain JavaScript and \`Math.*\`. Do not use browser APIs, DOM APIs, arrays that grow every frame, async code, imports, external libraries, or dynamic code evaluation.
- Include small helper functions such as \`hsvToRgb()\` or \`clamp()\` if needed.

Knob behavior:
- Knob 1 should control hue or palette.
- Knob 2 should control animation speed.
- Knob 3 should control mode, shape, scale, or density.
- Knob 4 should control frequency, phase, distortion, or detail.
- Use gentle knob sensitivity so one detent makes a small, controllable change.
- It should take at least 20 detents to sweep a major parameter across its expressive range.

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
- The file will be copied directly into \`firmware/patternflow_v1/\`.

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
  \`const char* const KNOB_LABELS[4] = {"HUE", "SPEED", "MODE", "FREQ"};\`
  \`struct Params { ... };\`
  one global \`Params params;\`
  \`void setup();\`
  \`void update(float dt, const InputFrame& input);\`
  \`void draw();\`
- \`draw()\` must write pixels with \`dma_display->drawPixelRGB888(x, y, r, g, b)\`.

Conversion fidelity:
- Preserve the JavaScript pattern's setup defaults exactly unless a value would break Arduino compilation.
- Preserve parameter ranges, knob step sizes, formulas, color logic, and animation timing from the JavaScript preview.
- Do not invent different defaults such as changing \`turbScale = 0.05\` to \`0.15\`.
- Treat the JavaScript code as the source of truth. Make only the minimal changes needed for Arduino compatibility, safe brightness, and Patternflow's required namespace interface.

Knob sensitivity:
- Keep the same knob sensitivity as the JavaScript preview.
- One \`input.knobDeltas[i]\` unit equals one physical encoder detent.
- A full knob turn is about 20 detents.
- Do not make one detent jump across a whole parameter range. It should take at least 20 detents to sweep a major parameter across its expressive range.
- Put named step constants near the top of the namespace, for example \`const float VECTOR_FIELD_HUE_STEP = 0.02f;\`, and use them in \`update()\`.

Brightness:
- Generate bright output suitable for a real HUB75 LED matrix, not a dim screen-only preview.
- At least some pixels should regularly reach near-full intensity, around 230-255 in one or more RGB channels.
- Do not cap final brightness below 0.9 unless the pattern intentionally has dark contrast.
- Prefer \`float val = constrain(base + signal * gain, 0.0f, 1.0f);\` with a small base brightness and enough gain to use the full 0-255 range.
- If the JavaScript preview is dim because it uses values like \`pow(v, 2.0)\` followed by \`v * 0.9\`, preserve the visual formula but raise output safely with a small base and gain, for example \`constrain(0.12f + v * 1.35f, 0.0f, 1.0f)\`.

Here is the JavaScript code to convert:

${code}`;


// Type bypass for Web Component
const EspWebInstallButton = 'esp-web-install-button' as any;

interface PatternPanelProps {
  content: SectionContent;
}

export default function PatternPanel({ content }: PatternPanelProps) {
  const [isMobile, setIsMobile] = useState(false);
  const activePatternId = useAppStore(state => state.activePatternId);
  const customJsCode = useAppStore(state => state.customJsCode);
  const setCustomJsCode = useAppStore(state => state.setCustomJsCode);
  const esp32Cost = analyzeEsp32Cost(customJsCode);
  
  const handleCopyCreatePrompt = () => {
    navigator.clipboard.writeText(createPrompt);
    alert('AI Prompt copied to clipboard! Paste it in ChatGPT/Claude to generate a pattern.');
  };

  const handleCopyConvertPrompt = () => {
    navigator.clipboard.writeText(getConvertPrompt(customJsCode));
    alert('C++ Conversion Prompt copied to clipboard! Paste it in ChatGPT/Claude to get your ESP32 C++ code.');
  };

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return (
    <div className="panel-content" id="pattern">
      <div className="panel-header">
        <h2>
          <PretextText 
            text={content.title} 
            font={isMobile ? "500 42px Inter, ui-sans-serif, system-ui, sans-serif" : "500 64px Inter, ui-sans-serif, system-ui, sans-serif"} 
            lineHeight={isMobile ? 42 : 64} 
            letterSpacing={isMobile ? -1.5 : -2.24} 
            delayOffset={0.2}
          />
        </h2>
        <div className="sub">
          <PretextText 
            text={content.subtitle} 
            font={isMobile ? "400 16px Inter, ui-sans-serif, system-ui, sans-serif" : "400 20px Inter, ui-sans-serif, system-ui, sans-serif"} 
            lineHeight={isMobile ? 24 : 29} 
            delayOffset={0.4}
          />
        </div>
      </div>
      <div className="panel-body">
        {content.meta && content.meta.length > 0 && (
          <div className="meta-row" style={{ display: 'flex', gap: '2rem', marginBottom: '2rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
            {content.meta.map((item, idx) => (
              <div key={idx} className="meta-item">
                <div style={{ fontSize: '12px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                <div style={{ fontSize: '16px', fontWeight: 500 }}>{item.value}</div>
              </div>
            ))}
          </div>
        )}
        
        <div className="prose" style={{ marginTop: '2rem', marginBottom: '3rem', fontSize: '16px', lineHeight: '1.6', color: '#333' }}>
          <ReactMarkdown>{content.content}</ReactMarkdown>
        </div>

        <Script
          type="module"
          src="https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module"
          strategy="lazyOnload"
        />

        <div className="flash-row" style={{ marginTop: '2rem', marginBottom: '3rem' }}>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '1.25rem', lineHeight: '1.5' }}>
            Connect your device via USB to flash the firmware directly from your browser.<br />
            Select a pattern to preview it in the 3D simulator.
          </p>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '2rem' }}>
            <button 
              onClick={() => useAppStore.getState().setActivePatternId('patternFlowOriginal')}
              style={{ padding: '0.5rem 1rem', background: activePatternId === 'patternFlowOriginal' ? '#000' : '#f0f0f0', color: activePatternId === 'patternFlowOriginal' ? '#fff' : '#000', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
            >
              Preview: Origin
            </button>
            <button 
              onClick={() => useAppStore.getState().setActivePatternId('patternWaveSaw')}
              style={{ padding: '0.5rem 1rem', background: activePatternId === 'patternWaveSaw' ? '#000' : '#f0f0f0', color: activePatternId === 'patternWaveSaw' ? '#fff' : '#000', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}
            >
              Preview: Wave
            </button>
            <button 
              onClick={() => useAppStore.getState().setActivePatternId('custom')}
              style={{ padding: '0.5rem 1rem', background: activePatternId === 'custom' ? '#000' : '#f0f0f0', color: activePatternId === 'custom' ? '#fff' : '#000', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '14px', fontWeight: 'bold' }}
            >
              Live Editor
            </button>
          </div>

          {activePatternId === 'custom' && (
            <div className="live-editor-container" style={{ marginBottom: '2rem', border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden' }}>
              <div style={{ padding: '0.75rem 1rem', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>JavaScript Pattern Editor (ESP32 Parity)</span>
                  <div style={{ marginTop: '0.25rem', fontSize: '11px', color: esp32Cost.level === 'HIGH' ? '#b00020' : esp32Cost.level === 'MEDIUM' ? '#8a5a00' : '#26733a', fontFamily: 'var(--mono)' }}>
                    ESP32 cost: {esp32Cost.level} · score {esp32Cost.score} · per pixel: trig {esp32Cost.perPixel.trig}, pow {esp32Cost.perPixel.pow}, sqrt {esp32Cost.perPixel.sqrt}, atan2 {esp32Cost.perPixel.atan2}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={handleCopyCreatePrompt} style={{ padding: '0.4rem 0.8rem', background: '#fff', border: '1px solid #ccc', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
                    1. Copy AI Prompt for Creation
                  </button>
                  <button onClick={handleCopyConvertPrompt} style={{ padding: '0.4rem 0.8rem', background: '#000', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '12px', cursor: 'pointer' }}>
                    2. Copy AI Prompt for C++
                  </button>
                </div>
              </div>
              <Editor
                height="400px"
                defaultLanguage="javascript"
                theme="vs-dark"
                value={customJsCode}
                onChange={(val) => setCustomJsCode(val || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  scrollBeyondLastLine: false,
                }}
              />
              <div style={{ padding: '0.65rem 1rem', background: '#fafafa', borderTop: '1px solid #ddd', fontSize: '12px', color: '#666', lineHeight: 1.5 }}>
                <strong style={{ color: '#333' }}>ESP32 estimate:</strong>{' '}
                per frame: trig {esp32Cost.perFrame.trig.toLocaleString()}, pow {esp32Cost.perFrame.pow.toLocaleString()}, sqrt {esp32Cost.perFrame.sqrt.toLocaleString()}, atan2 {esp32Cost.perFrame.atan2.toLocaleString()}.{' '}
                {esp32Cost.notes.join(' ')}
              </div>
            </div>
          )}
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            <div className="flash-item">
              <EspWebInstallButton manifest="/flash/manifest.json">
                <button slot="activate" className="btn-primary" style={{ padding: '0.75rem 1.5rem', background: '#000', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontWeight: 500, cursor: 'pointer', border: 'none' }}>
                  Flash Patternflow v1 (All Patterns)
                </button>
                <div slot="unsupported" style={{ marginTop: '0.5rem', fontSize: '12px', color: '#666' }}>
                  Desktop Chrome/Edge only.
                </div>
              </EspWebInstallButton>
            </div>
          </div>

          <div style={{ marginTop: '1.5rem', fontSize: '12px', color: '#999' }}>
            * Requires HTTPS environment.
          </div>
        </div>

        {content.cta && (
          <div className="cta-row" style={{ display: 'flex', gap: '1rem', marginTop: '3rem', marginBottom: '10vh' }}>
            {content.cta.primary && (
              <a href={content.cta.primary.href} className="btn-primary" style={{ padding: '0.75rem 1.5rem', background: '#000', color: '#fff', borderRadius: '4px', textDecoration: 'none', fontWeight: 500 }}>
                {content.cta.primary.label}
              </a>
            )}
            {content.cta.secondary && (
              <a href={content.cta.secondary.href} className="btn-secondary" style={{ padding: '0.75rem 1.5rem', background: '#f5f5f5', color: '#000', borderRadius: '4px', textDecoration: 'none', fontWeight: 500 }}>
                {content.cta.secondary.label}
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
