import React from 'react';
import type { SelectionModel } from './types';

export type DebugStats = {
  rectUpdates: number;
  reasons: Record<string, number>;
};

export function DebugOverlay(props: {
  enabled: boolean;
  selection: SelectionModel | null;
  rect: DOMRect | null;
  stats: DebugStats;
}) {
  if (!props.enabled) return null;

  const sel = props.selection;

  const fmtEl = (el: HTMLElement | undefined) => {
    if (!el) return '(none)';
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className ? `.${String(el.className).trim().split(/\s+/).slice(0, 3).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${id}${cls}`;
  };

  const rect = props.rect;
  const rectText = rect
    ? `x=${Math.round(rect.x)} y=${Math.round(rect.y)} w=${Math.round(rect.width)} h=${Math.round(rect.height)}`
    : '(null)';

  const reasonLines = Object.entries(props.stats.reasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div
      style={{
        position: 'fixed',
        right: 10,
        bottom: 10,
        zIndex: 999999,
        maxWidth: 520,
        padding: 10,
        borderRadius: 10,
        background: 'rgba(0,0,0,0.75)',
        color: '#fff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        lineHeight: 1.35,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 6 }}>Live UI Debug</div>
      <div>selected: {sel ? fmtEl(sel.selectedEl) : '(none)'}</div>
      <div>leaf: {sel ? fmtEl(sel.leafEl) : '(none)'}</div>
      <div>mapped: {sel ? fmtEl(sel.mappedEl) : '(none)'}</div>
      <div>groupRoot: {sel?.groupRootEl ? fmtEl(sel.groupRootEl) : '(none)'}</div>
      <div>locator: {sel ? `${sel.locator.file}:${sel.locator.line}${sel.locator.column ? `:${sel.locator.column}` : ''}` : '(none)'}</div>
      <div>rect: {rectText}</div>
      <div>rectUpdates: {props.stats.rectUpdates}</div>
      {reasonLines.length ? (
        <div style={{ marginTop: 6, opacity: 0.9 }}>
          {reasonLines.map(([k, v]) => (
            <div key={k}>
              {k}: {v}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
