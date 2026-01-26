import * as vscode from 'vscode';
import * as cheerio from 'cheerio';
import * as path from 'path';
import * as fs from 'fs';
import { Project, SyntaxKind, type JsxAttribute, type JsxSelfClosingElement, type JsxElement } from 'ts-morph';

export type UpdateTextResult = {
	changed: boolean;
	i18nKey?: string;
	i18nFile?: string;
	reason?: 'updated' | 'i18n-updated' | 'i18n-detected-but-not-found' | 'no-change' | 'not-found';
};

export class CodeModifier {
	public async ensureClassNames(
		fileUri: vscode.Uri,
		lineNumber: number,
		classNames: string[],
		columnNumber?: number,
		elementContext?: {
			tagName: string;
			id?: string;
			classList?: string[];
			role?: string;
			href?: string;
			type?: string;
			text?: string;
		}
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		if (!(ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js'))) {
			return false;
		}

		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();
		const updatedText = ensureJsxClassNamesAtLocation(text, fileUri.fsPath, lineNumber, classNames, columnNumber, elementContext);
		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}

	public async ensureClassName(
		fileUri: vscode.Uri,
		lineNumber: number,
		className: string,
		columnNumber?: number,
		elementContext?: {
			tagName: string;
			id?: string;
			classList?: string[];
			role?: string;
			href?: string;
			type?: string;
			text?: string;
		}
	): Promise<boolean> {
		return this.ensureClassNames(fileUri, lineNumber, [className], columnNumber, elementContext);
	}

	public async upsertCssClassRule(
		cssFileUri: vscode.Uri,
		className: string,
		newStyles: Record<string, string>
	): Promise<boolean> {
		const ext = cssFileUri.path.toLowerCase();
		if (!ext.endsWith('.css')) return false;
		const doc = await vscode.workspace.openTextDocument(cssFileUri);
		const text = doc.getText();
		const updatedText = upsertCssClassRule(text, className, newStyles);
		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(cssFileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}

	public async updateStyleByElementId(
		fileUri: vscode.Uri,
		elementId: string,
		newStyles: Record<string, string>
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();

		let updatedText: string | undefined;
		if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			updatedText = updateJsxInlineStyleByDataLui(text, fileUri.fsPath, elementId, newStyles);
		} else {
			// HTML doesn't have a stable JSX attribute mapping yet.
			return false;
		}

		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}

	public async updateTextByElementId(
		fileUri: vscode.Uri,
		elementId: string,
		newText: string
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();

		let updatedText: string | undefined;
		if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			updatedText = updateJsxTextByDataLui(text, fileUri.fsPath, elementId, newText);
		} else {
			return false;
		}

		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}

	public async updateStyle(
		fileUri: vscode.Uri,
		lineNumber: number,
		newStyles: Record<string, string>,
		columnNumber?: number,
		elementContext?: {
			tagName: string;
			id?: string;
			classList?: string[];
			role?: string;
			href?: string;
			type?: string;
			text?: string;
		}
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();

		let updatedText: string | undefined;
		if (ext.endsWith('.html') || ext.endsWith('.htm')) {
			updatedText = updateHtmlInlineStyle(text, lineNumber, newStyles);
		} else if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			updatedText = updateJsxInlineStyle(text, fileUri.fsPath, lineNumber, newStyles, columnNumber, elementContext);
		} else {
			throw new Error('Unsupported file type for updateStyle');
		}

		if (!updatedText || updatedText === text) {
			return false;
		}

		const edit = new vscode.WorkspaceEdit();
		const fullRange = new vscode.Range(
			doc.positionAt(0),
			doc.positionAt(text.length)
		);
		edit.replace(fileUri, fullRange, updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) {
			throw new Error('Failed to apply WorkspaceEdit');
		}
		await doc.save();
		return true;
	}

	public async updateText(
		fileUri: vscode.Uri,
		lineNumber: number,
		newText: string,
		columnNumber?: number,
		elementContext?: {
			tagName: string;
			id?: string;
			classList?: string[];
			role?: string;
			href?: string;
			type?: string;
			text?: string;
		}
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();

		let updatedText: string | undefined;
		if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			updatedText = updateJsxTextAtLine(text, fileUri.fsPath, lineNumber, newText, columnNumber, elementContext);
		} else if (ext.endsWith('.html') || ext.endsWith('.htm')) {
			updatedText = updateHtmlTextAtLine(text, lineNumber, newText);
		} else {
			throw new Error('Unsupported file type for updateText');
		}

		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}

	/**
	 * Enhanced text update that can handle i18n/translated text.
	 * If the JSX contains a t('key') call, it will try to update the translation file instead.
	 */
	public async updateTextWithI18n(
		fileUri: vscode.Uri,
		lineNumber: number,
		newText: string,
		columnNumber?: number,
		elementContext?: {
			tagName: string;
			id?: string;
			classList?: string[];
			role?: string;
			href?: string;
			type?: string;
			text?: string;
		}
	): Promise<UpdateTextResult> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();

		if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			// First, try to detect i18n patterns
			const i18nResult = detectAndUpdateI18n(text, fileUri, lineNumber, newText, columnNumber, elementContext);
			if (i18nResult) {
				return i18nResult;
			}

			// Fall back to direct text update
			const updatedText = updateJsxTextAtLine(text, fileUri.fsPath, lineNumber, newText, columnNumber, elementContext);
			if (!updatedText || updatedText === text) {
				return { changed: false, reason: 'no-change' };
			}
			const edit = new vscode.WorkspaceEdit();
			edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
			const applied = await vscode.workspace.applyEdit(edit);
			if (!applied) return { changed: false, reason: 'no-change' };
			await doc.save();
			return { changed: true, reason: 'updated' };
		} else if (ext.endsWith('.html') || ext.endsWith('.htm')) {
			const updatedText = updateHtmlTextAtLine(text, lineNumber, newText);
			if (!updatedText || updatedText === text) {
				return { changed: false, reason: 'no-change' };
			}
			const edit = new vscode.WorkspaceEdit();
			edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
			const applied = await vscode.workspace.applyEdit(edit);
			if (!applied) return { changed: false, reason: 'no-change' };
			await doc.save();
			return { changed: true, reason: 'updated' };
		}

		return { changed: false, reason: 'not-found' };
	}

	public async insertElement(
		fileUri: vscode.Uri,
		lineNumber: number,
		position: 'before' | 'after' | 'inside',
		markup: string
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();

		let updatedText: string | undefined;
		if (ext.endsWith('.html') || ext.endsWith('.htm')) {
			updatedText = insertHtmlAtLine(text, lineNumber, position, markup);
		} else if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			updatedText = insertJsxAtLine(text, doc, fileUri.fsPath, lineNumber, position, markup);
		} else {
			throw new Error('Unsupported file type for insertElement');
		}

		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}

	public async wrapWithBox(
		fileUri: vscode.Uri,
		lineNumber: number,
		options?: { lineUnder?: boolean }
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();

		let updatedText: string | undefined;
		if (ext.endsWith('.html') || ext.endsWith('.htm')) {
			updatedText = wrapHtmlAtLineWithBox(text, lineNumber, options);
		} else if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			updatedText = wrapJsxAtLineWithBox(text, doc, fileUri.fsPath, lineNumber, options);
		} else {
			throw new Error('Unsupported file type for wrapWithBox');
		}

		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}

	public async ensureItemsArrayInNearestComponent(
		fileUri: vscode.Uri,
		lineNumber: number,
		options: { varName?: string; count: number }
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		if (!(ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js'))) return false;
		const count = Math.max(1, Math.min(200, Math.floor(options.count)));
		const varName = (options.varName && /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(options.varName)) ? options.varName : 'items';

		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();
		const updatedText = ensureItemsArrayInNearestComponent(text, fileUri.fsPath, lineNumber, { varName, count });
		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}

	public async updateStyleAll(fileUri: vscode.Uri, tagName: string, newStyles: Record<string, string>): Promise<boolean> {
		return this.updateStyleAllMany(fileUri, [tagName], newStyles);
	}

	public async updateStyleAllMany(fileUri: vscode.Uri, tagNames: string[], newStyles: Record<string, string>): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();
		const normalizedTags = Array.from(
			new Set(
				tagNames
					.map(t => t.trim())
					.filter(Boolean)
					.map(t => t.toLowerCase())
			)
		);
		if (normalizedTags.length === 0) return false;

		let updatedText: string | undefined;
		if (ext.endsWith('.html') || ext.endsWith('.htm')) {
			updatedText = updateHtmlInlineStyleAllTagsMany(text, normalizedTags, newStyles);
		} else if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			updatedText = updateJsxInlineStyleAllTagsMany(text, fileUri.fsPath, normalizedTags, newStyles);
		} else {
			throw new Error('Unsupported file type for updateStyleAll');
		}

		if (!updatedText || updatedText === text) {
			return false;
		}

		const edit = new vscode.WorkspaceEdit();
		const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(text.length));
		edit.replace(fileUri, fullRange, updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) {
			throw new Error('Failed to apply WorkspaceEdit');
		}
		await doc.save();
		return true;
	}

	public async getTranslate(
		fileUri: vscode.Uri,
		lineNumber: number,
		columnNumber?: number,
		ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
	): Promise<[number, number]> {
		const ext = fileUri.path.toLowerCase();
		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();

		if (ext.endsWith('.html') || ext.endsWith('.htm')) {
			return getHtmlTranslate(text, lineNumber);
		}
		if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
			return getJsxTranslate(text, fileUri.fsPath, lineNumber, columnNumber, ctx);
		}
		return [0, 0];
	}

	public async getJsxSelection(
		fileUri: vscode.Uri,
		lineNumber: number
	): Promise<{ range: vscode.Range; snippet: string } | undefined> {
		const ext = fileUri.path.toLowerCase();
		if (!(ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js'))) {
			return;
		}

		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();
		const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
		const sourceFile = project.createSourceFile(fileUri.fsPath, text, { overwrite: true });
		const target = findNearestJsxNodeAtLine(sourceFile, lineNumber);
		if (!target) return;

		const start = target.getStart();
		const end = target.getEnd();
		const range = new vscode.Range(doc.positionAt(start), doc.positionAt(end));
		const snippet = text.slice(start, end);
		return { range, snippet };
	}

	public async deleteElement(
		fileUri: vscode.Uri,
		lineNumber: number,
		columnNumber?: number,
		elementContext?: {
			tagName: string;
			id?: string;
			classList?: string[];
			role?: string;
			href?: string;
			type?: string;
			text?: string;
		}
	): Promise<boolean> {
		const ext = fileUri.path.toLowerCase();
		if (!(ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js'))) {
			return false;
		}

		const doc = await vscode.workspace.openTextDocument(fileUri);
		const text = doc.getText();
		const updatedText = deleteJsxElement(text, fileUri.fsPath, lineNumber, columnNumber, elementContext);

		if (!updatedText || updatedText === text) return false;
		const edit = new vscode.WorkspaceEdit();
		edit.replace(fileUri, new vscode.Range(doc.positionAt(0), doc.positionAt(text.length)), updatedText);
		const applied = await vscode.workspace.applyEdit(edit);
		if (!applied) throw new Error('Failed to apply WorkspaceEdit');
		await doc.save();
		return true;
	}
}

function ensureItemsArrayInNearestComponent(
	input: string,
	filePathForProject: string,
	lineNumber: number,
	options: { varName: string; count: number }
): string {
	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const target = findNearestJsxNodeAtLine(sourceFile, lineNumber);
	if (!target) return input;

	const initText = `Array.from({ length: ${options.count} }, (_, i) => ({ id: i + 1, title: \`Card ${'${i + 1}'}\`, subtitle: 'Description' }))`;

	// Find nearest enclosing function-like node.
	let cur: any = target;
	let func: any | undefined;
	while (cur) {
		const k = cur.getKind?.();
		if (k === SyntaxKind.FunctionDeclaration || k === SyntaxKind.FunctionExpression || k === SyntaxKind.ArrowFunction) {
			func = cur;
			break;
		}
		cur = cur.getParent?.();
	}
	if (!func) return input;

	// Arrow fn can have expression body.
	if (func.getKind() === SyntaxKind.ArrowFunction) {
		const body: any = func.getBody?.();
		if (!body) return input;
		if (body.getKind && body.getKind() !== SyntaxKind.Block) {
			// Convert to block body.
			const existingText = body.getText();
			func.setBodyText(`{\n  const ${options.varName} = ${initText};\n  return ${existingText};\n}`);
			return sourceFile.getFullText();
		}
	}

	const block: any = func.getBody?.();
	if (!block || (block.getKind && block.getKind() !== SyntaxKind.Block)) return input;

	try {
		const existing = block
			.getDescendantsOfKind(SyntaxKind.VariableDeclaration)
			.some((d: any) => String(d.getName?.() ?? '') === options.varName);
		if (existing) return input;
	} catch {
		// ignore
	}

	block.insertStatements(0, `const ${options.varName} = ${initText};`);
	return sourceFile.getFullText();
}

function ensureJsxClassNamesAtLocation(
	input: string,
	filePathForProject: string,
	lineNumber: number,
	classNames: string[],
	columnNumber?: number,
	ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
): string {
	const desired = (Array.isArray(classNames) ? classNames : [])
		.map(x => String(x || '').trim())
		.filter(Boolean);
	if (desired.length === 0) return input;

	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const target = findBestJsxNodeAtLocation(sourceFile, lineNumber, columnNumber, ctx);
	if (!target) return input;
	const opening = getOpeningElement(target);
	if (!opening) return input;

	const classAttr = opening
		.getAttributes()
		.find(a => a.getKind() === SyntaxKind.JsxAttribute && (a as JsxAttribute).getNameNode().getText() === 'className') as JsxAttribute | undefined;

	if (!classAttr) {
		const cn = desired.join(' ');
		opening.addAttribute({ name: 'className', initializer: `'${cn.replace(/'/g, "\\'")}'` });
		return sourceFile.getFullText();
	}

	const init = classAttr.getInitializer();
	if (!init) {
		const cn = desired.join(' ');
		classAttr.setInitializer(`'${cn.replace(/'/g, "\\'")}'`);
		return sourceFile.getFullText();
	}

	// Support only simple string initializers for the MVP.
	let existingValue: string | undefined;
	if (init.getKind() === SyntaxKind.StringLiteral) {
		existingValue = unquoteStringLiteralText(init.getText());
	} else if (init.getKind() === SyntaxKind.JsxExpression) {
		const expr = init.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
		if (expr && expr.getKind() === SyntaxKind.StringLiteral) {
			existingValue = unquoteStringLiteralText(expr.getText());
		}
	}
	if (existingValue === undefined) return input;

	const parts = existingValue.split(/\s+/).filter(Boolean);
	let changed = false;
	for (const cn of desired) {
		if (parts.includes(cn)) continue;
		parts.push(cn);
		changed = true;
	}
	if (!changed) return input;
	const next = parts.join(' ');
	classAttr.setInitializer(`'${next.replace(/'/g, "\\'")}'`);
	return sourceFile.getFullText();
}

function cssPropNameFromJs(k: string): string {
	return String(k || '')
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/_/g, '-')
		.toLowerCase();
}

function escapeRegExp(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function upsertCssClassRule(input: string, className: string, newStyles: Record<string, string>): string {
	const cn = String(className || '').trim().replace(/^\./, '');
	if (!cn) return input;

	const filtered = normalizeInlineStylePatch(newStyles);
	if (Object.keys(filtered).length === 0) return input;

	const selector = `.${cn}`;
	const re = new RegExp(`(^|\\n)\\s*${escapeRegExp(selector)}\\s*\\{`, 'm');
	const match = re.exec(input);

	const desiredDecls = Object.entries(filtered).map(([k, v]) => [cssPropNameFromJs(k), v] as const);

	if (!match) {
		const lines = desiredDecls.map(([k, v]) => `  ${k}: ${v};`).join('\n');
		const suffix = input.endsWith('\n') ? '' : '\n';
		return input + `${suffix}\n${selector} {\n${lines}\n}\n`;
	}

	const start = match.index + match[0].length;
	// Find the end of the rule by scanning for the next '}'
	const end = input.indexOf('}', start);
	if (end < 0) return input;
	const body = input.slice(start, end);

	// Parse existing declarations (naive but ok for MVP)
	const declMap = new Map<string, string>();
	for (const line of body.split(/\r?\n/)) {
		const m = line.trim().match(/^([a-zA-Z0-9_-]+)\s*:\s*([^;]+);?$/);
		if (!m) continue;
		declMap.set(m[1], m[2].trim());
	}
	for (const [k, v] of desiredDecls) {
		declMap.set(k, v);
	}
	const nextLines = Array.from(declMap.entries()).map(([k, v]) => `  ${k}: ${v};`).join('\n');
	const nextBody = `\n${nextLines}\n`;
	return input.slice(0, start) + nextBody + input.slice(end);
}

function deleteJsxElement(
	input: string,
	filePath: string,
	lineNumber: number,
	columnNumber?: number,
	ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
): string | undefined {
	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePath, input, { overwrite: true });
	const target = findBestJsxNodeAtLocation(sourceFile, lineNumber, columnNumber, ctx);
	if (!target) return undefined;

	// Get the full range including any surrounding whitespace/newlines to avoid leaving blank lines
	const startPos = target.getStart();
	const endPos = target.getEnd();

	// Check if we should also remove the preceding newline/whitespace to avoid blank lines
	let actualStart = startPos;
	let actualEnd = endPos;

	// Look for a preceding newline and indentation we should also remove
	const textBefore = input.slice(0, startPos);
	const lastNewline = textBefore.lastIndexOf('\n');
	if (lastNewline >= 0) {
		const between = textBefore.slice(lastNewline + 1);
		// If only whitespace between the newline and our element, include it in deletion
		if (/^\s*$/.test(between)) {
			actualStart = lastNewline;
		}
	}

	// Look for a trailing newline we should also remove
	const textAfter = input.slice(endPos);
	const nextNewline = textAfter.indexOf('\n');
	if (nextNewline >= 0) {
		const between = textAfter.slice(0, nextNewline);
		// If only whitespace between our element and the newline, include the newline in deletion
		if (/^\s*$/.test(between)) {
			actualEnd = endPos + nextNewline + 1;
		}
	}

	const before = input.slice(0, actualStart);
	const after = input.slice(actualEnd);
	return before + after;
}

function updateHtmlTextAtLine(input: string, lineNumber: number, newText: string): string {
	// Best-effort: replace inline text when opening+closing tag appears on the same line.
	const lines = input.split(/\r?\n/);
	const idx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
	const line = lines[idx] ?? '';
	const m = line.match(/<\s*([A-Za-z][A-Za-z0-9:_-]*)\b[^>]*>([^<]*)<\s*\/\s*\1\s*>/);
	if (!m) return input;
	const tag = m[1];
	const before = line.slice(0, m.index ?? 0);
	const after = line.slice((m.index ?? 0) + m[0].length);
	const replaced = `${before}<${tag}>${newText}</${tag}>${after}`;
	lines[idx] = replaced;
	return lines.join('\n');
}

function updateJsxTextAtLine(
	input: string,
	filePathForProject: string,
	lineNumber: number,
	newText: string,
	columnNumber?: number,
	ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
): string {
	// Best-effort: only handles JSX elements with no nested JSX children (i.e. simple "<button>Text</button>").
	// Refuses strings with braces because they'd break JSX parsing.
	if (/[{}]/.test(newText)) return input;

	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const target = findBestJsxNodeAtLocation(sourceFile, lineNumber, columnNumber, ctx);
	if (!target) return input;
	if (target.getKind() !== SyntaxKind.JsxElement) return input;
	const jsxEl = target as JsxElement;
	const opening = jsxEl.getOpeningElement();
	const closing = jsxEl.getClosingElement();
	if (!closing) return input;

	// Ensure there are no nested JSX elements.
	const jsxChildren = jsxEl.getJsxChildren();
	const innerTextNodes = jsxChildren.filter(n => n.getKind() === SyntaxKind.JsxText);
	const hasNested =
		jsxEl.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
		jsxEl.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0;
	if (hasNested) return input;
	if (innerTextNodes.length === 0) return input;

	const start = opening.getEnd();
	const end = closing.getStart();
	const inner = input.slice(start, end);
	// Preserve surrounding whitespace if present.
	const leadingWs = inner.match(/^\s*/)?.[0] ?? '';
	const trailingWs = inner.match(/\s*$/)?.[0] ?? '';
	const nextInner = `${leadingWs}${newText}${trailingWs}`;
	return input.slice(0, start) + nextInner + input.slice(end);
}

function getIndentOfLine(doc: vscode.TextDocument, lineNumber1Based: number): string {
	const idx = Math.max(0, Math.min(doc.lineCount - 1, lineNumber1Based - 1));
	const line = doc.lineAt(idx).text;
	const m = line.match(/^\s*/);
	return m ? m[0] : '';
}

function insertJsxAtLine(
	input: string,
	doc: vscode.TextDocument,
	filePathForProject: string,
	lineNumber: number,
	position: 'before' | 'after' | 'inside',
	jsx: string
): string {
	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const target = findNearestJsxNodeAtLine(sourceFile, lineNumber);
	if (!target) return input;

	const start = target.getStart();
	const end = target.getEnd();
	const indent = getIndentOfLine(doc, lineNumber);
	const insertion = `\n${indent}${jsx}`;

	if (position === 'before') {
		return input.slice(0, start) + insertion + input.slice(start);
	}
	if (position === 'after') {
		return input.slice(0, end) + insertion + input.slice(end);
	}

	// inside
	if (target.getKind() === SyntaxKind.JsxElement) {
		const jsxEl = target as JsxElement;
		const closing = jsxEl.getClosingElement();
		if (!closing) return input;
		const closeStart = closing.getStart();
		const innerIndent = indent + '\t';
		const innerInsertion = `\n${innerIndent}${jsx}\n${indent}`;
		return input.slice(0, closeStart) + innerInsertion + input.slice(closeStart);
	}

	// Can't insert inside a self-closing element.
	return input;
}

function wrapJsxAtLineWithBox(
	input: string,
	doc: vscode.TextDocument,
	filePathForProject: string,
	lineNumber: number,
	options?: { lineUnder?: boolean }
): string {
	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const target = findNearestJsxNodeAtLine(sourceFile, lineNumber);
	if (!target) return input;
	const start = target.getStart();
	const end = target.getEnd();
	const snippet = input.slice(start, end);
	const indent = getIndentOfLine(doc, lineNumber);
	const innerIndent = indent + '\t';

	const boxOpen =
		`<div style={{ border: '1px solid rgba(255,255,255,0.18)', borderRadius: '12px', padding: '16px', background: 'rgba(255,255,255,0.04)' }}>`;
	const lineEl = options?.lineUnder
		? `\n${innerIndent}<div style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 10 }} />`
		: '';
	const wrapped =
		`\n${indent}${boxOpen}` +
		`\n${innerIndent}${snippet}` +
		lineEl +
		`\n${indent}</div>`;

	return input.slice(0, start) + wrapped + input.slice(end);
}

function updateHtmlInlineStyle(input: string, lineNumber: number, newStyles: Record<string, string>): string {
	// MVP: find the first element tag that appears on the specified line and merge its style attribute.
	const lines = input.split(/\r?\n/);
	const idx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
	const line = lines[idx] ?? '';

	// Find a tag name on this line.
	const m = line.match(/<\s*([A-Za-z][A-Za-z0-9:_-]*)\b/);
	if (!m) return input;
	const tag = m[1];

	// Determine which occurrence of this tag we’re on (1-based) by counting opening tags up to this line.
	const occurrence = countOpeningTagOccurrencesUpToLine(lines, tag, idx);

	const $ = cheerio.load(input, { xmlMode: false } as any);
	const elems = $(tag).toArray();
	if (elems.length === 0) return input;

	// Best-effort: pick the matching occurrence for this source line.
	const el = elems[Math.max(0, Math.min(elems.length - 1, occurrence - 1))];
	const currentStyle = $(el).attr('style') ?? '';
	const merged = mergeCssStyleString(currentStyle, newStyles);
	$(el).attr('style', merged);

	return $.root().html() ?? input;
}

function findHtmlElementAtLine(input: string, lineNumber: number): { tag: string; el: any } | undefined {
	const lines = input.split(/\r?\n/);
	const idx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
	const line = lines[idx] ?? '';
	// Prefer the last opening tag on the line; many files have multiple tags on a line.
	const re = /<\s*([A-Za-z][A-Za-z0-9:_-]*)\b/g;
	let tag: string | undefined;
	let m: RegExpExecArray | null;
	while ((m = re.exec(line)) !== null) {
		tag = m[1];
	}
	if (!tag) return;
	const occurrence = countOpeningTagOccurrencesUpToLine(lines, tag, idx);
	const $ = cheerio.load(input, { xmlMode: false } as any);
	const elems = $(tag).toArray();
	if (elems.length === 0) return;
	const el = elems[Math.max(0, Math.min(elems.length - 1, occurrence - 1))];
	return { tag, el };
}

function insertHtmlAtLine(input: string, lineNumber: number, position: 'before' | 'after' | 'inside', markup: string): string {
	const found = findHtmlElementAtLine(input, lineNumber);
	if (!found) return input;
	const $ = cheerio.load(input, { xmlMode: false } as any);
	// Re-find within this cheerio instance.
	const lines = input.split(/\r?\n/);
	const idx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
	const occurrence = countOpeningTagOccurrencesUpToLine(lines, found.tag, idx);
	const elems = $(found.tag).toArray();
	const el = elems[Math.max(0, Math.min(elems.length - 1, occurrence - 1))];
	if (!el) return input;

	// If we're inserting inside a container that visually provides the background,
	// try to make it responsive-safe by allowing it to grow with its content.
	if (position === 'inside') {
		maybeExtendHtmlBackgroundContainer($, el);
	}

	if (position === 'before') $(el).before(`\n${markup}\n`);
	else if (position === 'after') $(el).after(`\n${markup}\n`);
	else $(el).append(`\n${markup}\n`);
	return $.root().html() ?? input;
}

function maybeExtendHtmlBackgroundContainer($: cheerio.CheerioAPI, el: any): void {
	const currentStyle = ($(el).attr('style') ?? '').trim();
	if (!currentStyle) return;
	const map = parseCssStyleString(currentStyle);

	const bg = map.get('background') || map.get('background-color') || map.get('background-image');
	const hasBackground = !!(bg && bg.trim() && bg.trim() !== 'none' && bg.trim() !== 'transparent');
	if (!hasBackground) return;

	const height = (map.get('height') || '').trim();
	const maxHeight = (map.get('max-height') || '').trim();
	const isPx = (v: string) => /^\d+(?:\.\d+)?px$/i.test(v);
	const hasFixedHeightPx = isPx(height) || isPx(maxHeight);
	if (!hasFixedHeightPx) return;

	// Convert fixed height -> min-height + auto height so the background can extend.
	if (isPx(height)) {
		if (!map.get('min-height')) map.set('min-height', height);
		map.set('height', 'auto');
	}
	if (isPx(maxHeight)) {
		map.set('max-height', 'none');
	}

	// If overflow is forcing clipping, relax it.
	const overflow = (map.get('overflow') || '').trim();
	const overflowY = (map.get('overflow-y') || '').trim();
	const overflowX = (map.get('overflow-x') || '').trim();
	if (overflow === 'hidden') map.set('overflow', 'visible');
	if (overflowY === 'hidden') map.set('overflow-y', 'visible');
	if (overflowX === 'hidden') map.set('overflow-x', 'visible');

	const next = Array.from(map.entries())
		.map(([k, v]) => `${k}: ${v}`)
		.join('; ');
	$(el).attr('style', next);
}

function wrapHtmlAtLineWithBox(input: string, lineNumber: number, options?: { lineUnder?: boolean }): string {
	const found = findHtmlElementAtLine(input, lineNumber);
	if (!found) return input;
	const lines = input.split(/\r?\n/);
	const idx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
	const occurrence = countOpeningTagOccurrencesUpToLine(lines, found.tag, idx);

	const $ = cheerio.load(input, { xmlMode: false } as any);
	const elems = $(found.tag).toArray();
	const el = elems[Math.max(0, Math.min(elems.length - 1, occurrence - 1))];
	if (!el) return input;

	const boxStyle = [
		'border: 1px solid rgba(255,255,255,0.18)',
		'border-radius: 12px',
		'padding: 16px',
		'background: rgba(255,255,255,0.04)',
	].join('; ');
	$(el).wrap(`<div style="${boxStyle}"></div>`);
	if (options?.lineUnder) {
		const hrStyle = 'margin-top: 10px; border: 0; border-top: 1px solid rgba(255,255,255,0.22)';
		const parent = $(el).parent();
		parent.append(`\n<hr style="${hrStyle}" />\n`);
	}

	return $.root().html() ?? input;
}

function countOpeningTagOccurrencesUpToLine(lines: string[], tagName: string, inclusiveLineIndex: number): number {
	const tag = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const re = new RegExp(`<\\s*${tag}\\b`, 'g');
	let count = 0;
	for (let i = 0; i <= inclusiveLineIndex && i < lines.length; i++) {
		const line = lines[i];
		if (!line || line.indexOf('<') === -1) continue;
		// Skip closing tags like </button>
		const cleaned = line.replace(new RegExp(`<\\s*\\/\\s*${tag}\\b`, 'g'), '');
		const matches = cleaned.match(re);
		if (matches) count += matches.length;
	}
	return Math.max(1, count);
}

function mergeCssStyleString(existing: string, newStyles: Record<string, string>): string {
	const map = parseCssStyleString(existing);
	for (const [k, v] of Object.entries(newStyles)) {
		map.set(normalizeCssPropName(k), v);
	}
	return Array.from(map.entries())
		.map(([k, v]) => `${k}: ${v}`)
		.join('; ');
}

function parseCssStyleString(existing: string): Map<string, string> {
	const map = new Map<string, string>();
	existing
		.split(';')
		.map(s => s.trim())
		.filter(Boolean)
		.forEach(part => {
			const [k, ...rest] = part.split(':');
			if (!k || rest.length === 0) return;
			map.set(normalizeCssPropName(k), rest.join(':').trim());
		});
	return map;
}

function normalizeCssPropName(name: string): string {
	const trimmed = name.trim();
	// Keep CSS custom properties.
	if (trimmed.startsWith('--')) return trimmed;
	const lower = trimmed.toLowerCase();
	// Fix common "lost dash" properties we may have written previously.
	const lostDashMap: Record<string, string> = {
		backgroundcolor: 'background-color',
		backgroundimage: 'background-image',
		backgroundsize: 'background-size',
		backgroundposition: 'background-position',
		backgroundrepeat: 'background-repeat',
		bordercolor: 'border-color',
		borderwidth: 'border-width',
		borderstyle: 'border-style',
		borderradius: 'border-radius',
		boxshadow: 'box-shadow',
		fontfamily: 'font-family',
		fontsize: 'font-size',
		fontweight: 'font-weight',
		lineheight: 'line-height',
		letterspacing: 'letter-spacing',
		texttransform: 'text-transform',
		textdecoration: 'text-decoration',
		textshadow: 'text-shadow',
		backdropfilter: 'backdrop-filter',
	};
	if (lostDashMap[lower]) return lostDashMap[lower];
	// If already kebab-case (contains a dash), just lowercase it.
	if (trimmed.includes('-')) return lower;
	// Convert camelCase/PascalCase to kebab-case.
	return trimmed
		.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
		.replace(/_/g, '-')
		.toLowerCase();
}

function updateHtmlInlineStyleAllTags(input: string, tagName: string, newStyles: Record<string, string>): string {
	const $ = cheerio.load(input, { xmlMode: false } as any);
	const elems = $(tagName).toArray();
	if (elems.length === 0) return input;
	for (const el of elems) {
		const currentStyle = $(el).attr('style') ?? '';
		const merged = mergeCssStyleString(currentStyle, newStyles);
		$(el).attr('style', merged);
	}
	return $.root().html() ?? input;
}

function updateHtmlInlineStyleAllTagsMany(input: string, tagNames: string[], newStyles: Record<string, string>): string {
	const $ = cheerio.load(input, { xmlMode: false } as any);
	let changed = false;
	for (const tagName of tagNames) {
		const elems = $(tagName).toArray();
		if (elems.length === 0) continue;
		for (const el of elems) {
			const currentStyle = $(el).attr('style') ?? '';
			const merged = mergeCssStyleString(currentStyle, newStyles);
			if (merged !== currentStyle) changed = true;
			$(el).attr('style', merged);
		}
	}
	return changed ? ($.root().html() ?? input) : input;
}

function updateJsxInlineStyleAllTags(input: string, filePathForProject: string, tagName: string, newStyles: Record<string, string>): string {
	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const lower = tagName.toLowerCase();

	const elements: Array<JsxElement | JsxSelfClosingElement> = [];
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
		const opening = el.getOpeningElement();
		const name = opening.getTagNameNode().getText().toLowerCase();
		if (name === lower) elements.push(el);
	}
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
		const name = el.getTagNameNode().getText().toLowerCase();
		if (name === lower) elements.push(el);
	}
	if (elements.length === 0) return input;

	for (const node of elements) {
		const opening = getOpeningElement(node);
		if (!opening) continue;
		const styleAttr = opening
			.getAttributes()
			.find(a => a.getKind() === SyntaxKind.JsxAttribute && (a as JsxAttribute).getNameNode().getText() === 'style') as JsxAttribute | undefined;
		if (!styleAttr) {
			opening.addAttribute({
				name: 'style',
				initializer: `{{ ${objectEntries(newStyles)} }}`
			});
			continue;
		}

		const init = styleAttr.getInitializer();
		if (!init) {
			styleAttr.setInitializer(`{{ ${objectEntries(newStyles)} }}`);
			continue;
		}
		if (init.getKind() !== SyntaxKind.JsxExpression) continue;
		const expr = init.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
		if (!expr || expr.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
		const obj = expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
		for (const [k, v] of Object.entries(newStyles)) {
			const existing = obj.getProperty(k);
			const initializer = `'${v.replace(/'/g, "\\'")}'`;
			if (!existing) {
				obj.addPropertyAssignment({ name: k, initializer });
			} else if (existing.getKind() === SyntaxKind.PropertyAssignment) {
				existing.asKindOrThrow(SyntaxKind.PropertyAssignment).setInitializer(initializer);
			}
		}
	}

	return sourceFile.getFullText();
}

function updateJsxInlineStyleAllTagsMany(input: string, filePathForProject: string, tagNames: string[], newStyles: Record<string, string>): string {
	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const tagSet = new Set(tagNames.map(t => t.toLowerCase()));

	const elements: Array<JsxElement | JsxSelfClosingElement> = [];
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
		const opening = el.getOpeningElement();
		const name = opening.getTagNameNode().getText().toLowerCase();
		if (tagSet.has(name)) elements.push(el);
	}
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
		const name = el.getTagNameNode().getText().toLowerCase();
		if (tagSet.has(name)) elements.push(el);
	}
	if (elements.length === 0) return input;

	for (const node of elements) {
		const opening = getOpeningElement(node);
		if (!opening) continue;
		const styleAttr = opening
			.getAttributes()
			.find(a => a.getKind() === SyntaxKind.JsxAttribute && (a as JsxAttribute).getNameNode().getText() === 'style') as JsxAttribute | undefined;
		if (!styleAttr) {
			opening.addAttribute({
				name: 'style',
				initializer: `{{ ${objectEntries(newStyles)} }}`
			});
			continue;
		}

		const init = styleAttr.getInitializer();
		if (!init) {
			styleAttr.setInitializer(`{{ ${objectEntries(newStyles)} }}`);
			continue;
		}
		if (init.getKind() !== SyntaxKind.JsxExpression) continue;
		const expr = init.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
		if (!expr || expr.getKind() !== SyntaxKind.ObjectLiteralExpression) continue;
		const obj = expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
		for (const [k, v] of Object.entries(newStyles)) {
			const existing = obj.getProperty(k);
			const initializer = `'${v.replace(/'/g, "\\'")}'`;
			if (!existing) {
				obj.addPropertyAssignment({ name: k, initializer });
			} else if (existing.getKind() === SyntaxKind.PropertyAssignment) {
				existing.asKindOrThrow(SyntaxKind.PropertyAssignment).setInitializer(initializer);
			}
		}
	}

	return sourceFile.getFullText();
}

function parseTranslateFromTransform(transform: string | undefined): [number, number] {
	if (!transform) return [0, 0];
	// Only support translate(xpx, ypx) for MVP.
	const m = transform.match(/translate\(\s*(-?\d+(?:\.\d+)?)px\s*,\s*(-?\d+(?:\.\d+)?)px\s*\)/i);
	if (!m) return [0, 0];
	const x = Number(m[1]);
	const y = Number(m[2]);
	return [Number.isFinite(x) ? x : 0, Number.isFinite(y) ? y : 0];
}

function getHtmlTranslate(input: string, lineNumber: number): [number, number] {
	const lines = input.split(/\r?\n/);
	const idx = Math.max(0, Math.min(lines.length - 1, lineNumber - 1));
	const line = lines[idx] ?? '';
	const m = line.match(/<\s*([A-Za-z][A-Za-z0-9:_-]*)\b/);
	if (!m) return [0, 0];
	const tag = m[1];
	const occurrence = countOpeningTagOccurrencesUpToLine(lines, tag, idx);

	const $ = cheerio.load(input, { xmlMode: false } as any);
	const elems = $(tag).toArray();
	if (elems.length === 0) return [0, 0];
	const el = elems[Math.max(0, Math.min(elems.length - 1, occurrence - 1))];
	const style = $(el).attr('style') ?? '';
	const styleMap = parseCssStyleString(style);
	return parseTranslateFromTransform(styleMap.get('transform'));
}

function getJsxTranslate(
	input: string,
	filePathForProject: string,
	lineNumber: number,
	columnNumber?: number,
	ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
): [number, number] {
	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });

	const target = findBestJsxNodeAtLocation(sourceFile, lineNumber, columnNumber, ctx);
	if (!target) return [0, 0];
	const opening = getOpeningElement(target);
	if (!opening) return [0, 0];

	const styleAttr = opening
		.getAttributes()
		.find(a => a.getKind() === SyntaxKind.JsxAttribute && (a as JsxAttribute).getNameNode().getText() === 'style') as JsxAttribute | undefined;
	if (!styleAttr) return [0, 0];

	const init = styleAttr.getInitializer();
	if (!init || init.getKind() !== SyntaxKind.JsxExpression) return [0, 0];
	const expr = init.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
	if (!expr || expr.getKind() !== SyntaxKind.ObjectLiteralExpression) return [0, 0];

	const obj = expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
	const prop = obj.getProperty('transform');
	if (!prop || prop.getKind() !== SyntaxKind.PropertyAssignment) return [0, 0];
	const initializer = prop.asKindOrThrow(SyntaxKind.PropertyAssignment).getInitializer();
	if (!initializer) return [0, 0];
	const raw = initializer.getText();
	const unquoted = raw.replace(/^['"]|['"]$/g, '');
	return parseTranslateFromTransform(unquoted);
}

function updateJsxInlineStyle(
	input: string,
	filePathForProject: string,
	lineNumber: number,
	newStyles: Record<string, string>,
	columnNumber?: number,
	ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
): string {
	const filteredStyles = normalizeInlineStylePatch(newStyles);
	if (Object.keys(filteredStyles).length === 0) return input;

	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });

	const target = findBestJsxNodeAtLocation(sourceFile, lineNumber, columnNumber, ctx);
	if (!target) return input;

	const opening = getOpeningElement(target);
	if (!opening) return input;

	const styleAttr = opening
		.getAttributes()
		.find(a => a.getKind() === SyntaxKind.JsxAttribute && (a as JsxAttribute).getNameNode().getText() === 'style') as JsxAttribute | undefined;
	if (!styleAttr) {
		opening.addAttribute({
			name: 'style',
			initializer: `{{ ${objectEntries(filteredStyles)} }}`
		});
		return sourceFile.getFullText();
	}

	const init = styleAttr.getInitializer();
	if (!init) {
		styleAttr.setInitializer(`{{ ${objectEntries(filteredStyles)} }}`);
		return sourceFile.getFullText();
	}

	// Expect style={{ ... }}
	if (init.getKind() !== SyntaxKind.JsxExpression) {
		return input;
	}
	const expr = init.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
	if (!expr || expr.getKind() !== SyntaxKind.ObjectLiteralExpression) {
		return input;
	}

	const obj = expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
	for (const [k, v] of Object.entries(filteredStyles)) {
		const existing = obj.getProperty(k);
		const initializer = `'${v.replace(/'/g, "\\'")}'`;
		if (!existing) {
			obj.addPropertyAssignment({ name: k, initializer });
		} else if (existing.getKind() === SyntaxKind.PropertyAssignment) {
			existing.asKindOrThrow(SyntaxKind.PropertyAssignment).setInitializer(initializer);
		}
	}

	return sourceFile.getFullText();
}

function unquoteStringLiteralText(raw: string): string {
	return raw.replace(/^['"]|['"]$/g, '');
}

function getJsxAttributeStringValue(attr: JsxAttribute): string | undefined {
	const init = attr.getInitializer();
	if (!init) return undefined;
	if (init.getKind() === SyntaxKind.StringLiteral) {
		return unquoteStringLiteralText(init.getText());
	}
	if (init.getKind() === SyntaxKind.JsxExpression) {
		const expr = init.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
		if (!expr) return undefined;
		if (expr.getKind() === SyntaxKind.StringLiteral) {
			return unquoteStringLiteralText(expr.getText());
		}
	}
	return undefined;
}

function findJsxNodeByDataLui(
	sourceFile: import('ts-morph').SourceFile,
	elementId: string
): JsxElement | JsxSelfClosingElement | undefined {
	const want = String(elementId || '');
	if (!want) return undefined;

	const candidates: Array<JsxElement | JsxSelfClosingElement> = [];
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) candidates.push(el);
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) candidates.push(el);

	for (const node of candidates) {
		const opening = getOpeningElement(node);
		if (!opening) continue;
		const attr = opening
			.getAttributes()
			.find(a => a.getKind() === SyntaxKind.JsxAttribute && (a as JsxAttribute).getNameNode().getText() === 'data-lui') as JsxAttribute | undefined;
		if (!attr) continue;
		const val = getJsxAttributeStringValue(attr);
		if (val === want) return node;
	}
	return undefined;
}

function updateJsxInlineStyleByDataLui(
	input: string,
	filePathForProject: string,
	elementId: string,
	newStyles: Record<string, string>
): string {
	const filteredStyles = normalizeInlineStylePatch(newStyles);
	if (Object.keys(filteredStyles).length === 0) return input;

	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });

	const target = findJsxNodeByDataLui(sourceFile, elementId);
	if (!target) return input;
	const opening = getOpeningElement(target);
	if (!opening) return input;

	const styleAttr = opening
		.getAttributes()
		.find(a => a.getKind() === SyntaxKind.JsxAttribute && (a as JsxAttribute).getNameNode().getText() === 'style') as JsxAttribute | undefined;
	if (!styleAttr) {
		opening.addAttribute({
			name: 'style',
			initializer: `{{ ${objectEntries(filteredStyles)} }}`
		});
		return sourceFile.getFullText();
	}

	const init = styleAttr.getInitializer();
	if (!init) {
		styleAttr.setInitializer(`{{ ${objectEntries(filteredStyles)} }}`);
		return sourceFile.getFullText();
	}

	// Expect style={{ ... }}
	if (init.getKind() !== SyntaxKind.JsxExpression) return input;
	const expr = init.asKindOrThrow(SyntaxKind.JsxExpression).getExpression();
	if (!expr || expr.getKind() !== SyntaxKind.ObjectLiteralExpression) return input;

	const obj = expr.asKindOrThrow(SyntaxKind.ObjectLiteralExpression);
	for (const [k, v] of Object.entries(filteredStyles)) {
		const existing = obj.getProperty(k);
		const initializer = `'${v.replace(/'/g, "\\'")}'`;
		if (!existing) {
			obj.addPropertyAssignment({ name: k, initializer });
		} else if (existing.getKind() === SyntaxKind.PropertyAssignment) {
			existing.asKindOrThrow(SyntaxKind.PropertyAssignment).setInitializer(initializer);
		}
	}

	return sourceFile.getFullText();
}

function updateJsxTextByDataLui(
	input: string,
	filePathForProject: string,
	elementId: string,
	newText: string
): string {
	// Keep same safety: refuse braces.
	if (/[{}]/.test(newText)) return input;

	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const target = findJsxNodeByDataLui(sourceFile, elementId);
	if (!target) return input;
	if (target.getKind() !== SyntaxKind.JsxElement) return input;
	const jsxEl = target as JsxElement;
	const opening = jsxEl.getOpeningElement();
	const closing = jsxEl.getClosingElement();
	if (!closing) return input;

	const jsxChildren = jsxEl.getJsxChildren();
	const innerTextNodes = jsxChildren.filter(n => n.getKind() === SyntaxKind.JsxText);
	const hasNested =
		jsxEl.getDescendantsOfKind(SyntaxKind.JsxElement).length > 0 ||
		jsxEl.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement).length > 0;
	if (hasNested) return input;
	if (innerTextNodes.length === 0) return input;

	const start = opening.getEnd();
	const end = closing.getStart();
	const inner = input.slice(start, end);
	const leadingWs = inner.match(/^\s*/)?.[0] ?? '';
	const trailingWs = inner.match(/\s*$/)?.[0] ?? '';
	const nextInner = `${leadingWs}${newText}${trailingWs}`;
	return input.slice(0, start) + nextInner + input.slice(end);
}

function objectEntries(styles: Record<string, string>): string {
	return Object.entries(styles)
		.filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
		.map(([k, v]) => `${k}: '${v.replace(/'/g, "\\'")}'`)
		.join(', ');
}

function normalizeInlineStylePatch(styles: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(styles || {})) {
		if (typeof v !== 'string') continue;
		const trimmed = v.trim();
		if (!trimmed) continue;
		out[k] = trimmed;
	}
	return out;
}

function findNearestJsxNodeAtLine(sourceFile: import('ts-morph').SourceFile, lineNumber: number): JsxElement | JsxSelfClosingElement | undefined {
	const candidates: Array<JsxElement | JsxSelfClosingElement> = [];
	// Expand search to ±2 lines to handle off-by-one from source maps / Babel transforms.
	const minLine = lineNumber - 2;
	const maxLine = lineNumber + 2;

	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
		const start = el.getStartLineNumber();
		const end = el.getEndLineNumber();
		if (start <= maxLine && minLine <= end) candidates.push(el);
	}
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
		const start = el.getStartLineNumber();
		const end = el.getEndLineNumber();
		if (start <= maxLine && minLine <= end) candidates.push(el);
	}

	if (candidates.length === 0) return;
	// Prefer elements whose start line is closest to the target, then smallest span.
	candidates.sort((a, b) => {
		const aDist = Math.abs(a.getStartLineNumber() - lineNumber);
		const bDist = Math.abs(b.getStartLineNumber() - lineNumber);
		if (aDist !== bDist) return aDist - bDist;
		return (a.getEnd() - a.getStart()) - (b.getEnd() - b.getStart());
	});
	return candidates[0];
}

function findBestJsxNodeAtLocation(
	sourceFile: import('ts-morph').SourceFile,
	lineNumber: number,
	columnNumber?: number,
	ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
): JsxElement | JsxSelfClosingElement | undefined {
	const col = typeof columnNumber === 'number' && Number.isFinite(columnNumber) && columnNumber > 0
		? columnNumber
		: undefined;

	// If we have no extra info, keep existing behavior.
	if (!col && !ctx?.tagName) return findNearestJsxNodeAtLine(sourceFile, lineNumber);

	// Expand search to ±2 lines to handle off-by-one from source maps / Babel transforms.
	const minLine = lineNumber - 2;
	const maxLine = lineNumber + 2;

	const candidates: Array<JsxElement | JsxSelfClosingElement> = [];
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
		const start = el.getStartLineNumber();
		const end = el.getEndLineNumber();
		if (start <= maxLine && minLine <= end) candidates.push(el);
	}
	for (const el of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
		const start = el.getStartLineNumber();
		const end = el.getEndLineNumber();
		if (start <= maxLine && minLine <= end) candidates.push(el);
	}
	if (candidates.length === 0) return;

	const preferredDomTag = ctx?.tagName ? String(ctx.tagName).toLowerCase() : undefined;
	const preferredText = ctx?.text ? String(ctx.text).trim().slice(0, 40) : undefined;

	let best: JsxElement | JsxSelfClosingElement | undefined;
	let bestScore = -Infinity;
	for (const node of candidates) {
		const opening = getOpeningElement(node);
		const openStart = opening ? opening.getStart() : node.getStart();
		const lc = sourceFile.getLineAndColumnAtPos(openStart);
		const startLine = lc.line;
		const startCol = lc.column;

		let score = 0;
		// Prefer nodes that start near the debugSource line/col.
		score -= Math.abs(startLine - lineNumber) * 200;
		if (col) score -= Math.abs(startCol - col) * 3;
		// Prefer smaller (more specific) nodes when tied.
		score -= Math.min(20000, node.getEnd() - node.getStart()) * 0.001;
		if (opening && opening.getStartLineNumber() === lineNumber) score += 25;

		if (opening && preferredDomTag) {
			try {
				const jsxTag = opening.getTagNameNode().getText().toLowerCase();
				// Strongly prefer exact DOM-tag matches (e.g. <button>).
				if (jsxTag === preferredDomTag) score += 60;
			} catch {}
		}

		if (preferredText && node.getKind() === SyntaxKind.JsxElement) {
			try {
				const el = node as JsxElement;
				const innerText = el.getChildrenOfKind(SyntaxKind.JsxText).map(t => t.getText()).join(' ').replace(/\s+/g, ' ').trim();
				if (innerText && innerText.includes(preferredText)) score += 30;
			} catch {}
		}

		if (score > bestScore) {
			bestScore = score;
			best = node;
		}
	}

	return best ?? findNearestJsxNodeAtLine(sourceFile, lineNumber);
}

function getOpeningElement(node: JsxElement | JsxSelfClosingElement): import('ts-morph').JsxOpeningElement | JsxSelfClosingElement | undefined {
	if (node.getKind() === SyntaxKind.JsxSelfClosingElement) {
		return node as JsxSelfClosingElement;
	}
	if (node.getKind() === SyntaxKind.JsxElement) {
		return (node as JsxElement).getOpeningElement();
	}
	return;
}

// ===== i18n Support =====

/**
 * Common i18n translation file locations to search.
 */
const I18N_FILE_PATTERNS = [
	'src/locales/en.json',
	'src/locales/en/translation.json',
	'public/locales/en/translation.json',
	'public/locales/en.json',
	'locales/en/translation.json',
	'locales/en.json',
	'src/i18n/en.json',
	'i18n/en.json',
	'src/translations/en.json',
	'translations/en.json',
];

/**
 * Extracts the i18n key from a JSX element's content if it uses t('key') or {t('key')} pattern.
 */
function extractI18nKeyFromJsxContent(
	input: string,
	filePathForProject: string,
	lineNumber: number,
	columnNumber?: number,
	ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
): string | undefined {
	const project = new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true });
	const sourceFile = project.createSourceFile(filePathForProject, input, { overwrite: true });
	const target = findBestJsxNodeAtLocation(sourceFile, lineNumber, columnNumber, ctx);
	if (!target) return undefined;
	if (target.getKind() !== SyntaxKind.JsxElement) return undefined;

	const jsxEl = target as JsxElement;
	const opening = jsxEl.getOpeningElement();
	const closing = jsxEl.getClosingElement();
	if (!closing) return undefined;

	const start = opening.getEnd();
	const end = closing.getStart();
	const inner = input.slice(start, end).trim();

	// Match patterns like {t('key')}, {t("key")}, t('key'), t("key")
	const patterns = [
		/^\{t\(['"]([^'"]+)['"]\)\}$/,
		/^\{t\(['"]([^'"]+)['"],\s*\{[^}]*\}\)\}$/,  // t('key', { options })
		/^t\(['"]([^'"]+)['"]\)$/,
	];

	for (const pattern of patterns) {
		const match = inner.match(pattern);
		if (match?.[1]) {
			return match[1];
		}
	}

	return undefined;
}

/**
 * Find the i18n translation file in the workspace.
 */
function findI18nFile(fileUri: vscode.Uri): string | undefined {
	// Start from the file's directory and walk up to find project root
	let dir = path.dirname(fileUri.fsPath);
	const maxDepth = 10;
	let depth = 0;

	while (depth < maxDepth) {
		// Check if this looks like a project root (has package.json)
		const pkgPath = path.join(dir, 'package.json');
		if (fs.existsSync(pkgPath)) {
			// Search for translation files from this root
			for (const pattern of I18N_FILE_PATTERNS) {
				const candidate = path.join(dir, pattern);
				if (fs.existsSync(candidate)) {
					return candidate;
				}
			}
		}

		const parent = path.dirname(dir);
		if (parent === dir) break;
		dir = parent;
		depth++;
	}

	return undefined;
}

/**
 * Get a nested value from an object using a dot-separated key.
 */
function getNestedValue(obj: any, key: string): any {
	const parts = key.split('.');
	let current = obj;
	for (const part of parts) {
		if (current == null || typeof current !== 'object') return undefined;
		current = current[part];
	}
	return current;
}

/**
 * Set a nested value in an object using a dot-separated key.
 */
function setNestedValue(obj: any, key: string, value: any): void {
	const parts = key.split('.');
	let current = obj;
	for (let i = 0; i < parts.length - 1; i++) {
		const part = parts[i];
		if (current[part] == null || typeof current[part] !== 'object') {
			current[part] = {};
		}
		current = current[part];
	}
	current[parts[parts.length - 1]] = value;
}

/**
 * Detect if the JSX uses i18n and update the translation file if so.
 */
function detectAndUpdateI18n(
	input: string,
	fileUri: vscode.Uri,
	lineNumber: number,
	newText: string,
	columnNumber?: number,
	ctx?: { tagName: string; id?: string; classList?: string[]; role?: string; href?: string; type?: string; text?: string }
): UpdateTextResult | undefined {
	const i18nKey = extractI18nKeyFromJsxContent(input, fileUri.fsPath, lineNumber, columnNumber, ctx);
	if (!i18nKey) {
		return undefined; // Not an i18n element, let caller handle normally
	}

	// Find the translation file
	const i18nFile = findI18nFile(fileUri);
	if (!i18nFile) {
		return {
			changed: false,
			i18nKey,
			reason: 'i18n-detected-but-not-found',
		};
	}

	try {
		// Read and parse the translation file
		const content = fs.readFileSync(i18nFile, 'utf8');
		const translations = JSON.parse(content);

		// Check if the key exists
		const currentValue = getNestedValue(translations, i18nKey);
		if (currentValue === undefined) {
			return {
				changed: false,
				i18nKey,
				i18nFile,
				reason: 'i18n-detected-but-not-found',
			};
		}

		// Update the value
		setNestedValue(translations, i18nKey, newText);

		// Write back the file with nice formatting
		fs.writeFileSync(i18nFile, JSON.stringify(translations, null, 2) + '\n', 'utf8');

		return {
			changed: true,
			i18nKey,
			i18nFile,
			reason: 'i18n-updated',
		};
	} catch (err) {
		return {
			changed: false,
			i18nKey,
			i18nFile,
			reason: 'i18n-detected-but-not-found',
		};
	}
}

// Test-only exports for deterministic unit testing (no VS Code workspace required).
// These are internal helpers used by the extension at runtime through the `CodeModifier` class.
export const __testExports = {
	ensureJsxClassNamesAtLocation,
	updateHtmlTextAtLine,
	updateJsxTextAtLine,
	updateHtmlInlineStyle,
	updateJsxInlineStyle,
	updateJsxInlineStyleByDataLui,
	updateJsxTextByDataLui,
};
