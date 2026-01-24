import React, { useEffect, useMemo, useRef, useState } from 'react';
import { isToWebviewMessage, type FromWebviewMessage, type QuickStartInfoMessage } from './bridge/messages';
import { DebugOverlay, type DebugStats } from './editor/debugOverlay';
import type { SelectionModel } from './editor/types';
import { hitTestAtPoint } from './editor/hitTest';
import { getScrollParents } from './editor/scrollParents';

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
          if (event.data.info.recommendedMode === 'app') setWelcomeMode('app');
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
    // If we re-render the HTML, our previously selected DOM node may be replaced.
    const canvas = canvasRef.current;
    const loc = selectedLocatorRef.current;
    if (!canvas || !loc) {
      updateBreadcrumbs();
      return;
    }

    const queryBase = `[data-source-file="${CSS.escape(loc.file)}"][data-source-line="${loc.line}"]`;
    const query = loc.column ? `${queryBase}[data-source-column="${loc.column}"]` : queryBase;
    const next = canvas.querySelector<HTMLElement>(query) ?? canvas.querySelector<HTMLElement>(queryBase);
    if (next && next !== selectedElRef.current) {
      setSelectedEl(next);
    }
    updateBreadcrumbs();
    bumpDebug('renderedHtml', next?.getBoundingClientRect() ?? selectedElRef.current?.getBoundingClientRect() ?? null);
  }, [renderedHtml]);

  const pickStableClasses = (classList: DOMTokenList | null | undefined, max: number) => {
    const raw = classList ? Array.from(classList) : [];
    return raw
      .map(c => c.trim())
      .filter(Boolean)
      .filter(c => c.length <= 40)
      .filter(c => /^[a-zA-Z0-9_-]+$/.test(c))
      .slice(0, max);
  };

  const isScrollContainerEl = (el: HTMLElement) => {
    const cs = window.getComputedStyle(el);
    const oy = cs.overflowY;
    const ox = cs.overflowX;
    const scrollY = (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
    const scrollX = (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1;
    return scrollY || scrollX;
  };

  const summarizeNode = (el: HTMLElement | null | undefined) => {
    if (!el) return null;
    return { tagName: el.tagName.toLowerCase(), classList: pickStableClasses(el.classList, 4) };
  };

  const findGroupRoot = (el: HTMLElement) => {
    // Prefer an explicit "target" container when present.
    const target = el.closest<HTMLElement>('.target');
    if (target) return target;
    // Or an explicitly marked group root.
    const marked = el.closest<HTMLElement>('[data-live-ui-group-root="1"]');
    if (marked) return marked;
    return el;
  };

  const findGroupRootMapped = (leafMapped: HTMLElement) => {
    const groupCandidate = findGroupRoot(leafMapped);
    // Always ensure we return a source-mapped element.
    const mapped = groupCandidate.matches('[data-source-file][data-source-line]')
      ? groupCandidate
      : groupCandidate.closest<HTMLElement>('[data-source-file][data-source-line]');
    return mapped ?? leafMapped;
  };

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
      const line = loc?.line;
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

  return (
    <div style={{
			fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
			height: '100vh',
			width: '100vw',
			boxSizing: 'border-box',
			background: theme.bg,
			color: theme.fg,
		}}>
      <div style={{ padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start', justifyContent: 'space-between', background: theme.bg, color: theme.fg }}>
        <div>
        <h1 style={{ margin: 0, fontSize: 20, color: theme.fg }}>VSCode Live UI Editor</h1>
        <p style={{ marginTop: 8, color: theme.desc, lineHeight: 1.45, fontSize: 13 }}>
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
                    border: `1px solid ${theme.border}`,
                    color: theme.fg,
                    background: (b.el === selectedEl) ? 'rgba(99,102,241,0.28)' : theme.panel,
                    cursor: 'pointer',
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
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.panel, maxWidth: 860, color: theme.fg }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Help</div>
            <div style={{ fontSize: 12, color: theme.desc, lineHeight: 1.5 }}>
              <div><b>Selection mode:</b> Group selects the nearest container (like <code>.target</code>) so grouped UIs stay together.</div>
              <div><b>Element mode:</b> Select individual nested elements.</div>
              <div><b>Shortcuts:</b> Ctrl/Cmd+Click jump • Alt+Click leaf • Shift+Click group • Arrow keys nudge (Shift=10px)</div>
              <div><b>Text editing:</b> Double-click text • Enter save • Esc cancel • Click away saves</div>
              <div style={{ marginTop: 8 }}>
                <button onClick={() => vscode?.postMessage({ command: 'openHelp' })} style={{ padding: '6px 10px', borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg }}>
                  Open full HELP.md
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, padding: 6, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.panel }}>
            <button
              onClick={() => setSelectionMode('group')}
              style={{ padding: '6px 10px', borderRadius: 10, border: `1px solid ${theme.border}`, color: theme.fg, background: selectionMode === 'group' ? 'rgba(99,102,241,0.28)' : theme.bg }}
              title="Select whole grouped areas"
            >
              Group
            </button>
            <button
              onClick={() => setSelectionMode('element')}
              style={{ padding: '6px 10px', borderRadius: 10, border: `1px solid ${theme.border}`, color: theme.fg, background: selectionMode === 'element' ? 'rgba(99,102,241,0.28)' : theme.bg }}
              title="Select individual elements"
            >
              Element
            </button>
          </div>
          <button onClick={selectParent} disabled={!selectedEl} style={{ padding: '6px 10px', borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg, opacity: selectedEl ? 1 : 0.6 }}>
            Select parent
          </button>
          <button onClick={() => setHelpExpanded(v => !v)} style={{ padding: '6px 10px', borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg }}>
            {helpExpanded ? 'Hide help' : 'Help'}
          </button>
          <button onClick={() => setDebugEnabled(v => !v)} style={{ padding: '6px 10px', borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg }}>
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
          height: 'calc(100vh - 110px)',
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
          <div style={{ padding: 22 }}>
            <div style={{ maxWidth: 920, borderRadius: 16, border: `1px solid ${theme.border}`, background: theme.panel, padding: 18, color: theme.fg }}>
              <div style={{ fontWeight: 900, fontSize: 22, letterSpacing: 0.2 }}>Welcome to Live UI Editor</div>
              <div style={{ marginTop: 8, color: theme.desc, lineHeight: 1.5, fontSize: 14 }}>
                Pick what you’re working on, then hit Start. This is designed to work in <b>any repo</b> (even if you don’t know the framework).
              </div>

              {quickStartInfo ? (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg }}>
                  <div style={{ fontWeight: 800, fontSize: 13 }}>Detected</div>
                  <div style={{ marginTop: 6, fontSize: 13, color: theme.desc, lineHeight: 1.5 }}>
                    {quickStartInfo.appsDetected?.length ? (
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
                      <div>No supported dev-server app detected (Vite/Next). HTML mode is a great start.</div>
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
                  style={{
						padding: '10px 14px',
						borderRadius: 12,
						border: `1px solid ${theme.border}`,
						background: welcomeMode === 'html' ? theme.buttonBg : theme.bg,
						color: welcomeMode === 'html' ? theme.buttonFg : theme.fg,
						fontWeight: 800,
					}}
                >
                  Static HTML / No dev server
                </button>
                <button
                  onClick={() => setWelcomeMode('app')}
                  style={{
						padding: '10px 14px',
						borderRadius: 12,
						border: `1px solid ${theme.border}`,
						background: welcomeMode === 'app' ? theme.buttonBg : theme.bg,
						color: welcomeMode === 'app' ? theme.buttonFg : theme.fg,
						fontWeight: 800,
					}}
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

                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        const msg: FromWebviewMessage = { command: 'quickStart', mode: 'static', static: { target: 'htmlPicker' } };
                        vscode?.postMessage(msg);
                      }}
                      style={{ padding: '12px 16px', borderRadius: 12, border: 'none', background: '#16a34a', color: '#ffffff', fontWeight: 900 }}
                    >
                      Start (pick an HTML file)
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => vscode?.postMessage({ command: 'pickTargetFile', kind: 'html' })}
                      style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg, fontWeight: 700 }}
                    >
                      Pick an HTML file…
                    </button>
                    <button
                      onClick={() => vscode?.postMessage({ command: 'pickTargetFile', kind: 'active' })}
                      style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg, fontWeight: 700 }}
                      title="Uses the currently open editor file"
                    >
                      Use current file
                    </button>
                    <button
                      onClick={() => vscode?.postMessage({ command: 'pickTargetFile', kind: 'sample' })}
                      style={{ padding: '10px 14px', borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg, fontWeight: 700 }}
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
                      <select value={appConnect} onChange={(e) => setAppConnect(e.target.value as any)} style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${theme.inputBorder}`, background: theme.inputBg, color: theme.inputFg }}>
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
							style={{ width: 300, padding: '8px 10px', borderRadius: 10, border: `1px solid ${theme.inputBorder}`, background: theme.inputBg, color: theme.inputFg }}
                        />
                      </div>
                    ) : null}
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: theme.desc }}>Style mode:</span>
                      <select value={appStyleAdapterPref} onChange={(e) => setAppStyleAdapterPref(e.target.value as any)} style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${theme.inputBorder}`, background: theme.inputBg, color: theme.inputFg }}>
                        <option value="auto">Auto (recommended)</option>
                        <option value="tailwind">Tailwind</option>
                        <option value="cssClass">CSS Class</option>
                        <option value="inline">Inline</option>
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: theme.desc }}>Layout apply:</span>
                      <select value={appLayoutApplyMode} onChange={(e) => setAppLayoutApplyMode(e.target.value as any)} style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${theme.inputBorder}`, background: theme.inputBg, color: theme.inputFg }}>
                        <option value="off">Off (safest)</option>
                        <option value="safe">Safe</option>
                        <option value="full">Full (advanced)</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ marginTop: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: theme.desc, lineHeight: 1.4 }}>
                      <input type="checkbox" checked={appStartBackend} onChange={(e) => setAppStartBackend(e.target.checked)} />
                      Also start backend/API server (if the repo has one)
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
						style={{ padding: '12px 16px', borderRadius: 12, border: 'none', background: '#16a34a', color: '#ffffff', fontWeight: 900 }}
                    >
                      Start App Mode
                    </button>
                    <button
                      onClick={() => setHelpExpanded(true)}
						style={{ padding: '12px 16px', borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg, fontWeight: 800 }}
                      title="Shows quick help + link to full HELP.md"
                    >
                      Help / Troubleshooting
                    </button>
                  </div>

                  <div style={{ marginTop: 12, padding: 12, borderRadius: 12, border: `1px dashed ${theme.border}`, background: theme.bg, color: theme.fg }}>
                    <div style={{ fontWeight: 900, fontSize: 13 }}>Don’t have a dev server set up?</div>
                    <div style={{ marginTop: 8, fontSize: 13, color: theme.desc, lineHeight: 1.5 }}>
                      Most web apps can be started with <code>npm install</code> then <code>npm run dev</code> (or <code>npm start</code>). If you’re not sure, ask Copilot Chat in VS Code:
                    </div>
                    <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <button
                        onClick={async () => {
                          const detected = quickStartInfo?.appsDetected?.length
                            ? `Detected apps: ${quickStartInfo.appsDetected.map(a => `${a.framework.toUpperCase()} (${a.label || 'app'})`).join(' • ')}.`
                            : 'No Vite/Next app auto-detected.';
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
						style={{ padding: '10px 12px', borderRadius: 10, border: `1px solid ${theme.border}`, background: theme.bg, color: theme.fg, fontWeight: 800 }}
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
