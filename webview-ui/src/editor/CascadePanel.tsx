import React, { useMemo } from 'react';

export interface CascadePanelProps {
  selectedEl: HTMLElement | null;
  isDark: boolean;
  onClose: () => void;
}

interface MatchedRule {
  selector: string;
  specificity: [number, number, number]; // [id, class, element]
  properties: Record<string, string>;
  source: string; // e.g. "inline", "<style>", "stylesheet"
  overridden: Set<string>;
}

function calcSpecificity(selector: string): [number, number, number] {
  let ids = 0, classes = 0, elements = 0;
  // Strip pseudo-elements for counting
  const stripped = selector.replace(/::[a-z-]+/gi, '');
  ids = (stripped.match(/#[a-z_-][\w-]*/gi) || []).length;
  classes = (stripped.match(/\.[a-z_-][\w-]*/gi) || []).length
    + (stripped.match(/\[[^\]]+\]/g) || []).length
    + (stripped.match(/:(?!not|is|where|has)[a-z-]+/gi) || []).length;
  elements = (stripped.match(/(^|[\s+~>])(?![.#\[:*])[a-z][\w-]*/gi) || []).length
    + (stripped.match(/::?[a-z-]+/gi) || []).length;
  return [ids, classes, elements];
}

function specificityToString(s: [number, number, number]): string {
  return `(${s[0]}, ${s[1]}, ${s[2]})`;
}

function compareSpecificity(a: [number, number, number], b: [number, number, number]): number {
  if (a[0] !== b[0]) return a[0] - b[0];
  if (a[1] !== b[1]) return a[1] - b[1];
  return a[2] - b[2];
}

function getMatchedRules(el: HTMLElement): MatchedRule[] {
  const rules: MatchedRule[] = [];

  // 1. Collect from stylesheets
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;
      try {
        cssRules = sheet.cssRules;
      } catch {
        continue; // cross-origin sheet
      }
      const source = sheet.ownerNode instanceof HTMLStyleElement ? '<style>' :
        (sheet.href ? sheet.href.split('/').pop() || 'stylesheet' : 'stylesheet');

      for (const rule of Array.from(cssRules)) {
        if (rule instanceof CSSStyleRule) {
          try {
            if (el.matches(rule.selectorText)) {
              const props: Record<string, string> = {};
              for (let i = 0; i < rule.style.length; i++) {
                const prop = rule.style[i];
                props[prop] = rule.style.getPropertyValue(prop);
              }
              if (Object.keys(props).length > 0) {
                rules.push({
                  selector: rule.selectorText,
                  specificity: calcSpecificity(rule.selectorText),
                  properties: props,
                  source,
                  overridden: new Set(),
                });
              }
            }
          } catch {
            // Invalid selector
          }
        }
      }
    }
  } catch {
    // styleSheets access failed
  }

  // 2. Inline styles
  if (el.style.length > 0) {
    const props: Record<string, string> = {};
    for (let i = 0; i < el.style.length; i++) {
      const prop = el.style[i];
      props[prop] = el.style.getPropertyValue(prop);
    }
    rules.push({
      selector: 'element.style',
      specificity: [1, 0, 0] as [number, number, number], // inline beats all selectors
      properties: props,
      source: 'inline',
      overridden: new Set(),
    });
  }

  // Sort by specificity (highest last = wins)
  rules.sort((a, b) => compareSpecificity(a.specificity, b.specificity));

  // Mark overridden properties
  const winners = new Map<string, number>(); // prop -> winning rule index
  for (let i = 0; i < rules.length; i++) {
    for (const prop of Object.keys(rules[i].properties)) {
      if (winners.has(prop)) {
        const prevIdx = winners.get(prop)!;
        rules[prevIdx].overridden.add(prop);
      }
      winners.set(prop, i);
    }
  }

  return rules;
}

export function CascadePanel({ selectedEl, isDark, onClose }: CascadePanelProps) {
  const rules = useMemo(() => {
    if (!selectedEl) return [];
    return getMatchedRules(selectedEl);
  }, [selectedEl]);

  const computedHighlights = useMemo(() => {
    if (!selectedEl) return {};
    const cs = window.getComputedStyle(selectedEl);
    const keyProps = ['display', 'position', 'width', 'height', 'margin', 'padding',
      'color', 'background-color', 'font-size', 'font-family', 'border', 'z-index',
      'opacity', 'overflow', 'flex', 'grid-template-columns'];
    const result: Record<string, string> = {};
    for (const p of keyProps) {
      const v = cs.getPropertyValue(p);
      if (v) result[p] = v;
    }
    return result;
  }, [selectedEl]);

  const bg = isDark ? 'rgba(10,10,18,0.92)' : 'rgba(255,255,255,0.92)';
  const fg = isDark ? '#e0e0e0' : '#1e1e1e';
  const border = isDark ? 'rgba(45,212,191,0.30)' : 'rgba(20,184,166,0.32)';
  const accent = '#2dd4bf';
  const accentPurple = '#7c3aed';

  const tagName = selectedEl?.tagName.toLowerCase() || '';

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 380,
      background: bg, color: fg, borderLeft: `1px solid ${border}`,
      display: 'flex', flexDirection: 'column', fontSize: 12,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', zIndex: 10001,
      boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
    }}>
      {/* Header */}
      <div style={{
        padding: '10px 14px', borderBottom: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: isDark ? 'rgba(10,10,18,0.6)' : 'rgba(245,245,250,0.8)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>🎨</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>CSS Cascade</span>
          {tagName && (
            <span style={{
              background: `linear-gradient(135deg, ${accent} 0%, ${accentPurple} 100%)`, color: '#fff', borderRadius: 8,
              padding: '2px 8px', fontSize: 11, fontWeight: 600,
            }}>
              &lt;{tagName}&gt;
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', color: fg, cursor: 'pointer',
            fontSize: 18, lineHeight: 1, padding: '2px 6px',
          }}
        >×</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* Computed key values */}
        <div style={{ padding: '6px 14px', marginBottom: 6 }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 0.5, color: accent, marginBottom: 6,
          }}>
            Computed Values
          </div>
          {Object.entries(computedHighlights).map(([prop, val]) => (
            <div key={prop} style={{
              display: 'flex', justifyContent: 'space-between', padding: '2px 0',
              borderBottom: `1px solid ${border}`,
            }}>
              <span style={{ color: isDark ? '#93c5fd' : '#2563eb' }}>{prop}</span>
              <span style={{ color: isDark ? '#d1d5db' : '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{val}</span>
            </div>
          ))}
        </div>

        {/* Matched rules */}
        <div style={{ padding: '6px 14px' }}>
          <div style={{
            fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 0.5, color: accent, marginBottom: 6,
          }}>
            Matched Rules ({rules.length})
          </div>
          {rules.length === 0 && (
            <div style={{ fontStyle: 'italic', opacity: 0.6, padding: '12px 0', textAlign: 'center' }}>
              {selectedEl ? 'No CSS rules matched' : 'Select an element to inspect its CSS cascade'}
            </div>
          )}
          {rules.map((rule, ri) => (
            <div key={ri} style={{
              marginBottom: 10, borderRadius: 10, overflow: 'hidden',
              border: `1px solid ${border}`,
              background: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.03)',
            }}>
              {/* Rule header */}
              <div style={{
                padding: '6px 10px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: `1px solid ${border}`,
                background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              }}>
                <span style={{ fontWeight: 600, color: isDark ? accent : accentPurple }}>
                  {rule.selector}
                </span>
                <span style={{ fontSize: 10, opacity: 0.7 }}>
                  {specificityToString(rule.specificity)} · {rule.source}
                </span>
              </div>
              {/* Properties */}
              <div style={{ padding: '4px 10px' }}>
                {Object.entries(rule.properties).map(([prop, val]) => {
                  const isOverridden = rule.overridden.has(prop);
                  return (
                    <div key={prop} style={{
                      display: 'flex', justifyContent: 'space-between',
                      padding: '1px 0',
                      textDecoration: isOverridden ? 'line-through' : 'none',
                      opacity: isOverridden ? 0.45 : 1,
                    }}>
                      <span style={{ color: isDark ? accent : '#0d9488' }}>{prop}</span>
                      <span style={{
                        color: isDark ? '#d1d5db' : '#374151',
                        maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {val}
                        {prop.includes('color') && val && (
                          <span style={{
                            display: 'inline-block', width: 10, height: 10,
                            background: val, borderRadius: 2, marginLeft: 4,
                            border: `1px solid ${border}`, verticalAlign: 'middle',
                          }} />
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
