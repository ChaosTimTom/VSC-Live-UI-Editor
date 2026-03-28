import React, { useEffect, useState, useMemo } from 'react';

export interface DiffPreviewProps {
  file: string;
  original: string;
  modified: string;
  isDark: boolean;
  onClose: () => void;
}

interface DiffLine {
  type: 'same' | 'added' | 'removed';
  lineNum: number | null;
  text: string;
}

function computeSimpleDiff(original: string, modified: string): DiffLine[] {
  const origLines = original.split('\n');
  const modLines = modified.split('\n');
  const result: DiffLine[] = [];

  // Simple LCS-based diff
  const m = origLines.length;
  const n = modLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (origLines[i - 1] === modLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to produce diff
  let i = m;
  let j = n;
  const stack: DiffLine[] = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === modLines[j - 1]) {
      stack.push({ type: 'same', lineNum: j, text: modLines[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'added', lineNum: j, text: modLines[j - 1] });
      j--;
    } else {
      stack.push({ type: 'removed', lineNum: null, text: origLines[i - 1] });
      i--;
    }
  }

  stack.reverse();

  // Only show context around changes (3 lines before/after)
  const CONTEXT = 3;
  const changeLines = new Set<number>();
  stack.forEach((line, idx) => {
    if (line.type !== 'same') {
      for (let k = Math.max(0, idx - CONTEXT); k <= Math.min(stack.length - 1, idx + CONTEXT); k++) {
        changeLines.add(k);
      }
    }
  });

  let lastShown = -1;
  for (let idx = 0; idx < stack.length; idx++) {
    if (!changeLines.has(idx)) continue;
    if (lastShown >= 0 && idx - lastShown > 1) {
      result.push({ type: 'same', lineNum: null, text: '...' });
    }
    result.push(stack[idx]);
    lastShown = idx;
  }

  return result.length > 0 ? result : [{ type: 'same', lineNum: 1, text: '(no changes)' }];
}

export function DiffPreview({ file, original, modified, isDark, onClose }: DiffPreviewProps) {
  const colors = isDark
    ? { bg: 'rgba(10,10,18,0.92)', border: 'rgba(45,212,191,0.30)', text: '#ccc', added: 'rgba(34,197,94,0.15)', removed: 'rgba(239,68,68,0.15)', addedText: '#86efac', removedText: '#fca5a5', same: 'transparent', lineNum: '#555', header: 'rgba(10,10,18,0.6)' }
    : { bg: 'rgba(255,255,255,0.92)', border: 'rgba(20,184,166,0.32)', text: '#333', added: 'rgba(34,197,94,0.1)', removed: 'rgba(239,68,68,0.1)', addedText: '#166534', removedText: '#dc2626', same: 'transparent', lineNum: '#999', header: 'rgba(245,245,250,0.8)' };

  const diffLines = useMemo(() => computeSimpleDiff(original, modified), [original, modified]);

  const addedCount = diffLines.filter(l => l.type === 'added').length;
  const removedCount = diffLines.filter(l => l.type === 'removed').length;

  return (
    <div
      data-live-ui-overlay="1"
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width: 480,
        maxWidth: '100vw',
        background: colors.bg,
        borderLeft: `1px solid ${colors.border}`,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100000,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        color: colors.text,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Header */}
      <div style={{ padding: '10px 14px', background: colors.header, borderBottom: `1px solid ${colors.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Diff Preview</span>
        <span style={{ fontSize: 11, opacity: 0.7, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</span>
        <span style={{ fontSize: 11, color: colors.addedText }}>+{addedCount}</span>
        <span style={{ fontSize: 11, color: colors.removedText }}>-{removedCount}</span>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', color: colors.text, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
          aria-label="Close diff preview"
        >
          ✕
        </button>
      </div>

      {/* Diff Lines */}
      <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
        {diffLines.map((line, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              padding: '1px 8px',
              background: line.type === 'added' ? colors.added : line.type === 'removed' ? colors.removed : colors.same,
              borderLeft: line.type === 'added' ? '3px solid rgba(34,197,94,0.6)' : line.type === 'removed' ? '3px solid rgba(239,68,68,0.6)' : '3px solid transparent',
              minHeight: 20,
              alignItems: 'center',
            }}
          >
            <span style={{ width: 40, textAlign: 'right', paddingRight: 8, color: colors.lineNum, flexShrink: 0, fontSize: 10 }}>
              {line.lineNum ?? ''}
            </span>
            <span style={{ color: line.type === 'added' ? colors.addedText : line.type === 'removed' ? colors.removedText : colors.text, whiteSpace: 'pre', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
              {line.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default DiffPreview;
