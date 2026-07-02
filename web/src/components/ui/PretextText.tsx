'use client';

import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';

interface PretextTextProps {
  text: string;
  font: string; // e.g., "500 64px Inter"
  lineHeight: number;
  className?: string;
  delayOffset?: number; // base delay in seconds
  letterSpacing?: number; // CSS pixel value
}

export default function PretextText({ text, font, lineHeight, className = '', delayOffset = 0, letterSpacing }: PretextTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ text: string, width: number }[]>([]);
  const [fontsLoaded, setFontsLoaded] = useState(false);

  useEffect(() => {
    // document.fonts.ready resolves immediately when fonts are already loaded.
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) setFontsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    if (!fontsLoaded || !containerRef.current || !text) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          try {
            const prepared = prepareWithSegments(text, font, { letterSpacing });
            const layout = layoutWithLines(prepared, width, lineHeight);
            setLines(layout.lines);
          } catch (e) {
            console.error("Pretext layout failed", e);
          }
        }
      }
    });
    
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [text, font, lineHeight, letterSpacing, fontsLoaded]);

  return (
    <div 
      ref={containerRef} 
      className={className} 
      style={{ 
        position: 'relative', 
        height: lines.length > 0 ? lines.length * lineHeight : 'auto',
        minHeight: lineHeight
      }}
    >
      {/* Fallback space to keep layout before text is processed */}
      {lines.length === 0 && <span style={{ opacity: 0 }}>{text}</span>}
      
      {lines.map((line, i) => (
        <div 
          key={i} 
          className="pretext-line" 
          style={{ 
            position: 'absolute', 
            top: i * lineHeight,
            left: 0,
            whiteSpace: 'pre',
            animationDelay: `${delayOffset + i * 0.1}s` 
          }}
        >
          {line.text}
        </div>
      ))}
    </div>
  );
}
