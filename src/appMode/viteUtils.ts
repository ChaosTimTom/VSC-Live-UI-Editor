import * as vscode from 'vscode';
import * as net from 'net';
import type { AddressInfo } from 'net';
import * as http from 'http';

export type ViteAppCandidate = {
	root: vscode.Uri;
	label: string;
};

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

async function readJson(uri: vscode.Uri): Promise<any | undefined> {
	try {
		const bytes = await vscode.workspace.fs.readFile(uri);
		return JSON.parse(Buffer.from(bytes).toString('utf8'));
	} catch {
		return undefined;
	}
}

export async function findViteAppCandidates(): Promise<ViteAppCandidate[]> {
	const viteConfigs = await vscode.workspace.findFiles(
		'**/vite.config.{ts,js,mjs,cjs}',
		'**/node_modules/**',
		20
	);

	const roots = new Map<string, vscode.Uri>();
	for (const cfg of viteConfigs) {
		const dir = vscode.Uri.joinPath(cfg, '..');
		roots.set(dir.toString(), dir);
	}

	const candidates: ViteAppCandidate[] = [];
	for (const root of roots.values()) {
		const pkgUri = vscode.Uri.joinPath(root, 'package.json');
		if (!(await fileExists(pkgUri))) continue;
		const pkg = await readJson(pkgUri);
		const scripts = pkg?.scripts;
		const hasDevScript = typeof scripts?.dev === 'string';
		if (!hasDevScript) continue;
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
			if (!deps.vite) continue;
			const scripts = pkg?.scripts;
			const hasDevScript = typeof scripts?.dev === 'string';
			if (!hasDevScript) continue;
			const label = vscode.workspace.asRelativePath(root, false);
			candidates.push({ root, label });
		}
	}

	return candidates;
}

export async function pickViteAppRoot(): Promise<vscode.Uri | undefined> {
	const candidates = await findViteAppCandidates();
	if (candidates.length === 0) {
		vscode.window.showErrorMessage('Live UI Editor: Could not find a Vite app (no vite.config.* + package.json with a dev script).');
		return undefined;
	}
	if (candidates.length === 1) return candidates[0].root;

	const pick = await vscode.window.showQuickPick(
		candidates.map(c => ({ label: c.label, description: c.root.fsPath, root: c.root })),
		{ title: 'Pick Vite app root for App Mode' }
	);
	return pick?.root;
}

export async function getFreePort(): Promise<number> {
	return await new Promise((resolve, reject) => {
		const srv = net.createServer();
		srv.unref();
		srv.on('error', reject);
		srv.listen(0, '127.0.0.1', () => {
			const addr = srv.address() as AddressInfo;
			const port = addr.port;
			srv.close(() => resolve(port));
		});
	});
}

function requestOnce(url: string, timeoutMs: number): Promise<boolean> {
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

export async function waitForHttpReady(url: string, timeoutMs = 15000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		const ok = await requestOnce(url, 800);
		if (ok) return true;
		await new Promise(r => setTimeout(r, 250));
	}
	return false;
}

async function workspaceHasFile(glob: string): Promise<boolean> {
	const found = await vscode.workspace.findFiles(glob, '**/node_modules/**', 1);
	return found.length > 0;
}

export async function detectPackageManager(): Promise<'pnpm' | 'yarn' | 'npm'> {
	if (await workspaceHasFile('pnpm-lock.yaml')) return 'pnpm';
	if (await workspaceHasFile('yarn.lock')) return 'yarn';
	return 'npm';
}
