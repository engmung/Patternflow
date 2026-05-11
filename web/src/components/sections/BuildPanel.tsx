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
    desc: 'Three plates, any FDM printer.',
  },
  {
    id: 2,
    title: 'Solder the PCB',
    desc: 'Through-hole and a few SMD parts.',
  },
  {
    id: 3,
    title: 'Assemble',
    desc: 'Encoders, matrix, screws.',
  },
  {
    id: 4,
    title: 'Flash and power on',
    desc: 'Web flasher in the Pattern section.',
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
    setActiveTouchStep(1);
    setBuildStep(1);
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
        <div className="pf-block">
          <span className="pf-kicker">Requirements</span>
          <p className={styles.note}>
            Requires 3D printing, basic soldering, PCB ordering, and component sourcing.
            Kits are coming if you&apos;d rather skip the sourcing.
          </p>
        </div>

        <div className="pf-block" onMouseLeave={handleStepLeave}>
          <span className="pf-kicker">Four steps</span>
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
          <span className="pf-kicker">Guide</span>
          <div className="pf-prose">
            <p>
              The build guide includes all 3D models, PCB schematics, artworks, and Gerber files.
              Need help? Ask on Discord. Video guide coming soon.
            </p>
            <a className="pf-link" href="https://github.com/engmung/PatternFlow/blob/main/docs/BUILD.md" target="_blank" rel="noreferrer">
              Open the build guide
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
