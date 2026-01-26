import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isToWebviewMessage, type FromWebviewMessage, type QuickStartInfoMessage } from './bridge/messages';
import { DebugOverlay, type DebugStats } from './editor/debugOverlay';
import type { SelectionModel } from './editor/types';
import { hitTestAtPoint } from './editor/hitTest';
import { getScrollParents } from './editor/scrollParents';
import logo from '../../images/logo.png';

type SourceLocator = { file: string; line: number; column?: number };

function getCurrentTranslate(el: HTMLElement): [number, number] {
  const inline = el.style.transform;
  const computed = window.getComputedStyle(el).transform;
  const t = (inline && inline !== 'none') ? inline : computed;
  if (!t || t === 'none') return [0, 0];
  try {
    // DOMMatrixReadOnly supports `matrix(...)` and `translate(...)` formats.
    const m = new DOMMatrixReadOnly(t);
    return [Math.round(m.m41), Math.round(m.m42)];
  } catch {
    return [0, 0];
  }
}

function setTranslate(target: HTMLElement, x: number, y: number) {
  target.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function isInlineTextElement(el: HTMLElement): boolean {
  const tag = el.tagName.toLowerCase();
  const inlineTags = new Set(['span', 'a', 'strong', 'em', 'small', 'label', 'b', 'i', 'u']);
  if (!inlineTags.has(tag)) return false;
  const display = window.getComputedStyle(el).display;
  return display === 'inline';
}

function getSelectedComputedStylePatch(el: HTMLElement): Record<string, string> {
  const computed = window.getComputedStyle(el);
  const pairs: Array<[string, string]> = [
    ['color', 'color'],
    ['opacity', 'opacity'],
    ['backgroundColor', 'background-color'],
    ['fontFamily', 'font-family'],
    ['fontSize', 'font-size'],
    ['fontWeight', 'font-weight'],
    ['letterSpacing', 'letter-spacing'],
    ['lineHeight', 'line-height'],
    ['textTransform', 'text-transform'],
    ['textDecoration', 'text-decoration'],
    ['textShadow', 'text-shadow'],
    ['border', 'border'],
    ['borderColor', 'border-color'],
    ['borderWidth', 'border-width'],
    ['borderStyle', 'border-style'],
    ['borderRadius', 'border-radius'],
    ['boxShadow', 'box-shadow'],
    ['padding', 'padding'],
  ];
  const patch: Record<string, string> = {};
  for (const [key, cssProp] of pairs) {
    const v = computed.getPropertyValue(cssProp)?.trim();
    if (!v) continue;
    // Skip noisy defaults.
    if (v === 'auto' || v === 'normal' || v === 'none') continue;
    patch[key] = v;
  }
  return patch;
}

function pickBreadcrumbLabel(el: HTMLElement): string {
  const tag = el.tagName.toLowerCase();
  if (el.classList.contains('target')) return 'Target area';
  if (el.getAttribute('data-live-ui-group-root') === '1') {
    const className = (el.getAttribute('class') || '').toLowerCase();
    if (/(scroll|carousel|list)/.test(className)) return 'scroll box';
    return 'group';
  }

  const classList = Array.from(el.classList || []);
  const preferred = classList.find(c => /(scroll|carousel|list|card|title|header|footer|container|panel)/i.test(c));
  if (preferred) return preferred;

  if (/^h[1-6]$/.test(tag)) return 'title';
  if (tag === 'p') return 'text';
  return tag;
}

function buildBreadcrumbTrail(args: { leaf: HTMLElement; root?: HTMLElement | null; max?: number }): HTMLElement[] {
  const max = Math.max(2, Math.min(10, args.max ?? 6));
  const root = args.root ?? args.leaf.closest<HTMLElement>('.target');
  const chain: HTMLElement[] = [];
  let cur: HTMLElement | null = args.leaf;
  while (cur) {
    chain.push(cur);
    if (root && cur === root) break;
    cur = cur.parentElement;
  }
  const ordered = chain.reverse();

  // Filter down to “meaningful” crumbs, but always keep endpoints.
  const important = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase();
    if (el.classList.contains('target')) return true;
    if (el.getAttribute('data-live-ui-group-root') === '1') return true;
    if (/(card|scroll|carousel|list|container|panel)/i.test(el.className || '')) return true;
    if (/^h[1-6]$/.test(tag)) return true;
    return false;
  };
  const filtered: HTMLElement[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const el = ordered[i];
    if (i === 0 || i === ordered.length - 1 || important(el)) filtered.push(el);
  }

  // Trim from the front if we’re too long (keep the leaf).
  if (filtered.length > max) {
    return filtered.slice(filtered.length - max);
  }
  return filtered;
}

export default function App() {
  const vscode = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyWindow = window as any;
    return typeof anyWindow.acquireVsCodeApi === 'function' ? anyWindow.acquireVsCodeApi() : undefined;
  }, []);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasEl, setCanvasEl] = useState<HTMLDivElement | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [loadedFile, setLoadedFile] = useState<string>('');

  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [isInlineText, setIsInlineText] = useState<boolean>(false);
  const [selectionMode, setSelectionMode] = useState<'element' | 'group'>('group');
  const [helpExpanded, setHelpExpanded] = useState<boolean>(false);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ el: HTMLElement; label: string }>>([]);

  const [welcomeMode, setWelcomeMode] = useState<'html' | 'app'>('html');
  const [quickStartInfo, setQuickStartInfo] = useState<QuickStartInfoMessage['info'] | null>(null);
  const [appConnect, setAppConnect] = useState<'integrated' | 'existing' | 'external'>('integrated');
  const [appUrl, setAppUrl] = useState<string>('http://127.0.0.1:5173');
  const [appStyleAdapterPref, setAppStyleAdapterPref] = useState<'auto' | 'tailwind' | 'cssClass' | 'inline'>('auto');
  const [appLayoutApplyMode, setAppLayoutApplyMode] = useState<'off' | 'safe' | 'full'>('safe');
  const [appStartBackend, setAppStartBackend] = useState<boolean>(false);

  // Monorepo UX: pick the app/preview target before running anything.
  const [detectedPickKind, setDetectedPickKind] = useState<'app' | 'preview' | 'none'>('none');
  const [detectedAppRoot, setDetectedAppRoot] = useState<string>('');
  const [detectedPreviewId, setDetectedPreviewId] = useState<string>('');
  const [detectedUrl, setDetectedUrl] = useState<string>('');
  const detectedUrlDefaultRef = useRef<string>('');

  const theme = useMemo(() => {
    return {
      fg: 'var(--vscode-foreground, #111)',
      desc: 'var(--vscode-descriptionForeground, #444)',
      bg: 'var(--vscode-editor-background, #fff)',
      panel: 'var(--vscode-editorWidget-background, #f3f3f3)',
      border: 'var(--vscode-widget-border, rgba(127,127,127,0.4))',
      buttonBg: 'var(--vscode-button-background, #0e639c)',
      buttonFg: 'var(--vscode-button-foreground, #fff)',
      inputBg: 'var(--vscode-input-background, #fff)',
      inputFg: 'var(--vscode-input-foreground, #111)',
      inputBorder: 'var(--vscode-input-border, rgba(127,127,127,0.4))',
    };
  }, []);

  const [isDark, setIsDark] = useState<boolean>(true);
  useEffect(() => {
    const parseRgb = (v: string): { r: number; g: number; b: number } | null => {
      const m = v.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (!m) return null;
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    };
    const parseHex = (v: string): { r: number; g: number; b: number } | null => {
      const s = v.trim();
      const m = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
      if (!m) return null;
      const hex = m[1].length === 3
        ? m[1].split('').map(ch => ch + ch).join('')
        : m[1];
      const n = Number.parseInt(hex, 16);
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const srgb = [r, g, b].map(v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
    };

    const bg = getComputedStyle(document.documentElement)
      .getPropertyValue('--vscode-editor-background')
      .trim();
    const rgb = parseHex(bg) ?? parseRgb(bg);
    if (!rgb) return;
    setIsDark(luminance(rgb) < 0.5);
  }, []);

  const brand = useMemo(() => {
    return {
      teal: '#2dd4bf',
      purple: '#7c3aed',
      pink: '#fb7185',
    };
  }, []);

  const ui = useMemo(() => {
    // Teal-tinted borders to match the new brand palette (instead of neutral gray).
    const border = isDark ? 'rgba(45,212,191,0.30)' : 'rgba(20,184,166,0.32)';
    const surface = isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.03)';
    const surfaceStrong = isDark ? 'rgba(255,255,255,0.075)' : 'rgba(0,0,0,0.045)';
    const panel = isDark ? 'rgba(10,10,18,0.44)' : 'rgba(255,255,255,0.78)';
    const card = isDark ? 'rgba(10,10,18,0.56)' : 'rgba(255,255,255,0.86)';
    const gradientStrong = `linear-gradient(135deg, ${brand.teal} 0%, ${brand.purple} 55%, ${brand.pink} 100%)`;
    const gradientSoft = `linear-gradient(135deg, rgba(45,212,191,0.28) 0%, rgba(124,58,237,0.22) 55%, rgba(251,113,133,0.26) 100%)`;
    const glow = isDark
      ? '0 18px 55px rgba(0,0,0,0.55)'
      : '0 18px 55px rgba(0,0,0,0.14)';

    return {
      border,
      surface,
      surfaceStrong,
      panel,
      card,
      glow,
      gradientStrong,
      gradientSoft,
    };
  }, [brand.pink, brand.purple, brand.teal, isDark]);

  const toggleButtonStyle = (active: boolean): React.CSSProperties => {
    return {
      padding: '10px 14px',
      borderRadius: 12,
      border: `1px solid ${ui.border}`,
      background: active ? ui.gradientSoft : ui.surface,
      color: theme.fg,
      fontWeight: 800,
      cursor: 'pointer',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    };
  };

  const controlButtonStyle = (active?: boolean): React.CSSProperties => {
    return {
      padding: '6px 10px',
      borderRadius: 10,
      border: `1px solid ${ui.border}`,
      color: theme.fg,
      background: active ? ui.gradientSoft : ui.surface,
      cursor: 'pointer',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
    };
  };

  const primaryButtonStyle: React.CSSProperties = {
    padding: '12px 16px',
    borderRadius: 12,
    border: 'none',
    backgroundImage: ui.gradientStrong,
    color: '#ffffff',
    fontWeight: 900,
    cursor: 'pointer',
    boxShadow: ui.glow,
    textShadow: '0 1px 0 rgba(0,0,0,0.25)',
  };

  const fieldStyle: React.CSSProperties = {
    padding: '8px 10px',
    borderRadius: 10,
    border: `1px solid ${ui.border}`,
    background: ui.surfaceStrong,
    color: theme.inputFg,
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
  };

  const selectStyle: React.CSSProperties = {
    ...fieldStyle,
    cursor: 'pointer',
  };

  const textInputStyle: React.CSSProperties = {
    ...fieldStyle,
  };

  const defaultPortForFramework = (fw: unknown): number => {
    switch (fw) {
      case 'next':
      case 'cra':
      case 'nuxt':
      case 'remix':
        return 3000;
      case 'vite':
      case 'sveltekit':
        return 5173;
      case 'astro':
        return 4321;
      case 'angular':
        return 4200;
      case 'vue':
        return 8080;
      case 'gatsby':
        return 8000;
      default:
        return 3000;
    }
  };

  const buildDefaultUrlForFramework = (fw: unknown): string => {
    const host = '127.0.0.1';
    return `http://${host}:${defaultPortForFramework(fw)}`;
  };

  const buildDefaultUrlForPreviewTarget = (t: { defaultPort?: number; urlPath?: string } | undefined): string => {
    const host = '127.0.0.1';
    const port = (t && typeof t.defaultPort === 'number' && Number.isFinite(t.defaultPort) && t.defaultPort > 0) ? t.defaultPort : 3000;
    const path = (t && typeof t.urlPath === 'string' && t.urlPath.trim().startsWith('/')) ? t.urlPath.trim() : '';
    return `http://${host}:${port}${path}`;
  };
  const selectedElRef = useRef<HTMLElement | null>(null);
  const leafElRef = useRef<HTMLElement | null>(null);
  const selectedLocatorRef = useRef<SourceLocator | null>(null);
  const dragTranslateRef = useRef<[number, number]>([0, 0]);
  const nudgePersistTimerRef = useRef<number | undefined>(undefined);

  const [isEditingText, setIsEditingText] = useState<boolean>(false);
  const editingElRef = useRef<HTMLElement | null>(null);
  const editingLocatorRef = useRef<SourceLocator | null>(null);
  const editingPrevTextRef = useRef<string>('');
  const editingKeydownHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);

  const [overlayRect, setOverlayRect] = useState<DOMRect | null>(null);
  const overlayRafRef = useRef<number | null>(null);

  const scheduleMeasure = (reason: string) => {
    if (overlayRafRef.current != null) return;
    overlayRafRef.current = window.requestAnimationFrame(() => {
      overlayRafRef.current = null;
      const el = selectedElRef.current;
      const rect = el && el.isConnected ? el.getBoundingClientRect() : null;
      setOverlayRect(rect);
      bumpDebug(reason, rect);
    });
  };

  const [debugEnabled, setDebugEnabled] = useState<boolean>(false);
  const [debugRect, setDebugRect] = useState<DOMRect | null>(null);
  const [debugStats, setDebugStats] = useState<DebugStats>({ rectUpdates: 0, reasons: {} });
  const debugStatsRef = useRef<DebugStats>({ rectUpdates: 0, reasons: {} });

  const bumpDebug = (reason: string, rect?: DOMRect | null) => {
    if (!debugEnabled) return;
    const next: DebugStats = {
      rectUpdates: debugStatsRef.current.rectUpdates + 1,
      reasons: { ...debugStatsRef.current.reasons },
    };
    next.reasons[reason] = (next.reasons[reason] ?? 0) + 1;
    debugStatsRef.current = next;
    setDebugStats(next);
    if (rect !== undefined) setDebugRect(rect);
  };

  // Preview styles are applied temporarily and can be cleared.
  const previewOriginalRef = useRef<Map<string, string>>(new Map());

  const makePreviewKey = (file: string, line: number, prop: string) => JSON.stringify([file, line, prop]);

  useEffect(() => {
    selectedElRef.current = selectedEl;

    if (selectedEl) {
      dragTranslateRef.current = getCurrentTranslate(selectedEl);

		  // Inline text elements behave oddly with resize handles (width/height don't apply).
		  setIsInlineText(isInlineTextElement(selectedEl));
    } else {
      dragTranslateRef.current = [0, 0];
		  setIsInlineText(false);
    }
  }, [selectedEl]);

  const updateBreadcrumbs = () => {
    const leaf = (leafElRef.current && leafElRef.current.isConnected) ? leafElRef.current : selectedElRef.current;
    if (!leaf || !leaf.isConnected) {
      setBreadcrumbs([]);
      return;
    }
    const root = leaf.closest<HTMLElement>('.target') ?? leaf.closest<HTMLElement>('[data-live-ui-group-root="1"]');
    const els = buildBreadcrumbTrail({ leaf, root, max: 6 });
    setBreadcrumbs(els.map(el => ({ el, label: pickBreadcrumbLabel(el) })));
  };

  const pickStableClasses = (classList: DOMTokenList | undefined | null, max: number): string[] | undefined => {
    if (!classList) return undefined;
    const out: string[] = [];
    for (const c of Array.from(classList)) {
      const cls = String(c || '').trim();
      if (!cls) continue;
      // Avoid very long/generated classnames.
      if (cls.length > 32) continue;
      // Drop obvious hashes.
      if (/[a-f0-9]{8,}/i.test(cls)) continue;
      out.push(cls);
      if (out.length >= max) break;
    }
    return out.length ? out : undefined;
  };

  const isScrollContainerEl = (el: HTMLElement): boolean => {
    const style = window.getComputedStyle(el);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const scrollY = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    const scrollX = overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'overlay';
    if (!scrollX && !scrollY) return false;
    // Heuristic: only treat as scroll container if there's more content than viewport.
    return (el.scrollHeight > el.clientHeight + 1) || (el.scrollWidth > el.clientWidth + 1);
  };

  const summarizeNode = (el: HTMLElement | null): { tagName: string; id?: string; classList?: string[] } | null => {
    if (!el) return null;
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      classList: pickStableClasses(el.classList, 6),
    };
  };

  const findGroupRoot = (el: HTMLElement): HTMLElement | null => {
    return (
      el.closest<HTMLElement>('[data-live-ui-group-root="1"]') ??
      el.closest<HTMLElement>('.target') ??
      null
    );
  };

  const findGroupRootMapped = (mappedEl: HTMLElement): HTMLElement => {
    const group = findGroupRoot(mappedEl) ?? mappedEl;
    return group.closest<HTMLElement>('[data-source-file][data-source-line]') ?? group;
  };

  const postElementSelected = (sourceEl: HTMLElement) => {
    const file = sourceEl.getAttribute('data-source-file');
    const lineRaw = sourceEl.getAttribute('data-source-line');
    const line = lineRaw ? Number(lineRaw) : NaN;
    const columnRaw = sourceEl.getAttribute('data-source-column');
    const columnParsed = columnRaw ? Number(columnRaw) : NaN;
    const column = Number.isFinite(columnParsed) ? columnParsed : undefined;
    if (!(file && Number.isFinite(line))) return;

    selectedLocatorRef.current = { file, line, column };

    const tagName = sourceEl.tagName.toLowerCase();
    const id = sourceEl.id || undefined;
    const classList = sourceEl.classList ? Array.from(sourceEl.classList).slice(0, 8) : undefined;
    const role = sourceEl.getAttribute('role') || undefined;
    const href = sourceEl.getAttribute('href') || undefined;
    const type = sourceEl.getAttribute('type') || undefined;
    const text = (sourceEl.textContent || '').trim().slice(0, 80) || undefined;
    const inlineStyle = sourceEl.getAttribute('style') || undefined;
    const computedStyle = getSelectedComputedStylePatch(sourceEl);

    // Ancestors + selection hints help @ui-wizard understand grouped UIs.
    const ancestors: Array<{ tagName: string; classList?: string[] }> = [];
    let p: HTMLElement | null = sourceEl.parentElement;
    for (let i = 0; i < 10 && p; i++) {
      if (p.matches('[data-source-file][data-source-line]')) {
        ancestors.push({ tagName: p.tagName.toLowerCase(), classList: pickStableClasses(p.classList, 4) });
      }
      p = p.parentElement;
    }
    let sc: HTMLElement | null = sourceEl.parentElement;
    let foundScroll: HTMLElement | null = null;
    for (let i = 0; i < 25 && sc; i++) {
      if (isScrollContainerEl(sc)) { foundScroll = sc; break; }
      sc = sc.parentElement;
    }
    const groupRoot = findGroupRoot(sourceEl);
    const selectionHints = {
      isScrollContainer: isScrollContainerEl(sourceEl),
      isInsideScroll: !!foundScroll,
      scrollContainer: summarizeNode(foundScroll),
      itemRoot: groupRoot && groupRoot !== sourceEl ? summarizeNode(groupRoot) : null,
    };

    const msg: FromWebviewMessage = {
      command: 'elementSelected',
      file,
      line,
      column,
      elementContext: { tagName, id, classList, role, href, type, text },
      ancestors,
      selectionHints,
      inlineStyle,
      computedStyle,
    };
    vscode?.postMessage(msg);
  };

  const buildElementContext = (sourceEl: HTMLElement) => {
    const tagName = sourceEl.tagName.toLowerCase();
    const id = sourceEl.id || undefined;
    const classList = sourceEl.classList ? Array.from(sourceEl.classList).slice(0, 8) : undefined;
    const role = sourceEl.getAttribute('role') || undefined;
    const href = sourceEl.getAttribute('href') || undefined;
    const type = sourceEl.getAttribute('type') || undefined;
    const text = (sourceEl.textContent || '').trim().slice(0, 80) || undefined;
    return { tagName, id, classList, role, href, type, text };
  };

  const isLeafEditableTextEl = (el: HTMLElement) => {
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return false;
    const hasText = ((el.textContent || '').trim().length > 0);
    if (!hasText) return false;
    // Keep this conservative to avoid making big containers editable.
    if (el.childElementCount > 0) return false;
    return true;
  };

  const pickEditableLeafAtPoint = (e: MouseEvent): HTMLElement | null => {
    // Try to resolve the actual text node under the cursor.
    try {
      const anyDoc = document as any;
      const fromPosition = typeof anyDoc.caretPositionFromPoint === 'function' ? anyDoc.caretPositionFromPoint(e.clientX, e.clientY) : null;
      const fromRange = !fromPosition && typeof anyDoc.caretRangeFromPoint === 'function' ? anyDoc.caretRangeFromPoint(e.clientX, e.clientY) : null;
      const container: unknown = fromPosition?.offsetNode ?? fromRange?.startContainer;
      if (container) {
        const node = container as Node;
        const baseEl = node.nodeType === Node.TEXT_NODE ? (node.parentElement as HTMLElement | null) : (node as any as HTMLElement | null);
        if (baseEl && baseEl instanceof HTMLElement) {
          // Walk up until we find a leaf element (or bail out).
          let cur: HTMLElement | null = baseEl;
          for (let i = 0; i < 6 && cur; i++) {
            if (isLeafEditableTextEl(cur)) return cur;
            cur = cur.parentElement;
          }
        }
      }
    } catch {
      // ignore
    }

    const target = e.target as HTMLElement | null;
    if (!target) return null;
    let cur: HTMLElement | null = target;
    for (let i = 0; i < 6 && cur; i++) {
      if (isLeafEditableTextEl(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  };

  const selectElement = (el: HTMLElement, opts?: { leaf?: HTMLElement | null; notify?: boolean }) => {
    setSelectedEl(el);
    if (opts?.leaf && opts.leaf.isConnected) leafElRef.current = opts.leaf;
    if (opts?.notify) postElementSelected(el);
    // Let DOM settle.
    requestAnimationFrame(() => {
      updateBreadcrumbs();
      scheduleMeasure('selectElement');
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = selectedElRef.current;
      if (!target) return;

      // Don't interfere with browser shortcuts.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      let dx = 0;
      let dy = 0;
      const step = e.shiftKey ? 10 : 1;

      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;

      e.preventDefault();

      const [x, y] = getCurrentTranslate(target);
      const nx = x + dx;
      const ny = y + dy;
      dragTranslateRef.current = [nx, ny];
      setTranslate(target, nx, ny);
      scheduleMeasure('nudge');

      // Debounce persistence so holding the key doesn't spam messages.
      if (nudgePersistTimerRef.current) {
        window.clearTimeout(nudgePersistTimerRef.current);
      }
      nudgePersistTimerRef.current = window.setTimeout(() => {
        const file = target.getAttribute('data-source-file');
        const lineRaw = target.getAttribute('data-source-line');
        const line = lineRaw ? Number(lineRaw) : NaN;
        if (!file || !Number.isFinite(line)) return;

        const transform = target.style.transform || undefined;
        const msg: FromWebviewMessage = {
          command: 'updateStyle',
          file,
          line,
          style: { transform }
        };
        vscode?.postMessage(msg);
      }, 250);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [vscode]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!isToWebviewMessage(event.data)) return;
      if (event.data.command === 'setDocument') {
        setLoadedFile(event.data.file);
        setRenderedHtml(event.data.html);
        // New document => clear previews
        previewOriginalRef.current.clear();

        // New document => clear selection so we don't hold onto detached nodes.
        selectedLocatorRef.current = null;
        leafElRef.current = null;
        setSelectedEl(null);
      }
      if (event.data.command === 'previewStyle') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const el = canvas.querySelector<HTMLElement>(
          `[data-source-file="${CSS.escape(event.data.file)}"][data-source-line="${event.data.line}"]`
        );
        if (!el) return;

        // Remember original inline values for the keys we touch.
        for (const [k, v] of Object.entries(event.data.style)) {
          const key = makePreviewKey(event.data.file, event.data.line, k);
          if (!previewOriginalRef.current.has(key)) {
            previewOriginalRef.current.set(key, (el.style as any)[k] ?? '');
          }
          (el.style as any)[k] = v;
        }
        bumpDebug('previewStyle', selectedElRef.current?.getBoundingClientRect() ?? null);
      }
      if (event.data.command === 'clearPreview') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        for (const [key, original] of previewOriginalRef.current.entries()) {
          let parsed: unknown;
          try {
            parsed = JSON.parse(key);
          } catch {
            continue;
          }
          if (!Array.isArray(parsed) || parsed.length !== 3) continue;
          const [file, line, prop] = parsed as [string, number, string];
          if (!file || !Number.isFinite(line) || !prop) continue;
          const el = canvas.querySelector<HTMLElement>(
            `[data-source-file="${CSS.escape(file)}"][data-source-line="${line}"]`
          );
          if (!el) continue;
          (el.style as any)[prop] = original;
        }
        previewOriginalRef.current.clear();
        bumpDebug('clearPreview', selectedElRef.current?.getBoundingClientRect() ?? null);
      }
      if (event.data.command === 'requestTargets') {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const nodes = Array.from(canvas.querySelectorAll<HTMLElement>(event.data.selector));
        const targets = nodes
          .map(n => n.closest<HTMLElement>('[data-source-file][data-source-line]') ?? n)
          .map(el => {
            const file = el.getAttribute('data-source-file');
            const lineRaw = el.getAttribute('data-source-line');
            const line = lineRaw ? Number(lineRaw) : NaN;
            return file && Number.isFinite(line) ? { file, line } : undefined;
          })
          .filter(Boolean) as Array<{ file: string; line: number }>;

        // De-dupe
        const seen = new Set<string>();
        const unique = targets.filter(t => {
          const k = `${t.file}:${t.line}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        const msg: FromWebviewMessage = {
          command: 'targetsList',
          requestId: event.data.requestId,
          targets: unique,
        };
        vscode?.postMessage(msg);
      }
      if (event.data.command === 'quickStartInfo') {
        setQuickStartInfo(event.data.info);
        // Best-effort defaults (only nudge when user hasn't loaded anything yet).
        if (!renderedHtml) {
          if (event.data.info.recommendedUrl && appUrl === 'http://127.0.0.1:5173') {
            setAppUrl(event.data.info.recommendedUrl);
          }

			// If it looks like a dev server is already running, default to "Use existing URL".
			// Only auto-change if the user hasn't changed away from the default yet.
			if (event.data.info.recommendedConnect === 'existing' && appConnect === 'integrated') {
				setAppConnect('existing');
			}
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [renderedHtml, appUrl]);

	useEffect(() => {
		const report = quickStartInfo?.report;
		if (!report) return;

		const apps = Array.isArray(report.apps) ? report.apps : [];
		const previews = Array.isArray(report.previewTargets) ? report.previewTargets : [];

		// Choose a default picker kind.
		let nextKind: 'app' | 'preview' | 'none' = detectedPickKind;
		if (nextKind === 'none') {
			if (apps.length) nextKind = 'app';
			else if (previews.length) nextKind = 'preview';
		}

		// Keep selections valid.
		let nextAppRoot = detectedAppRoot;
		let nextPreviewId = detectedPreviewId;

		if (nextKind === 'app') {
			if (!apps.length) {
				nextKind = previews.length ? 'preview' : 'none';
			} else {
				const exists = nextAppRoot && apps.some(a => a && typeof a.root === 'string' && a.root === nextAppRoot);
				if (!exists) nextAppRoot = String(apps[0]?.root ?? '');
			}
		}

		if (nextKind === 'preview') {
			if (!previews.length) {
				nextKind = apps.length ? 'app' : 'none';
			} else {
				const exists = nextPreviewId && previews.some(p => p && typeof p.id === 'string' && p.id === nextPreviewId);
				if (!exists) nextPreviewId = String(previews[0]?.id ?? '');
			}
		}

		if (nextKind !== detectedPickKind) setDetectedPickKind(nextKind);
		if (nextAppRoot !== detectedAppRoot) setDetectedAppRoot(nextAppRoot);
		if (nextPreviewId !== detectedPreviewId) setDetectedPreviewId(nextPreviewId);

		// Suggested URL (editable): only replace if user hasn't customized.
    let nextDefaultUrl = '';
    if (nextKind === 'app') {
      const app = apps.find(a => a && typeof a.root === 'string' && a.root === nextAppRoot) ?? apps[0];
      const port = (app && typeof (app as any).defaultPort === 'number' && Number.isFinite((app as any).defaultPort)) ? (app as any).defaultPort : undefined;
      nextDefaultUrl = port ? `http://127.0.0.1:${port}` : buildDefaultUrlForFramework(app?.framework);
    } else if (nextKind === 'preview') {
			const t = previews.find(p => p && typeof p.id === 'string' && p.id === nextPreviewId) ?? previews[0];
			nextDefaultUrl = buildDefaultUrlForPreviewTarget(t);
		}

		if (nextDefaultUrl) {
			const prevDefault = detectedUrlDefaultRef.current;
			const shouldReplace = !detectedUrl || detectedUrl === prevDefault;
			detectedUrlDefaultRef.current = nextDefaultUrl;
			if (shouldReplace && detectedUrl !== nextDefaultUrl) setDetectedUrl(nextDefaultUrl);
		}
	}, [quickStartInfo, detectedPickKind, detectedAppRoot, detectedPreviewId, detectedUrl]);

  const selectParent = () => {
    const cur = selectedElRef.current;
    if (!cur) return;
    const parent = cur.parentElement?.closest<HTMLElement>('[data-source-file][data-source-line]') ?? cur.parentElement;
    if (parent) setSelectedEl(parent as HTMLElement);
  };

  useEffect(() => {
    const el = canvasEl;
    if (!el) return;

    const onClick = (e: MouseEvent) => {
      if (!canvasEl) return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // If the user is editing text, don't steal focus/selection.
      if (isEditingText && editingElRef.current && (target === editingElRef.current || editingElRef.current.contains(target))) {
        return;
      }

      // Second click of a double-click should not cause re-selection.
      if (e.detail && e.detail > 1) return;

      const hit = hitTestAtPoint({ canvasEl, clientX: e.clientX, clientY: e.clientY });
      if (!hit) return;

      leafElRef.current = hit.leafEl;

      const wantsGroup = (!e.altKey && (selectionMode === 'group' || e.shiftKey));
      const sourceEl = wantsGroup ? findGroupRootMapped(hit.mappedEl) : hit.mappedEl;

      selectElement(sourceEl, { leaf: hit.mappedEl, notify: true });

      // Normal click = select. Ctrl/Cmd+Click = jump to code.
      const shouldJumpToCode = e.ctrlKey || e.metaKey;
      if (!shouldJumpToCode) return;

      const file = sourceEl.getAttribute('data-source-file');
      const lineRaw = sourceEl.getAttribute('data-source-line');
      const line = lineRaw ? Number(lineRaw) : NaN;
      const columnRaw = sourceEl.getAttribute('data-source-column');
      const columnParsed = columnRaw ? Number(columnRaw) : NaN;
      const column = Number.isFinite(columnParsed) ? columnParsed : undefined;
      if (!file || !Number.isFinite(line)) return;

      const msg: FromWebviewMessage = { command: 'elementClicked', file, line, column };
      vscode?.postMessage(msg);
    };

    const commitTextEdit = (opts?: { cancel?: boolean }) => {
      const editEl = editingElRef.current;
      if (!editEl) return;

      if (editingKeydownHandlerRef.current) {
        editEl.removeEventListener('keydown', editingKeydownHandlerRef.current);
        editingKeydownHandlerRef.current = null;
      }

      const loc = editingLocatorRef.current;
      const file = loc?.file;
      const line = (typeof loc?.line === 'number') ? loc.line : NaN;
      const column = loc?.column;

      const prevText = editingPrevTextRef.current;
      const nextText = (editEl.textContent ?? '');

      editEl.setAttribute('contenteditable', 'false');
      editEl.removeAttribute('data-live-ui-editing');
      editEl.style.outline = '';

      setIsEditingText(false);
      editingElRef.current = null;
      editingLocatorRef.current = null;
      editingPrevTextRef.current = '';

      if (opts?.cancel) {
        try { editEl.textContent = prevText; } catch {}
        scheduleMeasure('editCancel');
        return;
      }

      if (!(file && Number.isFinite(line))) {
        scheduleMeasure('editNoLocator');
        return;
      }

      if (nextText === prevText) {
        scheduleMeasure('editNoChange');
        return;
      }

      const msg: FromWebviewMessage = {
        command: 'updateText',
        file,
        line,
        column,
        elementContext: buildElementContext(editEl),
        text: String(nextText),
      };
      vscode?.postMessage(msg);
      scheduleMeasure('editCommit');
    };

    const onDblClick = (e: MouseEvent) => {
      if (!canvasEl) return;

      // Don't start a new edit while already editing.
      if (isEditingText) return;

      const editableLeaf = pickEditableLeafAtPoint(e);
      if (!editableLeaf) return;

      // Only allow editing on source-mapped leaf nodes so persistence is deterministic.
      const mapped = editableLeaf.closest<HTMLElement>('[data-source-file][data-source-line]');
      if (!mapped) return;

      const file = mapped.getAttribute('data-source-file');
      const lineRaw = mapped.getAttribute('data-source-line');
      const line = lineRaw ? Number(lineRaw) : NaN;
      const columnRaw = mapped.getAttribute('data-source-column');
      const columnParsed = columnRaw ? Number(columnRaw) : NaN;
      const column = Number.isFinite(columnParsed) ? columnParsed : undefined;
      if (!file || !Number.isFinite(line)) return;

      const candidate = mapped;

      e.preventDefault();
      e.stopPropagation();

      // Ensure selection is on the element we're editing.
      selectElement(candidate, { leaf: candidate, notify: true });

      editingElRef.current = candidate;
      editingLocatorRef.current = { file, line, column };
      editingPrevTextRef.current = (candidate.textContent ?? '');
      setIsEditingText(true);

      candidate.setAttribute('contenteditable', 'true');
      candidate.setAttribute('data-live-ui-editing', '1');
      candidate.style.outline = '2px solid rgba(99,102,241,0.8)';

      // Focus and select all text.
      requestAnimationFrame(() => {
        try {
          // Prevent focus from scrolling the page (helps keep the dblclick stable).
          (candidate as any).focus?.({ preventScroll: true });
          const sel = window.getSelection();
          if (!sel) return;
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(candidate);
          sel.addRange(range);
        } catch {
          // ignore
        }
      });

      const onKeyDown = (ke: KeyboardEvent) => {
        if (ke.key === 'Escape') {
          ke.preventDefault();
          commitTextEdit({ cancel: true });
        }
        if (ke.key === 'Enter' && !ke.shiftKey) {
          ke.preventDefault();
          commitTextEdit();
        }
      };

      const onBlur = () => {
        commitTextEdit();
      };

      // Clean up handlers once editing ends.
      editingKeydownHandlerRef.current = onKeyDown;
      candidate.addEventListener('keydown', onKeyDown);
      candidate.addEventListener('blur', onBlur, { once: true });
    };

    el.addEventListener('click', onClick);
    el.addEventListener('dblclick', onDblClick);
    return () => {
      el.removeEventListener('click', onClick);
      el.removeEventListener('dblclick', onDblClick);
    };
  }, [vscode, selectionMode, isEditingText, canvasEl]);

  useEffect(() => {
    updateBreadcrumbs();
    if (selectedEl) scheduleMeasure('selectedEl');
  }, [selectedEl, renderedHtml]);

  useEffect(() => {
    // Overlay tracking: keep overlayRect aligned in all scenarios.
    const target = selectedElRef.current;
    const canvas = canvasEl;
    if (!target || !canvas) {
      setOverlayRect(null);
      return;
    }

    scheduleMeasure('overlayInit');

    const onScroll = () => scheduleMeasure('scroll');
    const onResize = () => scheduleMeasure('resize');

    // Listen to scroll on relevant scroll parents (nested scrollers) + the canvas itself.
    const parents = getScrollParents(target, canvas);
    for (const p of parents) {
      p.addEventListener('scroll', onScroll, { passive: true });
    }
    canvas.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    window.addEventListener('resize', onResize);

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => scheduleMeasure('ResizeObserver'))
      : null;
    ro?.observe(target);

    const mo = new MutationObserver(() => {
      // If selection becomes disconnected, clear the overlay (selection rebind happens elsewhere).
      if (selectedElRef.current && !selectedElRef.current.isConnected) {
        setOverlayRect(null);
        bumpDebug('disconnected');
        return;
      }
      scheduleMeasure('MutationObserver');
    });
    mo.observe(canvas, { subtree: true, childList: true, attributes: true });

    return () => {
      for (const p of parents) {
        p.removeEventListener('scroll', onScroll);
      }
      canvas.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      mo.disconnect();
    };
  }, [selectedEl, canvasEl]);

  const persistStyle = (target: HTMLElement, style: { width?: string; height?: string; transform?: string }) => {
    const file = target.getAttribute('data-source-file');
    const lineRaw = target.getAttribute('data-source-line');
    const line = lineRaw ? Number(lineRaw) : NaN;
    if (!file || !Number.isFinite(line)) return;

    const msg: FromWebviewMessage = { command: 'updateStyle', file, line, style };
    vscode?.postMessage(msg);
  };

  const onOverlayDragStart = (e: React.PointerEvent) => {
    const target = selectedElRef.current;
    if (!target) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const [x, y] = getCurrentTranslate(target);
    dragTranslateRef.current = [x, y];
    (dragTranslateRef as any).start = { id: e.pointerId, x: e.clientX, y: e.clientY, tx: x, ty: y };
    bumpDebug('dragStart');
  };

  const onOverlayDragMove = (e: React.PointerEvent) => {
    const target = selectedElRef.current;
    const start = (dragTranslateRef as any).start as { id: number; x: number; y: number; tx: number; ty: number } | undefined;
    if (!target || !start || start.id !== e.pointerId) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const nx = start.tx + dx;
    const ny = start.ty + dy;
    dragTranslateRef.current = [nx, ny];
    setTranslate(target, nx, ny);
    scheduleMeasure('drag');
  };

  const onOverlayDragEnd = (e: React.PointerEvent) => {
    const target = selectedElRef.current;
    const start = (dragTranslateRef as any).start as { id: number } | undefined;
    if (!target || !start || start.id !== e.pointerId) return;
    (dragTranslateRef as any).start = undefined;
    const transform = target.style.transform || undefined;
    persistStyle(target, { transform });
    scheduleMeasure('dragEnd');
  };

  type ResizeDir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

  const onResizeHandleDown = (dir: ResizeDir) => (e: React.PointerEvent) => {
    const target = selectedElRef.current;
    if (!target || isInlineText) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const rect = target.getBoundingClientRect();
    const [tx, ty] = getCurrentTranslate(target);
    (dragTranslateRef as any).resize = {
      id: e.pointerId,
      dir,
      x: e.clientX,
      y: e.clientY,
      w: rect.width,
      h: rect.height,
      tx,
      ty,
    };
    bumpDebug(`resizeStart:${dir}`);
  };

  const onResizeHandleMove = (e: React.PointerEvent) => {
    const target = selectedElRef.current;
    const st = (dragTranslateRef as any).resize as
      | { id: number; dir: ResizeDir; x: number; y: number; w: number; h: number; tx: number; ty: number }
      | undefined;
    if (!target || !st || st.id !== e.pointerId) return;

    const dx = e.clientX - st.x;
    const dy = e.clientY - st.y;

    let nextW = st.w;
    let nextH = st.h;
    let nextTx = st.tx;
    let nextTy = st.ty;

    if (st.dir.includes('e')) nextW = st.w + dx;
    if (st.dir.includes('s')) nextH = st.h + dy;
    if (st.dir.includes('w')) {
      nextW = st.w - dx;
      nextTx = st.tx + dx;
    }
    if (st.dir.includes('n')) {
      nextH = st.h - dy;
      nextTy = st.ty + dy;
    }

    nextW = Math.max(4, nextW);
    nextH = Math.max(4, nextH);

    target.style.width = `${Math.round(nextW)}px`;
    target.style.height = `${Math.round(nextH)}px`;
    dragTranslateRef.current = [nextTx, nextTy];
    setTranslate(target, nextTx, nextTy);
    scheduleMeasure('resize');
  };

  const onResizeHandleUp = (e: React.PointerEvent) => {
    const target = selectedElRef.current;
    const st = (dragTranslateRef as any).resize as { id: number } | undefined;
    if (!target || !st || st.id !== e.pointerId) return;
    (dragTranslateRef as any).resize = undefined;

    const width = target.style.width || undefined;
    const height = target.style.height || undefined;
    const transform = target.style.transform || undefined;
    persistStyle(target, { width, height, transform });
    scheduleMeasure('resizeEnd');
  };

  const selectionOverlay = (() => {
    const r = overlayRect;
    const hasSelection = !!(selectedElRef.current && selectedElRef.current.isConnected);
    if (!hasSelection || !r) return null;

    const borderColor = 'rgba(99,102,241,0.95)';
    const handleSize = 10;
    const half = Math.floor(handleSize / 2);

    const baseBox = {
      position: 'absolute' as const,
      left: r.x,
      top: r.y,
      width: r.width,
      height: r.height,
    };

    const handleStyle = (left: number, top: number, cursor: string) => ({
      position: 'absolute' as const,
      left,
      top,
      width: handleSize,
      height: handleSize,
      borderRadius: 3,
      background: borderColor,
      boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
      pointerEvents: 'auto' as const,
      cursor,
    });

    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;

    const dragHandle = {
      position: 'absolute' as const,
      left: cx - 14,
      top: r.y - 18,
      width: 28,
      height: 14,
      borderRadius: 8,
      background: borderColor,
      boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
      pointerEvents: 'auto' as const,
      cursor: 'move',
    };

    return (
      <div
        data-live-ui-overlay="1"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 99998,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            ...baseBox,
            border: `2px solid ${borderColor}`,
            borderRadius: 6,
            boxShadow: '0 0 0 1px rgba(0,0,0,0.15) inset',
            pointerEvents: 'none',
          }}
        />

        <div
          style={dragHandle}
          title="Drag"
          onPointerDown={onOverlayDragStart}
          onPointerMove={onOverlayDragMove}
          onPointerUp={onOverlayDragEnd}
          onPointerCancel={onOverlayDragEnd}
        />

        {!isInlineText ? (
          <>
            {/* Corners */}
            <div
              style={handleStyle(r.x - half, r.y - half, 'nwse-resize')}
              onPointerDown={onResizeHandleDown('nw')}
              onPointerMove={onResizeHandleMove}
              onPointerUp={onResizeHandleUp}
              onPointerCancel={onResizeHandleUp}
            />
            <div
              style={handleStyle(r.x + r.width - half, r.y - half, 'nesw-resize')}
              onPointerDown={onResizeHandleDown('ne')}
              onPointerMove={onResizeHandleMove}
              onPointerUp={onResizeHandleUp}
              onPointerCancel={onResizeHandleUp}
            />
            <div
              style={handleStyle(r.x - half, r.y + r.height - half, 'nesw-resize')}
              onPointerDown={onResizeHandleDown('sw')}
              onPointerMove={onResizeHandleMove}
              onPointerUp={onResizeHandleUp}
              onPointerCancel={onResizeHandleUp}
            />
            <div
              style={handleStyle(r.x + r.width - half, r.y + r.height - half, 'nwse-resize')}
              onPointerDown={onResizeHandleDown('se')}
              onPointerMove={onResizeHandleMove}
              onPointerUp={onResizeHandleUp}
              onPointerCancel={onResizeHandleUp}
            />

            {/* Edges */}
            <div
              style={handleStyle(cx - half, r.y - half, 'ns-resize')}
              onPointerDown={onResizeHandleDown('n')}
              onPointerMove={onResizeHandleMove}
              onPointerUp={onResizeHandleUp}
              onPointerCancel={onResizeHandleUp}
            />
            <div
              style={handleStyle(cx - half, r.y + r.height - half, 'ns-resize')}
              onPointerDown={onResizeHandleDown('s')}
              onPointerMove={onResizeHandleMove}
              onPointerUp={onResizeHandleUp}
              onPointerCancel={onResizeHandleUp}
            />
            <div
              style={handleStyle(r.x + r.width - half, cy - half, 'ew-resize')}
              onPointerDown={onResizeHandleDown('e')}
              onPointerMove={onResizeHandleMove}
              onPointerUp={onResizeHandleUp}
              onPointerCancel={onResizeHandleUp}
            />
            <div
              style={handleStyle(r.x - half, cy - half, 'ew-resize')}
              onPointerDown={onResizeHandleDown('w')}
              onPointerMove={onResizeHandleMove}
              onPointerUp={onResizeHandleUp}
              onPointerCancel={onResizeHandleUp}
            />
          </>
        ) : null}
      </div>
    );
  })();

  const detectedReport = quickStartInfo?.report;
  const detectedApps = Array.isArray(detectedReport?.apps) ? detectedReport!.apps : [];
  const detectedPreviewTargets = Array.isArray(detectedReport?.previewTargets) ? detectedReport!.previewTargets : [];
  const detectedHtmlCandidates = Array.isArray(detectedReport?.htmlCandidates) ? detectedReport!.htmlCandidates : [];

  const selectedDetectedApp =
    detectedPickKind === 'app'
      ? detectedApps.find(a => a && typeof a.root === 'string' && a.root === detectedAppRoot) ?? detectedApps[0]
      : undefined;
  const selectedDetectedPreview =
    detectedPickKind === 'preview'
      ? detectedPreviewTargets.find(t => t && typeof t.id === 'string' && t.id === detectedPreviewId) ?? detectedPreviewTargets[0]
      : undefined;
  const selectedDetectedRoot = (detectedPickKind === 'preview') ? selectedDetectedPreview?.root : selectedDetectedApp?.root;

  return (
    <div style={{
			fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
			height: '100vh',
      width: '100%',
      maxWidth: '100%',
			boxSizing: 'border-box',
			background: theme.bg,
			color: theme.fg,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
		}}>
      <div style={{
      padding: 14,
      display: 'flex',
      gap: 14,
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      background: ui.panel,
      borderBottom: `1px solid ${ui.border}`,
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
    }}>
        <div style={{ flex: '1 1 520px', minWidth: 260 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img
        src={logo}
        alt="Live UI Editor"
        style={{ height: 'clamp(36px, 4.2vh, 52px)', width: 'auto', display: 'block' }}
      />
        </div>
        <p style={{ marginTop: 8, color: theme.desc, lineHeight: 1.5, fontSize: 13, maxWidth: 920 }}>
          Click to select. Drag to move (snaps). Arrow keys nudge (Shift=10px). Drag handles to resize. Ctrl/Cmd+Click to jump to code. Alt+Click forces leaf selection.
        </p>
        {breadcrumbs.length ? (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: theme.desc }}>
            <span style={{ opacity: 1 }}>Selected:</span>
            {breadcrumbs.map((b, i) => (
              <React.Fragment key={i}>
                {i > 0 ? <span style={{ opacity: 0.85 }}>&gt;</span> : null}
                <button
                  onClick={() => selectElement(b.el, { notify: true })}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: `1px solid ${ui.border}`,
                    color: theme.fg,
                    background: (b.el === selectedEl) ? ui.gradientSoft : ui.surface,
                    cursor: 'pointer',
					backdropFilter: 'blur(10px)',
					WebkitBackdropFilter: 'blur(10px)',
                  }}
                  title={b.el.tagName.toLowerCase()}
                >
                  {b.label}
                </button>
              </React.Fragment>
            ))}
          </div>
        ) : null}
        <div style={{ marginTop: 12, color: theme.desc, fontSize: 12 }}>
          Loaded: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{loadedFile || '(none)'}</span>
        </div>
        {helpExpanded ? (
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `1px solid ${ui.border}`, background: ui.card, maxWidth: 860, color: theme.fg, boxShadow: ui.glow, backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Help</div>
            <div style={{ fontSize: 12, color: theme.desc, lineHeight: 1.5 }}>
              <div><b>Selection mode:</b> Group selects the nearest container (like <code>.target</code>) so grouped UIs stay together.</div>
              <div><b>Element mode:</b> Select individual nested elements.</div>
              <div><b>Shortcuts:</b> Ctrl/Cmd+Click jump • Alt+Click leaf • Shift+Click group • Arrow keys nudge (Shift=10px)</div>
              <div><b>Text editing:</b> Double-click text • Enter save • Esc cancel • Click away saves</div>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => vscode?.postMessage({ command: 'openHelp' })} style={controlButtonStyle(false)}>
                  Open full HELP.md
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: '0 1 auto' }}>
          <div style={{ display: 'flex', gap: 6, padding: 6, borderRadius: 12, border: `1px solid ${ui.border}`, background: ui.surfaceStrong, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
            <button
              onClick={() => setSelectionMode('group')}
			  style={controlButtonStyle(selectionMode === 'group')}
              title="Select whole grouped areas"
            >
              Group
            </button>
            <button
              onClick={() => setSelectionMode('element')}
			  style={controlButtonStyle(selectionMode === 'element')}
              title="Select individual elements"
            >
              Element
            </button>
          </div>
          <button onClick={selectParent} disabled={!selectedEl} style={{ ...controlButtonStyle(false), opacity: selectedEl ? 1 : 0.55, cursor: selectedEl ? 'pointer' : 'not-allowed' }}>
            Select parent
          </button>
          <button onClick={() => setHelpExpanded(v => !v)} style={controlButtonStyle(helpExpanded)}>
            {helpExpanded ? 'Hide help' : 'Help'}
          </button>
          <button onClick={() => setDebugEnabled(v => !v)} style={controlButtonStyle(debugEnabled)}>
            {debugEnabled ? 'Debug: On' : 'Debug: Off'}
          </button>
        </div>
      </div>
      <div
        ref={(node) => {
          canvasRef.current = node;
          setCanvasEl(node);
        }}
        style={{
          position: 'relative',
          width: '100%',
          flex: 1,
          minHeight: 0,
          margin: 0,
          padding: 0,
          border: 'none',
          background: theme.bg,
          overflow: 'auto',
        }}
      >
        {renderedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        ) : (
          <div style={{ padding: 22, display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 'min(920px, 100%)', borderRadius: 18, border: `1px solid ${ui.border}`, background: ui.card, padding: 18, color: theme.fg, boxShadow: ui.glow, backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' }}>
              <div style={{ fontWeight: 950, fontSize: 22, letterSpacing: 0.2 }}>Welcome</div>
              <div style={{ marginTop: 8, color: theme.desc, lineHeight: 1.5, fontSize: 14 }}>
                Pick what you’re working on, then hit Start. This is designed to work in <b>any repo</b> (even if you don’t know the framework).
              </div>

              {quickStartInfo ? (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: `1px solid ${ui.border}`, background: ui.surfaceStrong, color: theme.fg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Detected</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: theme.desc, lineHeight: 1.5 }}>
          {detectedReport ? (
                      <>
                        <div>
                Apps: {detectedApps.length || 0} • Preview targets: {detectedPreviewTargets.length || 0}
                        </div>
                        <div>
                          HTML entrypoints: {detectedHtmlCandidates.length || 0}
                        </div>
                        {quickStartInfo.recommendedUrl ? (
                            <div>
                              Suggested URL: <code style={{ color: theme.fg }}>{quickStartInfo.recommendedUrl}</code>
                              {quickStartInfo.recommendedConnect === 'existing' ? (
                                <span style={{ marginLeft: 8, fontWeight: 800, color: '#16a34a' }}>• looks running</span>
                              ) : quickStartInfo.recommendedConnect === 'integrated' ? (
                                <span style={{ marginLeft: 8, fontWeight: 800, color: '#f59e0b' }}>• not running yet</span>
                              ) : null}
                            </div>
                        ) : null}

                        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: `1px solid ${ui.border}`, background: ui.surface, color: theme.fg }}>
                          <div style={{ fontWeight: 850, fontSize: 13 }}>Detected main</div>
                          <div style={{ marginTop: 6, fontSize: 13, color: theme.desc }}>
                            {(() => {
                              // Prefer recommended mode, but always fall back to anything detected.
                              const wantsApp = quickStartInfo.recommendedMode === 'app';
                              const hasAppOrPreview = (detectedApps.length + detectedPreviewTargets.length) > 0;
                              const hasHtml = detectedHtmlCandidates.length > 0;

                              if (wantsApp && hasAppOrPreview) {
                                const primaryApp = detectedApps[0];
                                const primaryPreview = detectedPreviewTargets[0];
                                if (primaryApp) {
                                  return (
                                    <div>
                                      Recommended: <b>{primaryApp.framework.toUpperCase()}</b> — <span style={{ color: theme.fg, fontWeight: 800 }}>{primaryApp.label || primaryApp.root}</span>
                                      <button
                                        onClick={() => {
                                          setWelcomeMode('app');
                                          setDetectedPickKind('app');
                                          setDetectedAppRoot(primaryApp.root);
                                        }}
                                        style={{ ...toggleButtonStyle(false), marginLeft: 10 }}
                                        title="Select this app"
                                      >
                                        Select
                                      </button>
                                    </div>
                                  );
                                }
                                if (primaryPreview) {
                                  return (
                                    <div>
                                      Recommended: <b>{primaryPreview.label}</b> — <span style={{ color: theme.fg, fontWeight: 800 }}>{primaryPreview.root}</span>
                                      <button
                                        onClick={() => {
                                          setWelcomeMode('app');
                                          setDetectedPickKind('preview');
                                          setDetectedPreviewId(primaryPreview.id);
                                        }}
                                        style={{ ...toggleButtonStyle(false), marginLeft: 10 }}
                                        title="Select this preview"
                                      >
                                        Select
                                      </button>
                                    </div>
                                  );
                                }
                              }

                              if (!wantsApp && hasHtml) {
                                const primaryHtml = detectedHtmlCandidates[0];
                                return (
                                  <div>
                                    Recommended: <b>HTML</b> — <span style={{ color: theme.fg, fontWeight: 800 }}>{primaryHtml.label}</span>
                                    <button
                                      onClick={() => {
                                        setWelcomeMode('html');
                                        vscode?.postMessage({ command: 'quickStart', mode: 'static', static: { target: 'file', fileId: primaryHtml.fileId } } satisfies FromWebviewMessage);
                                      }}
                                      style={{ ...toggleButtonStyle(false), marginLeft: 10 }}
                                      title={primaryHtml.fileId}
                                    >
                                      Open
                                    </button>
                                  </div>
                                );
                              }

                              // Fallback priority: apps/previews first, then HTML.
                              if (hasAppOrPreview) {
                                const primaryApp = detectedApps[0];
                                const primaryPreview = detectedPreviewTargets[0];
                                if (primaryApp) {
                                  return (
                                    <div>
                                      Suggested: <b>{primaryApp.framework.toUpperCase()}</b> — <span style={{ color: theme.fg, fontWeight: 800 }}>{primaryApp.label || primaryApp.root}</span>
                                      <button
                                        onClick={() => {
                                          setWelcomeMode('app');
                                          setDetectedPickKind('app');
                                          setDetectedAppRoot(primaryApp.root);
                                        }}
                                        style={{ ...toggleButtonStyle(false), marginLeft: 10 }}
                                      >
                                        Select
                                      </button>
                                    </div>
                                  );
                                }
                                if (primaryPreview) {
                                  return (
                                    <div>
                                      Suggested: <b>{primaryPreview.label}</b> — <span style={{ color: theme.fg, fontWeight: 800 }}>{primaryPreview.root}</span>
                                      <button
                                        onClick={() => {
                                          setWelcomeMode('app');
                                          setDetectedPickKind('preview');
                                          setDetectedPreviewId(primaryPreview.id);
                                        }}
                                        style={{ ...toggleButtonStyle(false), marginLeft: 10 }}
                                      >
                                        Select
                                      </button>
                                    </div>
                                  );
                                }
                              }

                              if (hasHtml) {
                                const primaryHtml = detectedHtmlCandidates[0];
                                return (
                                  <div>
                                    Suggested: <b>HTML</b> — <span style={{ color: theme.fg, fontWeight: 800 }}>{primaryHtml.label}</span>
                                    <button
                                      onClick={() => {
                                        setWelcomeMode('html');
                                        vscode?.postMessage({ command: 'quickStart', mode: 'static', static: { target: 'file', fileId: primaryHtml.fileId } } satisfies FromWebviewMessage);
                                      }}
                                      style={{ ...toggleButtonStyle(false), marginLeft: 10 }}
                                      title={primaryHtml.fileId}
                                    >
                                      Open
                                    </button>
                                  </div>
                                );
                              }

                              return <div>No supported targets detected yet. You can still pick a file manually.</div>;
                            })()}
                          </div>

                          {(detectedApps.length || detectedPreviewTargets.length || detectedHtmlCandidates.length) ? (
                            <div style={{ marginTop: 10 }}>
                              <div style={{ fontWeight: 850, fontSize: 13 }}>Other detected targets</div>

                              {detectedApps.length ? (
                                <div style={{ marginTop: 8 }}>
                                  <div style={{ fontSize: 12, color: theme.desc, fontWeight: 800 }}>Apps</div>
                                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {detectedApps.map((a, idx) => (
                                      <button
                                        key={`${a.root}-${idx}`}
                                        onClick={() => {
                                          setWelcomeMode('app');
                                          setDetectedPickKind('app');
                                          setDetectedAppRoot(a.root);
                                        }}
                                        style={toggleButtonStyle(false)}
                                        title={a.root}
                                      >
                                        Select {a.framework.toUpperCase()} — {a.label || a.root}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {detectedPreviewTargets.length ? (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontSize: 12, color: theme.desc, fontWeight: 800 }}>Previews</div>
                                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {detectedPreviewTargets.map((t, idx) => (
                                      <button
                                        key={`${t.id}-${idx}`}
                                        onClick={() => {
                                          setWelcomeMode('app');
                                          setDetectedPickKind('preview');
                                          setDetectedPreviewId(t.id);
                                        }}
                                        style={toggleButtonStyle(false)}
                                        title={t.root}
                                      >
                                        Select {t.label} — {t.root}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}

                              {detectedHtmlCandidates.length ? (
                                <div style={{ marginTop: 10 }}>
                                  <div style={{ fontSize: 12, color: theme.desc, fontWeight: 800 }}>HTML</div>
                                  <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    {detectedHtmlCandidates.slice(0, 10).map((c, i) => (
                                      <button
                                        key={`${c.fileId}-${i}`}
                                        onClick={() => {
                                          setWelcomeMode('html');
                                          vscode?.postMessage({ command: 'quickStart', mode: 'static', static: { target: 'file', fileId: c.fileId } } satisfies FromWebviewMessage);
                                        }}
                                        style={toggleButtonStyle(false)}
                                        title={c.fileId}
                                      >
                                        Open {c.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                          {(detectedApps.length || detectedPreviewTargets.length) ? (
                            <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: `1px solid ${ui.border}`, background: ui.surface, color: theme.fg }}>
                              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <div style={{ display: 'flex', gap: 6, padding: 6, borderRadius: 12, border: `1px solid ${ui.border}`, background: ui.surfaceStrong, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
                                    <button
                                      onClick={() => setDetectedPickKind('app')}
                                      disabled={!detectedApps.length}
                                      style={{ ...controlButtonStyle(detectedPickKind === 'app'), opacity: detectedApps.length ? 1 : 0.55, cursor: detectedApps.length ? 'pointer' : 'not-allowed' }}
                                    >
                                      App
                                    </button>
                                    <button
                                      onClick={() => setDetectedPickKind('preview')}
                                      disabled={!detectedPreviewTargets.length}
                                      style={{ ...controlButtonStyle(detectedPickKind === 'preview'), opacity: detectedPreviewTargets.length ? 1 : 0.55, cursor: detectedPreviewTargets.length ? 'pointer' : 'not-allowed' }}
                                    >
                                      Preview
                                    </button>
                                  </div>

                                  {detectedPickKind === 'app' ? (
                                    <select value={detectedAppRoot} onChange={e => setDetectedAppRoot(e.target.value)} style={{ ...selectStyle, minWidth: 320 }}>
                                      {detectedApps.map((a, idx) => (
                                        <option key={`${a.root}-${idx}`} value={a.root}>
                                          {a.framework.toUpperCase()} — {a.label || a.root}
                                        </option>
                                      ))}
                                    </select>
                                  ) : detectedPickKind === 'preview' ? (
                                    <select value={detectedPreviewId} onChange={e => setDetectedPreviewId(e.target.value)} style={{ ...selectStyle, minWidth: 320 }}>
                                      {detectedPreviewTargets.map((t, idx) => (
                                        <option key={`${t.id}-${idx}`} value={t.id}>
                                          {t.label} — {t.root}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span style={{ color: theme.desc, fontSize: 12 }}>Pick App or Preview to continue.</span>
                                  )}
                                </div>

                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                  <button
                                    onClick={() => {
                                      if (!selectedDetectedRoot) return;
                                      vscode?.postMessage({ command: 'autoInstallDeps', root: selectedDetectedRoot } satisfies FromWebviewMessage);
                                    }}
                                    disabled={!selectedDetectedRoot}
                                    style={toggleButtonStyle(false)}
                                    title="Runs npm/pnpm/yarn install in this folder"
                                  >
                                    Install deps
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!selectedDetectedRoot) return;
                                      if (detectedPickKind === 'app' && selectedDetectedApp) {
                                        const msg: FromWebviewMessage = {
                                          command: 'quickStart',
                                          mode: 'app',
                                          app: {
                                            connect: 'integrated',
                                            appRoot: selectedDetectedApp.root,
                                            framework: selectedDetectedApp.framework,
                                            devScript: selectedDetectedApp.devScript,
                                            scriptName: (selectedDetectedApp as any).scriptName,
                                            defaultPort: (selectedDetectedApp as any).defaultPort,
                                            styleAdapterPref: appStyleAdapterPref,
                                            layoutApplyMode: appLayoutApplyMode,
                                            startBackend: appStartBackend,
                                          }
                                      };
                                      vscode?.postMessage(msg);
                                      return;
                                    }
                                    if (detectedPickKind === 'preview' && selectedDetectedPreview) {
                                        const url = (detectedUrl || buildDefaultUrlForPreviewTarget(selectedDetectedPreview)).trim();
                                        const msg: FromWebviewMessage = {
                                          command: 'quickStart',
                                          mode: 'app',
                                          app: {
                                            connect: 'integrated',
                                            url,
                                            appRoot: selectedDetectedPreview.root,
                                            framework: 'generic',
                                            devScript: 'dev',
                                            scriptName: selectedDetectedPreview.scriptName,
                                            defaultPort: selectedDetectedPreview.defaultPort,
                                            urlPath: selectedDetectedPreview.urlPath,
                                            styleAdapterPref: appStyleAdapterPref,
                                            layoutApplyMode: appLayoutApplyMode,
                                            startBackend: appStartBackend,
                                          }
                                      };
                                      vscode?.postMessage(msg);
                                    }
                                    }}
                                    disabled={!selectedDetectedRoot || detectedPickKind === 'none'}
                                    style={primaryButtonStyle}
                                    title="Starts and connects"
                                  >
                                    Start & Connect
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (!selectedDetectedRoot) return;
                                      if (detectedPickKind === 'app' && selectedDetectedApp) {
                                        const msg: FromWebviewMessage = {
                                          command: 'quickStart',
                                          mode: 'app',
                                          app: {
                                            connect: 'external',
                                            appRoot: selectedDetectedApp.root,
                                            framework: selectedDetectedApp.framework,
                                            devScript: selectedDetectedApp.devScript,
                                            scriptName: (selectedDetectedApp as any).scriptName,
                                            defaultPort: (selectedDetectedApp as any).defaultPort,
                                            styleAdapterPref: appStyleAdapterPref,
                                            layoutApplyMode: appLayoutApplyMode,
                                            startBackend: appStartBackend,
                                          }
                                      };
                                      vscode?.postMessage(msg);
                                      return;
                                    }
                                    if (detectedPickKind === 'preview' && selectedDetectedPreview) {
                                        const url = (detectedUrl || buildDefaultUrlForPreviewTarget(selectedDetectedPreview)).trim();
                                        const msg: FromWebviewMessage = {
                                          command: 'quickStart',
                                          mode: 'app',
                                          app: {
                                            connect: 'external',
                                            url,
                                            appRoot: selectedDetectedPreview.root,
                                            framework: 'generic',
                                            devScript: 'dev',
                                            scriptName: selectedDetectedPreview.scriptName,
                                            defaultPort: selectedDetectedPreview.defaultPort,
                                            urlPath: selectedDetectedPreview.urlPath,
                                            styleAdapterPref: appStyleAdapterPref,
                                            layoutApplyMode: appLayoutApplyMode,
                                            startBackend: appStartBackend,
                                          }
                                      };
                                      vscode?.postMessage(msg);
                                    }
                                    }}
                                    disabled={!selectedDetectedRoot || detectedPickKind === 'none'}
                                    style={toggleButtonStyle(false)}
                                    title="Starts in an external window"
                                  >
                                    Start external
                                  </button>
                                </div>
                              </div>

                              <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <input
                                  value={detectedUrl}
                                  onChange={e => setDetectedUrl(e.target.value)}
                                  placeholder="http://127.0.0.1:3000/"
                                  style={{ ...textInputStyle, flex: '1 1 320px', minWidth: 260 }}
                                />
                                <button
                                  onClick={() => {
                                    if (!selectedDetectedRoot) return;
                                    const url = (detectedUrl || '').trim();
                                    if (!url) return;
                                    if (detectedPickKind === 'app' && selectedDetectedApp) {
                                      const msg: FromWebviewMessage = {
                                        command: 'quickStart',
                                        mode: 'app',
                                        app: {
                                          connect: 'existing',
                                          url,
                                          appRoot: selectedDetectedApp.root,
                                          framework: selectedDetectedApp.framework,
                                          devScript: selectedDetectedApp.devScript,
                                          scriptName: (selectedDetectedApp as any).scriptName,
                                          defaultPort: (selectedDetectedApp as any).defaultPort,
                                          styleAdapterPref: appStyleAdapterPref,
                                          layoutApplyMode: appLayoutApplyMode,
                                          startBackend: appStartBackend,
                                        }
                                      };
                                      vscode?.postMessage(msg);
                                      return;
                                    }
                                    if (detectedPickKind === 'preview' && selectedDetectedPreview) {
                                      const msg: FromWebviewMessage = {
                                        command: 'quickStart',
                                        mode: 'app',
                                        app: {
                                          connect: 'existing',
                                          url,
                                          appRoot: selectedDetectedPreview.root,
                                          framework: 'generic',
                                          devScript: 'dev',
                                          scriptName: selectedDetectedPreview.scriptName,
                                          defaultPort: selectedDetectedPreview.defaultPort,
                                          urlPath: selectedDetectedPreview.urlPath,
                                          styleAdapterPref: appStyleAdapterPref,
                                          layoutApplyMode: appLayoutApplyMode,
                                          startBackend: appStartBackend,
                                        }
                                      };
                                      vscode?.postMessage(msg);
                                    }
                                  }}
                                  disabled={!selectedDetectedRoot || !(detectedUrl || '').trim() || detectedPickKind === 'none'}
                                  style={toggleButtonStyle(false)}
                                  title="Connect to an existing dev server URL"
                                >
                                  Connect existing
                                </button>
                              </div>

                              {selectedDetectedRoot ? (
                                <div style={{ marginTop: 8, fontSize: 12, color: theme.desc }}>
                                  Selected: <span style={{ color: theme.fg, fontWeight: 800 }}>{selectedDetectedRoot}</span>
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                      </>
                      ) : quickStartInfo.appsDetected?.length ? (
                        <>
                          <div>
                            App(s): {quickStartInfo.appsDetected.map(a => `${a.framework.toUpperCase()} (${a.label || 'app'})`).join(' • ')}
                          </div>
                          {quickStartInfo.recommendedUrl ? (
                            <div>
                              Suggested URL: <code style={{ color: theme.fg }}>{quickStartInfo.recommendedUrl}</code>
                              {quickStartInfo.recommendedConnect === 'existing' ? (
                                <span style={{ marginLeft: 8, fontWeight: 800, color: '#16a34a' }}>• looks running</span>
                              ) : quickStartInfo.recommendedConnect === 'integrated' ? (
                                <span style={{ marginLeft: 8, fontWeight: 800, color: '#f59e0b' }}>• not running yet</span>
                              ) : null}
                            </div>
                          ) : null}
                        </>
                      ) : (
                      <div>
                        No supported dev-server app detected (Vite/Next). HTML mode is a great start.
                        {quickStartInfo.report?.htmlCandidates?.length ? (
                          <div style={{ marginTop: 8 }}>
                            Found HTML entrypoints:
                            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {quickStartInfo.report.htmlCandidates.slice(0, 6).map((c, i) => (
                                <button
                                  key={`${c.fileId}-${i}`}
                                  onClick={() => vscode?.postMessage({ command: 'quickStart', mode: 'static', static: { target: 'file', fileId: c.fileId } } satisfies FromWebviewMessage)}
                                  style={toggleButtonStyle(false)}
                                  title={c.fileId}
                                >
                                  Open {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    )}

                    {quickStartInfo.notes?.length ? (
                      <div style={{ marginTop: 6 }}>
                        {quickStartInfo.notes.map((n, i) => (
                          <div key={i}>• {n}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setWelcomeMode('html')}
                  style={toggleButtonStyle(welcomeMode === 'html')}
                >
                  Static HTML / No dev server
                </button>
                <button
                  onClick={() => setWelcomeMode('app')}
                  style={toggleButtonStyle(welcomeMode === 'app')}
                >
                  App Mode (dev server)
                </button>
              </div>

              {welcomeMode === 'html' ? (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 700 }}>Start with an HTML file</div>
                  <div style={{ marginTop: 8, color: theme.desc, fontSize: 14, lineHeight: 1.5 }}>
                    Best for simple sites or when you don’t have a dev server. You’ll pick an <code>.html</code> file and edit it visually.
                  </div>

          {quickStartInfo?.report?.htmlCandidates?.length ? (
          <div style={{ marginTop: 10, padding: 12, borderRadius: 12, border: `1px solid ${ui.border}`, background: ui.surface, color: theme.fg }}>
            <div style={{ fontWeight: 850, fontSize: 13 }}>Suggested HTML entrypoints</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {quickStartInfo.report.htmlCandidates.slice(0, 8).map((c, i) => (
              <button
              key={`${c.fileId}-${i}`}
              onClick={() => vscode?.postMessage({ command: 'quickStart', mode: 'static', static: { target: 'file', fileId: c.fileId } } satisfies FromWebviewMessage)}
              style={toggleButtonStyle(false)}
              title={c.fileId}
              >
              Open {c.label}
              </button>
            ))}
            </div>
          </div>
          ) : null}

                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        const msg: FromWebviewMessage = { command: 'quickStart', mode: 'static', static: { target: 'htmlPicker' } };
                        vscode?.postMessage(msg);
                      }}
                      style={primaryButtonStyle}
                    >
                      Start (pick an HTML file)
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => vscode?.postMessage({ command: 'pickTargetFile', kind: 'html' })}
                      style={toggleButtonStyle(false)}
                    >
                      Pick an HTML file…
                    </button>
                    <button
                      onClick={() => vscode?.postMessage({ command: 'pickTargetFile', kind: 'active' })}
                      style={toggleButtonStyle(false)}
                      title="Uses the currently open editor file"
                    >
                      Use current file
                    </button>
                    <button
                      onClick={() => vscode?.postMessage({ command: 'pickTargetFile', kind: 'sample' })}
                      style={toggleButtonStyle(false)}
                      title="Loads the built-in sample (or prompts if missing)"
                    >
                      Try a sample
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 700 }}>Start App Mode (recommended for React/Vite/Next)</div>
                  <div style={{ marginTop: 8, color: theme.desc, fontSize: 14, lineHeight: 1.5 }}>
                    App Mode connects to a local dev server (like <code>http://127.0.0.1:5173</code>) and edits your real app UI without covering it.
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: theme.desc }}>Connect:</span>
                      <select value={appConnect} onChange={(e) => setAppConnect(e.target.value as any)} style={selectStyle}>
                        <option value="integrated">Start dev server (integrated terminal)</option>
                        <option value="existing">Use existing URL</option>
                        <option value="external">Start dev server (external window)</option>
                      </select>
                    </div>
                    {appConnect === 'existing' ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: theme.desc }}>URL:</span>
                        <input
                          value={appUrl}
                          onChange={(e) => setAppUrl(e.target.value)}
                          placeholder="http://127.0.0.1:5173"
							style={{ ...textInputStyle, width: 300 }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: theme.desc }}>Style mode:</span>
                      <select value={appStyleAdapterPref} onChange={(e) => setAppStyleAdapterPref(e.target.value as any)} style={selectStyle}>
                        <option value="auto">Auto (recommended)</option>
                        <option value="tailwind">Tailwind</option>
                        <option value="cssClass">CSS Class</option>
                        <option value="inline">Inline</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: theme.desc }}>Layout apply:</span>
                      <select value={appLayoutApplyMode} onChange={(e) => setAppLayoutApplyMode(e.target.value as any)} style={selectStyle}>
                        <option value="off">Off (safest)</option>
                        <option value="safe">Safe</option>
                        <option value="full">Full (advanced)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              fontSize: 13,
              color: theme.fg,
              lineHeight: 1.4,
              padding: '8px 10px',
              borderRadius: 12,
              border: `1px solid ${ui.border}`,
              background: ui.surface,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              cursor: 'pointer',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={appStartBackend}
              onChange={(e) => setAppStartBackend(e.target.checked)}
              style={{
                width: 16,
                height: 16,
                accentColor: brand.teal,
                cursor: 'pointer',
              }}
            />
            <span>
              Also start backend/API server <span style={{ color: theme.desc }}>(if the repo has one)</span>
            </span>
          </label>
                  </div>

                  <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        const msg: FromWebviewMessage = {
                          command: 'quickStart',
                          mode: 'app',
                          app: {
                            connect: appConnect,
                            url: appConnect === 'existing' ? appUrl : undefined,
                            styleAdapterPref: appStyleAdapterPref,
                            layoutApplyMode: appLayoutApplyMode,
                            startBackend: appStartBackend,
                          }
                        };
                        vscode?.postMessage(msg);
                      }}
						style={primaryButtonStyle}
                    >
                      Start App Mode
                    </button>
                    <button
                      onClick={() => setHelpExpanded(true)}
						style={toggleButtonStyle(false)}
                      title="Shows quick help + link to full HELP.md"
                    >
                      Help / Troubleshooting
                    </button>
                  </div>

                  <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `1px dashed ${ui.border}`, background: ui.surfaceStrong, color: theme.fg, backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>Don’t have a dev server set up?</div>
                    <div style={{ marginTop: 8, fontSize: 13, color: theme.desc, lineHeight: 1.5 }}>
                      Most web apps can be started with <code>npm install</code> then <code>npm run dev</code> (or <code>npm start</code>). If you’re not sure, ask Copilot Chat in VS Code:
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        onClick={async () => {
                          const detected = quickStartInfo?.report?.apps?.length
                            ? `Detected apps: ${quickStartInfo.report.apps.map(a => `${a.framework.toUpperCase()} (${a.label || 'app'})`).join(' • ')}.`
                            : (quickStartInfo?.appsDetected?.length
                              ? `Detected apps: ${quickStartInfo.appsDetected.map(a => `${a.framework.toUpperCase()} (${a.label || 'app'})`).join(' • ')}.`
                              : 'No dev-server app auto-detected.');
                          const install = quickStartInfo?.installHint ? `Install: ${quickStartInfo.installHint}.` : '';
                          const dev = quickStartInfo?.devHint ? `Dev server: ${quickStartInfo.devHint}.` : '';
                          const url = quickStartInfo?.recommendedUrl ? `It should run on ${quickStartInfo.recommendedUrl} (or tell me the correct URL/port).` : 'Tell me the correct localhost URL/port.';
                          const prompt = `I’m not technical. Help me start the dev server for this repo so Live UI Editor can connect. ${detected} ${install} ${dev} ${url} If it’s a monorepo, tell me which folder to run commands in and the exact steps.`;
                          try {
                            await navigator.clipboard.writeText(prompt);
                          } catch {
                            // ignore
                          }
                        }}
						style={toggleButtonStyle(false)}
                      >
                        Copy Copilot prompt
                      </button>
						<span style={{ fontSize: 13, color: theme.desc }}>Paste into Copilot Chat</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      {selectionOverlay}
      <DebugOverlay
        enabled={debugEnabled}
        selection={((): SelectionModel | null => {
          const sel = selectedElRef.current;
          const leaf = (leafElRef.current && leafElRef.current.isConnected) ? leafElRef.current : sel;
          const mapped = leaf ? (leaf.closest<HTMLElement>('[data-source-file][data-source-line]') ?? sel) : sel;
          const loc = selectedLocatorRef.current;
          if (!sel || !leaf || !mapped || !loc) return null;
          return {
            mode: selectionMode,
            leafEl: leaf,
            mappedEl: mapped,
            selectedEl: sel,
            groupRootEl: undefined,
            locator: loc,
          };
        })()}
        rect={debugRect}
        stats={debugStats}
      />
    </div>
  );
}
