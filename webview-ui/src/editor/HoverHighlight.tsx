import React, { useEffect, useRef, useState } from 'react';

export type HoverHighlightProps = {
  canvasEl: HTMLElement | null;
  selectedEl: HTMLElement | null;
  isDark: boolean;
  enabled: boolean;
};

type HoverInfo = {
  rect: DOMRect;
  tag: string;
  id?: string;
  classes: string[];
  width: number;
  height: number;
};

export function HoverHighlight({ canvasEl, selectedEl, isDark, enabled }: HoverHighlightProps) {
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const lastElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!canvasEl || !enabled) {
      setHover(null);
      return;
    }

    const onMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target === selectedEl) {
        if (lastElRef.current !== null) {
          lastElRef.current = null;
          setHover(null);
        }
        return;
      }

      // Find nearest source-mapped element
      const mapped = target.closest<HTMLElement>('[data-source-file][data-source-line]');
      if (!mapped || mapped === selectedEl) {
        if (lastElRef.current !== null) {
          lastElRef.current = null;
          setHover(null);
        }
        return;
      }

      // Skip overlay elements
      if (mapped.closest('[data-live-ui-overlay]')) {
        return;
      }

      if (mapped === lastElRef.current && mapped.isConnected) return;
      lastElRef.current = mapped;

      const rect = mapped.getBoundingClientRect();
      setHover({
        rect,
        tag: mapped.tagName.toLowerCase(),
        id: mapped.id || undefined,
        classes: Array.from(mapped.classList || []).slice(0, 3),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
    };

    const onLeave = () => {
      lastElRef.current = null;
      setHover(null);
    };

    canvasEl.addEventListener('mousemove', onMove, { passive: true });
    canvasEl.addEventListener('mouseleave', onLeave);
    return () => {
      canvasEl.removeEventListener('mousemove', onMove);
      canvasEl.removeEventListener('mouseleave', onLeave);
    };
  }, [canvasEl, selectedEl, enabled]);

  if (!hover) return null;

  const borderColor = isDark ? 'rgba(45,212,191,0.6)' : 'rgba(20,184,166,0.55)';
  const bgColor = isDark ? 'rgba(45,212,191,0.06)' : 'rgba(20,184,166,0.05)';
  const labelBg = isDark ? 'rgba(10,10,18,0.85)' : 'rgba(255,255,255,0.92)';
  const labelFg = isDark ? '#e2e8f0' : '#1e293b';
  const dimColor = isDark ? 'rgba(45,212,191,0.9)' : 'rgba(13,148,136,0.95)';

  const r = hover.rect;

  // Label position: above element, or below if no room above
  const labelTop = r.y > 30 ? r.y - 24 : r.y + r.height + 4;

  return (
    <div
      data-live-ui-overlay="1"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99997,
        pointerEvents: 'none',
      }}
    >
      {/* Hover box */}
      <div style={{
        position: 'absolute',
        left: r.x,
        top: r.y,
        width: r.width,
        height: r.height,
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 3,
        background: bgColor,
        transition: 'all 0.08s ease-out',
      }} />

      {/* Element info label */}
      <div style={{
        position: 'absolute',
        left: r.x,
        top: labelTop,
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        padding: '2px 6px',
        borderRadius: 4,
        background: labelBg,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${borderColor}`,
        fontSize: 10,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        color: labelFg,
        whiteSpace: 'nowrap',
        maxWidth: 300,
        overflow: 'hidden',
      }}>
        <span style={{ fontWeight: 700, color: isDark ? '#c4b5fd' : '#7c3aed' }}>{hover.tag}</span>
        {hover.id && <span style={{ color: isDark ? '#5eead4' : '#0d9488' }}>#{hover.id}</span>}
        {hover.classes.length > 0 && (
          <span style={{ opacity: 0.6 }}>.{hover.classes.join('.')}</span>
        )}
        <span style={{ color: dimColor, fontWeight: 600 }}>{hover.width}×{hover.height}</span>
      </div>
    </div>
  );
}
