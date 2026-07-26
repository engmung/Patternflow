import { useEffect, useRef, useState } from 'react';
import { useAppStore, SectionType } from '@/store/useAppStore';
import { SectionContent } from '@/lib/content';
import { captureEvent } from '@/lib/posthogEvents';
import styles from './BuildPanel.module.css';

interface BuildPanelProps {
  content: SectionContent;
  isActive: boolean;
}

const STEPS = [
  {
    id: 1,
    title: 'Print the case',
    desc: '3D print the current PLA enclosure.',
  },
  {
    id: 2,
    title: 'Solder the PCB',
    desc: 'Hand-solder the custom Patternflow PCB.',
  },
  {
    id: 3,
    title: 'Assemble',
    desc: 'Encoders, matrix, power wiring, and case fit.',
  },
  {
    id: 4,
    title: 'Flash and power on',
    desc: 'Browser flash the release firmware, then insert the ESP32-S3.',
  },
];

export default function BuildPanel({ content, isActive }: BuildPanelProps) {
  const setActiveSection = useAppStore((state) => state.setActiveSection);
  const buildStep = useAppStore((state) => state.buildStep);
  const setBuildStep = useAppStore((state) => state.setBuildStep);
  const isExploded = useAppStore((state) => state.isExploded);
  const setIsExploded = useAppStore((state) => state.setIsExploded);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [lockedStep, setLockedStep] = useState<number | null>(null);
  const [activeTouchStep, setActiveTouchStep] = useState<number | null>(null);

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
    const step = STEPS.find((item) => item.id === stepId);

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
        <h2 className="pf-h2">{content.title || 'Build your own.'}</h2>
        <p className="pf-sub">{content.subtitle || 'Print, solder, assemble, flash.'}</p>
      </div>

      <div className={`panel-body ${styles.buildPanel}`} ref={containerRef}>
        <div className="pf-block" onMouseLeave={handleStepLeave}>
          <span className="pf-kicker">Step preview</span>
          <div className={styles.stepList}>
            {STEPS.map((step) => {
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
                      {step.id === 3 && isActive && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-pressed={isExploded}
                          className={`${styles.inlineAction} ${isExploded ? styles.inlineActionOn : ''}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setIsExploded(!isExploded);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              event.stopPropagation();
                              setIsExploded(!isExploded);
                            }
                          }}
                        >
                          {isExploded ? 'Assemble' : 'Explode'}
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

        {/* The reality check every would-be builder wants before committing:
            what it costs, how long it takes, and — the big one — that the
            soldering was deliberately kept first-timer easy. Numbers follow
            the main path (custom PCB + 3D print, see BUILD_GUIDE.md BOM). */}
        <div className="pf-block">
          <span className="pf-kicker">What it takes</span>
          <div className={styles.factsGrid}>
            <div className={styles.factCard}>
              <span className={styles.factValue}>~US$100</span>
              <span className={styles.factLabel}>
                all parts — filament ~$30 · LED panel ~$20 · ESP32-S3 ~$13 · PCB &amp; the rest ~$35
              </span>
            </div>
            <div className={styles.factCard}>
              <span className={styles.factValue}>~2 weeks</span>
              <span className={styles.factLabel}>
                parts shipping — order first; the wait is the longest part of the build
              </span>
            </div>
            <div className={styles.factCard}>
              <span className={styles.factValue}>~10 hours</span>
              <span className={styles.factLabel}>
                3D printing — printer time, not yours; it runs while you wait
              </span>
            </div>
            <div className={styles.factCard}>
              <span className={styles.factValue}>~1 hour</span>
              <span className={styles.factLabel}>
                hands-on — about 30 min of soldering and 30 min of final assembly
              </span>
            </div>
          </div>
          <p className={styles.factsNote}>
            Never soldered before? Start here. The soldering is genuinely, really easy — every
            joint is big through-hole, and the board was deliberately stripped down to only the
            easy parts so that first-time solderers can finish it.
          </p>
        </div>

        {/* ONE prominent route — the current v3.0.0 guide — with the two
            ordering shortcuts wired straight to it. Every other combination
            (breadboard, laser cut, older boards) lives in the assembly map,
            which replaced the old build matrix here. */}
        <div className="pf-block">
          <span className="pf-kicker">Build guide</span>
          <a
            className={styles.guideCard}
            href="https://github.com/engmung/Patternflow/blob/main/BUILD_GUIDE.md"
            target="_blank"
            rel="noreferrer"
            onClick={() => captureEvent('build_guide_opened', {
              guide: 'v3.0.0',
              surface: 'build_panel',
            })}
          >
            <strong>Build Guide v3.0.0 ↗</strong>
            <span>
              The complete, current route — PLA-printed case, hand-soldered custom PCB, browser
              flash. Start to finish in one document.
            </span>
          </a>
          <div className={styles.quickLinks}>
            <a
              href="https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Order the PCB — PCBWay ↗</strong>
              <span>Shared project: no Gerber upload, and ordering supports Patternflow</span>
            </a>
            <a
              href="https://makerworld.com/en/models/3072492-patternflow-open-source-led-synthesizer-case#profileId-3459015"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Print the case — MakerWorld ↗</strong>
              <span>Tuned one-click profiles for Bambu printers; STLs in the repo for the rest</span>
            </a>
          </div>
          <p className={styles.otherPaths}>
            Building another way — breadboard electronics, laser-cut enclosure, or an older v2
            board? Every route lives in the assembly map.
          </p>
          <div className={styles.pathLinks}>
            <a className="pf-link" href="https://github.com/engmung/Patternflow/blob/main/docs/assembly/README.md" target="_blank" rel="noreferrer">
              Open the assembly map
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
