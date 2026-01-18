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
		body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; height: 100vh; display: flex; flex-direction: column; }
		#bar { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border-bottom: 1px solid rgba(127,127,127,0.3); }
		#title { font-weight: 600; }
		#mode { font-size: 12px; opacity: 0.85; }
		button { font: inherit; padding: 6px 10px; border-radius: 6px; border: 1px solid rgba(127,127,127,0.35); background: transparent; cursor: pointer; }
		button:hover { background: rgba(127,127,127,0.10); }
		button:disabled { opacity: 0.55; cursor: default; }
		#pendingBadge { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,0.35); opacity: 0.9; }
		#pendingBadge[data-zero="true"] { opacity: 0.55; }
		#apply { border-color: rgba(80, 140, 255, 0.75); }
		#discard { border-color: rgba(255, 120, 120, 0.65); }
		#identityBadge { font-size: 12px; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,0.35); opacity: 0.9; }
		#identityBadge[data-kind="unknown"] { opacity: 0.55; }
		#identityBadge[data-kind="stable"] { border-color: rgba(80, 180, 120, 0.75); }
		#identityBadge[data-kind="fallback"] { border-color: rgba(255, 180, 60, 0.75); }
		#enableStableIds { border-color: rgba(80, 180, 120, 0.75); }
		#layoutWrap { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; opacity: 0.9; }
		#layoutWrap input { transform: translateY(1px); }
		#help { font-size: 12px; opacity: 0.8; }
		#applyReport { font-size: 12px; opacity: 0.9; padding: 6px 10px; border-top: 1px solid rgba(127,127,127,0.25); display: none; white-space: pre-wrap; }
		#applyReport[data-kind="ok"] { color: rgba(80, 180, 120, 0.95); }
		#applyReport[data-kind="warn"] { color: rgba(255, 180, 60, 0.95); }
		#applyReport[data-kind="err"] { color: rgba(255, 120, 120, 0.95); }
		#frameWrap { flex: 1; min-height: 0; }
		iframe { width: 100%; height: 100%; border: 0; }
	</style>
</head>
<body>
	<div id="bar">
		<div id="title">Live UI Editor — App Mode</div>
		<div id="mode"></div>
		<button id="toggle"></button>
		<span id="pendingBadge" data-zero="true">Pending: 0</span>
		<button id="apply" disabled>Apply to Code</button>
		<button id="discard" disabled>Discard</button>
		<span id="identityBadge" data-kind="unknown" title="Stable IDs make edits apply to the correct element.">Identity: …</span>
		<button id="enableStableIds" title="Automatically enables Stable IDs in your Vite app so the editor can always target the correct element.">Enable Stable IDs</button>
		<label id="layoutWrap" title="When enabled, drag/resize will be written to code as width/height/transform. Leave off for safer styling-only edits.">
			<input id="layoutApply" type="checkbox" />
			Layout Apply
		</label>
		<div style="flex:1"></div>
		<div id="help"></div>
	</div>
	<div id="applyReport" data-kind="ok"></div>
	<div id="frameWrap">
		<iframe id="app" src="${opts.iframeUrl}" title="${opts.appLabel}"></iframe>
	</div>

	<script nonce="${nonce}">
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
		const discardBtn = document.getElementById('discard');
		const identityBadge = document.getElementById('identityBadge');
		const enableStableIdsBtn = document.getElementById('enableStableIds');
		const layoutApply = document.getElementById('layoutApply');
		const applyReport = document.getElementById('applyReport');

		let mode = 'browse'; // 'browse' | 'edit'
		let pendingCount = 0;
		let layoutApplyEnabled = false;
		let identityKind = 'unknown'; // 'unknown' | 'stable' | 'fallback'
		let enablingStableIds = false;

		if (typeof acquireVsCodeApi !== 'function') {
			helpEl.textContent = 'App Mode UI failed to initialize (webview API blocked). Reload the window; if it persists, the webview CSP may be too strict.';
		}

		try {
			const state = vscode.getState() || {};
			if (typeof state.layoutApplyEnabled === 'boolean') layoutApplyEnabled = state.layoutApplyEnabled;
		} catch {}
		layoutApply.checked = layoutApplyEnabled;
		vscode.setState({ ...(vscode.getState() || {}), layoutApplyEnabled });

		function render() {
			modeEl.textContent = mode === 'edit' ? 'Mode: Edit' : 'Mode: Browse';
			toggleBtn.textContent = mode === 'edit' ? 'Switch to Browse' : 'Switch to Edit';
			pendingBadge.textContent = 'Pending: ' + String(pendingCount || 0);
			pendingBadge.dataset.zero = pendingCount ? 'false' : 'true';
			applyBtn.disabled = pendingCount <= 0;
			discardBtn.disabled = pendingCount <= 0;
			layoutApply.checked = !!layoutApplyEnabled;
			identityBadge.dataset.kind = identityKind;
			identityBadge.textContent = identityKind === 'stable'
				? 'Identity: Stable'
				: identityKind === 'fallback'
					? 'Identity: Fallback'
					: 'Identity: …';
			enableStableIdsBtn.disabled = enablingStableIds;
			helpEl.textContent = mode === 'edit'
				? 'Edit: hover highlights, click selects, Ctrl/Cmd+Click jumps to code. Shift+Click toggles multi-select. Shift+Drag draws a selection box. Alt+Click selects exact leaf.'
				: 'Browse: normal app interaction, Alt+Click jumps to code';
		}

		function sendMode() {
			try {
				iframe.contentWindow?.postMessage({ type: 'live-ui-editor:setMode', mode }, '*');
			} catch {}
		}

		toggleBtn.addEventListener('click', () => {
			mode = mode === 'edit' ? 'browse' : 'edit';
			render();
			sendMode();
		});

		applyBtn.addEventListener('click', () => {
			vscode.postMessage({ command: 'applyPendingEdits' });
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

		layoutApply.addEventListener('change', () => {
			layoutApplyEnabled = !!layoutApply.checked;
			try { vscode.setState({ ...(vscode.getState() || {}), layoutApplyEnabled }); } catch {}
			vscode.postMessage({ command: 'setLayoutApply', enabled: layoutApplyEnabled });
			render();
		});

		window.addEventListener('message', (ev) => {
			const data = ev.data;
			if (!data || typeof data !== 'object') return;
			if (data.__liveUiEditor === true && data.message) {
				try {
					if (data.message && data.message.command === 'elementSelected') {
						identityKind = data.message.elementId ? 'stable' : 'fallback';
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
			if (msg.command === 'previewStyle') {
				iframe.contentWindow?.postMessage({ type: 'live-ui-editor:previewStyle', style: msg.style }, '*');
				return;
			}
			if (msg.command === 'clearPreview') {
				iframe.contentWindow?.postMessage({ type: 'live-ui-editor:clearPreview' }, '*');
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
