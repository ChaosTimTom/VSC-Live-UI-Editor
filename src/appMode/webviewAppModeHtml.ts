import * as vscode from 'vscode';

function getNonce(): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) nonce += possible.charAt(Math.floor(Math.random() * possible.length));
	return nonce;
}

export function getAppModeWebviewHtml(webview: vscode.Webview, opts: {
	iframeUrl: string;
	appLabel: string;
	tauriShimEnabled?: boolean;
}): string {
	const nonce = getNonce();
	const iframeOrigin = new URL(opts.iframeUrl).origin;

	const csp = [
		`default-src 'none'`,
		`img-src ${webview.cspSource} https: data:`,
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		// Keep this permissive enough that VS Code's injected webview API bootstrap can't be blocked.
		// (If acquireVsCodeApi is missing, the entire UI becomes inert.)
		`script-src ${webview.cspSource} 'nonce-${nonce}' 'unsafe-inline'`,
		`frame-src ${iframeOrigin} http://127.0.0.1:* http://localhost:*`,
	].join('; ');

	return `<!doctype html>
<html>
<head>
	<meta charset="utf-8" />
	<meta http-equiv="Content-Security-Policy" content="${csp}">
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Live UI Editor — App Mode</title>
	<style>
		:root { color-scheme: light dark; }
		html, body { height: 100%; }
		body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; overflow: hidden; background: transparent; }

		/* App fills the viewport; UI floats over it. */
		#frameWrap { position: fixed; inset: 0; background: transparent; }
		#frameInner { width: 100%; height: 100%; }
		iframe { width: 100%; height: 100%; border: 0; background: transparent; }
		iframe.preset { border: 1px solid rgba(127,127,127,0.25); border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); margin: 12px; background: white; }

		/* Floating HUD: transparent container, opaque controls. */
		#hud { position: fixed; top: 8px; left: 8px; right: 8px; z-index: 2147483646; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; pointer-events: none; }
		#hud button, #hud select, #hud input, #hud label { pointer-events: auto; }
		#hudText { display: inline-flex; align-items: center; gap: 10px; pointer-events: none; }
		#title { font-weight: 600; }
		#mode { font-size: 12px; opacity: 0.85; }
		button { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid rgba(127,127,127,0.35); background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, inherit); cursor: pointer; }
		button:hover { filter: brightness(1.07); }
		button:disabled { opacity: 0.55; cursor: default; }
		#pendingBadge { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,0.35); opacity: 0.9; }
		#pendingBadge[data-zero="true"] { opacity: 0.55; }
		#apply { border-color: rgba(80, 140, 255, 0.75); }
		#applyUnsafe { border-color: rgba(255, 180, 60, 0.75); }
		#discard { border-color: rgba(255, 120, 120, 0.65); }
		#identityBadge { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,0.35); opacity: 0.9; }
		#identityBadge[data-kind="unknown"] { opacity: 0.55; }
		#identityBadge[data-kind="stable"] { border-color: rgba(80, 180, 120, 0.75); }
		#identityBadge[data-kind="fallback"] { border-color: rgba(255, 180, 60, 0.75); }
		#identityBadge[data-kind="unmapped"] { border-color: rgba(255, 120, 120, 0.85); }
		#enableStableIds { border-color: rgba(80, 180, 120, 0.75); }
		#styleAdapter { font: inherit; padding: 5px 8px; border-radius: 8px; border: 1px solid rgba(127,127,127,0.35); background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, inherit); }
		#styleAdapterHint { font-size: 12px; opacity: 0.85; max-width: 420px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		#pickCssTarget { border-color: rgba(80, 140, 255, 0.35); }
		#cssTarget { font-size: 12px; opacity: 0.8; }
		#viewportPreset { font: inherit; padding: 5px 8px; border-radius: 8px; border: 1px solid rgba(127,127,127,0.35); background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, inherit); }
		#debugWrap { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.9; }
		#debugWrap input { transform: translateY(1px); }
		#tauriShimWrap { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.9; }
		#tauriShimWrap input { transform: translateY(1px); }
		#layoutWrap { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.9; }
		#layoutWrap input { transform: translateY(1px); }
		#help { position: fixed; left: 10px; bottom: 10px; z-index: 2147483646; font-size: 12px; opacity: 0.78; max-width: min(760px, calc(100vw - 20px)); pointer-events: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
		#applyReport { position: fixed; left: 10px; right: 10px; top: 54px; z-index: 2147483646; font-size: 12px; opacity: 0.95; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(127,127,127,0.25); background: var(--vscode-editor-background, #1e1e1e); color: var(--vscode-editor-foreground, inherit); display: none; white-space: pre-wrap; pointer-events: none; }
		#applyReport[data-kind="ok"] { color: rgba(80, 180, 120, 0.95); }
		#applyReport[data-kind="warn"] { color: rgba(255, 180, 60, 0.95); }
		#applyReport[data-kind="err"] { color: rgba(255, 120, 120, 0.95); }
	</style>
</head>
<body>
	<div id="frameWrap">
		<div id="frameInner">
			<iframe id="app" src="${opts.iframeUrl}" title="${opts.appLabel}" allow="clipboard-read; clipboard-write"></iframe>
		</div>
	</div>

	<div id="hud">
		<div id="hudText">
			<div id="title">Live UI Editor</div>
			<div id="mode"></div>
		</div>
		<button id="toggle"></button>
		<span id="pendingBadge" data-zero="true">Pending: 0</span>
		<button id="apply" disabled>Apply to Code</button>
		<button id="applyUnsafe" disabled title="Unsafe: applies without Stable IDs (may hit wrong element if mapping is ambiguous).">Apply Anyway</button>
		<button id="discard" disabled>Discard</button>
		<button id="identityBadge" data-kind="unknown" title="Stable IDs make edits apply to the correct element.">Identity: …</button>
		<select id="styleAdapter" title="How style edits are applied.">
			<option value="auto">Style Target: Auto</option>
			<option value="tailwind">Style Target: Tailwind</option>
			<option value="cssClass">Style Target: CSS file</option>
			<option value="inline">Style Target: Inline</option>
		</select>
		<span id="styleAdapterHint" title="Why this style target is selected."></span>
		<select id="viewportPreset" title="Preview the app at common device sizes.">
			<option value="responsive">Viewport: Responsive</option>
			<option value="iphone14">Viewport: iPhone 14 (390×844)</option>
			<option value="iphone14land">Viewport: iPhone 14 (Landscape 844×390)</option>
			<option value="iphonese">Viewport: iPhone SE (320×568)</option>
			<option value="iphoneseland">Viewport: iPhone SE (Landscape 568×320)</option>
			<option value="ipad">Viewport: iPad (768×1024)</option>
		</select>
		<label id="debugWrap" title="Visual debug overlays inside the app.">
			<input id="debugSafe" type="checkbox" />
			Safe-area / warnings
		</label>
		<button id="pickCssTarget" title="Choose which CSS file to write class-based styles into.">Pick CSS</button>
		<span id="cssTarget" title="Current CSS target file"></span>
		<button id="enableStableIds" title="Automatically enables Stable IDs for Vite or Next.js so the editor can always target the correct element.">Enable Stable IDs</button>
			<label id="tauriShimWrap" title="Runs a small in-browser Tauri shim so Tauri-targeted apps can load inside App Mode. This is a stub for navigation only; native features won’t fully work.">
				<input id="tauriShim" type="checkbox" />
				Tauri Shim
			</label>
		<label id="layoutWrap" title="When enabled, drag/resize will be written to code as width/height/transform. Leave off for safer styling-only edits.">
			<input id="layoutApply" type="checkbox" />
			Layout Apply
		</label>
		<div style="flex:1"></div>
	</div>
	<div id="applyReport" data-kind="ok"></div>
	<div id="help"></div>

	<script nonce="${nonce}">
		const iframeOrigin = ${JSON.stringify(iframeOrigin)};
		const vscode = (typeof acquireVsCodeApi === 'function')
			? acquireVsCodeApi()
			: {
				postMessage: () => {},
				getState: () => ({}),
				setState: () => {},
			};
		const iframe = document.getElementById('app');
		const modeEl = document.getElementById('mode');
		const toggleBtn = document.getElementById('toggle');
		const helpEl = document.getElementById('help');
		const pendingBadge = document.getElementById('pendingBadge');
		const applyBtn = document.getElementById('apply');
		const applyUnsafeBtn = document.getElementById('applyUnsafe');
		const discardBtn = document.getElementById('discard');
		const identityBadge = document.getElementById('identityBadge');
		const enableStableIdsBtn = document.getElementById('enableStableIds');
			const styleAdapterEl = document.getElementById('styleAdapter');
			const styleAdapterHintEl = document.getElementById('styleAdapterHint');
		const viewportPresetEl = document.getElementById('viewportPreset');
		const debugSafeEl = document.getElementById('debugSafe');
		const pickCssTargetBtn = document.getElementById('pickCssTarget');
		const cssTargetEl = document.getElementById('cssTarget');
		const tauriShim = document.getElementById('tauriShim');
		const layoutApply = document.getElementById('layoutApply');
		const applyReport = document.getElementById('applyReport');

		let mode = 'edit'; // 'browse' | 'edit'
		let pendingCount = 0;
		let layoutApplyEnabled = false;
		let identityKind = 'unknown'; // 'unknown' | 'stable' | 'fallback' | 'unmapped'
		let enablingStableIds = false;
		let tauriShimEnabled = ${opts.tauriShimEnabled ? 'true' : 'false'};
			let styleAdapterPref = 'auto'; // 'auto' | 'tailwind' | 'cssClass' | 'inline'
			let styleAdapterEffective = '';
			let styleAdapterReason = '';
		let cssTargetLabel = '';
		let viewportPreset = 'responsive';
		let debugSafe = false;

		if (typeof acquireVsCodeApi !== 'function') {
			helpEl.textContent = 'App Mode UI failed to initialize (webview API blocked). Reload the window; if it persists, the webview CSP may be too strict.';
		}

		try {
			const state = vscode.getState() || {};
			if (state && (state.mode === 'browse' || state.mode === 'edit')) mode = state.mode;
			if (typeof state.tauriShimEnabled === 'boolean') tauriShimEnabled = state.tauriShimEnabled;
			if (typeof state.layoutApplyEnabled === 'boolean') layoutApplyEnabled = state.layoutApplyEnabled;
				if (state && (state.styleAdapterPref === 'auto' || state.styleAdapterPref === 'tailwind' || state.styleAdapterPref === 'cssClass' || state.styleAdapterPref === 'inline')) styleAdapterPref = state.styleAdapterPref;
			if (state && typeof state.viewportPreset === 'string') viewportPreset = state.viewportPreset;
			if (typeof state.debugSafe === 'boolean') debugSafe = state.debugSafe;
		} catch {}
		tauriShim.checked = tauriShimEnabled;
		layoutApply.checked = layoutApplyEnabled;
			styleAdapterEl.value = styleAdapterPref;
		viewportPresetEl.value = viewportPreset;
		debugSafeEl.checked = debugSafe;
			vscode.setState({ ...(vscode.getState() || {}), mode, tauriShimEnabled, layoutApplyEnabled, styleAdapterPref, viewportPreset, debugSafe });

		function applyViewportPreset() {
			const presets = {
				responsive: null,
				iphone14: { w: 390, h: 844 },
				iphone14land: { w: 844, h: 390 },
				iphonese: { w: 320, h: 568 },
				iphoneseland: { w: 568, h: 320 },
				ipad: { w: 768, h: 1024 },
			};
			const p = presets[viewportPreset] || null;
			if (!p) {
				iframe.classList.remove('preset');
				iframe.style.width = '100%';
				iframe.style.height = '100%';
				return;
			}
			iframe.classList.add('preset');
			iframe.style.width = p.w + 'px';
			iframe.style.height = p.h + 'px';
		}

		function sendDebug() {
			try {
				iframe.contentWindow?.postMessage({ type: 'live-ui-editor:setDebug', safe: !!debugSafe }, iframeOrigin);
			} catch {}
		}

		function render() {
			modeEl.textContent = mode === 'edit' ? 'Mode: Edit' : 'Mode: Browse';
			toggleBtn.textContent = mode === 'edit' ? 'Switch to Browse' : 'Switch to Edit';
			pendingBadge.textContent = 'Pending: ' + String(pendingCount || 0);
			pendingBadge.dataset.zero = pendingCount ? 'false' : 'true';
			const stable = identityKind === 'stable';
			applyBtn.disabled = pendingCount <= 0 || !stable;
			applyUnsafeBtn.disabled = pendingCount <= 0;
			applyUnsafeBtn.style.display = stable ? 'none' : 'inline-block';
			discardBtn.disabled = pendingCount <= 0;
			layoutApply.checked = !!layoutApplyEnabled;
			tauriShim.checked = !!tauriShimEnabled;
				styleAdapterEl.value = styleAdapterPref;
			viewportPresetEl.value = viewportPreset;
			debugSafeEl.checked = !!debugSafe;
			applyViewportPreset();
				const eff = styleAdapterEffective || '';
				const showCss = eff === 'cssClass' || styleAdapterPref === 'cssClass' || (styleAdapterPref === 'auto' && eff === '');
				pickCssTargetBtn.style.display = showCss ? 'inline-block' : 'none';
				cssTargetEl.style.display = showCss ? 'inline-block' : 'none';
				cssTargetEl.textContent = cssTargetLabel
					? ('CSS: ' + cssTargetLabel)
					: (showCss ? 'CSS: (not set)' : '');
				styleAdapterHintEl.textContent = styleAdapterReason
					? styleAdapterReason
					: (eff ? ('Using: ' + eff) : '');
			identityBadge.dataset.kind = identityKind;
			identityBadge.textContent = identityKind === 'stable'
				? 'Identity: Stable'
				: identityKind === 'fallback'
					? 'Fix targeting (Fallback)'
					: identityKind === 'unmapped'
						? 'Fix targeting (Unmapped)'
				: 'Fix targeting';
			identityBadge.disabled = identityKind === 'stable' || enablingStableIds;
			enableStableIdsBtn.disabled = enablingStableIds;
			helpEl.textContent = mode === 'edit'
				? 'Edit: hover highlights, click selects, Ctrl/Cmd+Click jumps to code. Shift+Click toggles multi-select. Shift+Drag draws a selection box. Alt+Click selects exact leaf. Tip: select an element, then use UI Wizard.'
				: 'Browse: normal app interaction, Alt+Click jumps to code';
		}

		function sendMode() {
			try {
				iframe.contentWindow?.postMessage({ type: 'live-ui-editor:setMode', mode }, iframeOrigin);
			} catch {}
		}

		viewportPresetEl.addEventListener('change', () => {
			viewportPreset = String(viewportPresetEl.value || 'responsive');
			try { vscode.setState({ ...(vscode.getState() || {}), viewportPreset }); } catch {}
			render();
		});

		debugSafeEl.addEventListener('change', () => {
			debugSafe = !!debugSafeEl.checked;
			try { vscode.setState({ ...(vscode.getState() || {}), debugSafe }); } catch {}
			sendDebug();
			render();
		});

		toggleBtn.addEventListener('click', () => {
			mode = mode === 'edit' ? 'browse' : 'edit';
			try { vscode.setState({ ...(vscode.getState() || {}), mode }); } catch {}
			render();
			sendMode();
		});

		iframe.addEventListener('load', () => {
			// Ensure the injected client picks up our current mode after navigation/reload.
			sendMode();
			sendDebug();
		});

		render();
		sendMode();

		applyBtn.addEventListener('click', () => {
			vscode.postMessage({ command: 'applyPendingEdits' });
		});

		applyUnsafeBtn.addEventListener('click', () => {
			vscode.postMessage({ command: 'applyPendingEdits', forceUnsafe: true });
		});

		discardBtn.addEventListener('click', () => {
			vscode.postMessage({ command: 'discardPendingEdits' });
		});

		enableStableIdsBtn.addEventListener('click', () => {
			enablingStableIds = true;
			enableStableIdsBtn.textContent = 'Enabling…';
			render();
			vscode.postMessage({ command: 'enableStableIds' });
		});

		identityBadge.addEventListener('click', () => {
			if (identityKind === 'stable') return;
			if (enablingStableIds) return;
			enablingStableIds = true;
			enableStableIdsBtn.textContent = 'Enabling…';
			render();
			vscode.postMessage({ command: 'fixTargeting' });
		});

		pickCssTargetBtn.addEventListener('click', () => {
			vscode.postMessage({ command: 'pickCssTarget' });
		});

		layoutApply.addEventListener('change', () => {
			layoutApplyEnabled = !!layoutApply.checked;
			try { vscode.setState({ ...(vscode.getState() || {}), layoutApplyEnabled }); } catch {}
			vscode.postMessage({ command: 'setLayoutApply', enabled: layoutApplyEnabled });
			render();
		});

		tauriShim.addEventListener('change', () => {
			tauriShimEnabled = !!tauriShim.checked;
			try { vscode.setState({ ...(vscode.getState() || {}), tauriShimEnabled }); } catch {}
			vscode.postMessage({ command: 'setTauriShim', enabled: tauriShimEnabled });
			render();
		});

		window.addEventListener('message', (ev) => {
			// SECURITY: Only accept messages coming from our iframe.
			// Without this, any other frame/content could message the webview and attempt to trigger edits.
			try {
				if (!iframe || ev.source !== iframe.contentWindow) return;
				if (typeof ev.origin === 'string' && ev.origin !== iframeOrigin) return;
			} catch {
				return;
			}

			styleAdapterEl.addEventListener('change', () => {
				styleAdapterPref = String(styleAdapterEl.value || 'auto');
				try { vscode.setState({ ...(vscode.getState() || {}), styleAdapterPref }); } catch {}
				try { vscode.postMessage({ command: 'setStyleAdapter', adapter: styleAdapterPref }); } catch {}
				render();
			});
			const data = ev.data;
			if (!data || typeof data !== 'object') return;
			if (data.__liveUiEditor === true && data.message) {
				try {
					if (data.message && data.message.command === 'elementSelected') {
						identityKind = data.message.elementId ? 'stable' : 'fallback';
						render();
					}
					if (data.message && data.message.command === 'elementUnmapped') {
						identityKind = 'unmapped';
						render();
					}
				} catch {}
				vscode.postMessage(data.message);
			}
		});

		// Receive messages from the extension.
		window.addEventListener('message', (event) => {
			const msg = event.data;
			if (!msg || typeof msg !== 'object') return;
			if (msg.command === 'appModePendingCount') {
				pendingCount = typeof msg.count === 'number' ? msg.count : 0;
				render();
				return;
			}
			if (msg.command === 'appModeReload') {
				try {
					iframe.contentWindow?.location?.reload();
				} catch {}
				return;
			}
			if (msg.command === 'appModeStableIdsResult') {
				enablingStableIds = false;
				enableStableIdsBtn.textContent = 'Enable Stable IDs';
				render();
				return;
			}
			if (msg.command === 'appModeHint') {
				try {
					helpEl.textContent = typeof msg.text === 'string' ? msg.text : helpEl.textContent;
				} catch {}
				return;
			}
			if (msg.command === 'appModeCssTarget') {
				try {
					cssTargetLabel = typeof msg.label === 'string' ? msg.label : cssTargetLabel;
					render();
				} catch {}
				return;
			}
				if (msg.command === 'appModeStyleAdapter') {
					try {
						if (msg.preference === 'auto' || msg.preference === 'tailwind' || msg.preference === 'cssClass' || msg.preference === 'inline') {
							styleAdapterPref = msg.preference;
							styleAdapterEl.value = styleAdapterPref;
							try { vscode.setState({ ...(vscode.getState() || {}), styleAdapterPref }); } catch {}
						}
						styleAdapterEffective = typeof msg.effective === 'string' ? msg.effective : styleAdapterEffective;
						styleAdapterReason = typeof msg.reason === 'string' ? msg.reason : styleAdapterReason;
						render();
					} catch {}
					return;
				}
			if (msg.command === 'previewStyle') {
				iframe.contentWindow?.postMessage({ type: 'live-ui-editor:previewStyle', style: msg.style }, iframeOrigin);
				return;
			}
			if (msg.command === 'clearPreview') {
				iframe.contentWindow?.postMessage({ type: 'live-ui-editor:clearPreview' }, iframeOrigin);
				return;
			}
			if (msg.command === 'requestTargets') {
				// App Mode doesn't have deterministic source-to-DOM mapping for bulk targeting yet.
				vscode.postMessage({ command: 'targetsList', requestId: msg.requestId, targets: [] });
				return;
			}
			if (msg.command === 'appModeApplyReport') {
				try {
					const applied = Number(msg.applied || 0);
					const failed = Number(msg.failed || 0);
					const skipped = Number(msg.skipped || 0);
					const items = Array.isArray(msg.items) ? msg.items : [];
					const failedItems = items.filter(i => i && i.ok === false);
					const head = 'Apply report: ' + applied + ' applied, ' + skipped + ' skipped, ' + failed + ' not applied.';
					const lines = failedItems.slice(0, 8).map(i => {
						const where = String(i.file || '(file?)') + ':' + String(i.line || '?');
						const how = i.method ? (' (' + String(i.method) + ')') : '';
						const why = i.error || i.reason || 'failed';
						return '- ' + String(i.kind || 'edit') + ' ' + where + how + ': ' + String(why);
					});
					applyReport.textContent = lines.length ? (head + '\\n' + lines.join('\\n')) : head;
					applyReport.style.display = 'block';
					applyReport.dataset.kind = failed ? 'err' : (skipped ? 'warn' : 'ok');
				} catch {
					applyReport.textContent = 'Apply report: (failed to render details)';
					applyReport.style.display = 'block';
					applyReport.dataset.kind = 'err';
				}
				return;
			}
		});

		render();
		sendMode();
	</script>
</body>
</html>`;
}
