// A minimal Tauri runtime shim for running Tauri-targeted web apps inside App Mode (browser/iframe).
// Goal: prevent hard crashes on "not running in Tauri" checks.
// This does NOT implement real Tauri capabilities; it only provides safe stubs.

export const tauriShimScript = String.raw`
(function () {
	try {
		var g = window;
		if (g.__liveUiEditorTauriShimInstalled) return;
		g.__liveUiEditorTauriShimInstalled = true;

		// Patch clipboard APIs (App Mode iframe often blocks clipboard-write by policy).
		try {
			if (g.navigator && g.navigator.clipboard) {
				var cb = g.navigator.clipboard;
				if (cb && typeof cb.writeText === 'function') {
					var origWriteText = cb.writeText.bind(cb);
					cb.writeText = function (text) {
						try {
							return origWriteText(text);
						} catch {
							// Fallback: pretend success.
							return Promise.resolve();
						}
					};
				}
				if (cb && typeof cb.readText !== 'function') {
					cb.readText = function () { return Promise.resolve(''); };
				}
			}
		} catch {}

		function safeString(v) {
			try { return typeof v === 'string' ? v : String(v || ''); } catch { return ''; }
		}
		function joinPath(parts) {
			try {
				if (!Array.isArray(parts)) return '';
				return parts.filter(Boolean).map(safeString).join('/').replace(/\/+/g, '/');
			} catch { return ''; }
		}

		function stubDialog(cmd, args) {
			try {
				if (cmd.indexOf('confirm') !== -1) return Promise.resolve(false);
				if (cmd.indexOf('open') !== -1) return Promise.resolve(null);
				if (cmd.indexOf('message') !== -1) {
					try { g.alert && g.alert((args && (args.message || args.title)) ? String(args.message || args.title) : ''); } catch {}
					return Promise.resolve(null);
				}
			} catch {}
			return Promise.resolve(null);
		}

		function stubFs(cmd) {
			// These stubs are "empty but safe" so app UI can render.
			if (cmd.indexOf('exists') !== -1) return Promise.resolve(false);
			if (cmd.indexOf('read_dir') !== -1 || cmd.indexOf('readDir') !== -1) return Promise.resolve([]);
			if (cmd.indexOf('read_file') !== -1 || cmd.indexOf('readFile') !== -1) return Promise.resolve(new Uint8Array());
			if (cmd.indexOf('write_file') !== -1 || cmd.indexOf('writeFile') !== -1) return Promise.resolve(null);
			if (cmd.indexOf('mkdir') !== -1) return Promise.resolve(null);
			if (cmd.indexOf('remove') !== -1 || cmd.indexOf('rm') !== -1) return Promise.resolve(null);
			return Promise.resolve(null);
		}

		function stubPath(cmd, args) {
			if (cmd.indexOf('app_data_dir') !== -1 || cmd.indexOf('appDataDir') !== -1) return Promise.resolve('appData');
			if (cmd.indexOf('|join') !== -1 || cmd.indexOf('join') !== -1) {
				var parts = [];
				try {
					// Different versions pass args differently.
					if (args && Array.isArray(args.paths)) parts = args.paths;
					else if (args && Array.isArray(args.path)) parts = args.path;
					else if (args && args.paths) parts = args.paths;
					else if (args && args.a !== undefined && args.b !== undefined) parts = [args.a, args.b];
					else if (args && args.path !== undefined) parts = [args.path];
				} catch {}
				return Promise.resolve(joinPath(parts));
			}
			return Promise.resolve('');
		}

		function stubCustom(cmd, args) {
			// StoryRoot (and similar apps) register their own commands.
			// Provide reasonable defaults so UI can render without a native backend.
			function makeBookProject(id) {
				var now = new Date().toISOString();
				return {
					id: id,
					title: 'Stub Project',
					createdAt: now,
					updatedAt: now,
					settings: {
						trimSize: '8.5x8.5',
						trimId: 'paperback:8.5x8.5',
						dpi: 300,
						bleed: 0.125,
						margins: 0.5,
						textModelId: '',
						imageModelId: '',
						orientation: 'portrait'
					},
					manuscript: {
						rawText: '',
						paragraphs: [],
						remainingText: '',
						history: [],
						future: []
					},
					pages: [
						{
							id: 'page-1',
							index: 1,
							assignedTextBlocks: [],
							imageBlock: null,
							imageBlocks: [],
							imageHistory: [],
							imageLibraryEntries: [],
							canvasJson: null,
							status: 'EMPTY',
							pageType: 'full',
							generationLog: []
						}
					],
					styleGuide: {
						artStyle: '',
						palette: '',
						lighting: '',
						lineQuality: '',
						texture: '',
						cameraRules: '',
						doNotDo: []
					},
					characters: { characters: [], continuityRules: [] },
					continuityMemory: [],
					assets: [],
					coverThumbnail: null,
					lastSavedAt: null,
					referenceImages: [],
					manuscriptAnalysis: null,
					characterDNAs: [],
					styleDNA: null,
					settingDNAs: [],
					pageVisualMemories: []
				};
			}

			function makeDbBook(id) {
				var nowMs = Date.now();
				var proj = makeBookProject(id);
				return {
					id: id,
					title: proj.title,
					data: JSON.stringify(proj),
					created_at: nowMs,
					updated_at: nowMs
				};
			}

			if (cmd === 'load_all_books') {
				// Return DbBook[] (StoryRoot parses .data).
				return Promise.resolve([
					makeDbBook('stub-project')
				]);
			}
			if (cmd === 'get_book') {
				var id = '';
				try { id = args && typeof args.id === 'string' ? args.id : ''; } catch {}
				if (!id) id = 'stub-project';
				// Return DbBook | null (StoryRoot parses .data).
				return Promise.resolve(makeDbBook(id));
			}
			if (cmd === 'get_book_count') return Promise.resolve(1);
			if (cmd === 'save_book' || cmd === 'delete_book') return Promise.resolve(null);

			// Heuristics for unknown commands.
			if (cmd.indexOf('load_') === 0 || cmd.indexOf('list_') === 0 || cmd.indexOf('get_all') !== -1) return Promise.resolve([]);
			if (cmd.indexOf('get_') === 0 || cmd.indexOf('count') !== -1) return Promise.resolve(0);
			if (cmd.indexOf('delete_') === 0 || cmd.indexOf('remove_') === 0 || cmd.indexOf('save_') === 0 || cmd.indexOf('set_') === 0) return Promise.resolve(null);
			return Promise.resolve(null);
		}

		function invoke(cmd, args) {
			var c = safeString(cmd);
			try {
				// Route common plugin commands first.
				if (c.indexOf('plugin:dialog|') === 0) return stubDialog(c, args);
				if (c.indexOf('plugin:fs|') === 0) return stubFs(c);
				if (c.indexOf('plugin:path|') === 0) return stubPath(c, args);

				// Some bundles call path/core helpers without plugin prefix.
				if (c.indexOf('app_data_dir') !== -1 || c.indexOf('appDataDir') !== -1) return stubPath(c, args);
				if (c.indexOf('read_file') !== -1 || c.indexOf('readFile') !== -1 || c.indexOf('exists') !== -1) return stubFs(c);
				if (c.indexOf('message') !== -1 || c.indexOf('confirm') !== -1 || c.indexOf('open') !== -1) return stubDialog(c, args);
			} catch {}

			// Custom app commands.
			try { return stubCustom(c, args); } catch { return Promise.resolve(null); }
		}

		// Tauri v1 globals
		if (!g.__TAURI__) g.__TAURI__ = {};
		if (!g.__TAURI__.invoke) g.__TAURI__.invoke = invoke;
		// Some code expects nested namespaces.
		if (!g.__TAURI__.core) g.__TAURI__.core = {};
		if (!g.__TAURI__.core.invoke) g.__TAURI__.core.invoke = invoke;

		if (!g.__TAURI_IPC__) {
			g.__TAURI_IPC__ = function (payload) {
				try {
					var cmd = payload && (payload.cmd || payload.command);
					var args = payload && (payload.args || payload.payload);
					return invoke(cmd, args);
				} catch {
					return invoke(undefined, undefined);
				}
			};
		}

		if (!g.__TAURI_INVOKE__) g.__TAURI_INVOKE__ = invoke;

		// Tauri v2-ish internals used by some builds
		if (!g.__TAURI_INTERNALS__) g.__TAURI_INTERNALS__ = {};
		// Always override invoke while shim is enabled.
		g.__TAURI_INTERNALS__.invoke = invoke;
		if (!g.__TAURI_INTERNALS__.transformCallback) g.__TAURI_INTERNALS__.transformCallback = function () { return 0; };
		if (!g.__TAURI_INTERNALS__.convertFileSrc) g.__TAURI_INTERNALS__.convertFileSrc = function (p) { return p; };

		// Marker for debugging
		if (!g.__TAURI_METADATA__) g.__TAURI_METADATA__ = {};
		try { g.__TAURI_METADATA__.__liveUiEditorShim = true; } catch {}
	} catch {}
})();
`;
