import React, { useMemo } from 'react';

export type SpacingGuidesProps = {
  selectedRect: DOMRect | null;
  canvasEl: HTMLElement | null;
  isDark: boolean;
};

type GuideInfo = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  distance: number;
  orientation: 'h' | 'v';
};

function findNearestEdges(selectedRect: DOMRect, canvasEl: HTMLElement): GuideInfo[] {
  const guides: GuideInfo[] = [];
  const threshold = 200; // only show guides within 200px

  // Check parent edges
  const parent = canvasEl.querySelector('[data-source-file][data-source-line]');
  if (!parent) return guides;

  // Get all sibling source-mapped elements
  const allEls = canvasEl.querySelectorAll<HTMLElement>('[data-source-file][data-source-line]');
  const sr = selectedRect;

  for (const el of allEls) {
    if (el.closest('[data-live-ui-overlay]')) continue;
    const r = el.getBoundingClientRect();

    // Skip the selected element itself (same rect)
    if (Math.abs(r.x - sr.x) < 1 && Math.abs(r.y - sr.y) < 1 &&
        Math.abs(r.width - sr.width) < 1 && Math.abs(r.height - sr.height) < 1) continue;

    // Skip if way too far
    if (r.right < sr.left - threshold || r.left > sr.right + threshold) continue;
    if (r.bottom < sr.top - threshold || r.top > sr.bottom + threshold) continue;

    // Top distance: gap between el.bottom and sr.top
    if (r.bottom <= sr.top && sr.top - r.bottom < threshold) {
      const dist = Math.round(sr.top - r.bottom);
      if (dist > 0 && dist < threshold) {
        const x = Math.max(r.left, sr.left) + Math.min(r.width, sr.width) / 2;
        guides.push({ x1: x, y1: r.bottom, x2: x, y2: sr.top, distance: dist, orientation: 'v' });
      }
    }

    // Bottom distance: gap between sr.bottom and el.top
    if (sr.bottom <= r.top && r.top - sr.bottom < threshold) {
      const dist = Math.round(r.top - sr.bottom);
      if (dist > 0 && dist < threshold) {
        const x = Math.max(r.left, sr.left) + Math.min(r.width, sr.width) / 2;
        guides.push({ x1: x, y1: sr.bottom, x2: x, y2: r.top, distance: dist, orientation: 'v' });
      }
    }

    // Left distance: gap between el.right and sr.left
    if (r.right <= sr.left && sr.left - r.right < threshold) {
      const dist = Math.round(sr.left - r.right);
      if (dist > 0 && dist < threshold) {
        const y = Math.max(r.top, sr.top) + Math.min(r.height, sr.height) / 2;
        guides.push({ x1: r.right, y1: y, x2: sr.left, y2: y, distance: dist, orientation: 'h' });
      }
    }

    // Right distance: gap between sr.right and el.left
    if (sr.right <= r.left && r.left - sr.right < threshold) {
      const dist = Math.round(r.left - sr.right);
      if (dist > 0 && dist < threshold) {
        const y = Math.max(r.top, sr.top) + Math.min(r.height, sr.height) / 2;
        guides.push({ x1: sr.right, y1: y, x2: r.left, y2: y, distance: dist, orientation: 'h' });
      }
    }
  }

  // Deduplicate: keep closest guide per direction
  const seen = new Map<string, GuideInfo>();
  for (const g of guides) {
    const key = `${g.orientation}-${g.x1 < g.x2 ? 'right' : 'left'}-${g.y1 < g.y2 ? 'down' : 'up'}`;
    const existing = seen.get(key);
    if (!existing || g.distance < existing.distance) {
      seen.set(key, g);
    }
  }

  return Array.from(seen.values()).slice(0, 4);
}

export function SpacingGuides({ selectedRect, canvasEl, isDark }: SpacingGuidesProps) {
  if (!selectedRect || !canvasEl) return null;

  // Memoize the expensive DOM query to avoid rescanning on every render
  const guides = useMemo(
    () => findNearestEdges(selectedRect, canvasEl),
    [selectedRect?.x, selectedRect?.y, selectedRect?.width, selectedRect?.height, canvasEl],
  );
  if (!guides.length) return null;

  const lineColor = isDark ? 'rgba(251,146,60,0.7)' : 'rgba(234,88,12,0.6)';
  const labelBg = isDark ? 'rgba(251,146,60,0.9)' : 'rgba(234,88,12,0.85)';

  return (
    <div
      data-live-ui-overlay="1"
      style={{ position: 'fixed', inset: 0, zIndex: 99996, pointerEvents: 'none' }}
    >
      {guides.map((g, i) => {
        const isV = g.orientation === 'v';
        const midX = (g.x1 + g.x2) / 2;
        const midY = (g.y1 + g.y2) / 2;

        return (
          <React.Fragment key={i}>
            {/* Line */}
            {isV ? (
              <div style={{
                position: 'absolute',
                left: g.x1 - 0.5,
                top: Math.min(g.y1, g.y2),
                width: 1,
                height: Math.abs(g.y2 - g.y1),
                background: lineColor,
              }}>
                {/* Top cap */}
                <div style={{ position: 'absolute', top: 0, left: -3, width: 7, height: 1, background: lineColor }} />
                {/* Bottom cap */}
                <div style={{ position: 'absolute', bottom: 0, left: -3, width: 7, height: 1, background: lineColor }} />
              </div>
            ) : (
              <div style={{
                position: 'absolute',
                left: Math.min(g.x1, g.x2),
                top: g.y1 - 0.5,
                width: Math.abs(g.x2 - g.x1),
                height: 1,
                background: lineColor,
              }}>
                {/* Left cap */}
                <div style={{ position: 'absolute', left: 0, top: -3, width: 1, height: 7, background: lineColor }} />
                {/* Right cap */}
                <div style={{ position: 'absolute', right: 0, top: -3, width: 1, height: 7, background: lineColor }} />
              </div>
            )}

            {/* Distance label */}
            <div style={{
              position: 'absolute',
              left: midX - 12,
              top: midY - 8,
              padding: '1px 5px',
              borderRadius: 3,
              background: labelBg,
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              textAlign: 'center',
              lineHeight: '14px',
            }}>
              {g.distance}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
