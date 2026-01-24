import * as vscode from 'vscode';

export type AppFramework =
	| 'vite'
	| 'next'
	| 'cra'
	| 'astro'
	| 'sveltekit'
	| 'angular'
	| 'vue'
	| 'nuxt'
	| 'gatsby'
	| 'remix'
	| 'generic';

export type AppCandidate = {
	root: vscode.Uri;
	label: string;
	framework: AppFramework;
	isTauri?: boolean;
	devScript?: 'dev' | 'start';
};

function detectFrameworkFromPkg(pkg: any): AppFramework {
	const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) } as Record<string, unknown>;
	const has = (name: string) => Object.prototype.hasOwnProperty.call(deps, name);
	if (has('next')) return 'next';
	if (has('vite') || has('@vitejs/plugin-react') || has('@vitejs/plugin-react-swc')) return 'vite';
	if (has('react-scripts')) return 'cra';
	if (has('astro')) return 'astro';
	if (has('@sveltejs/kit')) return 'sveltekit';
	if (has('@angular/core')) return 'angular';
	if (has('@vue/cli-service')) return 'vue';
	if (has('nuxt')) return 'nuxt';
	if (has('gatsby')) return 'gatsby';
	if (has('@remix-run/dev') || has('remix')) return 'remix';
	return 'generic';
}

function detectDevScript(pkg: any): 'dev' | 'start' | undefined {
	const scripts = (pkg && typeof pkg === 'object' && pkg.scripts && typeof pkg.scripts === 'object')
		? (pkg.scripts as Record<string, unknown>)
		: {};
	if (typeof scripts.dev === 'string' && scripts.dev.trim()) return 'dev';
	if (typeof scripts.start === 'string' && scripts.start.trim()) return 'start';
	return undefined;
}

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
		candidates.push({ root, label, framework: 'vite', isTauri: await detectTauri(root), devScript: 'dev' });
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
			candidates.push({ root, label, framework: 'vite', isTauri: await detectTauri(root), devScript: 'dev' });
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
		candidates.push({ root, label, framework: 'next', isTauri: await detectTauri(root), devScript: 'dev' });
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
			candidates.push({ root, label, framework: 'next', isTauri: await detectTauri(root), devScript: 'dev' });
		}
	}

	return candidates;
}

export async function findGenericAppCandidates(): Promise<AppCandidate[]> {
	const pkgs = await vscode.workspace.findFiles('**/package.json', '**/node_modules/**', 80);
	const candidates: AppCandidate[] = [];
	const seen = new Set<string>();
	for (const pkgUri of pkgs) {
		const root = vscode.Uri.joinPath(pkgUri, '..');
		const key = root.toString();
		if (seen.has(key)) continue;
		seen.add(key);
		const pkg = await readJson(pkgUri);
		const devScript = detectDevScript(pkg);
		if (!devScript) continue;
		const framework = detectFrameworkFromPkg(pkg);
		// Keep these in their dedicated detectors.
		if (framework === 'vite' || framework === 'next') continue;
		const label = vscode.workspace.asRelativePath(root, false);
		candidates.push({ root, label, framework, isTauri: await detectTauri(root), devScript });
	}
	return candidates;
}

export async function pickAppCandidate(): Promise<AppCandidate | undefined> {
	const [vite, next, generic] = await Promise.all([findViteAppCandidates(), findNextAppCandidates(), findGenericAppCandidates()]);
	const candidates = [...vite, ...next, ...generic];
	if (candidates.length === 0) {
		vscode.window.showErrorMessage('Live UI Editor: Could not find an app with a dev/start script.');
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
