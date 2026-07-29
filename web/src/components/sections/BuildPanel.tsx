import { useEffect, useRef, useState } from 'react';
import { useAppStore, SectionType } from '@/store/useAppStore';
import { SectionContent } from '@/lib/content';
import { captureEvent } from '@/lib/posthogEvents';
import styles from './BuildPanel.module.css';

interface BuildPanelProps {
  content: SectionContent;
  isActive: boolean;
}

// The reality check every would-be builder wants before committing. Ordered
// cost → your time → machine time → waiting, so the two numbers the reader is
// actually deciding on come first. Numbers follow the main path (custom PCB +
// 3D print, see BUILD_GUIDE.md BOM).
const FACTS = [
  {
    value: '~$100',
    name: 'All parts',
    detail: 'filament ~$30 · panel ~$20 · ESP32-S3 ~$13 · PCB & rest ~$35',
  },
  {
    value: '~1 hr',
    name: 'Hands-on',
    detail: '30 min soldering, 30 min assembly. Big through-hole joints only.',
  },
  {
    value: '~10 hr',
    name: 'Printing',
    detail: 'Printer time, not yours — it runs while you wait.',
  },
  {
    value: '~2 wk',
    name: 'Shipping',
    detail: 'Order the parts first — the wait is the longest part.',
  },
];

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
        {/* Cost and time first: the reader decides whether to build at all
            before they care what the four steps are. */}
        <div className={styles.factsBand}>
          {FACTS.map((fact) => (
            <div className={styles.factCard} key={fact.name}>
              <span className={styles.factValue}>{fact.value}</span>
              <span className={styles.factName}>{fact.name}</span>
              <span className={styles.factLabel}>{fact.detail}</span>
            </div>
          ))}
        </div>

        <div className={styles.buildCols}>
        <div className="pf-block" onMouseLeave={handleStepLeave}>
          <span className="pf-kicker">
            {isMobile ? 'Four steps — tap to preview' : 'Four steps — hover to preview on the device'}
          </span>
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

        {/* ONE prominent route — the current v3.0.0 guide — with the two
            ordering shortcuts wired straight to it. Every other combination
            (breadboard, laser cut, older boards) lives in the assembly map,
            which replaced the old build matrix here. */}
        <div className="pf-block">
          <span className="pf-kicker">Start here</span>
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
              PLA case, hand-soldered PCB, browser flash. Start to finish in one document.
            </span>
          </a>
          {/* Name on the left, destination on the right — the guide card above
              is the only solid in this panel, so these stay hairline rows. */}
          <div className={styles.quickLinks}>
            <a
              href="https://www.pcbway.com/project/shareproject/Patternflow_An_LED_synthesizer_776d796c.html"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Order the PCB</strong>
              <span>PCBWay ↗</span>
            </a>
            <a
              href="https://makerworld.com/en/models/3072492-patternflow-open-source-led-synthesizer-case#profileId-3459015"
              target="_blank"
              rel="noreferrer"
            >
              <strong>Print the case</strong>
              <span>MakerWorld ↗</span>
            </a>
            <a
              href="https://github.com/engmung/Patternflow/releases/tag/v3.0.0"
              target="_blank"
              rel="noreferrer"
            >
              <strong>All files</strong>
              <span>Release v3.0.0 ↗</span>
            </a>
          </div>
          <p className={styles.otherPaths}>
            Breadboard, laser-cut, or an older v2 board? Every route is in the assembly map.
          </p>
          <div className={styles.pathLinks}>
            <a className="pf-link" href="https://github.com/engmung/Patternflow/blob/main/docs/assembly/README.md" target="_blank" rel="noreferrer">
              Open the assembly map
            </a>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
