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
exports.getWebviewHtml = getWebviewHtml;
const vscode = __importStar(require("vscode"));
function getNonce() {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
        nonce += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return nonce;
}
function rewriteAssetUris(html, webview, distRoot) {
    // Rewrites relative asset URLs (e.g. assets/foo.js) into webview-safe URIs.
    return html.replace(/(src|href)="([^"]+)"/g, (_m, attr, rawValue) => {
        // Handle Vite outputs like "./assets/...", "assets/...", or "/assets/...".
        let relPath;
        if (rawValue.startsWith('./assets/'))
            relPath = rawValue.slice(2);
        else if (rawValue.startsWith('assets/'))
            relPath = rawValue;
        else if (rawValue.startsWith('/assets/'))
            relPath = rawValue.slice(1);
        if (!relPath)
            return `${attr}="${rawValue}"`;
        const onDisk = vscode.Uri.joinPath(distRoot, relPath);
        const asWebview = webview.asWebviewUri(onDisk);
        return `${attr}="${asWebview}"`;
    });
}
function injectNonceIntoScripts(html, nonce) {
    // Add nonce to any script tags produced by Vite.
    return html.replace(/<script\b([^>]*)>/g, (m) => {
        if (m.includes(' nonce='))
            return m;
        return m.replace('<script', `<script nonce="${nonce}"`);
    });
}
function injectCsp(html, webview, nonce) {
    const csp = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} https: data:`,
        // react-moveable injects runtime <style> tags; allow inline styles in the webview.
        `style-src ${webview.cspSource} 'unsafe-inline'`,
        `script-src 'nonce-${nonce}'`
    ].join('; ');
    if (html.includes('http-equiv="Content-Security-Policy"')) {
        return html;
    }
    return html.replace(/<head>/i, `<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`);
}
async function getWebviewHtml(webview, extensionUri) {
    const nonce = getNonce();
    const distRoot = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist');
    const indexUri = vscode.Uri.joinPath(distRoot, 'index.html');
    const bytes = await vscode.workspace.fs.readFile(indexUri);
    let html = Buffer.from(bytes).toString('utf8');
    html = rewriteAssetUris(html, webview, distRoot);
    html = injectNonceIntoScripts(html, nonce);
    html = injectCsp(html, webview, nonce);
    return html;
}
//# sourceMappingURL=webviewHtml.js.map