import React, { useEffect, useMemo, useRef, useState } from 'react';
import Moveable from 'react-moveable';
import { isToWebviewMessage, type FromWebviewMessage } from './bridge/messages';

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

export default function App() {
  const vscode = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyWindow = window as any;
    return typeof anyWindow.acquireVsCodeApi === 'function' ? anyWindow.acquireVsCodeApi() : undefined;
  }, []);

  const frameRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const moveableRef = useRef<Moveable | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string>('');
  const [loadedFile, setLoadedFile] = useState<string>('');

  const [selectedEl, setSelectedEl] = useState<HTMLElement | null>(null);
  const [isInlineText, setIsInlineText] = useState<boolean>(false);
  const selectedElRef = useRef<HTMLElement | null>(null);
  const dragTranslateRef = useRef<[number, number]>([0, 0]);
  const [elementGuidelines, setElementGuidelines] = useState<HTMLElement[]>([]);
  const nudgePersistTimerRef = useRef<number | undefined>(undefined);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Build guidelines from elements in the rendered document.
    // Cap it to keep Moveable performant on large documents.
    const candidates = Array.from(canvas.querySelectorAll<HTMLElement>('[data-source-file][data-source-line]'));
    const filtered = candidates.filter(el => el.isConnected && el.offsetParent !== null).slice(0, 200);
    setElementGuidelines(filtered);
  }, [renderedHtml]);

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
      moveableRef.current?.updateRect();

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
        moveableRef.current?.updateRect();
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
        moveableRef.current?.updateRect();
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
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

		// Ignore clicks on moveable's own UI.
		if (target.closest('.moveable-control-box, .moveable-line, .moveable-control, .moveable-direction')) {
			return;
		}

      const sourceEl = target.closest<HTMLElement>('[data-source-file][data-source-line]');
      if (!sourceEl) return;

      // Use Moveable's selection UI instead of adding a separate outline box.
      setSelectedEl(sourceEl);

      // Notify extension of selection for Phase 5 (@ui-wizard).
      {
        const file = sourceEl.getAttribute('data-source-file');
        const lineRaw = sourceEl.getAttribute('data-source-line');
        const line = lineRaw ? Number(lineRaw) : NaN;
        const columnRaw = sourceEl.getAttribute('data-source-column');
        const columnParsed = columnRaw ? Number(columnRaw) : NaN;
        const column = Number.isFinite(columnParsed) ? columnParsed : undefined;
        if (file && Number.isFinite(line)) {
          const tagName = sourceEl.tagName.toLowerCase();
          const id = sourceEl.id || undefined;
          const classList = sourceEl.classList ? Array.from(sourceEl.classList).slice(0, 8) : undefined;
          const role = sourceEl.getAttribute('role') || undefined;
          const href = sourceEl.getAttribute('href') || undefined;
          const type = sourceEl.getAttribute('type') || undefined;
          const text = (sourceEl.textContent || '').trim().slice(0, 80) || undefined;
          const inlineStyle = sourceEl.getAttribute('style') || undefined;
			  const computedStyle = getSelectedComputedStylePatch(sourceEl);

          const msg: FromWebviewMessage = {
            command: 'elementSelected',
            file,
            line,
			column,
			elementContext: { tagName, id, classList, role, href, type, text },
			inlineStyle,
			computedStyle,
          };
          vscode?.postMessage(msg);
        }
      }

  		// Normal click = select for resizing. Ctrl/Cmd+Click = jump to code.
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

    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [vscode]);

  useEffect(() => {
    moveableRef.current?.updateRect();
  }, [selectedEl, renderedHtml]);

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial', height: '100vh', width: '100vw', boxSizing: 'border-box' }}>
      <div style={{ padding: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>VSCode Live UI Editor</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Click to select. Drag to move (snaps). Arrow keys nudge (Shift=10px). Drag handles to resize. Ctrl/Cmd+Click to jump to code.
        </p>
        <div style={{ marginTop: 12, opacity: 0.85, fontSize: 12 }}>
          Loaded: <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>{loadedFile || '(none)'}</span>
        </div>
      </div>
      <div
        ref={canvasRef}
        style={{
          position: 'relative',
          width: '100%',
          height: 'calc(100vh - 110px)',
          margin: 0,
          padding: 0,
          border: 'none',
          background: 'rgba(0,0,0,0.05)',
          overflow: 'auto',
        }}
      >
        {renderedHtml ? (
          <div dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        ) : (
          <div style={{ opacity: 0.85 }}>
            No document received yet. Run “Live UI: Open” with a workspace file selected.
          </div>
        )}
        {selectedEl ? (
          <Moveable
            ref={moveableRef}
            target={selectedEl}
            container={canvasRef.current ?? undefined}
            rootContainer={canvasRef.current ?? undefined}
            origin={false}
            draggable
      			resizable={!isInlineText}
            snappable
            snapThreshold={6}
            snapGap
            snapDirections={{ top: true, left: true, bottom: true, right: true, center: true, middle: true }}
            elementGuidelines={elementGuidelines}
            snapGridWidth={8}
            snapGridHeight={8}
            renderDirections={['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']}
      			// Inline text + resize handles is confusing; keep handles off.
      			// Moveable will still show a selection box for the element.
            keepRatio={false}
            throttleResize={0}
            useResizeObserver
            useMutationObserver
            useAccuratePosition
            onDragStart={(ev) => {
              // Start dragging from the element’s current translate.
              ev.set(dragTranslateRef.current);
            }}
            onDrag={(ev) => {
              const target = ev.target as HTMLElement;
              const [x, y] = ev.beforeTranslate;
              dragTranslateRef.current = [x, y];
              setTranslate(target, x, y);
              moveableRef.current?.updateRect();
            }}
            onDragEnd={(ev) => {
              const target = (ev.lastEvent?.target ?? selectedElRef.current) as HTMLElement | null;
              if (!target) return;
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
            }}
            onResize={(ev) => {
              const target = ev.target as HTMLElement;
              target.style.width = `${Math.round(ev.width)}px`;
              target.style.height = `${Math.round(ev.height)}px`;
              moveableRef.current?.updateRect();
            }}
            onResizeEnd={(ev) => {
              const target = (ev.lastEvent?.target ?? selectedElRef.current) as HTMLElement | null;
              if (!target) return;
              const file = target.getAttribute('data-source-file');
              const lineRaw = target.getAttribute('data-source-line');
              const line = lineRaw ? Number(lineRaw) : NaN;
              if (!file || !Number.isFinite(line)) return;

              const width = target.style.width || undefined;
              const height = target.style.height || undefined;

              const msg: FromWebviewMessage = {
                command: 'updateStyle',
                file,
                line,
                style: { width, height }
              };
              vscode?.postMessage(msg);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
