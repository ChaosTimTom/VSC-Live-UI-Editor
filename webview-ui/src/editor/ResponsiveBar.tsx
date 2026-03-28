import React from 'react';

export interface Breakpoint {
  label: string;
  width: number | null; // null = auto/responsive
  icon: string;
}

const DEFAULT_BREAKPOINTS: Breakpoint[] = [
  { label: 'Mobile S', width: 320, icon: '📱' },
  { label: 'Mobile L', width: 425, icon: '📱' },
  { label: 'Tablet', width: 768, icon: '📋' },
  { label: 'Laptop', width: 1024, icon: '💻' },
  { label: 'Desktop', width: 1440, icon: '🖥️' },
  { label: 'Auto', width: null, icon: '↔️' },
];

export interface ResponsiveBarProps {
  currentWidth: number | null;
  isDark: boolean;
  onWidthChange: (width: number | null) => void;
  customBreakpoints?: Breakpoint[];
}

export function ResponsiveBar({ currentWidth, isDark, onWidthChange, customBreakpoints }: ResponsiveBarProps) {
  const breakpoints = customBreakpoints ?? DEFAULT_BREAKPOINTS;

  const colors = isDark
    ? { bg: 'rgba(10,10,18,0.44)', border: 'rgba(45,212,191,0.30)', active: 'rgba(45,212,191,0.22)', hover: 'rgba(255,255,255,0.06)', text: '#ccc', activeText: '#fff' }
    : { bg: 'rgba(255,255,255,0.78)', border: 'rgba(20,184,166,0.32)', active: 'rgba(20,184,166,0.18)', hover: 'rgba(0,0,0,0.04)', text: '#555', activeText: '#111' };

  const isActive = (bp: Breakpoint) =>
    bp.width === null ? currentWidth === null : currentWidth === bp.width;

  return (
    <div
      data-live-ui-overlay="1"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '4px 8px',
        background: colors.bg,
        borderBottom: `1px solid ${colors.border}`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        flexShrink: 0,
        overflow: 'hidden',
      }}
    >
      <span style={{ fontSize: 11, color: colors.text, marginRight: 4, whiteSpace: 'nowrap' }}>Viewport:</span>
      {breakpoints.map((bp) => (
        <button
          key={bp.label}
          onClick={() => onWidthChange(bp.width)}
          title={bp.width ? `${bp.label} (${bp.width}px)` : bp.label}
          aria-label={bp.label}
          aria-pressed={isActive(bp)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '3px 8px',
            fontSize: 11,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            background: isActive(bp) ? colors.active : 'transparent',
            color: isActive(bp) ? colors.activeText : colors.text,
            fontWeight: isActive(bp) ? 600 : 400,
            whiteSpace: 'nowrap',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            if (!isActive(bp)) (e.currentTarget.style.background = colors.hover);
          }}
          onMouseLeave={(e) => {
            if (!isActive(bp)) (e.currentTarget.style.background = 'transparent');
          }}
        >
          <span style={{ fontSize: 13 }}>{bp.icon}</span>
          {bp.label}
          {bp.width && <span style={{ fontSize: 10, opacity: 0.7 }}>{bp.width}</span>}
        </button>
      ))}
      {currentWidth !== null && (
        <span style={{ fontSize: 10, color: colors.text, marginLeft: 'auto', opacity: 0.7 }}>
          {currentWidth}px
        </span>
      )}
    </div>
  );
}

export default ResponsiveBar;
