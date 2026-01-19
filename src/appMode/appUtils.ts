import * as vscode from 'vscode';

export type AppFramework = 'vite' | 'next';

export type AppCandidate = {
	root: vscode.Uri;
	label: string;
	framework: AppFramework;
	isTauri?: boolean;
};

async function detectTauri(root: vscode.Uri): Promise<boolean> {
	// Typical Tauri layout for web+tauri monorepos.
	const tauriCfg = vscode.Uri.joinPath(root, 'src-tauri', 'tauri.conf.json');
	return await fileExists(tauriCfg);
}

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

async function findRootsByConfig(glob: string): Promise<vscode.Uri[]> {
	const configs = await vscode.workspace.findFiles(glob, '**/node_modules/**', 30);
	const roots = new Map<string, vscode.Uri>();
	for (const cfg of configs) {
		const dir = vscode.Uri.joinPath(cfg, '..');
		roots.set(dir.toString(), dir);
	}
	return [...roots.values()];
}

export async function findViteAppCandidates(): Promise<AppCandidate[]> {
	const roots = await findRootsByConfig('**/vite.config.{ts,js,mjs,cjs,mts,cts}');
	const candidates: AppCandidate[] = [];
	for (const root of roots) {
		const pkgUri = vscode.Uri.joinPath(root, 'package.json');
		if (!(await fileExists(pkgUri))) continue;
		const pkg = await readJson(pkgUri);
		const scripts = pkg?.scripts;
		const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
		const hasDevScript = typeof scripts?.dev === 'string';
		if (!hasDevScript) continue;
		// Prefer real Vite apps.
		if (!deps.vite && !deps['@vitejs/plugin-react'] && !deps['@vitejs/plugin-react-swc']) continue;
		const label = vscode.workspace.asRelativePath(root, false);
		candidates.push({ root, label, framework: 'vite', isTauri: await detectTauri(root) });
	}

	// Fallback: package.json mentions vite (monorepos without vite.config at root).
	if (candidates.length === 0) {
		const pkgs = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 60);
		for (const pkgUri of pkgs) {
			const root = vscode.Uri.joinPath(pkgUri, '..');
			const pkg = await readJson(pkgUri);
			const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
			if (!deps.vite) continue;
			const scripts = pkg?.scripts;
			const hasDevScript = typeof scripts?.dev === 'string';
			if (!hasDevScript) continue;
			const label = vscode.workspace.asRelativePath(root, false);
			candidates.push({ root, label, framework: 'vite', isTauri: await detectTauri(root) });
		}
	}

	return candidates;
}

export async function findNextAppCandidates(): Promise<AppCandidate[]> {
	const roots = await findRootsByConfig('**/next.config.{js,mjs,cjs,ts}');
	const candidates: AppCandidate[] = [];

	for (const root of roots) {
		const pkgUri = vscode.Uri.joinPath(root, 'package.json');
		if (!(await fileExists(pkgUri))) continue;
		const pkg = await readJson(pkgUri);
		const scripts = pkg?.scripts;
		const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
		const hasDevScript = typeof scripts?.dev === 'string';
		if (!hasDevScript) continue;
		if (!deps.next) continue;
		const label = vscode.workspace.asRelativePath(root, false);
		candidates.push({ root, label, framework: 'next', isTauri: await detectTauri(root) });
	}

	// Fallback: package.json mentions next.
	if (candidates.length === 0) {
		const pkgs = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 60);
		for (const pkgUri of pkgs) {
			const root = vscode.Uri.joinPath(pkgUri, '..');
			const pkg = await readJson(pkgUri);
			const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
			if (!deps.next) continue;
			const scripts = pkg?.scripts;
			const hasDevScript = typeof scripts?.dev === 'string';
			if (!hasDevScript) continue;
			const label = vscode.workspace.asRelativePath(root, false);
			candidates.push({ root, label, framework: 'next', isTauri: await detectTauri(root) });
		}
	}

	return candidates;
}

export async function pickAppCandidate(): Promise<AppCandidate | undefined> {
	const [vite, next] = await Promise.all([findViteAppCandidates(), findNextAppCandidates()]);
	const candidates = [...vite, ...next];
	if (candidates.length === 0) {
		vscode.window.showErrorMessage('Live UI Editor: Could not find a supported app (Vite or Next.js) with a dev script.');
		return undefined;
	}
	if (candidates.length === 1) return candidates[0];

	const pick = await vscode.window.showQuickPick(
		candidates.map(c => ({
			label: c.label || c.root.fsPath,
			description: `${c.framework.toUpperCase()} • ${c.root.fsPath}`,
			candidate: c,
		})),
		{ title: 'Pick app root for Live UI Editor (App Mode)' }
	);
	return pick?.candidate;
}
