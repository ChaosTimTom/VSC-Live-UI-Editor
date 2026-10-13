import { ts } from 'ts-morph';
import { parse } from 'parse5';

export type RewriteValidation = { valid: boolean; reason?: string };

/** Validate a complete rewrite before it can enter the apply queue. */
export function validatePageRewrite(fileName: string, original: string, candidate: string): RewriteValidation {
	if (!candidate.trim() || candidate.trim() === original.trim()) {
		return { valid: false, reason: 'The model returned an empty or unchanged file.' };
	}
	if (/\.(tsx?|jsx?)$/i.test(fileName)) {
		const kind = /\.tsx$/i.test(fileName) ? ts.ScriptKind.TSX : /\.jsx$/i.test(fileName) ? ts.ScriptKind.JSX
			: /\.ts$/i.test(fileName) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
		const before = ts.createSourceFile(fileName, original, ts.ScriptTarget.Latest, true, kind);
		const after = ts.createSourceFile(fileName, candidate, ts.ScriptTarget.Latest, true, kind);
		const diagnostics = (after as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics;
		if (diagnostics.length) {
			return { valid: false, reason: `Generated source has a syntax error: ${ts.flattenDiagnosticMessageText(diagnostics[0].messageText, ' ')}` };
		}
		const directivesOf = (source: ts.SourceFile) => source.statements
			.filter(statement => ts.isExpressionStatement(statement) && ts.isStringLiteral(statement.expression))
			.map(statement => (statement as ts.ExpressionStatement).expression.getText(source));
		if (directivesOf(before).some(directive => !directivesOf(after).includes(directive))) {
			return { valid: false, reason: 'The rewrite removed an existing module directive, such as use client.' };
		}
		const importsOf = (source: ts.SourceFile) => source.statements.filter(ts.isImportDeclaration)
			.map(statement => (statement.moduleSpecifier as ts.StringLiteral).text);
		if (importsOf(before).some(module => !importsOf(after).includes(module))) {
			return { valid: false, reason: 'The rewrite removed an existing import. Regenerate while preserving dependencies and behavior.' };
		}
		const exportsOf = (source: ts.SourceFile) => source.statements.flatMap(statement => {
			if (ts.isExportAssignment(statement)) return ['default'];
			const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
			if (!modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) return [];
			if (modifiers.some(m => m.kind === ts.SyntaxKind.DefaultKeyword)) return ['default'];
			if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map(d => d.name.getText(source));
			if ('name' in statement && statement.name) return [(statement.name as ts.Node).getText(source)];
			return [];
		});
		const missing = exportsOf(before).filter(name => !exportsOf(after).includes(name));
		if (missing.length) return { valid: false, reason: `The rewrite removed exports: ${missing.join(', ')}.` };
		return { valid: true };
	}
	if (/\.html?$/i.test(fileName)) {
		const errors: string[] = [];
		const after = parse(candidate, { onParseError: error => {
			if (error.code !== 'missing-doctype') errors.push(error.code);
		} });
		if (errors.length) return { valid: false, reason: `Generated HTML is malformed: ${errors[0]}.` };
		const scriptsOf = (node: any): string[] => {
			const scripts: string[] = [];
			if (node.tagName === 'script') scripts.push(JSON.stringify({
				attrs: [...node.attrs].sort((a: any, b: any) => a.name.localeCompare(b.name)),
				text: node.childNodes.map((n: any) => n.value ?? '').join('').trim(),
			}));
			for (const child of node.childNodes ?? []) scripts.push(...scriptsOf(child));
			if (node.content) scripts.push(...scriptsOf(node.content));
			return scripts;
		};
		const beforeScripts = scriptsOf(parse(original));
		const afterScripts = scriptsOf(after);
		if (beforeScripts.some(script => !afterScripts.includes(script))) {
			return { valid: false, reason: 'The rewrite removed or changed an existing script. Try again with a styles-only request.' };
		}
		return { valid: true };
	}
	return { valid: false, reason: 'Full source redesign currently supports HTML and React JS/TS files. Other frameworks can use live CSS preview.' };
}

export function pageSourceUnchanged(original: string, current: string): boolean {
	return original === current;
}

/** Entry candidates are explicit and framework-aware; ambiguity stays visible to the user. */
export function pageEntryCandidates(framework: string, urlPath = '/'): string[] {
	const route = urlPath.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
	if (route.split('/').some(segment => segment === '..' || segment === '.')) return [];
	const nextRoute = route ? `${route}/` : '';
	if (framework === 'next') return [
		...['app', 'src/app'].flatMap(base => ['tsx', 'jsx', 'js'].map(ext => `${base}/${nextRoute}page.${ext}`)),
		...['pages', 'src/pages'].flatMap(base => ['tsx', 'jsx', 'js'].map(ext => `${base}/${route || 'index'}.${ext}`)),
	];
	if (framework === 'astro') return [`src/pages/${route || 'index'}.astro`];
	if (framework === 'sveltekit') return [`src/routes/${nextRoute}+page.svelte`];
	if (framework === 'nuxt') return [`pages/${route || 'index'}.vue`, 'app.vue'];
	return ['src/App.tsx', 'src/App.jsx', 'src/App.js', 'src/app.tsx', 'src/App.vue', 'src/App.svelte', 'index.html'];
}
