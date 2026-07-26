import { useEffect, useState } from 'react';
import React from 'react';
import ReactMarkdown from 'react-markdown';
import Link from 'next/link';
import { SectionContent } from '@/lib/content';
import Script from 'next/script';
import { useAppStore } from '@/store/useAppStore';
import Editor from '@monaco-editor/react';
import { showcasePresets } from '@/lib/presets';
import { captureEvent } from '@/lib/posthogEvents';
import { communityHref } from '@/lib/community/apiBase';
import { useMediaQuery } from '@/lib/useMediaQuery';
import styles from './PatternPanel.module.css';

const getVariantPrompt = (code: string) => `I am writing custom LED patterns in JavaScript for Patternflow's 128x64 LED matrix web preview.

I will give you one existing Patternflow pattern. Use it as a seed, not as a cage. Create exactly 5 distinct standalone variations that explore different visual directions.

Very important output rules:
- Return exactly 5 separate JavaScript code blocks.
- Each code block must be a complete standalone Patternflow pattern.
- Do not combine the 5 variations into one file.
- Do not add a mode selector, preset array, switch statement, or any code that contains multiple patterns in one output.
- Do not write wrapper text inside the code blocks.
- Put a short variation name before each code block.
- Do not include nested triple backticks inside any code block.

Required API for every variation:
- export function setup(params) {}
- export function update(dt, input, params) {}
- export function draw(display, params, time) {}
- Use input.knobValues as the primary control API. input.knobValues is an array of 4 absolute knob values after the min/max ranges are applied.
- input.knobNormalized is also available when a 0.0-1.0 value is useful.
- Keep input.knobDeltas only as compatibility fallback if needed.
- Use display.width and display.height in loops. Do not hardcode 128 or 64 inside draw().
- Use only plain JavaScript and Math.*. No browser APIs, DOM APIs, imports, async code, external libraries, dynamic evaluation, or per-pixel allocations.

Creative control mapping:
- It is okay to keep one knob as animation speed, preferably Knob 2, if that suits the variation.
- Do not keep all four knobs as the same old hue/speed/mode/frequency template unless it is genuinely the best fit.
- Redesign the other controls creatively for each variation. Examples: cell size, symmetry fold, glitch amount, palette split, trail length, scanline spacing, pulse width, inversion threshold, rotation, warp depth, density, edge thickness, phase offset, bloom-like gain, or motif selection.
- Each of the 5 variations should have a slightly different control personality. The controls should reveal the unique idea of that variation.
- Include a short comment near setup() or update() naming what the 4 knobs do for that specific variation.

Color direction:
- Make color part of the pattern logic, not just a global hue wash.
- Avoid relying on a single full-frame gradient or a uniform hue shift across the whole image.
- Prefer colors that respond to local pattern values: distance fields, cell seeds, stripe index, phase, brightness, threshold bands, motion direction, edge thickness, density, or mask state.
- Good examples: large values become red while small values become blue; interior/exterior use different palettes; threshold bands step through 3-5 colors; cell IDs pick related colors; moving fronts leave warmer highlights; thin edges are white while filled regions are saturated.
- Both smooth local gradients and stepped posterized color bands are welcome, as long as the color changes are tied to the geometry or signal of the pattern.
- Keep at least some pixels near full LED brightness.

Variation direction:
- Keep the general intent and the four control roles understandable, but do not copy the original structure too literally.
- At least 3 of the 5 variations must change the main drawing algorithm, not only constants, colors, thresholds, or speed.
- Avoid making all 5 outputs feel like the same pattern with different parameter values.
- Do not reuse the same grid, shape, distance formula, or composition in every variation.
- Give each variation a different dominant idea. Use these five directions:
  1. Structural remix: change the main geometry or repetition system.
  2. Motion remix: change how time moves through the pattern.
  3. Palette/material remix: change color logic, brightness rhythm, or foreground/background relationship.
  4. Domain remix: warp, mirror, fold, scroll, rotate, or otherwise remap coordinates.
  5. Contrast remix: make a clearly different sparse/dense, hard/soft, or organic/mechanical interpretation.
- The variations can be bold. They should still feel related to the seed, but not trapped inside its exact look.
- Keep the patterns bright enough for an LED matrix and reasonably ESP32-friendly.
- Avoid smoothing/lerping knob-controlled values unless the visual idea specifically needs inertia.

Knob ranges for the Patternflow live editor:
- Knob 1: 0.0 to 1.0, wraps at edges, default step 0.05 per detent.
- Knob 2: 0.1 to 10.0, clamps at edges, default step 0.10 per detent.
- Knob 3: 0.0 to 4.9, clamps at edges, default step 0.05 per detent.
- Knob 4: 0.0 to 1.0, wraps at edges, default step 0.05 per detent.

Existing pattern:
\`\`\`javascript
${code}
\`\`\``;


type EspWebInstallButtonProps = {
  children: React.ReactNode;
  manifest: string;
};

const EspWebInstallButton = 'esp-web-install-button' as unknown as React.ElementType<EspWebInstallButtonProps>;

interface PatternPanelProps {
  content: SectionContent;
}

const EDITOR_LINE_HEIGHT = 20;
// Fixed editor height — most visitors only paste AI-generated code and
// rarely scroll the source themselves, so growing the page with line
// count just pushed the rest of the section out of view. The editor
// now scrolls internally instead.
const EDITOR_HEIGHT = 480;

// Phones show a sliding window of preset numbers around the active one instead
// of the whole library — all 42 would wrap into a wall of rows. Keep in sync
// with the `.presetNumbers` column count in the 720px media query.
const MOBILE_PRESET_WINDOW = 7;

// Curated presets baked into the official flash image — keep in sync with
// presetPatterns[] in firmware/patternflow/pattern_registry.h.
const NUM_FIRMWARE_PRESETS = 34;

export default function PatternPanel({ content }: PatternPanelProps) {
  // Start with Origin selected; the effect below loads it into the editor.
  const [activePresetId, setActivePresetId] = useState<string | null>(() =>
    showcasePresets.some((p) => p.id === 'origin') ? 'origin' : null,
  );
  const customJsCode = useAppStore(state => state.customJsCode);
  const setCustomJsCode = useAppStore(state => state.setCustomJsCode);

  // The Live Editor renders through the 'custom' pattern, so the 3D preview
  // reflects the editor (and loaded presets). Load Origin into the editor
  // (zustand store) once on mount.
  useEffect(() => {
    useAppStore.getState().setActivePatternId('custom');
    const origin = showcasePresets.find((p) => p.id === 'origin');
    if (origin) {
      setCustomJsCode(origin.code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadPreset = (presetId: string) => {
    const preset = showcasePresets.find((p) => p.id === presetId);
    if (!preset) return;
    setCustomJsCode(preset.code);
    setActivePresetId(preset.id);
    // Make sure the 3D preview is showing the editor output, not a flash preset.
    useAppStore.getState().setActivePatternId('custom');
    captureEvent('live_preset_loaded', {
      preset_id: preset.id,
      preset_name: preset.name,
      surface: 'live_editor',
    });
  };

  const activePresetIndex = showcasePresets.findIndex((p) => p.id === activePresetId);

  // Which numbered cells to render: everything on desktop, a window centred on
  // the active preset (clamped at both ends) on phones. Tapping near the edge
  // of the window re-centres it, so the whole library stays reachable.
  const isNarrow = useMediaQuery('(max-width: 720px)');
  const windowStart = isNarrow
    ? Math.max(
        0,
        Math.min(
          (activePresetIndex >= 0 ? activePresetIndex : 0) - Math.floor(MOBILE_PRESET_WINDOW / 2),
          showcasePresets.length - MOBILE_PRESET_WINDOW,
        ),
      )
    : 0;
  const visiblePresets = isNarrow
    ? showcasePresets.slice(windowStart, windowStart + MOBILE_PRESET_WINDOW)
    : showcasePresets;

  const handleStepPreset = (dir: number) => {
    if (showcasePresets.length === 0) return;
    const base = activePresetIndex >= 0 ? activePresetIndex : dir > 0 ? -1 : 0;
    const next = (base + dir + showcasePresets.length) % showcasePresets.length;
    handleLoadPreset(showcasePresets[next].id);
  };

  const handleRandomPreset = () => {
    if (showcasePresets.length === 0) return;
    let nextPreset = showcasePresets[Math.floor(Math.random() * showcasePresets.length)];
    if (activePresetId && showcasePresets.length > 1) {
      while (nextPreset.id === activePresetId) {
        nextPreset = showcasePresets[Math.floor(Math.random() * showcasePresets.length)];
      }
    }
    handleLoadPreset(nextPreset.id);
  };

  const handleCopyVariantPrompt = () => {
    navigator.clipboard.writeText(getVariantPrompt(customJsCode));
    captureEvent('copy_variants_prompt_clicked', {
      surface: 'live_editor',
    });
    alert('Creation prompt copied to clipboard! Paste it in ChatGPT/Claude to get 5 pattern variations.');
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
          {/* The Live Editor is the only in-page workflow now; the other two
              slots are the places it feeds into. Pattern Lab sits where Flash
              presets used to — it's the full studio, so it ranks next to
              Community, and the quick-flash block moved below the editor. */}
          <div className={styles.modeSwitch} aria-label="Pattern tools">
            <button type="button" className={styles.active} aria-current="true">
              Live Editor
            </button>
            <Link href="/pattern-lab" title="Pattern Lab — the full pattern studio">
              Pattern Lab ↗
            </Link>
            {/* Straight to the community host — it runs on its own box, so
                bouncing through this site's /community first would just be an
                extra click. */}
            <Link
              href={communityHref()}
              title="Explore the Patternflow pattern community"
            >
              Community ↗
            </Link>
          </div>

          <div className={styles.liveEditor}>
              {/* Preset numbers FIRST, editor second, how-to steps last. On a
                  phone the bar under the editor was below the fold — people
                  never found the other presets, got stuck dragging inside
                  Monaco, and scrolled away. Trying patterns is the hook, so it
                  leads. */}
              <div className={styles.presetBar} aria-label="Live editor presets">
                <button type="button" onClick={() => handleStepPreset(-1)} aria-label="Previous preset">
                  ‹
                </button>
                {/* Every preset as a numbered cell — jump straight to any of
                    them instead of paging one step at a time. */}
                <div className={styles.presetNumbers} role="group" aria-label="Jump to preset">
                  {visiblePresets.map((preset, i) => {
                    const idx = windowStart + i;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={idx === activePresetIndex ? styles.presetNumActive : undefined}
                        title={preset.name}
                        aria-label={`Preset ${idx + 1}: ${preset.name}`}
                        aria-current={idx === activePresetIndex ? 'true' : undefined}
                        onClick={() => handleLoadPreset(preset.id)}
                      >
                        {idx + 1}
                      </button>
                    );
                  })}
                </div>
                <button type="button" onClick={() => handleStepPreset(1)} aria-label="Next preset">
                  ›
                </button>
                <button type="button" onClick={handleRandomPreset} aria-label="Random preset" title="Random preset">
                  🎲
                </button>
              </div>
              <Editor
                height={EDITOR_HEIGHT}
                defaultLanguage="javascript"
                theme="vs-dark"
                value={customJsCode}
                onChange={(val) => {
                  const next = val || '';
                  setCustomJsCode(next);
                  // Deselect the chip once the code is edited away from the preset.
                  if (activePresetId) {
                    const preset = showcasePresets.find((p) => p.id === activePresetId);
                    if (!preset || preset.code !== next) setActivePresetId(null);
                  }
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  lineHeight: EDITOR_LINE_HEIGHT,
                  scrollBeyondLastLine: false,
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    handleMouseWheel: true,
                  },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  automaticLayout: true,
                }}
              />
              {/* One combined how-to block under the editor: make a pattern
                  (1–2), get it onto hardware via Pattern Lab (3), and the
                  wired first-flash of the official firmware (4). */}
              <div className={styles.editorHeader}>
                <ol className={styles.editorSteps}>
                  <li>
                    <span className={styles.stepText}>Copy the prompt into your AI chatbot, then paste the result into the editor above.</span>
                    <div className={styles.editorActions}>
                      <button type="button" onClick={handleCopyVariantPrompt}>
                        Copy creation prompt
                      </button>
                    </div>
                  </li>
                  <li>
                    <span className={styles.stepText}>Play with it on the preview — tweak the code until it feels right.</span>
                  </li>
                  <li>
                    {/* The C++ prompt button used to live here; the process
                        stays visible, but the conversion itself now happens in
                        Pattern Lab, whose prompt knows about frames and ramps.
                        No button — Pattern Lab is one tab up and one card down. */}
                    <span className={styles.stepText}>
                      Want it on hardware? Open it in Pattern Lab — the full studio — to convert
                      it to ESP32 C++ and build flashable firmware.
                    </span>
                  </li>
                  <li>
                    <span className={styles.stepText}>
                      <strong>Got the hardware? Flash this once, whatever you do</strong> — it
                      also sets up Wi-Fi. Plug the ESP32 in over USB and flash the official
                      firmware — {NUM_FIRMWARE_PRESETS} presets built in — right from the browser.
                      After that your own patterns go wirelessly from Pattern Lab.
                    </span>
                    <div className={styles.editorActions}>
                      <EspWebInstallButton manifest="/flash/manifest.json">
                        <button
                          slot="activate"
                          type="button"
                          className={styles.flashButton}
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
                  </li>
                </ol>
              </div>
          </div>

          {/* Where the editor leads. Two destinations, each carrying its part
              of the roadmap: Pattern Lab is the professional AI editing tool
              and keeps growing as one; Community is the sharing space that
              grows into a marketplace where creators earn. The whole card is
              the link — no inner CTA buttons. (Replaces the old hand-written
              Arduino/Discord guide, which described dead workflows.) */}
          <div className={styles.nextSteps} aria-label="Next steps">
            <Link href="/pattern-lab" className={styles.nextCard}>
              <span className={styles.nextKicker}>The studio</span>
              <h3>Pattern Lab ↗</h3>
              <p>
                A professional editor for composing patterns with AI — generate in batches, shape
                color ramps, tune knobs on custom frames, then compile straight to ESP32 firmware.
                This is where Patternflow&apos;s creation tools keep growing.
              </p>
            </Link>
            <Link href={communityHref()} className={styles.nextCard}>
              <span className={styles.nextKicker}>The ecosystem</span>
              <h3>Community ↗</h3>
              <p>
                Share what you make, explore and fork what everyone else made. It&apos;s growing
                into a marketplace where creators trade patterns and earn inside the Patternflow
                ecosystem.
              </p>
            </Link>
          </div>

          <p className={styles.advancedNote}>
            No Arduino IDE needed for custom patterns anymore — Patternflow&apos;s own build server
            compiles your pattern into firmware and uploads it straight from the browser. The IDE
            route only matters when you&apos;re adding new firmware features or targeting an LED
            matrix with a different resolution; for that, the{' '}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/firmware/README.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              firmware README
            </a>{' '}
            covers setup, wiring, OTA flashing, and color calibration.
          </p>
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
