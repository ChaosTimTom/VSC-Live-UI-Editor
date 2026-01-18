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
exports.loadTargetFile = loadTargetFile;
const vscode = __importStar(require("vscode"));
function isLikelyRenderableFile(uri) {
    return /\.(html?|tsx|jsx)$/i.test(uri.fsPath);
}
async function loadTargetFile() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const active = vscode.window.activeTextEditor?.document;
    if (active && active.uri.scheme === 'file' && isLikelyRenderableFile(active.uri)) {
        const fileId = workspaceFolder
            ? vscode.workspace.asRelativePath(active.uri, false)
            : active.uri.fsPath;
        return { uri: active.uri, fileId, text: active.getText() };
    }
    // Default to sample file if present.
    if (workspaceFolder) {
        const sample = vscode.Uri.joinPath(workspaceFolder.uri, 'sample-ui.html');
        try {
            await vscode.workspace.fs.stat(sample);
            const bytes = await vscode.workspace.fs.readFile(sample);
            return {
                uri: sample,
                fileId: vscode.workspace.asRelativePath(sample, false),
                text: Buffer.from(bytes).toString('utf8')
            };
        }
        catch {
            // ignore
        }
    }
    const selection = await vscode.window.showOpenDialog({
        canSelectMany: false,
        openLabel: 'Render in Live UI',
        filters: {
            'HTML / React': ['html', 'htm', 'tsx', 'jsx']
        }
    });
    const uri = selection?.[0];
    if (!uri)
        return;
    const bytes = await vscode.workspace.fs.readFile(uri);
    const fileId = workspaceFolder ? vscode.workspace.asRelativePath(uri, false) : uri.fsPath;
    return { uri, fileId, text: Buffer.from(bytes).toString('utf8') };
}
//# sourceMappingURL=loadTargetFile.js.map