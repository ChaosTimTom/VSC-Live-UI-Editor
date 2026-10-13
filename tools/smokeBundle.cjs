// Load the production bundle with a minimal extension-host surface. This catches
// missing bundled modules and verifies command/chat registration without a UI.
const assert = require('node:assert/strict');
const Module = require('node:module');
const registered = new Map();
const disposable = () => ({ dispose() {} });
const api = {
  commands: { registerCommand: (name, fn) => { registered.set(name, fn); return disposable(); } },
  window: { createOutputChannel: () => ({ ...disposable(), appendLine() {} }) },
  workspace: {
    workspaceFolders: [],
    onDidChangeTextDocument: disposable,
    onDidSaveTextDocument: disposable,
    registerTextDocumentContentProvider: disposable,
  },
  chat: { createChatParticipant: (name) => { registered.set(name, true); return disposable(); } },
};
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  return name === 'vscode' ? api : originalLoad.call(this, name, ...args);
};
try {
  const extension = require('../dist/extension.js');
  extension.activate({ subscriptions: [], workspaceState: { get() {}, update: async () => {} } });
  for (const command of ['liveUI.open', 'liveUI.openAppMode', 'liveUI.redesignPage', 'liveUI.reviewPageRedesign', 'live-ui.ui-wizard']) {
    assert(registered.has(command), `Missing registration: ${command}`);
  }
  console.log(`Production bundle activated on ${process.version}; all editor and chat commands registered.`);
} finally {
  Module._load = originalLoad;
}
