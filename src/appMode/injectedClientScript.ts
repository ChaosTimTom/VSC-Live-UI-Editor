// Injected into the proxied app HTML. Runs inside the app origin (dev server) and can inspect React fibers.
// Exported as a string so the extension can embed it into proxied HTML responses.

export const injectedClientScript = String.raw`
(function () {
	// Prevent duplicate installs (common with Vite reload/HMR) which can create many
	// overlay boxes and multiple competing event listeners.
	var __g = window;
	try {
		if (__g.__liveUiEditorInjected && typeof __g.__liveUiEditorInjected.dispose === 'function') {
			__g.__liveUiEditorInjected.dispose();
		}
	} catch {}
	var __api = { version: 2, dispose: function () {} };
	try { __g.__liveUiEditorInjected = __api; } catch {}

	function base64UrlDecodeToString(s) {
		try {
			var b64 = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
			// Pad to multiple of 4
			while (b64.length % 4) b64 += '=';
			return decodeURIComponent(escape(atob(b64)));
		} catch {
			return undefined;
		}
	}

	function getElementId(el) {
		try {
			if (!el || !el.getAttribute) return undefined;
			var v = el.getAttribute('data-lui');
			return v ? String(v) : undefined;
		} catch {
			return undefined;
		}
	}

	function tryParseLuiElementId(elementId) {
		// Format: "lui:" + base64url(JSON.stringify({ f, l, c, n }))
		try {
			var s = String(elementId || '');
			if (!s || s.indexOf('lui:') !== 0) return undefined;
			var payload = s.slice(4);
			var json = base64UrlDecodeToString(payload);
			if (!json) return undefined;
			var obj = JSON.parse(json);
			if (!obj || typeof obj !== 'object') return undefined;
			var f = obj.f;
			var l = obj.l;
			var c = obj.c;
			if (typeof f !== 'string' || typeof l !== 'number') return undefined;
			return {
				fileName: f,
				lineNumber: l,
				columnNumber: typeof c === 'number' ? c : undefined,
			};
		} catch {
			return undefined;
		}
	}

	function findFiberFromDom(el) {
		if (!el) return undefined;
		try {
			var keys = Object.keys(el);
			for (var i = 0; i < keys.length; i++) {
				var key = keys[i];
				if (key.indexOf('__reactFiber$') === 0) return el[key];
				if (key.indexOf('__reactInternalInstance$') === 0) return el[key];
			}
		} catch {}
		return undefined;
	}

	function getDebugSourceFromFiber(fiber) {
		var cur = fiber;
		while (cur) {
			var ds = cur._debugSource;
			if (ds && typeof ds.fileName === 'string' && typeof ds.lineNumber === 'number') {
				return {
					fileName: ds.fileName,
					lineNumber: ds.lineNumber,
					columnNumber: typeof ds.columnNumber === 'number' ? ds.columnNumber : undefined,
				};
			}
			cur = cur.return;
		}
		return undefined;
	}

	function safeComputedStyle(el) {
		var cs = window.getComputedStyle(el);
		var keys = [
			'position','display','flexDirection','justifyContent','alignItems','gap',
			'width','height','minWidth','minHeight','maxWidth','maxHeight',
			'margin','padding',
			'fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','textAlign',
			'color','backgroundColor',
			'border','borderRadius','boxShadow',
			'opacity','transform',
		];
		var out = {};
		for (var i = 0; i < keys.length; i++) {
			var k = keys[i];
			out[k] = cs.getPropertyValue(k);
		}
		return out;
	}

	function elementContext(el) {
		var tagName = String(el.tagName || '').toLowerCase();
		var id = el.id || undefined;
		var classList = el.classList ? Array.prototype.slice.call(el.classList, 0, 8) : undefined;
		var role = el.getAttribute ? (el.getAttribute('role') || undefined) : undefined;
		var href = el.getAttribute ? (el.getAttribute('href') || undefined) : undefined;
		var type = el.getAttribute ? (el.getAttribute('type') || undefined) : undefined;
		var text = (el.textContent || '').trim().slice(0, 80) || undefined;
		return { tagName: tagName, id: id, classList: classList, role: role, href: href, type: type, text: text };
	}

	function install() {
		var mode = 'browse'; // 'browse' | 'edit'
		var selectedEl = null;
		var selectedEls = [];
		var hoveredEl = null;
		var isDragging = false;
		var isResizing = false;
		var isMarquee = false;
		var isEditingText = false;
		var dragStart = null;
		var resizeStart = null;
		var marqueeStart = null;
		var rafId = 0;
		var lastSelRect = null;
		var lastHoverRect = null;

		var listeners = [];
		var createdEls = [];
		function on(target, type, handler, options) {
			try {
				target.addEventListener(type, handler, options);
				listeners.push([target, type, handler, options]);
			} catch {}
		}
		function createEl(tag) {
			var el = document.createElement(tag);
			createdEls.push(el);
			return el;
		}

		var hoverBox = createEl('div');
		hoverBox.id = 'live-ui-editor-hover-box';
		hoverBox.style.cssText = [
			'position: fixed','left: 0','top: 0','width: 0','height: 0',
			'pointer-events: none','z-index: 2147483647',
			'border: 2px solid rgba(80, 140, 255, 0.95)','box-sizing: border-box',
			'display: none'
		].join(';');

		var selectedBox = createEl('div');
		selectedBox.id = 'live-ui-editor-selected-box';
		selectedBox.style.cssText = [
			'position: fixed','left: 0','top: 0','width: 0','height: 0',
			'pointer-events: none','z-index: 2147483647',
			'border: 2px solid rgba(255, 180, 60, 0.95)','box-sizing: border-box',
			'display: none'
		].join(';');

		(document.documentElement || document.body).appendChild(hoverBox);
		(document.documentElement || document.body).appendChild(selectedBox);

		var multiBox = createEl('div');
		multiBox.id = 'live-ui-editor-multi-box';
		multiBox.style.cssText = [
			'position: fixed','left: 0','top: 0','width: 0','height: 0',
			'pointer-events: none','z-index: 2147483647',
			'border: 2px dashed rgba(255, 180, 60, 0.95)','box-sizing: border-box',
			'display: none'
		].join(';');
		(document.documentElement || document.body).appendChild(multiBox);

		var marqueeBox = createEl('div');
		marqueeBox.id = 'live-ui-editor-marquee-box';
		marqueeBox.style.cssText = [
			'position: fixed','left: 0','top: 0','width: 0','height: 0',
			'pointer-events: none','z-index: 2147483647',
			'border: 1px solid rgba(80, 140, 255, 0.95)',
			'background: rgba(80, 140, 255, 0.12)',
			'box-sizing: border-box',
			'display: none'
		].join(';');
		(document.documentElement || document.body).appendChild(marqueeBox);

		var handleSE = createEl('div');
		handleSE.id = 'live-ui-editor-handle-se';
		handleSE.setAttribute('data-live-ui-handle', 'se');
		handleSE.style.cssText = [
			'position: fixed',
			'width: 10px',
			'height: 10px',
			'border-radius: 3px',
			'background: rgba(255, 180, 60, 0.95)',
			'border: 1px solid rgba(0,0,0,0.35)',
			'pointer-events: auto',
			'cursor: nwse-resize',
			'z-index: 2147483647',
			'display: none'
		].join(';');
		(document.documentElement || document.body).appendChild(handleSE);

		var handleSEMulti = createEl('div');
		handleSEMulti.id = 'live-ui-editor-handle-se-multi';
		handleSEMulti.setAttribute('data-live-ui-handle', 'se-multi');
		handleSEMulti.style.cssText = [
			'position: fixed',
			'width: 10px',
			'height: 10px',
			'border-radius: 3px',
			'background: rgba(255, 180, 60, 0.95)',
			'border: 1px solid rgba(0,0,0,0.35)',
			'pointer-events: auto',
			'cursor: nwse-resize',
			'z-index: 2147483647',
			'display: none'
		].join(';');
		(document.documentElement || document.body).appendChild(handleSEMulti);

		var deleteBtn = createEl('div');
		deleteBtn.id = 'live-ui-editor-delete-btn';
		deleteBtn.setAttribute('data-live-ui-handle', 'delete');
		deleteBtn.textContent = '🗑️';
		deleteBtn.title = 'Delete this element from source code';
		deleteBtn.style.cssText = [
			'position: fixed',
			'width: 24px',
			'height: 24px',
			'border-radius: 4px',
			'background: rgba(255, 80, 80, 0.95)',
			'border: 1px solid rgba(0,0,0,0.35)',
			'pointer-events: auto',
			'cursor: pointer',
			'z-index: 2147483647',
			'display: none',
			'font-size: 14px',
			'line-height: 22px',
			'text-align: center',
			'user-select: none'
		].join(';');
		(document.documentElement || document.body).appendChild(deleteBtn);

		var previewTargetEl = null;
		var previewStyleEl = createEl('style');
		previewStyleEl.id = 'live-ui-editor-preview-style';
		try { (document.head || document.documentElement).appendChild(previewStyleEl); } catch {}

		function cssPropNameFromJs(k) {
			return String(k || '')
				.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
				.replace(/_/g, '-')
				.toLowerCase();
		}

		function rectToBox(el, box) {
			var r = el.getBoundingClientRect();
			box.style.left = Math.max(0, r.left) + 'px';
			box.style.top = Math.max(0, r.top) + 'px';
			box.style.width = Math.max(0, r.width) + 'px';
			box.style.height = Math.max(0, r.height) + 'px';
			return r;
		}

		function rectChanged(a, b) {
			if (!a || !b) return true;
			return a.left !== b.left || a.top !== b.top || a.width !== b.width || a.height !== b.height;
		}

		function positionHandleSE(r) {
			if (!r) return;
			var x = Math.max(0, r.left + r.width - 5);
			var y = Math.max(0, r.top + r.height - 5);
			handleSE.style.left = x + 'px';
			handleSE.style.top = y + 'px';
		}

		function positionDeleteBtn(r) {
			if (!r) return;
			// Position at top-right corner of selection
			var x = Math.max(0, r.left + r.width - 12);
			var y = Math.max(0, r.top - 28);
			deleteBtn.style.left = x + 'px';
			deleteBtn.style.top = y + 'px';
		}

		function getSelectedUnionRect() {
			if (!selectedEls || selectedEls.length === 0) return null;
			var left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
			for (var i = 0; i < selectedEls.length; i++) {
				var el = selectedEls[i];
				if (!el || !document.contains(el)) continue;
				var r = el.getBoundingClientRect();
				left = Math.min(left, r.left);
				top = Math.min(top, r.top);
				right = Math.max(right, r.left + r.width);
				bottom = Math.max(bottom, r.top + r.height);
			}
			if (!isFinite(left) || !isFinite(top) || !isFinite(right) || !isFinite(bottom)) return null;
			return { left: left, top: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
		}

		function setBoxFromRect(box, r) {
			box.style.left = Math.max(0, r.left) + 'px';
			box.style.top = Math.max(0, r.top) + 'px';
			box.style.width = Math.max(0, r.width) + 'px';
			box.style.height = Math.max(0, r.height) + 'px';
		}

		function updateSelectionVisuals() {
			// Multi-select visuals
			if (selectedEls && selectedEls.length > 1) {
				var ur = getSelectedUnionRect();
				if (!ur) {
					selectedEls = [];
					selectedEl = null;
					selectedBox.style.display = 'none';
					multiBox.style.display = 'none';
					handleSE.style.display = 'none';
					handleSEMulti.style.display = 'none';
					deleteBtn.style.display = 'none';
					lastSelRect = null;
					return;
				}
				multiBox.style.display = 'block';
				setBoxFromRect(multiBox, ur);
				selectedBox.style.display = 'none';
				if (mode === 'edit') {
					positionHandleSE(ur);
					handleSEMulti.style.left = handleSE.style.left;
					handleSEMulti.style.top = handleSE.style.top;
					handleSEMulti.style.display = 'block';
					handleSE.style.display = 'none';
					// Hide delete for multi-select (too dangerous)
					deleteBtn.style.display = 'none';
				} else {
					handleSEMulti.style.display = 'none';
					handleSE.style.display = 'none';
					deleteBtn.style.display = 'none';
				}
				lastSelRect = { left: ur.left, top: ur.top, width: ur.width, height: ur.height };
				updateDebugWarningsForRect(ur);
				return;
			}

			multiBox.style.display = 'none';
			handleSEMulti.style.display = 'none';
			if (!selectedEl) {
				selectedBox.style.display = 'none';
				handleSE.style.display = 'none';
				deleteBtn.style.display = 'none';
				lastSelRect = null;
				if (warnLabel) warnLabel.style.display = 'none';
				return;
			}
			if (!document.contains(selectedEl)) {
				selectedEl = null;
				selectedBox.style.display = 'none';
				handleSE.style.display = 'none';
				deleteBtn.style.display = 'none';
				lastSelRect = null;
				if (warnLabel) warnLabel.style.display = 'none';
				return;
			}
			var r = rectToBox(selectedEl, selectedBox);
			selectedBox.style.display = 'block';
			if (mode === 'edit') {
				positionHandleSE(r);
				handleSE.style.display = 'block';
				positionDeleteBtn(r);
				deleteBtn.style.display = 'block';
			} else {
				handleSE.style.display = 'none';
				deleteBtn.style.display = 'none';
			}
			lastSelRect = { left: r.left, top: r.top, width: r.width, height: r.height };
			updateDebugWarningsForRect(r);
		}

		function updateHoverVisuals() {
			if (mode !== 'edit') {
				hoverBox.style.display = 'none';
				lastHoverRect = null;
				return;
			}
			if (!hoveredEl || !document.contains(hoveredEl)) {
				hoveredEl = null;
				hoverBox.style.display = 'none';
				lastHoverRect = null;
				return;
			}
			var r = hoveredEl.getBoundingClientRect();
			var cur = { left: r.left, top: r.top, width: r.width, height: r.height };
			if (rectChanged(lastHoverRect, cur)) {
				rectToBox(hoveredEl, hoverBox);
				hoverBox.style.display = 'block';
				lastHoverRect = cur;
			}
		}

		function ensureRafLoop() {
			if (rafId) return;
			var tick = function () {
				rafId = 0;
				updateHoverVisuals();
				updateSelectionVisuals();
				// Performance: don't run a permanent 60fps loop.
				// Keep a low-frequency follow loop only when an element is selected in edit mode.
				try {
					if (followTimer) {
						window.clearTimeout(followTimer);
						followTimer = 0;
					}
					if (mode === 'edit' && selectedEl) {
						followTimer = window.setTimeout(function () { ensureRafLoop(); }, 120);
					}
				} catch {}
			};
			rafId = window.requestAnimationFrame(tick);
		}

		var followTimer = 0;

		function postToParent(message) {
			try { window.parent && window.parent.postMessage({ __liveUiEditor: true, message: message }, '*'); } catch {}
		}

		function hasHorizontalScroll() {
			try {
				var se = document.scrollingElement || document.documentElement;
				if (!se) return false;
				return (se.scrollWidth - se.clientWidth) > 1;
			} catch {
				return false;
			}
		}
		function hasBottomOverlay() {
			try {
				var vw = window.innerWidth || 0;
				var vh = window.innerHeight || 0;
				if (!vw || !vh) return false;
				var y = vh - 2;
				var xs = [Math.floor(vw * 0.1), Math.floor(vw * 0.5), Math.floor(vw * 0.9)];
				for (var i = 0; i < xs.length; i++) {
					var el = document.elementFromPoint(xs[i], y);
					if (!(el instanceof Element)) continue;
					if (isEditorUiEl(el)) continue;
					var cs = window.getComputedStyle(el);
					var pos = (cs.position || '').toLowerCase();
					if (pos !== 'fixed' && pos !== 'sticky') continue;
					var r = el.getBoundingClientRect();
					if (r.height >= 44 && r.top < (vh - 2) && r.bottom > (vh - 2)) return true;
				}
				return false;
			} catch {
				return false;
			}
		}
		function updateDebugWarningsForRect(rect) {
			if (!debugSafe || !warnLabel) return;
			try {
				var vw = window.innerWidth || 0;
				var vh = window.innerHeight || 0;
				var warnings = [];
				if (hasHorizontalScroll()) warnings.push('Horizontal scroll');
				if (hasBottomOverlay()) warnings.push('Bottom overlay');
				if (rect && vw && vh) {
					var out = rect.left < 0 || rect.top < 0 || (rect.left + rect.width) > vw || (rect.top + rect.height) > vh;
					if (out) warnings.push('Outside viewport');
				}
				if (!warnings.length) {
					warnLabel.style.display = 'none';
					return;
				}
				warnLabel.style.display = 'block';
				warnLabel.textContent = warnings.join(' • ');
				var left = 8;
				var top = 8;
				if (rect && vw) {
					left = Math.max(8, Math.min((vw - 220), rect.left));
					top = Math.max(8, (rect.top - 28));
				}
				warnLabel.style.left = left + 'px';
				warnLabel.style.top = top + 'px';
			} catch {}
		}

		function sendSelected(el) {
			var elementId = getElementId(el);
			var ds = elementId ? tryParseLuiElementId(elementId) : undefined;
			if (!ds) {
				var fiber = findFiberFromDom(el);
				ds = fiber ? getDebugSourceFromFiber(fiber) : undefined;
			}
			if (!ds) {
				postToParent({
					command: 'elementUnmapped',
					elementId: elementId,
					elementContext: elementContext(el),
					inlineStyle: el.getAttribute ? (el.getAttribute('style') || undefined) : undefined,
					computedStyle: safeComputedStyle(el),
				});
				return;
			}
			postToParent({
				command: 'elementSelected',
				file: ds.fileName,
				line: ds.lineNumber,
				column: ds.columnNumber,
				elementId: elementId,
				elementContext: elementContext(el),
				inlineStyle: el.getAttribute ? (el.getAttribute('style') || undefined) : undefined,
				computedStyle: safeComputedStyle(el),
			});
		}

		function sendClicked(el) {
			var elementId = getElementId(el);
			var ds = elementId ? tryParseLuiElementId(elementId) : undefined;
			if (!ds) {
				var fiber = findFiberFromDom(el);
				ds = fiber ? getDebugSourceFromFiber(fiber) : undefined;
			}
			if (!ds) return;
			postToParent({ command: 'elementClicked', file: ds.fileName, line: ds.lineNumber, column: ds.columnNumber, elementId: elementId });
		}

		function sendUpdateStyle(el) {
			var elementId = getElementId(el);
			var ds = elementId ? tryParseLuiElementId(elementId) : undefined;
			if (!ds) {
				var fiber = findFiberFromDom(el);
				ds = fiber ? getDebugSourceFromFiber(fiber) : undefined;
			}
			if (!ds) return;
			var style = {};
			if (el.style && el.style.width) style.width = el.style.width;
			if (el.style && el.style.height) style.height = el.style.height;
			if (el.style && el.style.transform) style.transform = el.style.transform;
			postToParent({ command: 'updateStyle', file: ds.fileName, line: ds.lineNumber, column: ds.columnNumber, elementId: elementId, elementContext: elementContext(el), style: style });
		}

		function sendUpdateText(el, text) {
			var elementId = getElementId(el);
			var ds = elementId ? tryParseLuiElementId(elementId) : undefined;
			if (!ds) {
				var fiber = findFiberFromDom(el);
				ds = fiber ? getDebugSourceFromFiber(fiber) : undefined;
			}
			if (!ds) return;
			postToParent({ command: 'updateText', file: ds.fileName, line: ds.lineNumber, column: ds.columnNumber, elementId: elementId, elementContext: elementContext(el), text: String(text || '') });
		}

		function setMode(next) {
			mode = next === 'edit' ? 'edit' : 'browse';
			hoverBox.style.display = mode === 'edit' ? 'block' : 'none';
			if (mode !== 'edit') hoveredEl = null;
			updateSelectionVisuals();
			ensureRafLoop();
		}

		function applyPreview(style) {
			if (!selectedEl) return;
			clearPreview();
			previewTargetEl = selectedEl;
			try { previewTargetEl.setAttribute('data-live-ui-preview-target', '1'); } catch {}
			var decls = [];
			for (var k in (style || {})) {
				if (!Object.prototype.hasOwnProperty.call(style, k)) continue;
				var v = style[k];
				if (v === undefined || v === null || v === '') continue;
				decls.push(cssPropNameFromJs(k) + ': ' + String(v) + ' !important');
			}
			previewStyleEl.textContent = decls.length
				? '[data-live-ui-preview-target="1"]{' + decls.join(';') + ';}'
				: '';
		}

		function clearPreview() {
			if (previewTargetEl && previewTargetEl.getAttribute) {
				try { previewTargetEl.removeAttribute('data-live-ui-preview-target'); } catch {}
			}
			previewTargetEl = null;
			previewStyleEl.textContent = '';
		}

		var debugSafe = false;
		var debugOverlay = null;
		var warnLabel = null;
		function ensureDebugUi() {
			if (debugOverlay) return;
			debugOverlay = document.createElement('div');
			debugOverlay.id = 'live-ui-editor-debug-overlay';
			debugOverlay.style.position = 'fixed';
			debugOverlay.style.left = '0';
			debugOverlay.style.top = '0';
			debugOverlay.style.right = '0';
			debugOverlay.style.bottom = '0';
			debugOverlay.style.pointerEvents = 'none';
			debugOverlay.style.zIndex = '2147483646';
			debugOverlay.style.display = 'none';
			// Safe-area guides (works when the browser exposes env(safe-area-inset-*)).
			var top = document.createElement('div');
			top.style.position = 'absolute';
			top.style.left = '0';
			top.style.top = '0';
			top.style.right = '0';
			top.style.height = 'env(safe-area-inset-top, 0px)';
			top.style.background = 'rgba(255, 180, 60, 0.25)';
			var bottom = document.createElement('div');
			bottom.style.position = 'absolute';
			bottom.style.left = '0';
			bottom.style.bottom = '0';
			bottom.style.right = '0';
			bottom.style.height = 'env(safe-area-inset-bottom, 0px)';
			bottom.style.background = 'rgba(255, 180, 60, 0.25)';
			var left = document.createElement('div');
			left.style.position = 'absolute';
			left.style.left = '0';
			left.style.top = '0';
			left.style.bottom = '0';
			left.style.width = 'env(safe-area-inset-left, 0px)';
			left.style.background = 'rgba(255, 180, 60, 0.18)';
			var right = document.createElement('div');
			right.style.position = 'absolute';
			right.style.right = '0';
			right.style.top = '0';
			right.style.bottom = '0';
			right.style.width = 'env(safe-area-inset-right, 0px)';
			right.style.background = 'rgba(255, 180, 60, 0.18)';
			debugOverlay.appendChild(top);
			debugOverlay.appendChild(bottom);
			debugOverlay.appendChild(left);
			debugOverlay.appendChild(right);
			document.documentElement.appendChild(debugOverlay);

			warnLabel = document.createElement('div');
			warnLabel.id = 'live-ui-editor-warn-label';
			warnLabel.style.position = 'fixed';
			warnLabel.style.padding = '4px 6px';
			warnLabel.style.borderRadius = '6px';
			warnLabel.style.background = 'rgba(255, 120, 120, 0.92)';
			warnLabel.style.color = 'white';
			warnLabel.style.font = '12px system-ui, -apple-system, Segoe UI, Roboto, Arial';
			warnLabel.style.pointerEvents = 'none';
			warnLabel.style.zIndex = '2147483647';
			warnLabel.style.display = 'none';
			document.documentElement.appendChild(warnLabel);
		}
		function setDebug(next) {
			debugSafe = !!(next && next.safe);
			if (debugSafe) {
				ensureDebugUi();
				if (debugOverlay) debugOverlay.style.display = 'block';
			} else {
				if (debugOverlay) debugOverlay.style.display = 'none';
				if (warnLabel) warnLabel.style.display = 'none';
			}
			ensureRafLoop();
		}

		var onMessage = function (ev) {
			// SECURITY: Only accept control messages from the parent webview.
			try {
				if (ev.source !== window.parent) return;
			} catch {
				return;
			}
			var data = ev.data;
			if (!data || typeof data !== 'object') return;
			if (data.type === 'live-ui-editor:setMode') return setMode(data.mode);
			if (data.type === 'live-ui-editor:setDebug') return setDebug(data);
			if (data.type === 'live-ui-editor:previewStyle') return applyPreview(data.style || {});
			if (data.type === 'live-ui-editor:clearPreview') return clearPreview();
		};
		on(window, 'message', onMessage);

		var onMouseMove = function (e) {
			if (mode !== 'edit') return;
			var el = document.elementFromPoint(e.clientX, e.clientY);
			if (!(el instanceof Element)) return;
			if (el === document.documentElement || el === document.body) return;
			if (hoveredEl !== el) {
				hoveredEl = el;
				rectToBox(el, hoverBox);
				hoverBox.style.display = 'block';
				lastHoverRect = null;
				ensureRafLoop();
			}
		};
		on(window, 'mousemove', onMouseMove, true);

		var onScroll = function () {
			// Scroll events can come from nested scrollers; RAF loop keeps things correct.
			ensureRafLoop();
		};
		on(window, 'scroll', onScroll, true);

		var onResize = function () { ensureRafLoop(); };
		on(window, 'resize', onResize);

		function isEditorUiEl(el) {
			if (!el || !el.getAttribute) return false;
			var id = el.id || '';
			return id === 'live-ui-editor-hover-box' || id === 'live-ui-editor-selected-box' || id === 'live-ui-editor-multi-box' || id === 'live-ui-editor-marquee-box' || id === 'live-ui-editor-handle-se' || id === 'live-ui-editor-handle-se-multi' || id === 'live-ui-editor-delete-btn';
		}

		function pickEditableElement(startEl, ev) {
			var el = startEl;
			if (!(el instanceof Element)) return null;
			if (isEditorUiEl(el)) return null;
			// If the exact element has a stable identity marker, prefer it.
			// This helps keep selection on the intended leaf node.
			try {
				if (getElementId(el)) {
					// Alt+Shift+click: choose parent.
					if (ev && ev.altKey && ev.shiftKey && el.parentElement) return el.parentElement;
					// Alt+click: choose exact element (no heuristics).
					if (ev && ev.altKey) return el;
					// No modifier: still prefer the exact identified element.
					return el;
				}
			} catch {}
			// Alt+Shift+click: choose parent.
			if (ev && ev.altKey && ev.shiftKey && el.parentElement) return el.parentElement;
			// Alt+click: choose exact element (no heuristics).
			if (ev && ev.altKey) return el;

			var maxHops = 6;
			while (el && maxHops-- > 0) {
				if (!el.parentElement) break;
				if (el === document.documentElement || el === document.body) break;

				var tag = String(el.tagName || '').toLowerCase();
				// Avoid selecting tiny/leaf inline elements by default.
				var cs = window.getComputedStyle(el);
				var isInline = (cs.display || '').indexOf('inline') === 0;
				var r = el.getBoundingClientRect();
				var tiny = (r.width < 18 || r.height < 14);
				var svgLeaf = tag === 'path' || tag === 'circle' || tag === 'rect' || tag === 'line' || tag === 'polyline' || tag === 'polygon' || tag === 'g';
				var texty = tag === 'span' || tag === 'small' || tag === 'strong' || tag === 'em' || tag === 'b' || tag === 'i' || tag === 'code';
				var isLeafText = false;
				try {
					var hasNoChildren = (el.childElementCount || 0) === 0;
					var hasText = ((el.textContent || '').trim().length > 0);
					isLeafText = texty && hasNoChildren && hasText;
				} catch {}
				// Avoid selecting super-tiny inline leaves by default, but allow selecting readable text spans.
				if (svgLeaf || (isLeafText && (isInline || tiny) && (r.width < 18 || r.height < 14))) {
					el = el.parentElement;
					continue;
				}
				break;
			}
			return el;
		}

		function parseTranslatePx(transform) {
			if (!transform) return { x: 0, y: 0, base: '' };
			var m = transform.match(/translate\(\s*([-\d.]+)px\s*,\s*([-\d.]+)px\s*\)/);
			if (!m) return { x: 0, y: 0, base: transform };
			var x = parseFloat(m[1] || '0') || 0;
			var y = parseFloat(m[2] || '0') || 0;
			var base = transform.replace(m[0], '').trim();
			return { x: x, y: y, base: base };
		}

		function setTranslatePx(el, base, x, y) {
			var t = (base ? base + ' ' : '') + 'translate(' + x + 'px, ' + y + 'px)';
			el.style.transform = t.trim();
		}

		var onPointerDown = function (e) {
			if (mode !== 'edit') return;
			if (isEditingText) return;
			if (e.button !== 0) return;
			var target = e.target;
			if (!(target instanceof Element)) return;
			if (target === handleSE || target === handleSEMulti) return;

			// Shift+Click toggles multi-select (handled in click). Shift+Drag starts marquee after a small move threshold.
			if (e.shiftKey) {
				isMarquee = false;
				marqueeStart = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY };
				return;
			}
			var picked = pickEditableElement(target, e);
			if (!picked) return;

			// Selection is changing; drop any existing preview.
			clearPreview();

			// Select and start dragging.
			e.preventDefault();
			e.stopPropagation();
			if (e.stopImmediatePropagation) e.stopImmediatePropagation();
			var keepMulti = (selectedEls && selectedEls.length > 1 && selectedEls.indexOf(picked) >= 0);
			if (!keepMulti) {
				selectedEl = picked;
				selectedEls = [picked];
			} else {
				selectedEl = selectedEls[0] || picked;
			}
			updateSelectionVisuals();
			if (selectedEl) sendSelected(selectedEl);
			ensureRafLoop();

			if (selectedEls && selectedEls.length > 1) {
				var items = [];
				for (var mi = 0; mi < selectedEls.length; mi++) {
					var mEl = selectedEls[mi];
					if (!mEl || !document.contains(mEl)) continue;
					var parsedM = parseTranslatePx(mEl.style.transform || '');
					items.push({ el: mEl, base: parsedM.base, tx0: parsedM.x, ty0: parsedM.y });
				}
				isDragging = true;
				dragStart = {
					pointerId: e.pointerId,
					x0: e.clientX,
					y0: e.clientY,
					base: '',
					tx0: 0,
					ty0: 0,
					multi: true,
					items: items,
				};
			} else {
				var parsed = parseTranslatePx(picked.style.transform || '');
				isDragging = true;
				dragStart = {
					pointerId: e.pointerId,
					x0: e.clientX,
					y0: e.clientY,
					base: parsed.base,
					tx0: parsed.x,
					ty0: parsed.y,
					multi: false,
					items: null,
				};
			}
		};
		on(window, 'pointerdown', onPointerDown, true);

		var onPointerMove = function (e) {
			if (marqueeStart && e.pointerId === marqueeStart.pointerId) {
				var x1 = marqueeStart.x0;
				var y1 = marqueeStart.y0;
				var x2 = e.clientX;
				var y2 = e.clientY;
				var dxm = x2 - x1;
				var dym = y2 - y1;
				if (!isMarquee) {
					if ((Math.abs(dxm) + Math.abs(dym)) < 6) return;
					isMarquee = true;
					marqueeBox.style.display = 'block';
				}
				e.preventDefault();
				e.stopPropagation();
				if (e.stopImmediatePropagation) e.stopImmediatePropagation();
				var left = Math.min(x1, x2);
				var top = Math.min(y1, y2);
				var w = Math.abs(x2 - x1);
				var h = Math.abs(y2 - y1);
				setBoxFromRect(marqueeBox, { left: left, top: top, width: w, height: h });
				return;
			}
			if (!selectedEl && (!selectedEls || selectedEls.length === 0)) return;
			if (isDragging && dragStart && e.pointerId === dragStart.pointerId) {
				e.preventDefault();
				e.stopPropagation();
				if (e.stopImmediatePropagation) e.stopImmediatePropagation();
				var dx = e.clientX - dragStart.x0;
				var dy = e.clientY - dragStart.y0;
				if (dragStart.multi && dragStart.items) {
					for (var i = 0; i < dragStart.items.length; i++) {
						var it = dragStart.items[i];
						setTranslatePx(it.el, it.base, Math.round(it.tx0 + dx), Math.round(it.ty0 + dy));
					}
				} else if (selectedEl) {
					setTranslatePx(selectedEl, dragStart.base, Math.round(dragStart.tx0 + dx), Math.round(dragStart.ty0 + dy));
				}
				updateSelectionVisuals();
				return;
			}
			if (isResizing && resizeStart && e.pointerId === resizeStart.pointerId) {
				e.preventDefault();
				e.stopPropagation();
				if (e.stopImmediatePropagation) e.stopImmediatePropagation();
				var dx2 = e.clientX - resizeStart.x0;
				var dy2 = e.clientY - resizeStart.y0;
				var w = Math.max(4, Math.round(resizeStart.w0 + dx2));
				var h = Math.max(4, Math.round(resizeStart.h0 + dy2));
				if (resizeStart.multi && resizeStart.items) {
					var sx = Math.max(0.05, (w / Math.max(1, resizeStart.w0)));
					var sy = Math.max(0.05, (h / Math.max(1, resizeStart.h0)));
					for (var j = 0; j < resizeStart.items.length; j++) {
						var it2 = resizeStart.items[j];
						var newW = Math.max(4, Math.round(it2.r0.width * sx));
						var newH = Math.max(4, Math.round(it2.r0.height * sy));
						it2.el.style.width = newW + 'px';
						it2.el.style.height = newH + 'px';
						var desiredLeft = resizeStart.r0.left + (it2.r0.left - resizeStart.r0.left) * sx;
						var desiredTop = resizeStart.r0.top + (it2.r0.top - resizeStart.r0.top) * sy;
						var dxPos = desiredLeft - it2.r0.left;
						var dyPos = desiredTop - it2.r0.top;
						setTranslatePx(it2.el, it2.base, Math.round(it2.tx0 + dxPos), Math.round(it2.ty0 + dyPos));
					}
				} else if (selectedEl) {
					selectedEl.style.width = w + 'px';
					selectedEl.style.height = h + 'px';
				}
				updateSelectionVisuals();
				return;
			}
		};
		on(window, 'pointermove', onPointerMove, true);

		var onPointerUp = function (e) {
			if (marqueeStart && e.pointerId === marqueeStart.pointerId) {
				var x1 = marqueeStart.x0;
				var y1 = marqueeStart.y0;
				var x2 = e.clientX;
				var y2 = e.clientY;
				marqueeStart = null;
				if (!isMarquee) {
					// Shift+Click: let click handler run.
					return;
				}
				isMarquee = false;
				marqueeBox.style.display = 'none';
				e.preventDefault();
				e.stopPropagation();
				if (e.stopImmediatePropagation) e.stopImmediatePropagation();
				var left = Math.min(x1, x2);
				var top = Math.min(y1, y2);
				var right = Math.max(x1, x2);
				var bottom = Math.max(y1, y2);
				var picked = [];
				var all = document.querySelectorAll('body *');
				for (var i = 0; i < all.length; i++) {
					var el = all[i];
					if (!(el instanceof Element)) continue;
					if (isEditorUiEl(el)) continue;
					var r = el.getBoundingClientRect();
					if (r.width < 2 || r.height < 2) continue;
					var hit = !(r.left > right || (r.left + r.width) < left || r.top > bottom || (r.top + r.height) < top);
					if (!hit) continue;
					var pe = pickEditableElement(el, null);
					if (pe && picked.indexOf(pe) < 0) picked.push(pe);
					if (picked.length > 40) break;
				}
				selectedEls = picked;
				selectedEl = picked.length ? picked[0] : null;
				updateSelectionVisuals();
				if (selectedEl) sendSelected(selectedEl);
				ensureRafLoop();
				return;
			}
			if (!selectedEl && (!selectedEls || selectedEls.length === 0)) return;
			if (isDragging && dragStart && e.pointerId === dragStart.pointerId) {
				isDragging = false;
				dragStart = null;
				if (selectedEls && selectedEls.length > 1) {
					for (var i2 = 0; i2 < selectedEls.length; i2++) sendUpdateStyle(selectedEls[i2]);
				} else if (selectedEl) {
					sendUpdateStyle(selectedEl);
				}
				return;
			}
			if (isResizing && resizeStart && e.pointerId === resizeStart.pointerId) {
				isResizing = false;
				resizeStart = null;
				if (selectedEls && selectedEls.length > 1) {
					for (var i3 = 0; i3 < selectedEls.length; i3++) sendUpdateStyle(selectedEls[i3]);
				} else if (selectedEl) {
					sendUpdateStyle(selectedEl);
				}
				return;
			}
		};
		on(window, 'pointerup', onPointerUp, true);

		var onHandlePointerDown = function (e) {
			if (mode !== 'edit') return;
			if (!selectedEl) return;
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			if (e.stopImmediatePropagation) e.stopImmediatePropagation();
			isResizing = true;
			var r = selectedEl.getBoundingClientRect();
			resizeStart = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, w0: r.width, h0: r.height };
			ensureRafLoop();
		};
		on(handleSE, 'pointerdown', onHandlePointerDown, true);

		var onHandleMultiPointerDown = function (e) {
			if (mode !== 'edit') return;
			if (!selectedEls || selectedEls.length < 2) return;
			if (e.button !== 0) return;
			e.preventDefault();
			e.stopPropagation();
			if (e.stopImmediatePropagation) e.stopImmediatePropagation();
			isResizing = true;
			var r0 = getSelectedUnionRect();
			if (!r0) { isResizing = false; return; }
			var items = [];
			for (var i = 0; i < selectedEls.length; i++) {
				var el = selectedEls[i];
				if (!el || !document.contains(el)) continue;
				var parsed = parseTranslatePx(el.style.transform || '');
				items.push({ el: el, base: parsed.base, tx0: parsed.x, ty0: parsed.y, r0: el.getBoundingClientRect() });
			}
			resizeStart = { pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, w0: r0.width, h0: r0.height, r0: r0, multi: true, items: items };
			ensureRafLoop();
		};
		on(handleSEMulti, 'pointerdown', onHandleMultiPointerDown, true);

		var onDeleteClick = function (e) {
			if (mode !== 'edit') return;
			if (!selectedEl) return;
			e.preventDefault();
			e.stopPropagation();
			if (e.stopImmediatePropagation) e.stopImmediatePropagation();

			// Get element info for deletion
			var elementId = getElementId(selectedEl);
			var ds = elementId ? tryParseLuiElementId(elementId) : undefined;
			if (!ds) {
				var fiber = findFiberFromDom(selectedEl);
				ds = fiber ? getDebugSourceFromFiber(fiber) : undefined;
			}
			if (!ds) return;

			// Send delete command to parent
			postToParent({
				command: 'deleteElement',
				file: ds.fileName,
				line: ds.lineNumber,
				column: ds.columnNumber,
				elementId: elementId,
				elementContext: elementContext(selectedEl),
			});

			// Clear selection since the element will be deleted
			selectedEl = null;
			selectedEls = [];
			updateSelectionVisuals();
		};
		on(deleteBtn, 'click', onDeleteClick, true);

		var onClick = function (e) {
			var el = e.target;
			if (!(el instanceof Element)) return;
			// Don't interfere with delete button clicks
			if (el === deleteBtn || el.id === 'live-ui-editor-delete-btn') return;
			if (mode === 'edit') {
				var picked = pickEditableElement(el, e);
				if (picked) el = picked;
			}

			// Browse mode: Alt+Click = jump-to-code (block app click).
			if (mode === 'browse' && e.altKey) {
				e.preventDefault();
				e.stopPropagation();
				if (e.stopImmediatePropagation) e.stopImmediatePropagation();
				selectedEl = el;
				updateSelectionVisuals();
				sendSelected(el);
				sendClicked(el);
				return;
			}

			// Edit mode: click selects (block app click). Ctrl/Cmd+Click jumps.
			if (mode === 'edit') {
				e.preventDefault();
				e.stopPropagation();
				if (e.stopImmediatePropagation) e.stopImmediatePropagation();
				// Selection is changing; drop any existing preview.
				clearPreview();
				if (e.shiftKey) {
					// Toggle selection in multi-select mode.
					var idx = selectedEls.indexOf(el);
					if (idx >= 0) selectedEls.splice(idx, 1);
					else selectedEls.push(el);
					selectedEl = selectedEls.length ? selectedEls[0] : null;
				} else {
					selectedEl = el;
					selectedEls = [el];
				}
				updateSelectionVisuals();
				if (selectedEl) sendSelected(selectedEl);
				if (e.ctrlKey || e.metaKey) sendClicked(el);
				return;
			}
		};
		on(window, 'click', onClick, true);

		var onDblClick = function (e) {
			if (mode !== 'edit') return;
			if (isDragging || isResizing) return;
			var el = e.target;
			if (!(el instanceof Element)) return;
			if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return;
			if (el.childElementCount > 0) return;

			e.preventDefault();
			e.stopPropagation();
			if (e.stopImmediatePropagation) e.stopImmediatePropagation();
			selectedEl = el;
			updateSelectionVisuals();
			sendSelected(el);
			ensureRafLoop();

			var prevText = (el.textContent || '');
			isEditingText = true;
			try {
				el.setAttribute('contenteditable', 'true');
				el.focus();
				var sel = window.getSelection && window.getSelection();
				if (sel) {
					var range = document.createRange();
					range.selectNodeContents(el);
					sel.removeAllRanges();
					sel.addRange(range);
				}
			} catch {}

			function finish(commit) {
				try { el.removeAttribute('contenteditable'); } catch {}
				isEditingText = false;
				el.removeEventListener('keydown', onKeyDown, true);
				el.removeEventListener('blur', onBlur, true);
				if (!commit) {
					try { el.textContent = prevText; } catch {}
					return;
				}
				var nextText = (el.textContent || '');
				if (nextText !== prevText) sendUpdateText(el, nextText);
			}

			function onKeyDown(ev) {
				if (ev.key === 'Escape') {
					ev.preventDefault();
					ev.stopPropagation();
					if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
					finish(false);
					return;
				}
				if (ev.key === 'Enter' && !ev.shiftKey) {
					ev.preventDefault();
					ev.stopPropagation();
					if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
					finish(true);
					return;
				}
			}

			function onBlur() {
				finish(true);
			}

			el.addEventListener('keydown', onKeyDown, true);
			el.addEventListener('blur', onBlur, true);
		};
		on(window, 'dblclick', onDblClick, true);

		setMode(mode);
		updateSelectionVisuals();
		ensureRafLoop();

		return function dispose() {
			try {
				clearPreview();
				hoveredEl = null;
				selectedEl = null;
				selectedEls = [];
				if (rafId) {
					try { window.cancelAnimationFrame(rafId); } catch {}
					rafId = 0;
				}
				for (var i = 0; i < listeners.length; i++) {
					var l = listeners[i];
					try { l[0].removeEventListener(l[1], l[2], l[3]); } catch {}
				}
				listeners = [];
				for (var j = 0; j < createdEls.length; j++) {
					var n = createdEls[j];
					try { if (n && n.parentNode) n.parentNode.removeChild(n); } catch {}
				}
				createdEls = [];
			} catch {}
		};
	}

	// Best-effort: some apps aggressively rewrite <head>; retry a few times.
	var installed = false;
	for (var i = 0; i < 5; i++) {
		try {
			if (!installed) {
				var dispose = install();
				try { __api.dispose = typeof dispose === 'function' ? dispose : function () {}; } catch {}
				installed = true;
			}
			break;
		} catch {}
	}
})();
`;
