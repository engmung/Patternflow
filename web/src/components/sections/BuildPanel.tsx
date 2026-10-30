import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAppStore, SectionType } from '@/store/useAppStore';
import { SectionContent } from '@/lib/content';
import { captureEvent } from '@/lib/posthogEvents';
import { preloadCaseModel } from '@/components/3d/preloadCaseModel';
import CasePicker from './CasePicker';
import { BUILD_CASES, findCase, writeCaseToUrl, type BuildFact, type BuildStep, type CaseId } from './build-cases-data';
import styles from './BuildPanel.module.css';

interface BuildPanelProps {
  content: SectionContent;
  isActive: boolean;
}

// The reality check every would-be builder wants before committing. Ordered
// cost → your time → machine time → waiting, so the two numbers the reader is
// actually deciding on come first. Numbers follow the main path (custom PCB +
// the official printed case, see BUILD_GUIDE.md: the BOM in §1 and the time
// at the top). The case switch below changes step 01, not these, unless the
// case is a build of its own (BuildCase.flow), which brings its own.
const FACTS: BuildFact[] = [
  {
    // A range, not the floor. The breakdown below adds up to about $100, and
    // that is the well-sourced, nothing-goes-wrong build — the figure people
    // who have actually built one report is higher. Shipping, minimum order
    // quantities on the small parts, and a reprint or two are the difference,
    // and quoting only the best case makes the project look cheaper than it
    // is to the one person it matters to: whoever is deciding to start.
    value: '$100–200',
    name: 'All parts',
    // Printing, not filament: most people order the case rather than owning a
    // printer, and $30 is what that costs.
    detail:
      'At best: 3D printing ~$30 · panel ~$20 · ESP32-S3 ~$13 · PCB & rest ~$35. Shipping, minimum order quantities and a reprint or two take it up from there.',
  },
  {
    value: '~1 hr',
    name: 'Hands-on',
    detail: '30 min soldering, 30 min assembly. Big through-hole joints — a first time is fine.',
  },
  {
    // BUILD_GUIDE.md and hardware/case/README.md both say ~10 h for the
    // official case on a 256 mm bed, at the 0.2 mm layers they set.
    value: '~10 hr',
    name: 'Printing',
    detail: 'Printer time, not yours, for the official case on a 256 mm bed.',
  },
  {
    value: '~2 wk',
    name: 'Shipping',
    detail: 'Order the parts first — the wait is the longest part.',
  },
];

// Step 01 is replaced by the chosen case's own (build-cases-data.ts); the
// one written here is the official case's. A build of its own replaces all four.
const STEPS: BuildStep[] = [
  {
    id: 1,
    title: 'Print the case',
    desc: 'Print the body in white PLA and the knobs in black.',
  },
  {
    id: 2,
    title: 'Solder the PCB',
    desc: 'Hand-solder the v3.9 board. Every part is through-hole.',
  },
  {
    id: 3,
    title: 'Assemble',
    desc: 'Encoders, matrix, power wiring, and case fit.',
  },
  {
    // BUILD_GUIDE.md §8.1: flash the module off the board, then seat it; power
    // only ever comes in through J4, the screw terminal (§2).
    id: 4,
    title: 'Flash and power on',
    desc: 'Flash the ESP32-S3 from the browser, seat it, then power up through the screw terminal.',
  },
];

// /build?case=<id> opens the panel on that case, so a remix can be linked to
// directly. The official case is the bare /build.
function caseFromUrl(): CaseId | null {
  return findCase(new URLSearchParams(window.location.search).get('case'))?.id ?? null;
}

export default function BuildPanel({ content, isActive }: BuildPanelProps) {
  const setActiveSection = useAppStore((state) => state.setActiveSection);
  const buildStep = useAppStore((state) => state.buildStep);
  const setBuildStep = useAppStore((state) => state.setBuildStep);
  const explode = useAppStore((state) => state.explode);
  const setExplode = useAppStore((state) => state.setExplode);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [lockedStep, setLockedStep] = useState<number | null>(null);
  const [activeTouchStep, setActiveTouchStep] = useState<number | null>(null);
  // The case is the store's, not this panel's: the product preview draws the
  // device in it, on the Pattern tab as well as here, and it has to outlive
  // this panel, which is remounted every time the Build tab is left.
  const buildCase = useAppStore((state) => state.buildCase);
  const setBuildCase = useAppStore((state) => state.setBuildCase);
  const selectedCase = findCase(buildCase) ?? BUILD_CASES[0];
  const flow = selectedCase.flow;
  const facts = flow?.facts ?? FACTS;
  const steps = (flow?.steps ?? STEPS).map((step) => (step.id === 1 ? { ...step, ...selectedCase.step } : step));
  const wasActive = useRef(isActive);

  const handleCaseSelect = (nextId: CaseId, interaction: 'click' | 'key') => {
    setBuildCase(nextId);
    // Only while the panel is the one on screen — it stays mounted, hidden,
    // on the other tabs, and must not write to their URLs.
    if (isActive && window.location.pathname === '/build') writeCaseToUrl(nextId);
    captureEvent('build_case_selected', {
      case_id: nextId,
      interaction,
      surface: 'build_panel',
    });
  };

  // A ?case= link sets the store once the client can read the URL, and again
  // on Back and Forward. In an effect, after hydration: the page is static, so
  // the server's HTML is always the store's default, and the first client
  // render has to match it. A URL that names no case leaves the store alone —
  // it is the URL of every other tab too, and the case a reader picked stays
  // the one they are looking at.
  useEffect(() => {
    const readUrl = () => {
      const id = caseFromUrl();
      if (id) setBuildCase(id);
    };
    readUrl();
    window.addEventListener('popstate', readUrl);
    return () => window.removeEventListener('popstate', readUrl);
  }, [setBuildCase]);

  // The tab button pushes a bare /build, but the store may hold a remix picked
  // before the reader left: put it back in the address bar when the panel
  // comes on screen, so the link still says what the card and the preview
  // show. A URL that does name a case — Back to an earlier /build?case= — is
  // the reader's, and wins; RightPanel's popstate can bring the panel on
  // screen before the listener above has read it.
  useEffect(() => {
    const cameOn = isActive && !wasActive.current;
    wasActive.current = isActive;
    if (!cameOn || window.location.pathname !== '/build') return;
    const named = caseFromUrl();
    if (named) setBuildCase(named);
    else writeCaseToUrl(buildCase);
  }, [isActive, buildCase, setBuildCase]);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 900);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (!isActive || !isMobile || activeTouchStep !== null) return;
    const frame = window.requestAnimationFrame(() => {
      setActiveTouchStep(1);
      setBuildStep(1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTouchStep, isActive, isMobile, setBuildStep]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('data-section') as SectionType;
            if (id) setActiveSection(id);
          }
        });
      },
      { threshold: 0.5 },
    );

    const sections = containerRef.current?.querySelectorAll('[data-section]');
    sections?.forEach((sec) => observer.observe(sec));

    return () => observer.disconnect();
  }, [setActiveSection]);

  const handleStepEnter = (stepId: number) => {
    if (isMobile || lockedStep !== null) return;
    setBuildStep(stepId);
  };

  const handleStepLeave = () => {
    if (isMobile || lockedStep !== null) return;
    setBuildStep(0);
  };

  const handleStepClick = (stepId: number) => {
    const step = steps.find((item) => item.id === stepId);

    if (isMobile) {
      if (activeTouchStep === stepId) {
        setActiveTouchStep(null);
        setBuildStep(0);
        return;
      }
      setActiveTouchStep(stepId);
      setBuildStep(stepId);
      captureEvent('build_step_selected', {
        step_id: stepId,
        step_title: step?.title,
        interaction: 'tap',
        surface: 'build_panel',
      });
      return;
    }

    if (lockedStep === stepId) {
      setLockedStep(null);
      return;
    }

    setLockedStep(stepId);
    setBuildStep(stepId);
    captureEvent('build_step_selected', {
      step_id: stepId,
      step_title: step?.title,
      interaction: 'click',
      surface: 'build_panel',
    });
  };

  return (
    <div className="panel-content pf-section-panel" id="build">
      <div className="panel-header">
        <h1 className="pf-h2">{content.title || 'Build your own.'}</h1>
        <p className="pf-sub">{flow?.subtitle ?? (content.subtitle || 'Print, solder, assemble, flash.')}</p>
      </div>

      <div className={`panel-body ${styles.buildPanel}`} ref={containerRef}>
        {/* Cost and time first: the reader decides whether to build at all
            before they care what the four steps are. */}
        <div className={styles.factsBand}>
          {facts.map((fact) => (
            <div className={styles.factCard} key={fact.name}>
              <span className={styles.factValue}>{fact.value}</span>
              <span className={styles.factName}>{fact.name}</span>
              <span className={styles.factLabel}>{fact.detail}</span>
            </div>
          ))}
        </div>

        {/* Which case comes before the steps: it decides step 01, whether you
            need a printer or a laser cutter at all, and which case the 3D
            preview shows. */}
        <CasePicker
          cases={BUILD_CASES}
          selected={selectedCase}
          onSelect={handleCaseSelect}
          onPrefetch={preloadCaseModel}
          onLinkOpen={(id, target) => captureEvent('build_case_link_opened', {
            case_id: id,
            target,
            surface: 'build_panel',
          })}
          lead={content.content}
        />

        <div className={styles.buildCols}>
        <div className="pf-block" onMouseLeave={handleStepLeave}>
          <span className="pf-kicker">
            {isMobile ? 'Four steps — tap to preview' : 'Four steps — hover to preview on the device'}
          </span>
          <div className={styles.stepList}>
            {steps.map((step) => {
              const isActive = isMobile ? activeTouchStep === step.id : buildStep === step.id;
              const stepIndex = String(step.id).padStart(2, '0');

              return (
                <div
                  key={step.id}
                  role="button"
                  tabIndex={0}
                  className={`pf-row ${styles.stepCard} ${isActive ? 'on' : ''}`}
                  onMouseEnter={() => handleStepEnter(step.id)}
                  onClick={() => handleStepClick(step.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleStepClick(step.id);
                    }
                  }}
                >
                  <span className="pf-ghost">{stepIndex}</span>
                  <div className={styles.stepContent}>
                    <div className={styles.stepHead}>
                      <span className="pf-row-t">{step.title}</span>
                      {/* A slider, not a toggle. The old control was a text
                          link that flipped between two fixed states, so the
                          separation happened *at* you; dragging it puts the
                          device apart in your own hand, which is the claim the
                          whole project makes. Events stop here so a drag does
                          not also re-trigger the row underneath. */}
                      {/* Assemble on the main path; a build of its own draws its
                          sheets apart while they are cut and glued. */}
                      {isActive && (flow ? step.id === 1 || step.id === 2 : step.id === 3) && (
                        <span
                          className={styles.explodeControl}
                          onClick={(event) => event.stopPropagation()}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          <label htmlFor="pf-explode">
                            {explode < 0.02 ? 'Assembled' : 'Exploded'}
                          </label>
                          <input
                            id="pf-explode"
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={explode}
                            aria-label="How far apart the device is drawn"
                            onChange={(event) => setExplode(Number(event.target.value))}
                          />
                        </span>
                      )}
                    </div>
                    <span className="pf-row-d">{step.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ONE prominent route — the build guide on the site, where every step
            is shown on the 3D model — with the written guide and the two
            ordering shortcuts under it. The case row follows the switch above:
            MakerWorld for the official case, the remix's folder otherwise. The
            electronics routes (breadboard, older boards) live in the assembly
            map, which replaced the old build matrix here. */}
        {/* A build of its own has its own guide, on its own repository, and
            its own files; the PCB, the assembly map and the v3 guides are not
            for it. Its case folder is first, as a remix's is above. */}
        {flow ? (
        <div className="pf-block">
          <span className="pf-kicker">Start here</span>
          <a
            className={styles.guideCard}
            href={flow.guide.href}
            target="_blank"
            rel="noreferrer"
            onClick={() => captureEvent('build_case_link_opened', {
              case_id: selectedCase.id,
              target: 'guide',
              surface: 'build_panel_start',
            })}
          >
            <strong>{flow.guide.title}</strong>
            <span>{flow.guide.desc}</span>
          </a>
          <div className={styles.quickLinks}>
            {flow.links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                onClick={() => captureEvent('build_case_link_opened', {
                  case_id: selectedCase.id,
                  target: link.target,
                  surface: 'build_panel_start',
                })}
              >
                <strong>{link.label}</strong>
                <span>{link.target} ↗</span>
              </a>
            ))}
          </div>
        </div>
        ) : (
        <div className="pf-block">
          <span className="pf-kicker">Start here</span>
          <Link
            className={styles.guideCard}
            href="/guide/build"
            onClick={() => captureEvent('build_guide_opened', {
              guide: 'interactive',
              surface: 'build_panel',
            })}
          >
            <strong>The build guide, in 3D →</strong>
            <span>
              Parts, soldering, case, wiring, first light. Every step on a Patternflow you can turn.
            </span>
          </Link>
          {/* Name on the left, destination on the right — the guide card above
              is the only solid in this panel, so these stay hairline rows. */}
          <div className={styles.quickLinks}>
            <a
              href="https://github.com/engmung/Patternflow/blob/main/BUILD_GUIDE.md"
              target="_blank"
              rel="noreferrer"
              onClick={() => captureEvent('build_guide_opened', {
                guide: 'written',
                surface: 'build_panel',
              })}
            >
              <strong>Read it instead</strong>
              <span>BUILD_GUIDE ↗</span>
            </a>
            <a
              href="https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Order the PCB</strong>
              <span>PCBWay ↗</span>
            </a>
            <a
              href={selectedCase.links[0].href}
              target="_blank"
              rel="noreferrer"
              onClick={() => captureEvent('build_case_link_opened', {
                case_id: selectedCase.id,
                target: selectedCase.links[0].target,
                surface: 'build_panel_start',
              })}
            >
              <strong>{selectedCase.step.title}</strong>
              <span>{selectedCase.links[0].target} ↗</span>
            </a>
            <a
              href="https://github.com/engmung/Patternflow/blob/main/hardware/README.md"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Gerbers, BOM, STLs</strong>
              <span>hardware/ ↗</span>
            </a>
            {/* The one check the docs put before any purchase: the panel's
                driver chip decides whether it lights at all. */}
            <a
              href="https://github.com/engmung/Patternflow/blob/main/docs/panel-compatibility.md"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Before you buy the panel</strong>
              <span>Compatibility ↗</span>
            </a>
          </div>
          <p className={styles.otherPaths}>
            No custom PCB, or an older v2 board? Every route is in the assembly map.
          </p>
          <div className={styles.pathLinks}>
            <a className="pf-link" href="https://github.com/engmung/Patternflow/blob/main/docs/assembly/README.md" target="_blank" rel="noreferrer">
              Open the assembly map
            </a>
            <Link className="pf-link" href="/build/breadboard">
              Breadboard guide
            </Link>
            <a className="pf-link" href="https://github.com/engmung/Patternflow/blob/main/docs/legacy/BUILD_GUIDE_v2.md" target="_blank" rel="noreferrer">
              v2 board guide
            </a>
          </div>
        </div>
        )}
        </div>
      </div>
    </div>
  );
}
