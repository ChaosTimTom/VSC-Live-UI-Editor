import React, { useEffect, useMemo, useRef, useState } from 'react';
import { acquireVsCodeApiSafe } from './vscodeApi';
import type {
  AppModeApplyReport,
  AppModeIdentityKind,
  AppModeInjectedOpts,
  AppModeLayoutApplyMode,
  AppModeStyleAdapter,
  AppModeViewportPreset,
} from './types';

function getInjectedOpts(): AppModeInjectedOpts {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyWindow = window as any;
  const opts = anyWindow.__LIVE_UI_APP_MODE_OPTS__ as AppModeInjectedOpts | undefined;
  if (!opts || !opts.iframeUrl || !opts.iframeOrigin) {
    return { iframeUrl: 'about:blank', iframeOrigin: 'null', appLabel: '(unknown app)' };
  }
  return opts;
}

function clampLayoutMode(raw: unknown): AppModeLayoutApplyMode {
  return raw === 'safe' || raw === 'full' ? raw : 'off';
}

function clampStyleAdapter(raw: unknown): AppModeStyleAdapter {
  return raw === 'tailwind' || raw === 'cssClass' || raw === 'inline' ? raw : 'auto';
}

function clampViewportPreset(raw: unknown): AppModeViewportPreset {
  const ok = new Set<AppModeViewportPreset>(['responsive', 'iphone14', 'iphone14land', 'iphonese', 'iphoneseland', 'ipad']);
  return ok.has(raw as AppModeViewportPreset) ? (raw as AppModeViewportPreset) : 'responsive';
}

type PersistedState = {
  sidebarCollapsed?: boolean;
  mode?: 'browse' | 'edit';
  layoutApplyMode?: AppModeLayoutApplyMode;
  styleAdapterPref?: AppModeStyleAdapter;
  viewportPreset?: AppModeViewportPreset;
  debugSafe?: boolean;
  tauriShimEnabled?: boolean;
};

export default function AppModeShell() {
  const vscode = useMemo(() => acquireVsCodeApiSafe(), []);
  const opts = useMemo(() => getInjectedOpts(), []);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mode, setMode] = useState<'browse' | 'edit'>('edit');
  const [pendingCount, setPendingCount] = useState(0);
  const [identityKind, setIdentityKind] = useState<AppModeIdentityKind>('unknown');

  const [layoutApplyMode, setLayoutApplyMode] = useState<AppModeLayoutApplyMode>('off');

  const [styleAdapterPref, setStyleAdapterPref] = useState<AppModeStyleAdapter>('auto');
  const [styleAdapterEffective, setStyleAdapterEffective] = useState<string>('');
  const [styleAdapterReason, setStyleAdapterReason] = useState<string>('');

  const [cssTargetLabel, setCssTargetLabel] = useState<string>('');

  const [viewportPreset, setViewportPreset] = useState<AppModeViewportPreset>('responsive');
  const [debugSafe, setDebugSafe] = useState<boolean>(false);
  const [tauriShimEnabled, setTauriShimEnabled] = useState<boolean>(!!opts.tauriShimEnabled);

  const [applyReport, setApplyReport] = useState<AppModeApplyReport | undefined>(undefined);
  const applyReportTimerRef = useRef<number | undefined>(undefined);

  // Restore persisted UI state.
  useEffect(() => {
    try {
      const raw = vscode.getState() as PersistedState | undefined;
      if (!raw || typeof raw !== 'object') return;
      if (typeof raw.sidebarCollapsed === 'boolean') setSidebarCollapsed(raw.sidebarCollapsed);
      if (raw.mode === 'browse' || raw.mode === 'edit') setMode(raw.mode);
      if (typeof raw.debugSafe === 'boolean') setDebugSafe(raw.debugSafe);
      if (typeof raw.tauriShimEnabled === 'boolean') setTauriShimEnabled(raw.tauriShimEnabled);
      setLayoutApplyMode(clampLayoutMode(raw.layoutApplyMode));
      setStyleAdapterPref(clampStyleAdapter(raw.styleAdapterPref));
      setViewportPreset(clampViewportPreset(raw.viewportPreset));
    } catch {
      // ignore
    }
  }, [vscode]);

  // Persist UI state.
  useEffect(() => {
    const next: PersistedState = {
      sidebarCollapsed,
      mode,
      debugSafe,
      tauriShimEnabled,
      layoutApplyMode,
      styleAdapterPref,
      viewportPreset,
    };
    try {
      const prev = (vscode.getState() as PersistedState) || {};
      vscode.setState({ ...prev, ...next });
    } catch {
      // ignore
    }
  }, [vscode, sidebarCollapsed, mode, debugSafe, tauriShimEnabled, layoutApplyMode, styleAdapterPref, viewportPreset]);

  const stable = identityKind === 'stable';
  const canApply = pendingCount > 0 && stable;
  const canApplyUnsafe = pendingCount > 0;
  const canDiscard = pendingCount > 0;

  function postToIframe(message: unknown) {
    try {
      iframeRef.current?.contentWindow?.postMessage(message, opts.iframeOrigin);
    } catch {
      // ignore
    }
  }

  function sendMode(nextMode: 'browse' | 'edit') {
    postToIframe({ type: 'live-ui-editor:setMode', mode: nextMode });
  }

  function sendDebug(nextDebugSafe: boolean) {
    postToIframe({ type: 'live-ui-editor:setDebug', safe: !!nextDebugSafe });
  }

  function applyViewportPreset(preset: AppModeViewportPreset) {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const presets: Record<AppModeViewportPreset, { w: number; h: number } | null> = {
      responsive: null,
      iphone14: { w: 390, h: 844 },
      iphone14land: { w: 844, h: 390 },
      iphonese: { w: 320, h: 568 },
      iphoneseland: { w: 568, h: 320 },
      ipad: { w: 768, h: 1024 },
    };

    const p = presets[preset] ?? null;
    if (!p) {
      iframe.classList.remove('lui-preset');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      return;
    }
    iframe.classList.add('lui-preset');
    iframe.style.width = `${p.w}px`;
    iframe.style.height = `${p.h}px`;
  }

  useEffect(() => {
    applyViewportPreset(viewportPreset);
  }, [viewportPreset]);

  // Ensure iframe picks up current mode/debug after navigation/reload.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      sendMode(mode);
      sendDebug(debugSafe);
    };
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [mode, debugSafe]);

  // Initial push.
  useEffect(() => {
    sendMode(mode);
    sendDebug(debugSafe);
  }, []);

  // Keyboard: Ctrl/Cmd+B toggles sidebar.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isToggle = (e.key === 'b' || e.key === 'B') && (e.ctrlKey || e.metaKey);
      if (!isToggle) return;
      e.preventDefault();
      setSidebarCollapsed(v => !v);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Receive messages from extension + iframe.
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      const data = ev.data;
      if (!data || typeof data !== 'object') return;

      // Iframe -> webview -> extension bridge (secure source/origin check).
      try {
        if (iframeRef.current && ev.source === iframeRef.current.contentWindow) {
          if (typeof ev.origin === 'string' && ev.origin !== opts.iframeOrigin) return;

          // Injected script posts { __liveUiEditor: true, message }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const anyData = data as any;
          if (anyData.__liveUiEditor === true && anyData.message) {
            try {
              if (anyData.message.command === 'elementSelected') {
                setIdentityKind(anyData.message.elementId ? 'stable' : 'fallback');
              }
              if (anyData.message.command === 'elementUnmapped') {
                setIdentityKind('unmapped');
              }
            } catch {
              // ignore
            }
            vscode.postMessage(anyData.message);
          }
          return;
        }
      } catch {
        // ignore
      }

      // Extension -> webview messages
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = data as any;
      if (msg.command === 'appModePendingCount') {
        setPendingCount(typeof msg.count === 'number' ? msg.count : 0);
        return;
      }
      if (msg.command === 'appModeReload') {
        try {
          iframeRef.current?.contentWindow?.location?.reload();
        } catch {
          // ignore
        }
        return;
      }
      if (msg.command === 'appModeStableIdsResult') {
        // No-op here; button disables are handled on the extension side now.
        return;
      }
      if (msg.command === 'appModeHint') {
        // Optional: could surface in UI later.
        return;
      }
      if (msg.command === 'appModeCssTarget') {
        setCssTargetLabel(typeof msg.label === 'string' ? msg.label : '');
        return;
      }
      if (msg.command === 'appModeStyleAdapter') {
        if (msg.preference) setStyleAdapterPref(clampStyleAdapter(msg.preference));
        setStyleAdapterEffective(typeof msg.effective === 'string' ? msg.effective : '');
        setStyleAdapterReason(typeof msg.reason === 'string' ? msg.reason : '');
        return;
      }
      if (msg.command === 'previewStyle') {
        postToIframe({ type: 'live-ui-editor:previewStyle', style: msg.style });
        return;
      }
      if (msg.command === 'clearPreview') {
        postToIframe({ type: 'live-ui-editor:clearPreview' });
        return;
      }
      if (msg.command === 'requestTargets') {
        vscode.postMessage({ command: 'targetsList', requestId: msg.requestId, targets: [] });
        return;
      }
      if (msg.command === 'appModeApplyReport') {
        try {
          const applied = Number(msg.applied || 0);
          const failed = Number(msg.failed || 0);
          const skipped = Number(msg.skipped || 0);
          const items = Array.isArray(msg.items) ? msg.items : [];
          const failedItems = items.filter((i: any) => i && i.ok === false);
          const head = `Apply report: ${applied} applied, ${skipped} skipped, ${failed} not applied.`;
          const lines = failedItems.slice(0, 8).map((i: any) => {
            const where = `${String(i.file || '(file?)')}:${String(i.line || '?')}`;
            const how = i.method ? ` (${String(i.method)})` : '';
            const why = i.error || i.reason || 'failed';
            return `- ${String(i.kind || 'edit')} ${where}${how}: ${String(why)}`;
          });
          const text = lines.length ? `${head}\n${lines.join('\n')}` : head;
          const kind: AppModeApplyReport['kind'] = failed ? 'err' : (skipped ? 'warn' : 'ok');
          setApplyReport({ kind, text });

          if (applyReportTimerRef.current) window.clearTimeout(applyReportTimerRef.current);
          applyReportTimerRef.current = window.setTimeout(() => setApplyReport(undefined), 6500);
        } catch {
          setApplyReport({ kind: 'err', text: 'Apply report: (failed to render details)' });
        }
        return;
      }
    };

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [vscode, opts.iframeOrigin]);

  const onToggleMode = () => {
    const next = mode === 'edit' ? 'browse' : 'edit';
    setMode(next);
    sendMode(next);
  };

  const onApply = (forceUnsafe: boolean) => {
    vscode.postMessage({ command: 'applyPendingEdits', forceUnsafe: forceUnsafe ? true : undefined });
  };

  const onDiscard = () => {
    vscode.postMessage({ command: 'discardPendingEdits' });
  };

  const onEnableStableIds = () => {
    vscode.postMessage({ command: 'enableStableIds' });
  };

  const onFixTargeting = () => {
    vscode.postMessage({ command: 'fixTargeting' });
  };

  const onPickCss = () => {
    vscode.postMessage({ command: 'pickCssTarget' });
  };

  const onStartBackend = () => {
    vscode.postMessage({ command: 'startBackend' });
  };

  const onStyleAdapterChange = (next: AppModeStyleAdapter) => {
    setStyleAdapterPref(next);
    vscode.postMessage({ command: 'setStyleAdapter', adapter: next });
  };

  const onLayoutApplyModeChange = (next: AppModeLayoutApplyMode) => {
    setLayoutApplyMode(next);
    vscode.postMessage({ command: 'setLayoutApplyMode', mode: next });
  };

  const onViewportPresetChange = (next: AppModeViewportPreset) => {
    setViewportPreset(next);
  };

  const onDebugSafeChange = (next: boolean) => {
    setDebugSafe(next);
    sendDebug(next);
  };

  const onTauriShimChange = (next: boolean) => {
    setTauriShimEnabled(next);
    vscode.postMessage({ command: 'setTauriShim', enabled: next });
  };

  const showCss = styleAdapterEffective === 'cssClass' || styleAdapterPref === 'cssClass' || (styleAdapterPref === 'auto' && styleAdapterEffective === '');

  return (
    <div className={sidebarCollapsed ? 'lui-root lui-collapsed' : 'lui-root'}>
      <aside className="lui-sidebar">
        <div className="lui-top">
          <button className="lui-iconBtn" onClick={() => setSidebarCollapsed(v => !v)} title="Toggle sidebar (Ctrl/Cmd+B)">
            {sidebarCollapsed ? '»' : '«'}
          </button>
          {!sidebarCollapsed && (
            <div className="lui-titleWrap">
              <div className="lui-title">Live UI Editor</div>
              <div className="lui-subtitle">{opts.appLabel}</div>
            </div>
          )}
        </div>

        <div className="lui-section">
          <div className="lui-row">
            <button className="lui-primary" onClick={onToggleMode} title="Toggle Edit/Browse">
              {mode === 'edit' ? 'Switch to Browse' : 'Switch to Edit'}
            </button>
          </div>

          <div className="lui-chips">
            <span className={pendingCount ? 'lui-chip' : 'lui-chip lui-muted'}>Pending: {pendingCount}</span>
            <span className={`lui-chip lui-id-${identityKind}`}>Identity: {identityKind === 'stable' ? 'Stable' : identityKind === 'fallback' ? 'Fallback' : identityKind === 'unmapped' ? 'Unmapped' : '…'}</span>
          </div>

          <div className="lui-actions">
            <button className="lui-primary" onClick={() => onApply(false)} disabled={!canApply}>Apply to Code</button>
            {!stable && (
              <button className="lui-warning" onClick={() => onApply(true)} disabled={!canApplyUnsafe} title="Unsafe: applies without Stable IDs (may hit wrong element if mapping is ambiguous).">
                Apply Anyway
              </button>
            )}
            <button className="lui-danger" onClick={onDiscard} disabled={!canDiscard}>Discard</button>
          </div>
        </div>

        <details className="lui-details" open>
          <summary>Targeting</summary>
          <div className="lui-detailsBody">
            <button className="lui-primary" onClick={onEnableStableIds} title="Enable Stable IDs for reliable targeting">Enable Stable IDs</button>
            <button className="lui-secondary" onClick={onFixTargeting} disabled={identityKind === 'stable'} title="Try to auto-fix targeting">Fix targeting</button>
            <div className="lui-hint">Stable IDs help ensure edits apply to the correct element.</div>
          </div>
        </details>

        <details className="lui-details" open>
          <summary>Style</summary>
          <div className="lui-detailsBody">
            <label className="lui-label">
              <span>Style Target</span>
              <select value={styleAdapterPref} onChange={(e) => onStyleAdapterChange(clampStyleAdapter(e.target.value))}>
                <option value="auto">Auto</option>
                <option value="tailwind">Tailwind</option>
                <option value="cssClass">CSS file</option>
                <option value="inline">Inline</option>
              </select>
            </label>
            <div className="lui-hint">{styleAdapterReason ? styleAdapterReason : (styleAdapterEffective ? `Using: ${styleAdapterEffective}` : '')}</div>

            {showCss && (
              <div className="lui-row">
                <button className="lui-secondary" onClick={onPickCss}>Pick CSS</button>
                <div className="lui-small">{cssTargetLabel ? `CSS: ${cssTargetLabel}` : 'CSS: (not set)'}</div>
              </div>
            )}
          </div>
        </details>

        <details className="lui-details" open>
          <summary>Layout & View</summary>
          <div className="lui-detailsBody">
            <label className="lui-label">
              <span>Layout mode</span>
              <select value={layoutApplyMode} onChange={(e) => onLayoutApplyModeChange(clampLayoutMode(e.target.value))}>
                <option value="off">Off</option>
                <option value="safe">Safe</option>
                <option value="full">Full</option>
              </select>
            </label>

            <label className="lui-label">
              <span>Viewport</span>
              <select value={viewportPreset} onChange={(e) => onViewportPresetChange(clampViewportPreset(e.target.value))}>
                <option value="responsive">Responsive</option>
                <option value="iphone14">iPhone 14 (390×844)</option>
                <option value="iphone14land">iPhone 14 (Landscape 844×390)</option>
                <option value="iphonese">iPhone SE (320×568)</option>
                <option value="iphoneseland">iPhone SE (Landscape 568×320)</option>
                <option value="ipad">iPad (768×1024)</option>
              </select>
            </label>

            <label className="lui-check">
              <input type="checkbox" checked={debugSafe} onChange={(e) => onDebugSafeChange(e.target.checked)} />
              Safe-area / warnings
            </label>
          </div>
        </details>

        <details className="lui-details">
          <summary>Project helpers</summary>
          <div className="lui-detailsBody">
            <button className="lui-secondary" onClick={onStartBackend} title="Start an additional backend/API server (if your app needs one for navigation/data).">
              Start Backend
            </button>
            <div className="lui-hint">Use this if your app needs a separate API/auth server for navigation or data.</div>
          </div>
        </details>

        <details className="lui-details">
          <summary>Advanced</summary>
          <div className="lui-detailsBody">
            <label className="lui-check">
              <input type="checkbox" checked={tauriShimEnabled} onChange={(e) => onTauriShimChange(e.target.checked)} />
              Tauri Shim
            </label>
            <div className="lui-hint">Compatibility stub for Tauri-targeted apps; native APIs won’t fully work.</div>
          </div>
        </details>

        {!sidebarCollapsed && (
          <div className="lui-footer">
            <div className="lui-help">Edit: click selects • Ctrl/Cmd+Click jumps • Shift+Click multi-select • Alt+Click leaf</div>
          </div>
        )}
      </aside>

      <main className="lui-main">
        <div className="lui-frameWrap">
          <iframe ref={iframeRef} className="lui-iframe" src={opts.iframeUrl} title={opts.appLabel} allow="clipboard-read; clipboard-write" />
        </div>

        {applyReport && (
          <div className={`lui-toast lui-toast-${applyReport.kind}`}>
            <pre>{applyReport.text}</pre>
          </div>
        )}
      </main>

      <style>{`
        :root { color-scheme: light dark; }
        html, body { height: 100%; }
        body { margin: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; overflow: hidden; }

        .lui-root { height: 100vh; width: 100vw; display: grid; grid-template-columns: 320px 1fr; background: transparent; }
        .lui-root.lui-collapsed { grid-template-columns: 52px 1fr; }

        .lui-sidebar { border-right: 1px solid rgba(127,127,127,0.25); background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, #ddd); display: flex; flex-direction: column; gap: 12px; padding: 10px; overflow: auto; }
        .lui-top { display: flex; gap: 10px; align-items: center; }
        .lui-title { font-weight: 700; }
        .lui-subtitle { font-size: 12px; opacity: 0.8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 240px; }

        .lui-iconBtn { width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(127,127,127,0.35); background: transparent; color: inherit; cursor: pointer; }

        .lui-section { border: 1px solid rgba(127,127,127,0.18); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 10px; }
        .lui-row { display: flex; gap: 10px; align-items: center; justify-content: space-between; }
        .lui-actions { display: grid; grid-template-columns: 1fr; gap: 8px; }

        button { font: inherit; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(127,127,127,0.35); background: transparent; color: inherit; cursor: pointer; }
        button:hover { filter: brightness(1.06); }
        button:disabled { opacity: 0.55; cursor: default; }

        .lui-primary { border-color: rgba(80, 140, 255, 0.75); }
        .lui-secondary { border-color: rgba(127,127,127,0.35); opacity: 0.95; }
        .lui-warning { border-color: rgba(255, 180, 60, 0.75); }
        .lui-danger { border-color: rgba(255, 120, 120, 0.75); }

        .lui-chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .lui-chip { font-size: 12px; padding: 3px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,0.35); opacity: 0.95; }
        .lui-muted { opacity: 0.6; }
        .lui-id-stable { border-color: rgba(80, 180, 120, 0.75); }
        .lui-id-fallback { border-color: rgba(255, 180, 60, 0.75); }
        .lui-id-unmapped { border-color: rgba(255, 120, 120, 0.85); }

        .lui-details { border: 1px solid rgba(127,127,127,0.18); border-radius: 12px; padding: 8px 10px; }
        .lui-details > summary { cursor: pointer; font-weight: 600; }
        .lui-detailsBody { display: flex; flex-direction: column; gap: 10px; padding-top: 10px; }

        .lui-label { display: grid; gap: 6px; font-size: 12px; }
        select { font: inherit; padding: 6px 8px; border-radius: 10px; border: 1px solid rgba(127,127,127,0.35); background: transparent; color: inherit; }

        .lui-check { display: flex; gap: 8px; align-items: center; font-size: 12px; }
        .lui-hint { font-size: 12px; opacity: 0.8; line-height: 1.25; }
        .lui-small { font-size: 12px; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

        .lui-footer { margin-top: auto; padding-top: 10px; border-top: 1px solid rgba(127,127,127,0.18); }
        .lui-help { font-size: 12px; opacity: 0.75; }

        .lui-main { position: relative; background: transparent; }
        .lui-frameWrap { position: absolute; inset: 0; display: grid; place-items: stretch; }
        .lui-iframe { width: 100%; height: 100%; border: 0; background: transparent; }
        .lui-iframe.lui-preset { border: 1px solid rgba(127,127,127,0.25); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); margin: 12px; background: white; }

        .lui-toast { position: absolute; left: 12px; bottom: 12px; right: 12px; max-width: 920px; border-radius: 12px; border: 1px solid rgba(127,127,127,0.25); background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, #ddd); padding: 10px 12px; opacity: 0.98; pointer-events: none; }
        .lui-toast pre { margin: 0; white-space: pre-wrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
        .lui-toast-ok { color: rgba(80, 180, 120, 0.95); }
        .lui-toast-warn { color: rgba(255, 180, 60, 0.95); }
        .lui-toast-err { color: rgba(255, 120, 120, 0.95); }
      `}</style>
    </div>
  );
}
