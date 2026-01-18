"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const webviewHtml_1 = require("./webviewHtml");
const messages_1 = require("./bridge/messages");
const robustInjector_1 = require("./injector/robustInjector");
const loadTargetFile_1 = require("./workspace/loadTargetFile");
const CodeModifier_1 = require("./codeModifier/CodeModifier");
const uiWizard_1 = require("./chat/uiWizard");
const webviewAppModeHtml_1 = require("./appMode/webviewAppModeHtml");
const proxyServer_1 = require("./appMode/proxyServer");
const injectedClientScript_1 = require("./appMode/injectedClientScript");
const viteUtils_1 = require("./appMode/viteUtils");
const detachedDevServer_1 = require("./appMode/detachedDevServer");
const cp = __importStar(require("child_process"));
function activate(context) {
    const output = vscode.window.createOutputChannel('Live UI Editor');
    context.subscriptions.push(output);
    const codeModifier = new CodeModifier_1.CodeModifier();
    let currentPanel;
    let currentPanelMode = 'static';
    let currentAppProxy;
    let hotReloadTimer;
    let hotReloadPendingUri;
    let lastLoadedUri;
    let lastLoadedFileId;
    let lastSelected;
    let pendingTargetsRequest;
    const refreshWebviewIfOpen = async (uri) => {
        if (!currentPanel)
            return;
        if (currentPanelMode === 'app')
            return;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const looksAbsolute = /^[A-Za-z]:\\/.test(uri.fsPath) || uri.fsPath.startsWith('\\\\');
        const fileId = looksAbsolute
            ? uri.fsPath
            : (workspaceFolder ? vscode.workspace.asRelativePath(uri, false) : (lastLoadedFileId ?? uri.fsPath));
        const doc = await vscode.workspace.openTextDocument(uri);
        const injected = (0, robustInjector_1.injectSourceMetadataRobust)(doc.getText(), fileId, { cacheKey: uri.toString(), version: doc.version });
        const msg = { command: 'setDocument', file: fileId, html: injected };
        currentPanel.webview.postMessage(msg);
    };
    const normalizePossiblyBundlerPath = (raw) => {
        let s = raw.trim();
        // Common React dev formats from different toolchains.
        s = s.replace(/^webpack:\/\/\/?/i, '');
        s = s.replace(/^vite:\/\/\/?/i, '');
        s = s.replace(/^file:\/\//i, '');
        s = s.replace(/^\/\/+/, '');
        s = s.replace(/^\.\//, '');
        return s;
    };
    const resolveFileIdToUri = (fileId) => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const raw = fileId;
        if (!raw)
            return undefined;
        // file:// URIs
        if (/^file:\/\//i.test(raw)) {
            try {
                return vscode.Uri.parse(raw);
            }
            catch {
                // fall through
            }
        }
        // Absolute Windows path
        if (/^[A-Za-z]:\\/.test(raw) || /^[A-Za-z]:\//.test(raw) || raw.startsWith('\\\\')) {
            const win = raw.replace(/\//g, '\\');
            return vscode.Uri.file(win);
        }
        // Absolute POSIX path (including WSL-like), best effort.
        if (raw.startsWith('/')) {
            return vscode.Uri.file(raw);
        }
        const normalized = normalizePossiblyBundlerPath(raw);
        if (workspaceFolder) {
            return vscode.Uri.joinPath(workspaceFolder.uri, normalized);
        }
        return undefined;
    };
    const scheduleHotReload = (uri) => {
        hotReloadPendingUri = uri;
        if (hotReloadTimer)
            clearTimeout(hotReloadTimer);
        hotReloadTimer = setTimeout(() => {
            const pending = hotReloadPendingUri;
            hotReloadPendingUri = undefined;
            hotReloadTimer = undefined;
            if (!pending)
                return;
            void refreshWebviewIfOpen(pending);
        }, 200);
    };
    const readUtf8 = async (uri) => {
        const data = await vscode.workspace.fs.readFile(uri);
        return Buffer.from(data).toString('utf8');
    };
    const writeUtf8 = async (uri, text) => {
        await vscode.workspace.fs.writeFile(uri, Buffer.from(text, 'utf8'));
    };
    const fileExists = async (uri) => {
        try {
            await vscode.workspace.fs.stat(uri);
            return true;
        }
        catch {
            return false;
        }
    };
    const findViteConfig = async (appRoot) => {
        const candidates = ['vite.config.ts', 'vite.config.mts', 'vite.config.js', 'vite.config.mjs', 'vite.config.cjs'];
        for (const name of candidates) {
            const u = vscode.Uri.joinPath(appRoot, name);
            if (await fileExists(u))
                return u;
        }
        return undefined;
    };
    const runInstallInApp = async (appRoot, pkg) => {
        const pm = await (0, viteUtils_1.detectPackageManager)();
        const cmd = pm === 'pnpm'
            ? `pnpm add -D ${pkg}`
            : pm === 'yarn'
                ? `yarn add -D ${pkg}`
                : `npm install -D ${pkg}`;
        output.appendLine(`[stableIds] Installing ${pkg} using ${pm}...`);
        await new Promise((resolve, reject) => {
            const child = cp.spawn(cmd, {
                cwd: appRoot.fsPath,
                shell: true,
                windowsHide: true,
            });
            child.stdout.on('data', d => output.appendLine(String(d)));
            child.stderr.on('data', d => output.appendLine(String(d)));
            child.on('error', reject);
            child.on('exit', code => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`Install failed with code ${code}`));
            });
        });
    };
    const stableIdsBabelPluginSource = `// Live UI Editor: injected Stable IDs for reliable element targeting (dev only)
// This is a Babel plugin used via @vitejs/plugin-react.

function base64UrlEncode(str) {
	return Buffer.from(String(str), 'utf8')
		.toString('base64')
		.replace(/\\+/g, '-')
		.replace(/\\//g, '_')
		.replace(/=+$/g, '');
}

export default function liveUiEditorBabelPlugin(babel) {
	const t = babel.types;
	let counter = 0;
	return {
		name: 'live-ui-editor-data-lui',
		visitor: {
			JSXOpeningElement(path, state) {
				const node = path.node;
				if (!node || !node.loc) return;
				// Skip if already tagged.
				if (node.attributes && node.attributes.some(a => a && a.type === 'JSXAttribute' && a.name && a.name.name === 'data-lui')) return;

				counter += 1;
				const file = (state && state.file && state.file.opts && state.file.opts.filename) ? String(state.file.opts.filename) : '';
				const payload = JSON.stringify({ f: file, l: node.loc.start.line, c: node.loc.start.column + 1, n: counter });
				const elementId = 'lui:' + base64UrlEncode(payload);
				const attr = t.jsxAttribute(t.jsxIdentifier('data-lui'), t.stringLiteral(elementId));
				node.attributes = [attr, ...(node.attributes || [])];
			}
		}
	};
}
`;
    const enableStableIdsInViteApp = async (appRoot) => {
        const viteConfig = await findViteConfig(appRoot);
        if (!viteConfig) {
            return { ok: false, message: 'Could not find vite.config.(ts/js/mjs/cjs) in the app root.' };
        }
        const pluginFile = vscode.Uri.joinPath(appRoot, 'live-ui-editor.babel-plugin.js');
        if (!(await fileExists(pluginFile))) {
            await writeUtf8(pluginFile, stableIdsBabelPluginSource);
        }
        let configText = await readUtf8(viteConfig);
        const original = configText;
        // Ensure react plugin import (switch from swc if needed)
        if (/@vitejs\/plugin-react-swc/.test(configText)) {
            configText = configText.replace(/@vitejs\/plugin-react-swc/g, '@vitejs/plugin-react');
        }
        if (!/@vitejs\/plugin-react\b/.test(configText)) {
            // Try to add react plugin import near the top.
            configText = `import react from '@vitejs/plugin-react';\n` + configText;
        }
        // Ensure our plugin import
        if (!/live-ui-editor\.babel-plugin\.js/.test(configText)) {
            configText = `import liveUiEditorBabelPlugin from './live-ui-editor.babel-plugin.js';\n` + configText;
        }
        // Patch react() usage inside plugins array (best-effort).
        // 1) Simple react() -> react({ babel: { plugins: [liveUiEditorBabelPlugin] } })
        configText = configText.replace(/\breact\(\s*\)/g, `react({ babel: { plugins: [liveUiEditorBabelPlugin] } })`);
        // 2) If react({ ... }) exists but no babel/plugins, add it at start of the object.
        configText = configText.replace(/\breact\(\s*\{(?![\s\S]*?\bbabel\s*:)([\s\S]*?)\}\s*\)/g, (m, inner) => {
            return `react({ babel: { plugins: [liveUiEditorBabelPlugin] },${inner ? '\n' + inner : ''} })`;
        });
        if (configText !== original) {
            await writeUtf8(viteConfig, configText);
        }
        // Ensure @vitejs/plugin-react is installed so the app still runs.
        const pkgJson = vscode.Uri.joinPath(appRoot, 'package.json');
        if (await fileExists(pkgJson)) {
            try {
                const pkg = JSON.parse(await readUtf8(pkgJson));
                const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
                if (!deps['@vitejs/plugin-react']) {
                    await runInstallInApp(appRoot, '@vitejs/plugin-react');
                }
            }
            catch (err) {
                output.appendLine(`[stableIds] package.json check failed: ${String(err)}`);
            }
        }
        return { ok: true, message: `Stable IDs enabled. Restart your dev server if it was running.` };
    };
    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        if (!currentPanel)
            return;
        if (!lastLoadedUri)
            return;
        if (e.document.uri.toString() !== lastLoadedUri.toString())
            return;
        // Debounced refresh so typing doesn't spam injections.
        scheduleHotReload(lastLoadedUri);
    }));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(doc => {
        if (!currentPanel)
            return;
        if (!lastLoadedUri)
            return;
        if (doc.uri.toString() !== lastLoadedUri.toString())
            return;
        // Immediate refresh on save.
        void refreshWebviewIfOpen(lastLoadedUri);
    }));
    const previewStyleIfOpen = async (file, line, style) => {
        if (!currentPanel)
            return;
        const msg = { command: 'previewStyle', file, line, style };
        currentPanel.webview.postMessage(msg);
    };
    const clearPreviewIfOpen = async () => {
        if (!currentPanel)
            return;
        const msg = { command: 'clearPreview' };
        currentPanel.webview.postMessage(msg);
    };
    const requestTargetsIfOpen = async (selector) => {
        if (!currentPanel)
            return [];
        if (pendingTargetsRequest) {
            clearTimeout(pendingTargetsRequest.timer);
            pendingTargetsRequest.reject(new Error('Superseded by new requestTargets'));
            pendingTargetsRequest = undefined;
        }
        const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
        return await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                pendingTargetsRequest = undefined;
                reject(new Error('Timed out waiting for targetsList'));
            }, 2000);
            pendingTargetsRequest = { requestId, resolve, reject, timer };
            const msg = { command: 'requestTargets', requestId, selector };
            currentPanel.webview.postMessage(msg);
        });
    };
    const getJsxSelectionAtLine = (uri, lineNumber) => codeModifier.getJsxSelection(uri, lineNumber);
    const replaceSelectedJsxAtLine = async (uri, lineNumber, newJsx) => {
        const selection = await codeModifier.getJsxSelection(uri, lineNumber);
        if (!selection)
            return false;
        const doc = await vscode.workspace.openTextDocument(uri);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, selection.range, newJsx);
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied)
            return false;
        await doc.save();
        return true;
    };
    (0, uiWizard_1.registerUiWizard)(context, {
        codeModifier,
        getSelected: () => lastSelected,
        getJsxSelectionAtLine,
        replaceSelectedJsxAtLine,
        refreshWebviewIfOpen,
        previewStyleIfOpen,
        clearPreviewIfOpen,
        requestTargetsIfOpen,
    });
    const disposable = vscode.commands.registerCommand('liveUI.open', async () => {
        const panel = vscode.window.createWebviewPanel('liveUIEditor', 'Live UI Editor', vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')
            ]
        });
        currentPanel = panel;
        currentPanelMode = 'static';
        if (currentAppProxy) {
            void currentAppProxy.close();
            currentAppProxy = undefined;
        }
        panel.onDidDispose(() => {
            if (currentPanel === panel)
                currentPanel = undefined;
        });
        panel.webview.onDidReceiveMessage(async (message) => {
            if (!(0, messages_1.isFromWebviewMessage)(message))
                return;
            if (message.command === 'elementSelected') {
                const targetUri = resolveFileIdToUri(message.file) ?? lastLoadedUri;
                if (!targetUri)
                    return;
                lastSelected = {
                    fileId: message.file,
                    line: message.line,
                    column: message.column,
                    elementId: message.elementId,
                    uri: targetUri,
                    elementContext: message.elementContext,
                    inlineStyle: message.inlineStyle,
                    computedStyle: message.computedStyle,
                };
                return;
            }
            if (message.command === 'targetsList') {
                if (pendingTargetsRequest && pendingTargetsRequest.requestId === message.requestId) {
                    clearTimeout(pendingTargetsRequest.timer);
                    pendingTargetsRequest.resolve(message.targets);
                    pendingTargetsRequest = undefined;
                }
                return;
            }
            if (message.command === 'elementClicked') {
                const targetUri = resolveFileIdToUri(message.file);
                if (!targetUri) {
                    vscode.window.showErrorMessage('Live UI Editor: No folder is open, and the clicked element did not provide an absolute file path.');
                    return;
                }
                const doc = await vscode.workspace.openTextDocument(targetUri);
                const editor = await vscode.window.showTextDocument(doc, { preview: false });
                const line = Math.max(0, message.line - 1);
                const col = typeof message.column === 'number' && Number.isFinite(message.column)
                    ? Math.max(0, message.column - 1)
                    : 0;
                const pos = new vscode.Position(line, col);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            }
            if (message.command === 'updateStyle') {
                output.appendLine(`[updateStyle] ${message.file}:${message.line} ${JSON.stringify(message.style)}`);
                output.show(true);
                try {
                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    const looksAbsolute = /^[A-Za-z]:\\/.test(message.file) || message.file.startsWith('\\\\');
                    const targetUri = looksAbsolute
                        ? vscode.Uri.file(message.file)
                        : (workspaceFolder ? vscode.Uri.joinPath(workspaceFolder.uri, message.file) : lastLoadedUri);
                    if (!targetUri)
                        return;
                    const style = {};
                    if (message.style.width)
                        style.width = message.style.width;
                    if (message.style.height)
                        style.height = message.style.height;
                    if (message.style.transform)
                        style.transform = message.style.transform;
                    const changed = await codeModifier.updateStyle(targetUri, message.line, style, message.column, message.elementContext);
                    if (changed) {
                        const doc = await vscode.workspace.openTextDocument(targetUri);
                        const text = doc.getText();
                        const fileId = looksAbsolute
                            ? targetUri.fsPath
                            : (workspaceFolder ? vscode.workspace.asRelativePath(targetUri, false) : (lastLoadedFileId ?? targetUri.fsPath));
                        const injected = (0, robustInjector_1.injectSourceMetadataRobust)(text, fileId, { cacheKey: targetUri.toString(), version: doc.version });
                        const msg = { command: 'setDocument', file: fileId, html: injected };
                        panel.webview.postMessage(msg);
                    }
                }
                catch (e) {
                    output.appendLine(`[updateStyle:error] ${String(e)}`);
                    vscode.window.showErrorMessage('Live UI Editor: Failed to apply resize to source. See Output → Live UI Editor.');
                }
            }
            if (message.command === 'updateText') {
                try {
                    const targetUri = resolveFileIdToUri(message.file);
                    if (!targetUri)
                        return;
                    const changed = await codeModifier.updateText(targetUri, message.line, message.text, message.column, message.elementContext);
                    if (!changed) {
                        vscode.window.showInformationMessage('Live UI Editor: No text change applied (unsupported target or identical text).');
                    }
                }
                catch (e) {
                    output.appendLine(`[updateText:error] ${String(e)}`);
                    vscode.window.showErrorMessage('Live UI Editor: Failed to apply text edit to source. See Output → Live UI Editor.');
                }
            }
        });
        panel.webview.html = await (0, webviewHtml_1.getWebviewHtml)(panel.webview, context.extensionUri);
        const loaded = await (0, loadTargetFile_1.loadTargetFile)();
        if (loaded) {
            lastLoadedUri = loaded.uri;
            lastLoadedFileId = loaded.fileId;
            // Prefer reading via VS Code so we have a document version for injector caching.
            const doc = await vscode.workspace.openTextDocument(loaded.uri);
            const injected = (0, robustInjector_1.injectSourceMetadataRobust)(doc.getText(), loaded.fileId, { cacheKey: loaded.uri.toString(), version: doc.version });
            const msg = {
                command: 'setDocument',
                file: loaded.fileId,
                html: injected
            };
            panel.webview.postMessage(msg);
        }
        else {
            vscode.window.showInformationMessage('Live UI Editor: No file selected to render.');
        }
    });
    const disposableAppMode = vscode.commands.registerCommand('liveUI.openAppMode', async () => {
        const appRoot = await (0, viteUtils_1.pickViteAppRoot)();
        if (!appRoot)
            return;
        const pkgManager = await (0, viteUtils_1.detectPackageManager)();
        const port = await (0, viteUtils_1.getFreePort)();
        const host = '127.0.0.1';
        let origin = `http://${host}:${port}`;
        const devCommand = process.platform === 'win32'
            ? `npm run dev -- --host ${host} --port ${port} --strictPort`
            : pkgManager === 'pnpm'
                ? `pnpm dev -- --host ${host} --port ${port} --strictPort`
                : pkgManager === 'yarn'
                    ? `yarn dev --host ${host} --port ${port} --strictPort`
                    : `npm run dev -- --host ${host} --port ${port} --strictPort`;
        // Let the user choose launch mode up-front (especially important on Windows).
        let launchMode = 'integrated';
        if (process.platform === 'win32') {
            const pick = await vscode.window.showQuickPick([
                { label: 'External window', description: 'Start dev server in a separate cmd window', value: 'external' },
                { label: 'Integrated terminal', description: 'Start dev server in VS Code terminal', value: 'integrated' },
                { label: 'Use existing URL', description: 'I already have the dev server running', value: 'existing' },
            ], { title: 'Live UI Editor (App Mode): Start dev server how?' });
            if (!pick)
                return;
            launchMode = pick.value;
        }
        else {
            launchMode = 'integrated';
        }
        if (launchMode === 'external') {
            const launched = (0, detachedDevServer_1.startDetachedDevServerWindows)({
                cwd: appRoot.fsPath,
                commandLine: devCommand,
                windowTitle: 'Live UI App Mode Dev Server',
                logger: (line) => output.appendLine(line),
            });
            output.appendLine(`[appMode] win32 detached pid=${launched.pid ?? 'unknown'}`);
            vscode.window.showInformationMessage('Live UI Editor (App Mode): Started dev server in an external window.');
        }
        else if (launchMode === 'integrated') {
            const termName = 'Live UI App Mode: Dev Server';
            let term = vscode.window.terminals.find(t => t.name === termName);
            if (!term)
                term = vscode.window.createTerminal({ name: termName, cwd: appRoot.fsPath });
            term.show(true);
            term.sendText(devCommand, true);
        }
        else {
            const url = await vscode.window.showInputBox({
                prompt: 'Enter existing dev server URL (e.g. http://127.0.0.1:5173)',
                value: origin,
                ignoreFocusOut: true,
            });
            if (!url)
                return;
            origin = url;
        }
        output.appendLine(`[appMode] Starting dev server at ${origin}`);
        output.appendLine(`[appMode] cwd=${appRoot.fsPath}`);
        output.appendLine(`[appMode] cmd=${devCommand}`);
        output.show(true);
        let ready = await (0, viteUtils_1.waitForHttpReady)(origin, launchMode === 'integrated' ? 60000 : 45000);
        if (!ready) {
            const pick = await vscode.window.showErrorMessage(`Live UI Editor: Timed out waiting for dev server at ${origin}.`, { modal: false }, 'Retry', 'Start in Integrated Terminal', 'Use Existing URL', 'Copy Command');
            if (pick === 'Copy Command') {
                await vscode.env.clipboard.writeText(devCommand);
                vscode.window.showInformationMessage('Live UI Editor: Dev server command copied to clipboard.');
                return;
            }
            if (pick === 'Use Existing URL') {
                const url = await vscode.window.showInputBox({
                    prompt: 'Enter existing dev server URL (e.g. http://127.0.0.1:5173)',
                    value: origin,
                    ignoreFocusOut: true,
                });
                if (!url)
                    return;
                ready = await (0, viteUtils_1.waitForHttpReady)(url, 15000);
                if (!ready) {
                    vscode.window.showErrorMessage(`Live UI Editor: Could not reach ${url}.`);
                    return;
                }
                // Override origin for proxy target
                origin = url;
            }
            if (pick === 'Start in Integrated Terminal') {
                const termName = 'Live UI App Mode: Dev Server';
                let term = vscode.window.terminals.find(t => t.name === termName);
                if (!term)
                    term = vscode.window.createTerminal({ name: termName, cwd: appRoot.fsPath });
                term.show(true);
                term.sendText(devCommand, true);
                ready = await (0, viteUtils_1.waitForHttpReady)(origin, 60000);
            }
            if (pick === 'Retry') {
                ready = await (0, viteUtils_1.waitForHttpReady)(origin, 60000);
            }
            if (!ready) {
                vscode.window.showErrorMessage(`Live UI Editor: Dev server still not reachable at ${origin}. Check Output → Live UI Editor for cmd/cwd.`);
                return;
            }
        }
        if (currentAppProxy) {
            await currentAppProxy.close();
            currentAppProxy = undefined;
        }
        currentAppProxy = await (0, proxyServer_1.startInjectedProxyServer)({
            targetOrigin: origin,
            injectedScript: injectedClientScript_1.injectedClientScript,
            logger: (line) => { output.appendLine(line); },
        });
        let panel;
        currentPanelMode = 'app';
        const pendingEdits = new Map();
        let layoutApplyEnabled = false;
        let warnedLayoutApplyBlocked = false;
        function pendingKey(e) {
            if (typeof e.elementId === 'string' && e.elementId) {
                return [e.kind, e.file, e.elementId].join('|');
            }
            const ctx = e.elementContext || {};
            const cls = Array.isArray(ctx.classList) ? ctx.classList.join('.') : '';
            const id = typeof ctx.id === 'string' ? ctx.id : '';
            const tag = typeof ctx.tagName === 'string' ? ctx.tagName : '';
            const txt = typeof ctx.text === 'string' ? ctx.text.slice(0, 40) : '';
            return [e.kind, e.file, String(e.line), String(e.column ?? 0), tag, id, cls, txt].join('|');
        }
        function publishPendingCount() {
            try {
                panel?.webview.postMessage({ command: 'appModePendingCount', count: pendingEdits.size });
            }
            catch { }
        }
        async function applyPendingEditsToCode() {
            if (pendingEdits.size === 0)
                return { applied: 0, failed: 0, skipped: 0, items: [] };
            const edits = Array.from(pendingEdits.values());
            // CRITICAL: Group edits by file, then sort by line number DESCENDING within each file.
            // This ensures we apply edits from bottom to top, so earlier edits don't shift
            // the line numbers of later edits.
            const editsByFile = new Map();
            for (const e of edits) {
                const key = e.file;
                if (!editsByFile.has(key))
                    editsByFile.set(key, []);
                editsByFile.get(key).push(e);
            }
            // Sort each file's edits by line descending (apply bottom-up)
            for (const fileEdits of editsByFile.values()) {
                fileEdits.sort((a, b) => (b.line - a.line) || ((b.column ?? 0) - (a.column ?? 0)));
            }
            let appliedCount = 0;
            let failedCount = 0;
            let skippedCount = 0;
            const items = [];
            // Process one file at a time
            for (const [fileId, fileEdits] of editsByFile) {
                const targetUri = resolveFileIdToUri(fileId);
                if (!targetUri) {
                    for (const e of fileEdits) {
                        items.push({
                            kind: e.kind,
                            file: e.file,
                            line: e.line,
                            column: e.column,
                            elementId: e.elementId,
                            ok: false,
                            reason: 'resolveFileIdToUri failed',
                        });
                        failedCount++;
                    }
                    continue;
                }
                // Apply each edit in this file (already sorted bottom-to-top)
                for (const e of fileEdits) {
                    const base = {
                        kind: e.kind,
                        file: e.file,
                        line: e.line,
                        column: e.column,
                        elementId: e.elementId,
                        ok: false,
                    };
                    try {
                        if (e.kind === 'style') {
                            // Pass through all style properties from the pending edit.
                            const style = {};
                            for (const [k, v] of Object.entries(e.style)) {
                                if (typeof v === 'string' && v)
                                    style[k] = v;
                            }
                            if (Object.keys(style).length === 0) {
                                // Nothing to apply (e.g. layout changes were filtered out).
                                items.push({ ...base, ok: false, reason: 'skipped (empty style patch)' });
                                skippedCount++;
                                continue;
                            }
                            let changed = false;
                            let method;
                            // elementId-based apply only works if the source actually contains data-lui.
                            // In Vite, our Stable IDs are injected at build-time, so source often won't include it.
                            if (e.elementId && typeof codeModifier.updateStyleByElementId === 'function') {
                                changed = await codeModifier.updateStyleByElementId(targetUri, e.elementId, style);
                                if (changed)
                                    method = 'elementId';
                            }
                            if (!changed) {
                                changed = await codeModifier.updateStyle(targetUri, e.line, style, e.column, e.elementContext);
                                if (changed)
                                    method = 'location';
                            }
                            if (changed) {
                                items.push({ ...base, ok: true, method });
                                appliedCount++;
                            }
                            else {
                                items.push({ ...base, ok: false, method, reason: 'no change (node not found or identical value)' });
                                failedCount++;
                            }
                        }
                        else {
                            let changed = false;
                            let method;
                            let i18nInfo = {};
                            if (e.elementId && typeof codeModifier.updateTextByElementId === 'function') {
                                changed = await codeModifier.updateTextByElementId(targetUri, e.elementId, e.text);
                                if (changed)
                                    method = 'elementId';
                            }
                            if (!changed) {
                                // Try the i18n-aware update first
                                const result = await codeModifier.updateTextWithI18n(targetUri, e.line, e.text, e.column, e.elementContext);
                                changed = result.changed;
                                if (changed)
                                    method = 'location';
                                if (result.i18nKey) {
                                    i18nInfo = { key: result.i18nKey, file: result.i18nFile };
                                }
                                if (result.reason === 'i18n-updated') {
                                    output.appendLine(`[appMode:apply:i18n] Updated "${result.i18nKey}" in ${result.i18nFile}`);
                                }
                                else if (result.reason === 'i18n-detected-but-not-found') {
                                    items.push({ ...base, ok: false, method, reason: `i18n key "${result.i18nKey}" not found in translation files` });
                                    failedCount++;
                                    continue;
                                }
                            }
                            if (changed) {
                                items.push({ ...base, ok: true, method });
                                appliedCount++;
                            }
                            else {
                                items.push({ ...base, ok: false, method, reason: 'no change (node not found or identical value)' });
                                failedCount++;
                            }
                        }
                    }
                    catch (err) {
                        output.appendLine(`[appMode:apply:error] ${String(err)}`);
                        items.push({ ...base, ok: false, error: String(err) });
                        failedCount++;
                    }
                }
            }
            pendingEdits.clear();
            publishPendingCount();
            return { applied: appliedCount, failed: failedCount, skipped: skippedCount, items };
        }
        function createAppModePanel() {
            const created = vscode.window.createWebviewPanel('liveUIAppMode', 'Live UI Editor — App Mode', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
            panel = created;
            currentPanel = created;
            created.webview.html = (0, webviewAppModeHtml_1.getAppModeWebviewHtml)(created.webview, {
                iframeUrl: currentAppProxy.proxyOrigin,
                appLabel: vscode.workspace.asRelativePath(appRoot, false),
            });
            publishPendingCount();
            created.onDidDispose(() => {
                if (currentPanel === created)
                    currentPanel = undefined;
                panel = undefined;
                if (pendingEdits.size > 0) {
                    void (async () => {
                        const choice = await vscode.window.showWarningMessage(`Live UI Editor (App Mode): You have ${pendingEdits.size} pending edit(s).`, { modal: true }, 'Apply', 'Discard', 'Cancel');
                        if (choice === 'Apply') {
                            const res = await applyPendingEditsToCode();
                            vscode.window.showInformationMessage(`Live UI Editor (App Mode): Applied ${res.applied} edit(s)${res.failed ? `, ${res.failed} not applied` : ''}.`);
                        }
                        else if (choice === 'Discard') {
                            pendingEdits.clear();
                        }
                        else {
                            // Can't actually cancel disposal; reopen the panel to preserve the session.
                            if (currentAppProxy) {
                                createAppModePanel();
                                return;
                            }
                        }
                        // Session ends here.
                        if (currentAppProxy) {
                            await currentAppProxy.close();
                            currentAppProxy = undefined;
                        }
                    })();
                    return;
                }
                if (currentAppProxy) {
                    void currentAppProxy.close();
                    currentAppProxy = undefined;
                }
            });
            created.webview.onDidReceiveMessage(async (message) => {
                if (!(0, messages_1.isFromWebviewMessage)(message))
                    return;
                if (message.command === 'enableStableIds') {
                    try {
                        const confirm = await vscode.window.showWarningMessage('Live UI Editor can enable Stable IDs by modifying your Vite config and adding a small dev-only plugin file. This makes targeting reliable. Proceed?', { modal: true }, 'Enable', 'Cancel');
                        if (confirm !== 'Enable') {
                            try {
                                created.webview.postMessage({ command: 'appModeStableIdsResult', ok: false });
                            }
                            catch { }
                            return;
                        }
                        const res = await enableStableIdsInViteApp(appRoot);
                        if (res.ok)
                            vscode.window.showInformationMessage(res.message);
                        else
                            vscode.window.showErrorMessage(`Live UI Editor: ${res.message}`);
                        try {
                            created.webview.postMessage({ command: 'appModeStableIdsResult', ok: res.ok, message: res.message });
                        }
                        catch { }
                    }
                    catch (err) {
                        output.appendLine(`[stableIds:error] ${String(err)}`);
                        vscode.window.showErrorMessage('Live UI Editor: Failed to enable Stable IDs. Check Output → Live UI Editor.');
                        try {
                            created.webview.postMessage({ command: 'appModeStableIdsResult', ok: false });
                        }
                        catch { }
                    }
                    return;
                }
                if (message.command === 'setLayoutApply') {
                    layoutApplyEnabled = message.enabled;
                    output.appendLine(`[appMode] layoutApplyEnabled=${layoutApplyEnabled}`);
                    return;
                }
                if (message.command === 'applyPendingEdits') {
                    const res = await applyPendingEditsToCode();
                    try {
                        created.webview.postMessage({
                            command: 'appModeApplyReport',
                            applied: res.applied,
                            failed: res.failed,
                            skipped: res.skipped,
                            items: res.items,
                        });
                    }
                    catch { }
                    try {
                        const short = res.items
                            .filter(i => !i.ok)
                            .slice(0, 12)
                            .map(i => `${i.kind} ${i.file}:${i.line}${i.method ? ` (${i.method})` : ''} - ${i.error || i.reason || 'failed'}`)
                            .join('\n');
                        output.appendLine(`[appMode:apply] applied=${res.applied} failed=${res.failed} skipped=${res.skipped}`);
                        if (short)
                            output.appendLine(`[appMode:apply:details]\n${short}`);
                    }
                    catch { }
                    vscode.window.showInformationMessage(`Live UI Editor (App Mode): Applied ${res.applied} edit(s) to code${res.skipped ? `, ${res.skipped} skipped` : ''}${res.failed ? `, ${res.failed} not applied` : ''}.`);
                    return;
                }
                if (message.command === 'discardPendingEdits') {
                    pendingEdits.clear();
                    publishPendingCount();
                    try {
                        created.webview.postMessage({ command: 'appModeReload' });
                    }
                    catch { }
                    return;
                }
                if (message.command === 'elementSelected') {
                    const targetUri = resolveFileIdToUri(message.file);
                    if (!targetUri)
                        return;
                    lastSelected = {
                        fileId: message.file,
                        line: message.line,
                        column: message.column,
                        elementId: message.elementId,
                        uri: targetUri,
                        elementContext: message.elementContext,
                        inlineStyle: message.inlineStyle,
                        computedStyle: message.computedStyle,
                    };
                    return;
                }
                if (message.command === 'elementClicked') {
                    const targetUri = resolveFileIdToUri(message.file);
                    if (!targetUri)
                        return;
                    const doc = await vscode.workspace.openTextDocument(targetUri);
                    const editor = await vscode.window.showTextDocument(doc, { preview: false });
                    const line = Math.max(0, message.line - 1);
                    const col = typeof message.column === 'number' && Number.isFinite(message.column)
                        ? Math.max(0, message.column - 1)
                        : 0;
                    const pos = new vscode.Position(line, col);
                    editor.selection = new vscode.Selection(pos, pos);
                    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
                    return;
                }
                if (message.command === 'targetsList') {
                    if (pendingTargetsRequest && pendingTargetsRequest.requestId === message.requestId) {
                        clearTimeout(pendingTargetsRequest.timer);
                        pendingTargetsRequest.resolve(message.targets);
                        pendingTargetsRequest = undefined;
                    }
                    return;
                }
                if (message.command === 'updateStyle') {
                    // Guardrail: by default, don't persist layout changes from drag/resize.
                    const nextStyle = { ...message.style };
                    if (!layoutApplyEnabled) {
                        delete nextStyle.width;
                        delete nextStyle.height;
                        delete nextStyle.transform;
                        if (Object.keys(nextStyle).length === 0) {
                            if (!warnedLayoutApplyBlocked) {
                                warnedLayoutApplyBlocked = true;
                                vscode.window.showWarningMessage('Live UI Editor (App Mode): Layout Apply is OFF, so drag/resize changes are not saved to code. Enable “Layout Apply” to persist width/height/transform.');
                            }
                            return;
                        }
                    }
                    const edit = {
                        kind: 'style',
                        file: message.file,
                        line: message.line,
                        column: message.column,
                        elementId: message.elementId,
                        elementContext: message.elementContext,
                        style: nextStyle,
                    };
                    const key = pendingKey(edit);
                    const existing = pendingEdits.get(key);
                    if (existing && existing.kind === 'style') {
                        existing.style = { ...existing.style, ...edit.style };
                        pendingEdits.set(key, existing);
                    }
                    else {
                        pendingEdits.set(key, edit);
                    }
                    publishPendingCount();
                    return;
                }
                if (message.command === 'updateText') {
                    const edit = {
                        kind: 'text',
                        file: message.file,
                        line: message.line,
                        column: message.column,
                        elementId: message.elementId,
                        elementContext: message.elementContext,
                        text: message.text,
                    };
                    pendingEdits.set(pendingKey(edit), edit);
                    publishPendingCount();
                    return;
                }
                if (message.command === 'deleteElement') {
                    output.appendLine(`[deleteElement] ${message.file}:${message.line}`);
                    try {
                        const targetUri = resolveFileIdToUri(message.file);
                        if (!targetUri) {
                            vscode.window.showErrorMessage('Live UI Editor: Could not resolve file path for deletion.');
                            return;
                        }
                        const deleted = await codeModifier.deleteElement(targetUri, message.line, message.column, message.elementContext);
                        if (deleted) {
                            vscode.window.showInformationMessage('Live UI Editor: Element deleted from source.');
                            // Reload the iframe to reflect the change
                            try {
                                created.webview.postMessage({ command: 'appModeReload' });
                            }
                            catch { }
                        }
                        else {
                            vscode.window.showWarningMessage('Live UI Editor: Could not find element to delete at that location.');
                        }
                    }
                    catch (err) {
                        output.appendLine(`[deleteElement:error] ${String(err)}`);
                        vscode.window.showErrorMessage(`Live UI Editor: Failed to delete element. ${String(err)}`);
                    }
                    return;
                }
            });
            return created;
        }
        // Create the initial panel.
        createAppModePanel();
    });
    context.subscriptions.push(disposable);
    context.subscriptions.push(disposableAppMode);
}
function deactivate() { }
//# sourceMappingURL=extension.js.map