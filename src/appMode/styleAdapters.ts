import * as vscode from 'vscode';

export type StyleAdapterId = 'inline' | 'cssClass' | 'tailwind';
export type StyleAdapterPreference = 'auto' | StyleAdapterId;

export type StyleSystemDetection = {
	tailwind: { present: boolean; confidence: number; reason: string };
	cssFiles: { present: boolean; reason: string };
	cssModules: { present: boolean; reason: string };
	cssInJs: { present: boolean; reason: string };
};

function safeJsonParse(text: string): any {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
	try {
		await vscode.workspace.fs.stat(uri);
		return true;
	} catch {
		return false;
	}
}

async function readTextIfExists(uri: vscode.Uri): Promise<string | undefined> {
	try {
		const buf = await vscode.workspace.fs.readFile(uri);
		return Buffer.from(buf).toString('utf8');
	} catch {
		return undefined;
	}
}

function hasDep(pkg: any, name: string): boolean {
	if (!pkg || typeof pkg !== 'object') return false;
	const deps = (pkg.dependencies && typeof pkg.dependencies === 'object') ? pkg.dependencies : {};
	const dev = (pkg.devDependencies && typeof pkg.devDependencies === 'object') ? pkg.devDependencies : {};
	const peer = (pkg.peerDependencies && typeof pkg.peerDependencies === 'object') ? pkg.peerDependencies : {};
	return !!(deps[name] || dev[name] || peer[name]);
}

export async function detectStyleSystems(appRoot: vscode.Uri): Promise<StyleSystemDetection> {
	const pkgUri = vscode.Uri.joinPath(appRoot, 'package.json');
	const pkgText = await readTextIfExists(pkgUri);
	const pkg = pkgText ? safeJsonParse(pkgText) : undefined;

	const tailwindConfigCandidates = [
		'tailwind.config.js',
		'tailwind.config.cjs',
		'tailwind.config.mjs',
		'tailwind.config.ts',
		'postcss.config.js',
		'postcss.config.cjs',
		'postcss.config.mjs',
		'postcss.config.ts',
	];

	let tailwindConfigFound: string | undefined;
	for (const rel of tailwindConfigCandidates) {
		const u = vscode.Uri.joinPath(appRoot, rel);
		if (await fileExists(u)) {
			tailwindConfigFound = rel;
			break;
		}
	}

	const hasTailwindDep = hasDep(pkg, 'tailwindcss');
	const hasPostcssDep = hasDep(pkg, 'postcss');
	const hasAutoprefixerDep = hasDep(pkg, 'autoprefixer');
	const tailwindPresent = hasTailwindDep || !!tailwindConfigFound;
	const tailwindConfidence = tailwindPresent
		? (hasTailwindDep && tailwindConfigFound ? 1 : 0.7)
		: 0;
	const tailwindReason = tailwindPresent
		? (hasTailwindDep && tailwindConfigFound
			? `Detected Tailwind (tailwindcss dep + ${tailwindConfigFound}).`
			: hasTailwindDep
				? 'Detected Tailwind (tailwindcss dependency in package.json).'
				: `Detected Tailwind config (${tailwindConfigFound}).`)
		: 'Tailwind not detected.';

	const cssModulesMatches = await vscode.workspace.findFiles(
		new vscode.RelativePattern(appRoot, '**/*.module.{css,scss,sass,less,styl}'),
		'**/node_modules/**',
		5
	);
	const cssModulesPresent = cssModulesMatches.length > 0;
	const cssModulesReason = cssModulesPresent
		? `Detected CSS Modules (${vscode.workspace.asRelativePath(cssModulesMatches[0], false)}).`
		: 'CSS Modules not detected.';

	const cssFilesMatches = await vscode.workspace.findFiles(
		new vscode.RelativePattern(appRoot, '**/*.{css,scss,sass,less,styl}'),
		'**/node_modules/**',
		5
	);
	const cssFilesPresent = cssFilesMatches.length > 0;
	const cssFilesReason = cssFilesPresent
		? `Detected CSS files (${vscode.workspace.asRelativePath(cssFilesMatches[0], false)}).`
		: 'No CSS files detected.';

	const cssInJsPresent =
		hasDep(pkg, 'styled-components') ||
		hasDep(pkg, '@emotion/react') ||
		hasDep(pkg, '@emotion/styled') ||
		hasDep(pkg, 'goober') ||
		hasDep(pkg, '@stitches/react') ||
		hasDep(pkg, '@vanilla-extract/css');
	const cssInJsReason = cssInJsPresent
		? 'Detected CSS-in-JS dependency (styled-components/emotion/stitches/vanilla-extract/etc).' 
		: 'No CSS-in-JS dependency detected.';

	// Note: These are heuristic signals only; adapters should still be resilient.
	return {
		tailwind: {
			present: tailwindPresent,
			confidence: tailwindConfidence,
			reason: tailwindReason + (hasPostcssDep || hasAutoprefixerDep ? '' : ''),
		},
		cssFiles: { present: cssFilesPresent, reason: cssFilesReason },
		cssModules: { present: cssModulesPresent, reason: cssModulesReason },
		cssInJs: { present: cssInJsPresent, reason: cssInJsReason },
	};
}

function escapeTailwindArbitraryValue(raw: string): string {
	// Tailwind arbitrary values are bracketed: w-[10px].
	// Avoid spaces (use underscores) and escape closing bracket.
	return String(raw)
		.trim()
		.replace(/\s+/g, '_')
		.replace(/\]/g, '\\]');
}

export function tailwindTokensFromStylePatch(style: Record<string, string>): string[] {
	const tokens: string[] = [];
	for (const [k, v] of Object.entries(style || {})) {
		if (!v || typeof v !== 'string') continue;
		const value = v.trim();
		if (!value) continue;

		switch (k) {
			case 'width': tokens.push(`w-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'height': tokens.push(`h-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'minWidth': tokens.push(`min-w-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'minHeight': tokens.push(`min-h-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'maxWidth': tokens.push(`max-w-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'maxHeight': tokens.push(`max-h-[${escapeTailwindArbitraryValue(value)}]`); break;

			case 'padding': tokens.push(`p-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'paddingTop': tokens.push(`pt-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'paddingRight': tokens.push(`pr-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'paddingBottom': tokens.push(`pb-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'paddingLeft': tokens.push(`pl-[${escapeTailwindArbitraryValue(value)}]`); break;

			case 'margin': tokens.push(`m-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'marginTop': tokens.push(`mt-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'marginRight': tokens.push(`mr-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'marginBottom': tokens.push(`mb-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'marginLeft': tokens.push(`ml-[${escapeTailwindArbitraryValue(value)}]`); break;

			case 'fontSize': tokens.push(`text-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'lineHeight': tokens.push(`leading-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'fontWeight': tokens.push(`font-[${escapeTailwindArbitraryValue(value)}]`); break;

			case 'color': tokens.push(`text-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'backgroundColor': tokens.push(`bg-[${escapeTailwindArbitraryValue(value)}]`); break;

			case 'borderRadius': tokens.push(`rounded-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'borderWidth': tokens.push(`border-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'borderColor': tokens.push(`border-[${escapeTailwindArbitraryValue(value)}]`); break;

			case 'opacity': tokens.push(`opacity-[${escapeTailwindArbitraryValue(value)}]`); break;

			case 'display': {
				const dv = value.toLowerCase();
				if (['block','inline-block','inline','flex','inline-flex','grid','inline-grid','none'].includes(dv)) {
					tokens.push(dv === 'none' ? 'hidden' : dv);
				} else {
					tokens.push(`display-[${escapeTailwindArbitraryValue(value)}]`);
				}
				break;
			}

			case 'position': {
				const pv = value.toLowerCase();
				if (['absolute','relative','fixed','sticky','static'].includes(pv)) tokens.push(pv);
				break;
			}
			case 'top': tokens.push(`top-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'right': tokens.push(`right-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'bottom': tokens.push(`bottom-[${escapeTailwindArbitraryValue(value)}]`); break;
			case 'left': tokens.push(`left-[${escapeTailwindArbitraryValue(value)}]`); break;

			default:
				// Intentionally ignore properties we can't safely map yet.
				break;
		}
	}

	// De-dupe while preserving order
	const seen = new Set<string>();
	return tokens.filter(t => {
		if (!t) return false;
		if (seen.has(t)) return false;
		seen.add(t);
		return true;
	});
}
