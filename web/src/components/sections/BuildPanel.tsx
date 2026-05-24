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

        <div className="pf-block">
          <span className="pf-kicker">Choose your build</span>
          <div className={`pf-prose ${styles.pathIntro}`}>
            <p>
              Pick one enclosure path and one electronics path. The current guide is the complete
              route today; the other combinations are being prepared so you can start with the
              tools, budget, and space you actually have. The custom PCB is stable; PCBA may
              come later as an easier assembly option.
            </p>
          </div>
          <div className={styles.buildMatrix} role="table" aria-label="Build combinations">
            <div className={`${styles.matrixCell} ${styles.matrixCorner}`} role="columnheader">
              <span className={styles.cornerElectronics}>Electronics</span>
              <span className={styles.cornerEnclosure}>Enclosure</span>
            </div>
            <div className={`${styles.matrixCell} ${styles.matrixHeader} ${styles.matrixColumnHeader}`} role="columnheader">Custom PCB</div>
            <div className={`${styles.matrixCell} ${styles.matrixHeader} ${styles.matrixColumnHeader}`} role="columnheader">Breadboard</div>

            <div className={`${styles.matrixCell} ${styles.matrixHeader} ${styles.matrixRowHeader}`} role="rowheader">3D print</div>
            <a className={`${styles.matrixCell} ${styles.matrixOption} ${styles.matrixCurrent}`} href="https://github.com/engmung/PatternFlow/blob/main/docs/BUILD.md" target="_blank" rel="noreferrer" role="cell">
              <strong>PLA print</strong>
              <strong>Hand solder</strong>
            </a>
            <div className={`${styles.matrixCell} ${styles.matrixOption}`} role="cell">
              <strong>Preparing</strong>
              <span>PCB-free wiring</span>
            </div>

            <div className={`${styles.matrixCell} ${styles.matrixHeader} ${styles.matrixRowHeader}`} role="rowheader">Laser cut</div>
            <div className={`${styles.matrixCell} ${styles.matrixOption}`} role="cell">
              <strong>Preparing</strong>
              <span>Flat enclosure</span>
            </div>
            <div className={`${styles.matrixCell} ${styles.matrixOption}`} role="cell">
              <strong>Preparing</strong>
              <span>Lowest fabrication path</span>
            </div>
          </div>
          <div className={styles.pathLinks}>
            <a className="pf-link" href="https://github.com/engmung/PatternFlow/blob/main/docs/build/README.md" target="_blank" rel="noreferrer">
              Open the build map
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
