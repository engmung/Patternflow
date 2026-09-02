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
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';
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

// Patterns in the Basics pack, which a freshly flashed board installs in one
// click from the community's decks shelf. Keep in sync with
// web/public/packs/basics.json.
//
// This used to be the count of presets baked into the image, and said 34 long
// after the firmware kept only Origin — which read as a promise the flash did
// not deliver, and got filed as a bug. The image ships one pattern on purpose
// now; the rest arrive as modules.
const NUM_BASICS_PATTERNS = 33;

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

  // The 42-cell number wall is folded away by default — it was the loudest
  // thing in the panel and said nothing about which preset you were on.
  const [showAllPresets, setShowAllPresets] = useState(false);
  const activePreset = activePresetIndex >= 0 ? showcasePresets[activePresetIndex] : null;

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
          {/* No tab bar: two of its three cells navigated to other pages, so it
              promised tabs and delivered links. The editor is this panel, and
              the way out is one block below it. */}
          <div className={styles.liveEditor}>
              {/* Which preset you are on, by name — the numbered wall said
                  nothing about that and is folded behind "All 42" now. */}
              <div className={styles.presetBar} aria-label="Live editor presets">
                <button type="button" onClick={() => handleStepPreset(-1)} aria-label="Previous preset">
                  ‹
                </button>
                <div className={styles.presetNow}>
                  <span className={styles.presetIndex}>
                    {String(activePresetIndex >= 0 ? activePresetIndex + 1 : 0).padStart(2, '0')} / {showcasePresets.length}
                  </span>
                  <span className={styles.presetName}>{activePreset?.name ?? 'Custom'}</span>
                  {/* The one accent in this panel: it means "this is what the
                      preview is running right now", not decoration. */}
                  <span className={styles.presetLive}>on the device</span>
                </div>
                <button type="button" onClick={() => handleStepPreset(1)} aria-label="Next preset">
                  ›
                </button>
                <button type="button" onClick={handleRandomPreset} aria-label="Random preset" title="Random preset">
                  Random
                </button>
                <button
                  type="button"
                  aria-expanded={showAllPresets}
                  onClick={() => setShowAllPresets((open) => !open)}
                >
                  All {showcasePresets.length}
                </button>
              </div>
              {showAllPresets && (
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
              )}
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
              {/* The four numbered steps collapsed to this: what the editor is
                  for, and the one button that belongs next to it. Everything
                  about hardware moved to its own block below. */}
              <div className={styles.editorFoot}>
                <span>
                  Paste AI-generated code here, or edit the preset. The preview updates as
                  you type.
                </span>
                <button type="button" onClick={handleCopyVariantPrompt}>
                  Copy creation prompt
                </button>
              </div>
          </div>

          {/* Two branches, one row: where the pattern goes, and what to do if
              you already own a board. Previously the exits were scattered
              across the tab bar, these cards, and a trailing paragraph. */}
          <div className={styles.branches}>
            <div className={styles.nextSteps} aria-label="Next steps">
              <span className="pf-kicker">Where it goes next</span>
              <Link href="/pattern-lab" className={styles.nextCard}>
                <span className={styles.nextKicker}>01</span>
                <h3>Pattern Lab ↗</h3>
                <p>The full studio — batch generation, color ramps, and ESP32 C++ compile.</p>
              </Link>
              <Link href={communityHref()} className={styles.nextCard}>
                <span className={styles.nextKicker}>02</span>
                <h3>Community ↗</h3>
                <p>Share what you make, fork what everyone else made.</p>
              </Link>
              <p className={styles.advancedNote}>
                The build server compiles your pattern into firmware in the browser. The{' '}
                <a
                  href="https://github.com/engmung/Patternflow/blob/main/firmware/README.md"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Arduino IDE
                </a>{' '}
                is only for new firmware features or a different matrix size.
              </p>
            </div>

            <div className={styles.hardwareBlock}>
              <span className="pf-kicker">Got the hardware?</span>
              <strong className={styles.hardwareTitle}>Do this once</strong>
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
              {/* Kept to one line. A first install can go wrong at the port,
                  at the pattern count and at Wi-Fi, but a note under a button
                  is the wrong place to answer all three — the guide holds it,
                  and the link is how you get there. */}
              <p className={styles.hardwareNote}>
                Plug the ESP32-S3 into the <b>left</b> USB-C port. Sets up Wi-Fi and boots into
                Origin, then{' '}
                <a href="https://community.patternflow.work/community/decks">the Basics pack</a>{' '}
                adds {NUM_BASICS_PATTERNS} more in one click.
              </p>
              <p className={styles.hardwareNote}>
                <a
                  href="https://github.com/engmung/Patternflow/blob/main/BUILD_GUIDE.md#8-firmware"
                  target="_blank"
                  rel="noreferrer"
                >
                  Flashing guide ↗
                </a>{' '}
                for the steps, the port, and what to do if the board doesn&rsquo;t show up.
              </p>
              <span className={styles.hardwareReq}>Chrome / Edge only</span>
            </div>
          </div>
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
