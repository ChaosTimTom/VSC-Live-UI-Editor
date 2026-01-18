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
exports.injectSourceMetadataRobust = injectSourceMetadataRobust;
const ts_morph_1 = require("ts-morph");
const parse5 = __importStar(require("parse5"));
const simpleInjector_1 = require("./simpleInjector");
const tsMorphProject = new ts_morph_1.Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
const tsSourceCache = new Map();
const outputCacheByVersion = new Map();
let tsFileCounter = 0;
function hashKey(s) {
    // Small stable hash for in-memory file naming.
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) + h) ^ s.charCodeAt(i);
    }
    return (h >>> 0).toString(16);
}
function escapeHtmlAttribute(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function injectHtmlWithParse5(input, fileId) {
    // Parse as fragment so we don't invent <html>/<head> wrappers.
    const documentFragment = parse5.parseFragment(input, { sourceCodeLocationInfo: true });
    const insertions = [];
    const walk = (node) => {
        if (!node)
            return;
        if (node.nodeName && typeof node.nodeName === 'string' && node.nodeName !== '#text' && node.nodeName !== '#comment') {
            const attrs = Array.isArray(node.attrs) ? node.attrs : [];
            const hasSource = attrs.some(a => a?.name === 'data-source-file' || a?.name === 'data-source-line' || a?.name === 'data-source-column');
            const loc = node.sourceCodeLocation;
            const startTag = loc?.startTag;
            if (!hasSource && startTag && typeof startTag.startLine === 'number' && typeof startTag.startCol === 'number' && typeof startTag.endOffset === 'number') {
                const line = startTag.startLine;
                const column = startTag.startCol;
                const fileAttr = escapeHtmlAttribute(fileId);
                const attrText = ` data-source-file="${fileAttr}" data-source-line="${line}" data-source-column="${column}"`;
                // Insert before ">" or before "/>".
                const endOffset = startTag.endOffset;
                const closeIsSelf = input[endOffset - 2] === '/';
                const insertAt = closeIsSelf ? endOffset - 2 : endOffset - 1;
                if (insertAt > 0 && insertAt <= input.length) {
                    insertions.push({ offset: insertAt, text: attrText });
                }
            }
        }
        const childNodes = Array.isArray(node.childNodes) ? node.childNodes : [];
        for (const c of childNodes)
            walk(c);
        // Some parse5 node shapes also include `content` for template.
        if (node.content)
            walk(node.content);
    };
    const roots = Array.isArray(documentFragment.childNodes) ? documentFragment.childNodes : [];
    for (const r of roots)
        walk(r);
    if (insertions.length === 0)
        return input;
    insertions.sort((a, b) => b.offset - a.offset);
    let out = input;
    for (const ins of insertions) {
        out = out.slice(0, ins.offset) + ins.text + out.slice(ins.offset);
    }
    return out;
}
function getOrCreateTsSourceFile(cacheKey, input) {
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
function injectJsxWithTsMorph(input, fileId, cacheKey) {
    // Use .tsx so TS parses JSX reliably.
    const sourceFile = getOrCreateTsSourceFile(cacheKey, input);
    const fileAttr = escapeHtmlAttribute(fileId);
    const insertions = [];
    const addInsertionForNode = (node, endOffset) => {
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
    for (const node of sourceFile.getDescendantsOfKind(ts_morph_1.SyntaxKind.JsxSelfClosingElement)) {
        const attrs = node.getAttributes();
        const hasSource = attrs.some(a => {
            const nameNode = a.getNameNode?.();
            return nameNode && typeof nameNode.getText === 'function' && nameNode.getText() === 'data-source-file';
        });
        if (hasSource)
            continue;
        addInsertionForNode(node, node.getEnd());
    }
    for (const node of sourceFile.getDescendantsOfKind(ts_morph_1.SyntaxKind.JsxOpeningElement)) {
        const attrs = node.getAttributes();
        const hasSource = attrs.some(a => {
            const nameNode = a.getNameNode?.();
            return nameNode && typeof nameNode.getText === 'function' && nameNode.getText() === 'data-source-file';
        });
        if (hasSource)
            continue;
        addInsertionForNode(node, node.getEnd());
    }
    if (insertions.length === 0)
        return input;
    insertions.sort((a, b) => b.offset - a.offset);
    let out = input;
    for (const ins of insertions) {
        out = out.slice(0, ins.offset) + ins.text + out.slice(ins.offset);
    }
    return out;
}
function injectSourceMetadataRobust(input, fileId, options) {
    const lower = fileId.toLowerCase();
    const cacheKey = options?.cacheKey ?? fileId;
    const version = options?.version;
    if (typeof version === 'number') {
        const cached = outputCacheByVersion.get(cacheKey);
        if (cached && cached.version === version)
            return cached.output;
    }
    try {
        if (lower.endsWith('.html') || lower.endsWith('.htm')) {
            const out = injectHtmlWithParse5(input, fileId);
            if (typeof version === 'number')
                outputCacheByVersion.set(cacheKey, { version, output: out });
            return out;
        }
        if (lower.endsWith('.tsx') || lower.endsWith('.jsx')) {
            const out = injectJsxWithTsMorph(input, fileId, cacheKey);
            if (typeof version === 'number')
                outputCacheByVersion.set(cacheKey, { version, output: out });
            return out;
        }
    }
    catch {
        // fall back
    }
    const out = (0, simpleInjector_1.injectSourceMetadata)(input, fileId);
    if (typeof version === 'number')
        outputCacheByVersion.set(cacheKey, { version, output: out });
    return out;
}
//# sourceMappingURL=robustInjector.js.map