'use client';

import { useTheme } from '@/context/ThemeContext';
import { useState, useEffect } from 'react';

export default function TweaksPanel() {
  const { tweaks, setTweaks } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data) return;
      if (e.data.type === '__activate_edit_mode') setIsOpen(true);
      if (e.data.type === '__deactivate_edit_mode') setIsOpen(false);
    };

    window.addEventListener('message', handleMessage);
    window.parent?.postMessage({ type: '__edit_mode_available' }, '*');

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    window.parent?.postMessage({
      type: '__edit_mode_set_keys',
      edits: { palette: tweaks.palette, ledHue: tweaks.ledHue, sans: tweaks.sans, mono: tweaks.mono }
    }, '*');
  }, [tweaks]);

  const updateTweak = (key: keyof typeof tweaks, value: string) => {
    setTweaks(prev => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed', bottom: '20px', right: '20px', zIndex: 99,
          padding: '8px 12px', background: 'var(--ink)', color: 'var(--cream)',
          fontFamily: 'var(--mono)', fontSize: 'var(--pf-fs-mono)', border: 'none', cursor: 'pointer',
          textTransform: 'uppercase'
        }}
        className={isOpen ? 'hidden' : ''}
      >
        TWEAKS
      </button>

      <div className={`tw ${isOpen ? 'open' : ''}`} id="tw">
        <div className="tw-head" style={{display: 'flex', justifyContent: 'space-between'}}>
          <span>Tweaks</span>
          <button onClick={() => setIsOpen(false)} style={{background: 'none', border: 'none', color: 'inherit', cursor: 'pointer'}}>✕</button>
        </div>
        <div className="tw-row">
          <label>Palette</label>
          <div className="opts" id="opt-palette">
            {['cream', 'paper', 'stone'].map(val => (
              <button 
                key={val} 
                data-v={val} 
                className={tweaks.palette === val ? 'on' : ''}
                onClick={() => updateTweak('palette', val)}
              >
                {val.charAt(0).toUpperCase() + val.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="tw-row">
          <label>LED Hue (the only color)</label>
          <div className="opts" id="opt-hue">
            {['orange', 'red', 'amber', 'white'].map(val => (
              <button 
                key={val} 
                data-v={val} 
                className={tweaks.ledHue === val ? 'on' : ''}
                onClick={() => updateTweak('ledHue', val)}
              >
                {val.charAt(0).toUpperCase() + val.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="tw-row">
          <label>Sans</label>
          <div className="opts" id="opt-sans">
            {['Inter', 'DM Sans'].map(val => (
              <button 
                key={val} 
                data-v={val} 
                className={tweaks.sans === val ? 'on' : ''}
                onClick={() => updateTweak('sans', val)}
              >
                {val}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
