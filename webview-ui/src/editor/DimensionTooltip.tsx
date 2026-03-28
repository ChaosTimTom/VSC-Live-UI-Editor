import React from 'react';

export type DimensionTooltipProps = {
  rect: DOMRect | null;
  isDragging: boolean;
  isResizing: boolean;
  isDark: boolean;
};

export function DimensionTooltip({ rect, isDragging, isResizing, isDark }: DimensionTooltipProps) {
  if (!rect || (!isDragging && !isResizing)) return null;

  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);

  const bg = isDark ? 'rgba(10,10,18,0.88)' : 'rgba(255,255,255,0.92)';
  const fg = isDark ? '#e2e8f0' : '#1e293b';
  const accent = isDark ? '#2dd4bf' : '#0d9488';
  const border = isDark ? 'rgba(45,212,191,0.35)' : 'rgba(20,184,166,0.30)';

  // Position tooltip below and to the right of the element
  const tooltipLeft = rect.right + 8;
  const tooltipTop = rect.bottom + 8;

  return (
    <div
      data-live-ui-overlay="1"
      style={{
        position: 'fixed',
        left: tooltipLeft,
        top: tooltipTop,
        zIndex: 100000,
        pointerEvents: 'none',
        padding: '4px 8px',
        borderRadius: 5,
        background: bg,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        border: `1px solid ${border}`,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        color: fg,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        boxShadow: isDark ? '0 4px 12px rgba(0,0,0,0.4)' : '0 4px 12px rgba(0,0,0,0.12)',
      }}
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ color: accent, fontWeight: 700 }}>{w} × {h}</span>
      </div>
      {isDragging && (
        <div style={{ opacity: 0.6, fontSize: 10 }}>pos: {x}, {y}</div>
      )}
    </div>
  );
}
