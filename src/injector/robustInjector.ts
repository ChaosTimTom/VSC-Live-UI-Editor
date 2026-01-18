import { Project, SyntaxKind } from 'ts-morph';
import * as parse5 from 'parse5';
import { injectSourceMetadata as injectSimple } from './simpleInjector';

type InjectOptions = {
	cacheKey?: string;
	version?: number;
};

const tsMorphProject = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
const tsSourceCache = new Map<string, { fileName: string }>();
const outputCacheByVersion = new Map<string, { version: number; output: string }>();
let tsFileCounter = 0;

function hashKey(s: string): string {
	// Small stable hash for in-memory file naming.
	let h = 5381;
	for (let i = 0; i < s.length; i++) {
		h = ((h << 5) + h) ^ s.charCodeAt(i);
	}
	return (h >>> 0).toString(16);
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function injectHtmlWithParse5(input: string, fileId: string): string {
	// Parse as fragment so we don't invent <html>/<head> wrappers.
	const documentFragment = parse5.parseFragment(input, { sourceCodeLocationInfo: true }) as any;
	const insertions: Array<{ offset: number; text: string }> = [];

	const walk = (node: any) => {
		if (!node) return;
		if (node.nodeName && typeof node.nodeName === 'string' && node.nodeName !== '#text' && node.nodeName !== '#comment') {
			const attrs: Array<{ name: string; value: string }> = Array.isArray(node.attrs) ? node.attrs : [];
			const hasSource = attrs.some(a => a?.name === 'data-source-file' || a?.name === 'data-source-line' || a?.name === 'data-source-column');
			const loc = node.sourceCodeLocation;
			const startTag = loc?.startTag;
			if (!hasSource && startTag && typeof startTag.startLine === 'number' && typeof startTag.startCol === 'number' && typeof startTag.endOffset === 'number') {
				const line = startTag.startLine;
				const column = startTag.startCol;
				const fileAttr = escapeHtmlAttribute(fileId);
				const attrText = ` data-source-file="${fileAttr}" data-source-line="${line}" data-source-column="${column}"`;

				// Insert before ">" or before "/>".
				const endOffset: number = startTag.endOffset;
				const closeIsSelf = input[endOffset - 2] === '/';
				const insertAt = closeIsSelf ? endOffset - 2 : endOffset - 1;
				if (insertAt > 0 && insertAt <= input.length) {
					insertions.push({ offset: insertAt, text: attrText });
				}
			}
		}

		const childNodes: any[] = Array.isArray(node.childNodes) ? node.childNodes : [];
		for (const c of childNodes) walk(c);
		// Some parse5 node shapes also include `content` for template.
		if (node.content) walk(node.content);
	};

	const roots: any[] = Array.isArray((documentFragment as any).childNodes) ? (documentFragment as any).childNodes : [];
	for (const r of roots) walk(r);

	if (insertions.length === 0) return input;
	insertions.sort((a, b) => b.offset - a.offset);
	let out = input;
	for (const ins of insertions) {
		out = out.slice(0, ins.offset) + ins.text + out.slice(ins.offset);
	}
	return out;
}

function getOrCreateTsSourceFile(cacheKey: string, input: string) {
	let entry = tsSourceCache.get(cacheKey);
	if (!entry) {
		const name = `injected_${hashKey(cacheKey)}_${tsFileCounter++}.tsx`;
		entry = { fileName: name };
		tsSourceCache.set(cacheKey, entry);
	}
	const existing = tsMorphProject.getSourceFile(entry.fileName);
	if (!existing) {
		return tsMorphProject.createSourceFile(entry.fileName, input, { overwrite: true });
	}
	existing.replaceWithText(input);
	return existing;
}

function injectJsxWithTsMorph(input: string, fileId: string, cacheKey: string): string {
	// Use .tsx so TS parses JSX reliably.
	const sourceFile = getOrCreateTsSourceFile(cacheKey, input);
	const fileAttr = escapeHtmlAttribute(fileId);

	const insertions: Array<{ offset: number; text: string }> = [];

	const addInsertionForNode = (node: any, endOffset: number) => {
		const pos = node.getStart();
		const lc = sourceFile.getLineAndColumnAtPos(pos);
		const line = lc.line;
		const column = lc.column;
		const attrText = ` data-source-file=\"${fileAttr}\" data-source-line=\"${line}\" data-source-column=\"${column}\"`;
		const closeIsSelf = input[endOffset - 2] === '/';
		const insertAt = closeIsSelf ? endOffset - 2 : endOffset - 1;
		if (insertAt > 0 && insertAt <= input.length) {
			insertions.push({ offset: insertAt, text: attrText });
		}
	};

	for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
		const attrs = node.getAttributes();
		const hasSource = attrs.some(a => {
			const nameNode = (a as any).getNameNode?.();
			return nameNode && typeof nameNode.getText === 'function' && nameNode.getText() === 'data-source-file';
		});
		if (hasSource) continue;
		addInsertionForNode(node, node.getEnd());
	}

	for (const node of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
		const attrs = node.getAttributes();
		const hasSource = attrs.some(a => {
			const nameNode = (a as any).getNameNode?.();
			return nameNode && typeof nameNode.getText === 'function' && nameNode.getText() === 'data-source-file';
		});
		if (hasSource) continue;
		addInsertionForNode(node, node.getEnd());
	}

	if (insertions.length === 0) return input;
	insertions.sort((a, b) => b.offset - a.offset);
	let out = input;
	for (const ins of insertions) {
		out = out.slice(0, ins.offset) + ins.text + out.slice(ins.offset);
	}
	return out;
}

export function injectSourceMetadataRobust(input: string, fileId: string, options?: InjectOptions): string {
	const lower = fileId.toLowerCase();
	const cacheKey = options?.cacheKey ?? fileId;
	const version = options?.version;
	if (typeof version === 'number') {
		const cached = outputCacheByVersion.get(cacheKey);
		if (cached && cached.version === version) return cached.output;
	}
	try {
		if (lower.endsWith('.html') || lower.endsWith('.htm')) {
			const out = injectHtmlWithParse5(input, fileId);
			if (typeof version === 'number') outputCacheByVersion.set(cacheKey, { version, output: out });
			return out;
		}
		if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) {
			const out = injectJsxWithTsMorph(input, fileId, cacheKey);
			if (typeof version === 'number') outputCacheByVersion.set(cacheKey, { version, output: out });
			return out;
		}
	} catch {
		// fall back
	}
	const out = injectSimple(input, fileId);
	if (typeof version === 'number') outputCacheByVersion.set(cacheKey, { version, output: out });
	return out;
}
