import React, { useEffect, useMemo, useState } from 'react';

export type PropertyInspectorProps = {
  selectedEl: HTMLElement | null;
  isDark: boolean;
  onStyleChange?: (prop: string, value: string) => void;
};

type ComputedSection = {
  label: string;
  props: Array<{ key: string; cssProp: string; value: string; editable?: boolean }>;
};

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function parseBoxValues(el: HTMLElement, prop: string): { top: string; right: string; bottom: string; left: string } {
  const cs = window.getComputedStyle(el);
  return {
    top: cs.getPropertyValue(`${prop}-top`) || '0px',
    right: cs.getPropertyValue(`${prop}-right`) || '0px',
    bottom: cs.getPropertyValue(`${prop}-bottom`) || '0px',
    left: cs.getPropertyValue(`${prop}-left`) || '0px',
  };
}

function px(v: string): number {
  return Math.round(parseFloat(v) || 0);
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return rgb;
  const r = Number(m[1]);
  const g = Number(m[2]);
  const b = Number(m[3]);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function PropertyInspector({ selectedEl, isDark, onStyleChange }: PropertyInspectorProps) {
  const [sections, setSections] = useState<ComputedSection[]>([]);
  const [boxModel, setBoxModel] = useState<{
    margin: { top: string; right: string; bottom: string; left: string };
    padding: { top: string; right: string; bottom: string; left: string };
    border: { top: string; right: string; bottom: string; left: string };
    width: string;
    height: string;
  } | null>(null);
  const [editingProp, setEditingProp] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const colors = useMemo(() => ({
    border: isDark ? 'rgba(45,212,191,0.25)' : 'rgba(20,184,166,0.28)',
    surface: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
    card: isDark ? 'rgba(10,10,18,0.50)' : 'rgba(255,255,255,0.82)',
    label: isDark ? 'rgba(255,255,255,0.50)' : 'rgba(0,0,0,0.45)',
    value: isDark ? 'rgba(45,212,191,0.9)' : 'rgba(13,148,136,0.95)',
    text: isDark ? '#e2e8f0' : '#1e293b',
    marginColor: isDark ? 'rgba(251,146,60,0.30)' : 'rgba(251,146,60,0.20)',
    borderColor: isDark ? 'rgba(251,191,36,0.35)' : 'rgba(251,191,36,0.25)',
    paddingColor: isDark ? 'rgba(74,222,128,0.30)' : 'rgba(74,222,128,0.20)',
    contentColor: isDark ? 'rgba(96,165,250,0.30)' : 'rgba(96,165,250,0.20)',
  }), [isDark]);

  useEffect(() => {
    if (!selectedEl || !selectedEl.isConnected) {
      setSections([]);
      setBoxModel(null);
      return;
    }

    const cs = window.getComputedStyle(selectedEl);
    const rect = selectedEl.getBoundingClientRect();

    // Box model
    setBoxModel({
      margin: parseBoxValues(selectedEl, 'margin'),
      padding: parseBoxValues(selectedEl, 'padding'),
      border: parseBoxValues(selectedEl, 'border'),
      width: `${Math.round(rect.width)}px`,
      height: `${Math.round(rect.height)}px`,
    });

    const get = (p: string) => cs.getPropertyValue(p)?.trim() || '';

    const display = get('display');
    const parentDisplay = selectedEl.parentElement
      ? window.getComputedStyle(selectedEl.parentElement).getPropertyValue('display')?.trim() || ''
      : '';
    const isFlex = display === 'flex' || display === 'inline-flex';
    const isGrid = display === 'grid' || display === 'inline-grid';
    const parentIsFlex = parentDisplay === 'flex' || parentDisplay === 'inline-flex';
    const parentIsGrid = parentDisplay === 'grid' || parentDisplay === 'inline-grid';

    const layoutProps: Array<{ key: string; cssProp: string; value: string; editable?: boolean }> = [
      { key: 'display', cssProp: 'display', value: display, editable: true },
      { key: 'position', cssProp: 'position', value: get('position'), editable: true },
      { key: 'width', cssProp: 'width', value: `${Math.round(rect.width)}px`, editable: true },
      { key: 'height', cssProp: 'height', value: `${Math.round(rect.height)}px`, editable: true },
      { key: 'flex', cssProp: 'flex', value: get('flex') },
    ];
    if (isFlex) {
      layoutProps.push(
        { key: 'flex-direction', cssProp: 'flex-direction', value: get('flex-direction'), editable: true },
        { key: 'flex-wrap', cssProp: 'flex-wrap', value: get('flex-wrap'), editable: true },
        { key: 'justify-content', cssProp: 'justify-content', value: get('justify-content'), editable: true },
        { key: 'align-items', cssProp: 'align-items', value: get('align-items'), editable: true },
        { key: 'align-content', cssProp: 'align-content', value: get('align-content'), editable: true },
        { key: 'gap', cssProp: 'gap', value: get('gap'), editable: true },
      );
    }
    if (parentIsFlex) {
      layoutProps.push(
        { key: 'flex-grow', cssProp: 'flex-grow', value: get('flex-grow'), editable: true },
        { key: 'flex-shrink', cssProp: 'flex-shrink', value: get('flex-shrink'), editable: true },
        { key: 'flex-basis', cssProp: 'flex-basis', value: get('flex-basis'), editable: true },
        { key: 'order', cssProp: 'order', value: get('order'), editable: true },
      );
    }
    if (isGrid) {
      layoutProps.push(
        { key: 'grid-template-columns', cssProp: 'grid-template-columns', value: get('grid-template-columns'), editable: true },
        { key: 'grid-template-rows', cssProp: 'grid-template-rows', value: get('grid-template-rows'), editable: true },
        { key: 'gap', cssProp: 'gap', value: get('gap'), editable: true },
      );
    }
    if (parentIsGrid) {
      layoutProps.push(
        { key: 'grid-column', cssProp: 'grid-column', value: get('grid-column'), editable: true },
        { key: 'grid-row', cssProp: 'grid-row', value: get('grid-row'), editable: true },
      );
    }
    const layoutSection: ComputedSection = {
      label: 'Layout',
      props: layoutProps.filter(p => p.value && p.value !== 'none' && p.value !== 'auto' && p.value !== 'normal' && p.value !== '0' && p.value !== '0px'),
    };

    const typographySection: ComputedSection = {
      label: 'Typography',
      props: [
        { key: 'font-family', cssProp: 'font-family', value: get('font-family'), editable: true },
        { key: 'font-size', cssProp: 'font-size', value: get('font-size'), editable: true },
        { key: 'font-weight', cssProp: 'font-weight', value: get('font-weight'), editable: true },
        { key: 'line-height', cssProp: 'line-height', value: get('line-height'), editable: true },
        { key: 'letter-spacing', cssProp: 'letter-spacing', value: get('letter-spacing') },
        { key: 'text-align', cssProp: 'text-align', value: get('text-align') },
        { key: 'text-transform', cssProp: 'text-transform', value: get('text-transform') },
        { key: 'text-decoration', cssProp: 'text-decoration', value: get('text-decoration') },
      ].filter(p => p.value && p.value !== 'none' && p.value !== 'normal'),
    };

    const colorSection: ComputedSection = {
      label: 'Colors',
      props: [
        { key: 'color', cssProp: 'color', value: get('color'), editable: true },
        { key: 'background', cssProp: 'background-color', value: get('background-color'), editable: true },
        { key: 'opacity', cssProp: 'opacity', value: get('opacity'), editable: true },
      ].filter(p => p.value && p.value !== 'rgba(0, 0, 0, 0)' && p.value !== 'transparent'),
    };

    const borderSection: ComputedSection = {
      label: 'Border & Shadow',
      props: [
        { key: 'border', cssProp: 'border', value: get('border') },
        { key: 'border-radius', cssProp: 'border-radius', value: get('border-radius'), editable: true },
        { key: 'box-shadow', cssProp: 'box-shadow', value: get('box-shadow') },
        { key: 'outline', cssProp: 'outline', value: get('outline') },
      ].filter(p => p.value && p.value !== 'none' && p.value !== '0px'),
    };

    const spacingSection: ComputedSection = {
      label: 'Spacing',
      props: [
        { key: 'margin', cssProp: 'margin', value: get('margin'), editable: true },
        { key: 'padding', cssProp: 'padding', value: get('padding'), editable: true },
      ].filter(p => p.value && p.value !== '0px'),
    };

    const effectsSection: ComputedSection = {
      label: 'Effects',
      props: [
        { key: 'overflow', cssProp: 'overflow', value: get('overflow'), editable: true },
        { key: 'cursor', cssProp: 'cursor', value: get('cursor') },
        { key: 'z-index', cssProp: 'z-index', value: get('z-index'), editable: true },
        { key: 'transition', cssProp: 'transition', value: get('transition') },
        { key: 'transform', cssProp: 'transform', value: get('transform'), editable: true },
        { key: 'visibility', cssProp: 'visibility', value: get('visibility') },
        { key: 'pointer-events', cssProp: 'pointer-events', value: get('pointer-events') },
      ].filter(p => {
        if (!p.value) return false;
        if (p.key === 'overflow' && p.value === 'visible') return false;
        if (p.key === 'cursor' && (p.value === 'auto' || p.value === 'default')) return false;
        if (p.key === 'z-index' && p.value === 'auto') return false;
        if (p.key === 'transition' && (p.value === 'none' || p.value === 'all 0s ease 0s')) return false;
        if (p.key === 'transform' && p.value === 'none') return false;
        if (p.key === 'visibility' && p.value === 'visible') return false;
        if (p.key === 'pointer-events' && p.value === 'auto') return false;
        return true;
      }),
    };

    setSections([layoutSection, typographySection, colorSection, borderSection, spacingSection, effectsSection].filter(s => s.props.length > 0));
  }, [selectedEl]);

  if (!selectedEl || !selectedEl.isConnected) return null;

  const tag = selectedEl.tagName.toLowerCase();
  const classes = Array.from(selectedEl.classList || []).slice(0, 6);
  const elId = selectedEl.id;

  const renderCs = window.getComputedStyle(selectedEl);
  const currentDisplay = renderCs.display?.trim() || '';
  const currentIsFlex = currentDisplay === 'flex' || currentDisplay === 'inline-flex';
  const currentIsGrid = currentDisplay === 'grid' || currentDisplay === 'inline-grid';

  const handleEdit = (key: string, currentValue: string) => {
    setEditingProp(key);
    setEditValue(currentValue);
  };

  const handleEditCommit = (cssProp: string) => {
    if (onStyleChange && editValue) {
      onStyleChange(cssProp, editValue);
    }
    setEditingProp(null);
    setEditValue('');
  };

  const handleEditCancel = () => {
    setEditingProp(null);
    setEditValue('');
  };

  return (
    <div
      style={{
        width: 280,
        minWidth: 220,
        maxWidth: 340,
        borderLeft: `1px solid ${colors.border}`,
        background: colors.card,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        fontSize: 12,
        color: colors.text,
      }}
      data-live-ui-overlay="1"
      role="complementary"
      aria-label="Property inspector"
    >
      {/* Element Identity */}
      <div style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            padding: '2px 6px',
            borderRadius: 4,
            background: 'rgba(124,58,237,0.2)',
            color: isDark ? '#c4b5fd' : '#7c3aed',
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
          }}>
            {tag}
          </span>
          {elId && (
            <span style={{
              padding: '2px 6px',
              borderRadius: 4,
              background: 'rgba(45,212,191,0.15)',
              color: isDark ? '#5eead4' : '#0d9488',
              fontFamily: MONO,
              fontSize: 11,
            }}>
              #{elId}
            </span>
          )}
        </div>
        {classes.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {classes.map((c, i) => (
              <span key={i} style={{
                padding: '1px 5px',
                borderRadius: 3,
                background: colors.surface,
                border: `1px solid ${colors.border}`,
                fontFamily: MONO,
                fontSize: 10,
                opacity: 0.85,
              }}>
                .{c}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Display Quick Toggle */}
      <div style={{ padding: '6px 12px', borderBottom: `1px solid ${colors.border}`, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {(['block', 'flex', 'grid', 'inline', 'inline-flex', 'inline-grid', 'none'] as const).map((v) => (
          <button
            key={v}
            onClick={() => onStyleChange?.('display', v)}
            style={{
              height: 20,
              padding: '0 6px',
              borderRadius: 4,
              border: `1px solid ${colors.border}`,
              background: currentDisplay === v ? 'rgba(99,102,241,0.7)' : colors.surface,
              color: currentDisplay === v ? '#fff' : colors.text,
              fontFamily: MONO,
              fontSize: 10,
              cursor: 'pointer',
              fontWeight: currentDisplay === v ? 700 : 400,
              lineHeight: '18px',
            }}
            aria-label={`Set display to ${v}`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Box Model Visualization */}
      {boxModel && (
        <div style={{ padding: '10px 12px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.7, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Box Model</div>
          <div style={{ position: 'relative', textAlign: 'center', fontFamily: MONO, fontSize: 10 }}>
            {/* Margin */}
            <div style={{
              padding: '8px 12px',
              background: colors.marginColor,
              borderRadius: 6,
              border: `1px dashed rgba(251,146,60,0.4)`,
            }}>
              <div style={{ opacity: 0.6, fontSize: 9, marginBottom: 2 }}>margin</div>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
                <span>{px(boxModel.margin.top)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{px(boxModel.margin.left)}</span>
                {/* Border */}
                <div style={{
                  flex: 1,
                  margin: '0 6px',
                  padding: '6px 10px',
                  background: colors.borderColor,
                  borderRadius: 4,
                  border: `1px solid rgba(251,191,36,0.4)`,
                }}>
                  <div style={{ opacity: 0.6, fontSize: 9, marginBottom: 2 }}>border</div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
                    <span>{px(boxModel.border.top)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{px(boxModel.border.left)}</span>
                    {/* Padding */}
                    <div style={{
                      flex: 1,
                      margin: '0 4px',
                      padding: '6px 8px',
                      background: colors.paddingColor,
                      borderRadius: 4,
                      border: `1px dashed rgba(74,222,128,0.4)`,
                    }}>
                      <div style={{ opacity: 0.6, fontSize: 9, marginBottom: 2 }}>padding</div>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 2 }}>
                        <span>{px(boxModel.padding.top)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>{px(boxModel.padding.left)}</span>
                        {/* Content */}
                        <div style={{
                          flex: 1,
                          margin: '0 4px',
                          padding: '4px 6px',
                          background: colors.contentColor,
                          borderRadius: 3,
                          fontWeight: 700,
                          fontSize: 11,
                        }}>
                          {boxModel.width} × {boxModel.height}
                        </div>
                        <span>{px(boxModel.padding.right)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
                        <span>{px(boxModel.padding.bottom)}</span>
                      </div>
                    </div>
                    <span>{px(boxModel.border.right)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
                    <span>{px(boxModel.border.bottom)}</span>
                  </div>
                </div>
                <span>{px(boxModel.margin.right)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
                <span>{px(boxModel.margin.bottom)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Computed Styles Sections */}
      {sections.map((section) => (
        <div key={section.label} style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.7, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>{section.label}</div>
          {section.props.map((prop) => (
            <div
              key={prop.key}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '3px 0',
                gap: 8,
              }}
            >
              <span style={{ color: colors.label, fontFamily: MONO, fontSize: 11, flexShrink: 0 }}>{prop.key}</span>
              {editingProp === prop.key ? (
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleEditCommit(prop.cssProp);
                    if (e.key === 'Escape') handleEditCancel();
                  }}
                  onBlur={() => handleEditCommit(prop.cssProp)}
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: colors.value,
                    background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)',
                    border: `1px solid ${colors.border}`,
                    borderRadius: 3,
                    padding: '1px 4px',
                    outline: 'none',
                    maxWidth: 130,
                    flex: 1,
                  }}
                  aria-label={`Edit ${prop.key}`}
                />
              ) : (
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: colors.value,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: 150,
                    cursor: prop.editable ? 'pointer' : 'default',
                    textAlign: 'right',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: 4,
                  }}
                  title={`${prop.key}: ${prop.value}${prop.editable ? ' (click to edit)' : ''}`}
                  onClick={prop.editable ? () => handleEdit(prop.key, prop.value) : undefined}
                >
                  {/* Color swatch + picker for color values */}
                  {(prop.key === 'color' || prop.key === 'background') && prop.value && prop.value !== 'transparent' ? (
                    <>
                      <input
                        type="color"
                        value={rgbToHex(prop.value)}
                        onChange={(e) => onStyleChange?.(prop.cssProp, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 20,
                          height: 20,
                          padding: 0,
                          border: `1px solid ${colors.border}`,
                          borderRadius: 3,
                          cursor: 'pointer',
                          background: 'transparent',
                          flexShrink: 0,
                        }}
                        aria-label={`Pick ${prop.key}`}
                      />
                    </>
                  ) : null}
                  {(prop.key === 'color' || prop.key === 'background') ? rgbToHex(prop.value) : prop.value}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Quick Layout Controls */}
      {currentIsFlex && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.7, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Quick Layout – Flex</div>
          {/* Direction */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: colors.label, fontSize: 10, marginBottom: 3 }}>Direction</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {([['row', '→'], ['row-reverse', '←'], ['column', '↓'], ['column-reverse', '↑']] as const).map(([val, icon]) => (
                <button
                  key={val}
                  onClick={() => onStyleChange?.('flex-direction', val)}
                  style={{
                    height: 22, minWidth: 28, padding: '0 5px', borderRadius: 4,
                    border: `1px solid ${colors.border}`,
                    background: renderCs.flexDirection === val ? 'rgba(99,102,241,0.7)' : colors.surface,
                    color: renderCs.flexDirection === val ? '#fff' : colors.text,
                    fontFamily: MONO, fontSize: 12, cursor: 'pointer', fontWeight: 600,
                  }}
                  aria-label={`flex-direction: ${val}`}
                >{icon}</button>
              ))}
            </div>
          </div>
          {/* Justify Content */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: colors.label, fontSize: 10, marginBottom: 3 }}>Justify</div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'].map((val) => (
                <button
                  key={val}
                  onClick={() => onStyleChange?.('justify-content', val)}
                  style={{
                    height: 20, padding: '0 4px', borderRadius: 4,
                    border: `1px solid ${colors.border}`,
                    background: renderCs.justifyContent === val ? 'rgba(99,102,241,0.7)' : colors.surface,
                    color: renderCs.justifyContent === val ? '#fff' : colors.text,
                    fontFamily: MONO, fontSize: 9, cursor: 'pointer',
                  }}
                  aria-label={`justify-content: ${val}`}
                >{val.replace('flex-', '').replace('space-', 's-')}</button>
              ))}
            </div>
          </div>
          {/* Align Items */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: colors.label, fontSize: 10, marginBottom: 3 }}>Align</div>
            <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              {['flex-start', 'center', 'flex-end', 'stretch', 'baseline'].map((val) => (
                <button
                  key={val}
                  onClick={() => onStyleChange?.('align-items', val)}
                  style={{
                    height: 20, padding: '0 4px', borderRadius: 4,
                    border: `1px solid ${colors.border}`,
                    background: renderCs.alignItems === val ? 'rgba(99,102,241,0.7)' : colors.surface,
                    color: renderCs.alignItems === val ? '#fff' : colors.text,
                    fontFamily: MONO, fontSize: 9, cursor: 'pointer',
                  }}
                  aria-label={`align-items: ${val}`}
                >{val.replace('flex-', '')}</button>
              ))}
            </div>
          </div>
          {/* Wrap */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: colors.label, fontSize: 10, marginBottom: 3 }}>Wrap</div>
            <div style={{ display: 'flex', gap: 3 }}>
              {['nowrap', 'wrap', 'wrap-reverse'].map((val) => (
                <button
                  key={val}
                  onClick={() => onStyleChange?.('flex-wrap', val)}
                  style={{
                    height: 20, padding: '0 5px', borderRadius: 4,
                    border: `1px solid ${colors.border}`,
                    background: renderCs.flexWrap === val ? 'rgba(99,102,241,0.7)' : colors.surface,
                    color: renderCs.flexWrap === val ? '#fff' : colors.text,
                    fontFamily: MONO, fontSize: 9, cursor: 'pointer',
                  }}
                  aria-label={`flex-wrap: ${val}`}
                >{val}</button>
              ))}
            </div>
          </div>
          {/* Gap */}
          <div>
            <div style={{ color: colors.label, fontSize: 10, marginBottom: 3 }}>Gap (px)</div>
            <input
              type="number"
              min={0}
              defaultValue={parseInt(renderCs.gap) || 0}
              onChange={(e) => onStyleChange?.('gap', `${e.target.value}px`)}
              style={{
                width: 60, height: 22, padding: '0 4px', borderRadius: 4,
                border: `1px solid ${colors.border}`, background: colors.surface,
                color: colors.value, fontFamily: MONO, fontSize: 11, outline: 'none',
              }}
              aria-label="Gap in pixels"
            />
          </div>
        </div>
      )}

      {currentIsGrid && (
        <div style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border}` }}>
          <div style={{ fontWeight: 700, fontSize: 11, opacity: 0.7, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.8 }}>Quick Layout – Grid</div>
          {/* Columns */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: colors.label, fontSize: 10, marginBottom: 3 }}>Columns</div>
            <input
              type="text"
              defaultValue={renderCs.gridTemplateColumns}
              onKeyDown={(e) => { if (e.key === 'Enter') onStyleChange?.('grid-template-columns', (e.target as HTMLInputElement).value); }}
              onBlur={(e) => onStyleChange?.('grid-template-columns', e.target.value)}
              style={{
                width: '100%', height: 22, padding: '0 4px', borderRadius: 4,
                border: `1px solid ${colors.border}`, background: colors.surface,
                color: colors.value, fontFamily: MONO, fontSize: 10, outline: 'none',
                boxSizing: 'border-box' as const,
              }}
              aria-label="grid-template-columns"
            />
          </div>
          {/* Rows */}
          <div style={{ marginBottom: 6 }}>
            <div style={{ color: colors.label, fontSize: 10, marginBottom: 3 }}>Rows</div>
            <input
              type="text"
              defaultValue={renderCs.gridTemplateRows}
              onKeyDown={(e) => { if (e.key === 'Enter') onStyleChange?.('grid-template-rows', (e.target as HTMLInputElement).value); }}
              onBlur={(e) => onStyleChange?.('grid-template-rows', e.target.value)}
              style={{
                width: '100%', height: 22, padding: '0 4px', borderRadius: 4,
                border: `1px solid ${colors.border}`, background: colors.surface,
                color: colors.value, fontFamily: MONO, fontSize: 10, outline: 'none',
                boxSizing: 'border-box' as const,
              }}
              aria-label="grid-template-rows"
            />
          </div>
          {/* Gap */}
          <div>
            <div style={{ color: colors.label, fontSize: 10, marginBottom: 3 }}>Gap (px)</div>
            <input
              type="number"
              min={0}
              defaultValue={parseInt(renderCs.gap) || 0}
              onChange={(e) => onStyleChange?.('gap', `${e.target.value}px`)}
              style={{
                width: 60, height: 22, padding: '0 4px', borderRadius: 4,
                border: `1px solid ${colors.border}`, background: colors.surface,
                color: colors.value, fontFamily: MONO, fontSize: 11, outline: 'none',
              }}
              aria-label="Gap in pixels"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default PropertyInspector;
