"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startDetachedDevServerWindows = startDetachedDevServerWindows;
const child_process_1 = require("child_process");
function startDetachedDevServerWindows(opts) {
    // Launch in a new console window.
    // Use a single command string so cmd.exe parses start/title/args correctly.
    const title = opts.windowTitle ?? 'Live UI Dev Server';
    // NOTE: Do not use backslash-escaped quotes here; cmd.exe does not treat backslash as an escape.
    // Quote the commandLine so special chars/spaces are handled by cmd /k.
    const cmd = `start "${title}" cmd.exe /k "${opts.commandLine}"`;
    const child = (0, child_process_1.spawn)('cmd.exe', ['/s', '/c', cmd], {
        cwd: opts.cwd,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
    });
    child.on('error', (err) => {
        opts.logger?.(`[devServer:win32:spawn:error] ${String(err)}`);
    });
    child.unref();
    return { pid: child.pid };
}
//# sourceMappingURL=detachedDevServer.js.map