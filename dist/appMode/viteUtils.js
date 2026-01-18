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
exports.findViteAppCandidates = findViteAppCandidates;
exports.pickViteAppRoot = pickViteAppRoot;
exports.getFreePort = getFreePort;
exports.waitForHttpReady = waitForHttpReady;
exports.detectPackageManager = detectPackageManager;
const vscode = __importStar(require("vscode"));
const net = __importStar(require("net"));
const http = __importStar(require("http"));
async function fileExists(uri) {
    try {
        await vscode.workspace.fs.stat(uri);
        return true;
    }
    catch {
        return false;
    }
}
async function readJson(uri) {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return JSON.parse(Buffer.from(bytes).toString('utf8'));
    }
    catch {
        return undefined;
    }
}
async function findViteAppCandidates() {
    const viteConfigs = await vscode.workspace.findFiles('**/vite.config.{ts,js,mjs,cjs}', '**/node_modules/**', 20);
    const roots = new Map();
    for (const cfg of viteConfigs) {
        const dir = vscode.Uri.joinPath(cfg, '..');
        roots.set(dir.toString(), dir);
    }
    const candidates = [];
    for (const root of roots.values()) {
        const pkgUri = vscode.Uri.joinPath(root, 'package.json');
        if (!(await fileExists(pkgUri)))
            continue;
        const pkg = await readJson(pkgUri);
        const scripts = pkg?.scripts;
        const hasDevScript = typeof scripts?.dev === 'string';
        if (!hasDevScript)
            continue;
        const label = vscode.workspace.asRelativePath(root, false);
        candidates.push({ root, label });
    }
    // Fallback: if no vite.config, still try roots with package.json that mentions vite.
    if (candidates.length === 0) {
        const pkgs = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 50);
        for (const pkgUri of pkgs) {
            const root = vscode.Uri.joinPath(pkgUri, '..');
            const pkg = await readJson(pkgUri);
            const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
            if (!deps.vite)
                continue;
            const scripts = pkg?.scripts;
            const hasDevScript = typeof scripts?.dev === 'string';
            if (!hasDevScript)
                continue;
            const label = vscode.workspace.asRelativePath(root, false);
            candidates.push({ root, label });
        }
    }
    return candidates;
}
async function pickViteAppRoot() {
    const candidates = await findViteAppCandidates();
    if (candidates.length === 0) {
        vscode.window.showErrorMessage('Live UI Editor: Could not find a Vite app (no vite.config.* + package.json with a dev script).');
        return undefined;
    }
    if (candidates.length === 1)
        return candidates[0].root;
    const pick = await vscode.window.showQuickPick(candidates.map(c => ({ label: c.label, description: c.root.fsPath, root: c.root })), { title: 'Pick Vite app root for App Mode' });
    return pick?.root;
}
async function getFreePort() {
    return await new Promise((resolve, reject) => {
        const srv = net.createServer();
        srv.unref();
        srv.on('error', reject);
        srv.listen(0, '127.0.0.1', () => {
            const addr = srv.address();
            const port = addr.port;
            srv.close(() => resolve(port));
        });
    });
}
function requestOnce(url, timeoutMs) {
    return new Promise((resolve) => {
        const req = http.get(url, (res) => {
            res.resume();
            resolve((res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 500);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve(false);
        });
    });
}
async function waitForHttpReady(url, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const ok = await requestOnce(url, 800);
        if (ok)
            return true;
        await new Promise(r => setTimeout(r, 250));
    }
    return false;
}
async function workspaceHasFile(glob) {
    const found = await vscode.workspace.findFiles(glob, '**/node_modules/**', 1);
    return found.length > 0;
}
async function detectPackageManager() {
    if (await workspaceHasFile('pnpm-lock.yaml'))
        return 'pnpm';
    if (await workspaceHasFile('yarn.lock'))
        return 'yarn';
    return 'npm';
}
//# sourceMappingURL=viteUtils.js.map