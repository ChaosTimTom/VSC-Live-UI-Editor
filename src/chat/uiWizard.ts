import * as vscode from 'vscode';
import type { CodeModifier } from '../codeModifier/CodeModifier';

export type SelectedElement = {
	fileId: string;
	line: number;
	column?: number;
	uri: vscode.Uri;
	elementContext?: {
		tagName: string;
		id?: string;
		classList?: string[];
		role?: string;
		href?: string;
		type?: string;
		text?: string;
	};
	ancestors?: Array<{ tagName: string; classList?: string[] }>;
	selectionHints?: {
		isScrollContainer?: boolean;
		isInsideScroll?: boolean;
		isRepeatedItem?: boolean;
		responsiveContainer?: boolean;
		scrollContainer?: { tagName: string; classList?: string[] } | null;
		itemRoot?: { tagName: string; classList?: string[] } | null;
	};
	inlineStyle?: string;
	computedStyle?: Record<string, string>;
};

type PendingApplyScope = {
	key: string;
	patch: Record<string, string>;
	choices: Array<{ id: 'element' | 'allElements' | 'itemRoots' | 'scrollContainer'; label: string; selector?: string }>;
};

function isStableClassName(raw: string): boolean {
	const c = raw.trim();
	if (!c) return false;
	// Don't attempt to match Tailwind arbitrary variants or complex selectors.
	if (c.includes(':') || c.includes('[') || c.includes(']') || c.includes('/') || c.includes('(') || c.includes(')')) return false;
	// Avoid obviously hashed / generated classes.
	if (c.length > 32) return false;
	if (/[A-Fa-f0-9]{8,}/.test(c)) return false;
	return /^[a-zA-Z0-9_-]+$/.test(c);
}

function pickStableClasses(classList: string[] | undefined, max: number): string[] {
	return (classList ?? [])
		.map(c => c.trim())
		.filter(isStableClassName)
		.slice(0, max);
}

function buildScopedCssSelectorFromSelected(selected: SelectedElement): string | undefined {
	const tag = selected.elementContext?.tagName?.toLowerCase();
	if (!tag) return;
	const id = selected.elementContext?.id?.trim();
	if (id && /^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) {
		return `${tag}#${id}`;
	}

	const leafClasses = pickStableClasses(selected.elementContext?.classList, 3);
	const leafSel = leafClasses.length ? `${tag}.${leafClasses.join('.')}` : tag;

	// If App Mode provided the closest scroll container, prefer that as the scope.
	const sc = selected.selectionHints?.scrollContainer;
	if (sc && typeof sc === 'object') {
		const scTag = (sc.tagName || '').toLowerCase();
		const scClasses = pickStableClasses(sc.classList, 2);
		if (scTag && scClasses.length > 0) {
			return `${scTag}.${scClasses.join('.')} ${leafSel}`;
		}
	}

	// Prefer scoping to the nearest useful ancestor so we don't match across the whole page.
	// Only add a single ancestor scope to keep selectors resilient.
	const ancestors = selected.ancestors ?? [];
	for (const a of ancestors) {
		const aTag = (a.tagName || '').toLowerCase();
		if (!aTag) continue;
		const aClasses = pickStableClasses(a.classList, 2);
		if (aClasses.length === 0) continue;
		return `${aTag}.${aClasses.join('.')} ${leafSel}`;
	}

	return leafSel;
}

function parseScopeChoice(prompt: string): '1' | '2' | '3' | '4' | undefined {
	const p = prompt.toLowerCase().trim();
	if (/^\s*1\s*$/.test(p)) return '1';
	if (/^\s*2\s*$/.test(p)) return '2';
	if (/^\s*3\s*$/.test(p)) return '3';
	if (/^\s*4\s*$/.test(p)) return '4';
	if (/\b(this|just this|only this|selected)\b/.test(p)) return '1';
	if (/\b(all|every|everything|entire list|whole list|all of them)\b/.test(p)) return '2';
	if (/\b(item|card)\b/.test(p)) return '3';
	if (/\b(container|scroll)\b/.test(p)) return '4';
	return;
}

function buildSelectorFromNodeSummary(node: { tagName: string; classList?: string[] } | null | undefined): string | undefined {
	if (!node) return;
	const tag = (node.tagName || '').toLowerCase().trim();
	if (!tag) return;
	const classes = pickStableClasses(node.classList, 2);
	return classes.length ? `${tag}.${classes.join('.')}` : tag;
}

function findLikelyItemRoot(selected: SelectedElement): { tagName: string; classList?: string[] } | undefined {
	const hinted = selected.selectionHints?.itemRoot;
	if (hinted && typeof hinted === 'object' && hinted.tagName) {
		return { tagName: hinted.tagName, classList: hinted.classList };
	}
	const sc = selected.selectionHints?.scrollContainer;
	const scTag = (sc && typeof sc === 'object') ? (sc.tagName || '').toLowerCase() : '';
	const scClasses = (sc && typeof sc === 'object') ? (sc.classList ?? []).join(' ') : '';
	for (const a of (selected.ancestors ?? [])) {
		const tag = (a.tagName || '').toLowerCase();
		if (!tag) continue;
		const stable = pickStableClasses(a.classList, 2);
		if (stable.length === 0) continue;
		// Don't pick the scroll container itself as the "item" root.
		if (scTag && tag === scTag && scClasses && (a.classList ?? []).join(' ') === scClasses) continue;
		return { tagName: tag, classList: stable };
	}
	return;
}

type ApplyResult = {
	changed: boolean;
	message: string;
};

type InsertPosition = 'before' | 'after' | 'inside';
type AddIntent =
	| { kind: 'add'; position: InsertPosition; markup: string; label: string }
	| { kind: 'wrapBox'; lineUnder: boolean };

type DataDrivenIntent = {
	kind: 'scrollCards';
	count: number;
	axis: 'x' | 'y';
};

function stripCodeFences(s: string): string {
	const trimmed = s.trim();
	if (!trimmed.startsWith('```')) return trimmed;
	return trimmed
		.replace(/^```[a-zA-Z0-9_-]*\s*/m, '')
		.replace(/\s*```\s*$/m, '')
		.trim();
}

function looksLikeJsx(s: string): boolean {
	const t = s.trim();
	return t.startsWith('<') && t.includes('>');
}

function stripJsonFences(s: string): string {
	const trimmed = s.trim();
	if (!trimmed.startsWith('```')) return trimmed;
	return trimmed
		.replace(/^```[a-zA-Z0-9_-]*\s*/m, '')
		.replace(/\s*```\s*$/m, '')
		.trim();
}

function extractQuotedText(prompt: string): string | undefined {
	const m1 = prompt.match(/"([^"]+)"/);
	if (m1?.[1]) return m1[1];
	const m2 = prompt.match(/'([^']+)'/);
	if (m2?.[1]) return m2[1];
	return;
}

function parseDataDrivenIntent(prompt: string): DataDrivenIntent | undefined {
	const p = prompt.toLowerCase();
	if (!/(scroll|scrollbox|scroll box|carousel|list|cards?)/.test(p)) return;
	if (!/(card|cards)/.test(p)) return;
	const n = p.match(/\b(\d{1,3})\b/);
	const count = n?.[1] ? Math.max(1, Math.min(50, Number(n[1]))) : 10;
	const axis: 'x' | 'y' = /(horizontal|row|carousel)/.test(p) ? 'x' : 'y';
	return { kind: 'scrollCards', count, axis };
}

function inferDataDrivenInsertPosition(prompt: string, selected: SelectedElement): InsertPosition {
	const p = prompt.toLowerCase();
	const wantsInside = /\b(in it|inside|within|into)\b/.test(p);
	const wantsAfter = /\b(below|after|under)\b/.test(p);
	const tag = (selected.elementContext?.tagName || '').toLowerCase();
	const isContainerTag = ['div', 'section', 'main', 'article', 'aside', 'nav', 'header', 'footer', 'body'].includes(tag);
	if (wantsInside) return isContainerTag ? 'inside' : 'after';
	if (wantsAfter) return 'after';
	// Default: prefer inserting inside containers so content stays constrained.
	return isContainerTag ? 'inside' : 'after';
}

function buildJsxScrollCardsMarkup(args: { count: number; axis: 'x' | 'y'; varName: string }): string {
	const containerStyle = args.axis === 'x'
		? `{ display: 'flex', flexDirection: 'row', gap: '12px', overflowX: 'auto', padding: '4px', WebkitOverflowScrolling: 'touch' }`
		: `{ display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', maxHeight: '420px', padding: '4px' }`;
	const cardStyle = `{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: '12px', padding: '12px', background: 'rgba(255,255,255,0.06)' }`;
	return (
		`<div data-live-ui-group-root="1" style=${containerStyle}>\n` +
		`  {${args.varName}.map((item) => (\n` +
		`    <div key={item.id} style=${cardStyle}>\n` +
		`      <div style={{ fontWeight: '600' }}>{item.title}</div>\n` +
		`      <div style={{ opacity: '0.8', fontSize: '14px' }}>{item.subtitle}</div>\n` +
		`    </div>\n` +
		`  ))}\n` +
		`</div>`
	);
}

function buildHtmlScrollCardsMarkup(args: { count: number; axis: 'x' | 'y'; includeAuthors?: boolean }): string {
	const shellStyle = [
		'width: 100%','box-sizing: border-box','margin-top: 16px',
		'border: 1px solid rgba(255,255,255,0.18)','border-radius: 14px',
		'background: rgba(0,0,0,0.18)','backdrop-filter: blur(10px)','padding: 12px'
	].join('; ');
	const containerStyle = args.axis === 'x'
		? `${shellStyle}; display:flex; flex-direction:row; gap:12px; overflow-x:auto; max-width:100%; -webkit-overflow-scrolling:touch;`
		: `${shellStyle}; display:flex; flex-direction:column; gap:12px; overflow-y:auto; max-height:180px;`;
	const cardStyle = [
		'flex: 0 0 auto','min-width: 220px',
		'border:1px solid rgba(255,255,255,0.14)','border-radius:12px',
		'padding:12px','background:rgba(255,255,255,0.06)','color:#E5E7EB'
	].join('; ');
	const authors = [
		'Ava Johnson','Noah Kim','Mia Patel','Liam Garcia','Sophia Chen',
		'Elijah Brown','Isabella Nguyen','James Wilson','Olivia Martinez','Ethan Davis'
	];
	const cards = Array.from({ length: args.count }, (_, i) => {
		const idx = i + 1;
		const author = authors[i % authors.length];
		const subtitle = args.includeAuthors ? `By ${author}` : 'Description';
		return `<div style="${cardStyle}"><div style="font-weight:600;">Card ${idx}</div><div style="opacity:0.8; font-size:14px;">${subtitle}</div></div>`;
	}).join('\n');
	return `<div data-live-ui-group-root="1" style="${containerStyle}">\n${cards}\n</div>`;
}

function escapeHtmlText(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtmlAttr(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function cssToReactStyleObject(css: string): Record<string, string> {
	const out: Record<string, string> = {};
	css
		.split(';')
		.map(p => p.trim())
		.filter(Boolean)
		.forEach(part => {
			const [kRaw, ...rest] = part.split(':');
			if (!kRaw || rest.length === 0) return;
			const k = kRaw.trim().toLowerCase();
			const v = rest.join(':').trim();
			if (!v) return;
			// kebab-case -> camelCase
			const camel = k.replace(/-([a-z])/g, (_, c) => String(c).toUpperCase());
			out[camel] = v;
		});
	return out;
}

function reactStyleToCss(style: Record<string, string>): string {
	const entries: string[] = [];
	for (const [k, v] of Object.entries(style)) {
		if (!v) continue;
		const kebab = k
			.replace(/([a-z0-9])([A-Z])/g, '$1-$2')
			.replace(/_/g, '-')
			.toLowerCase();
		entries.push(`${kebab}: ${v}`);
	}
	return entries.join('; ');
}

function stripLayoutCss(css: string): string {
	const disallow = new Set(['width', 'height', 'transform', 'left', 'top', 'right', 'bottom', 'position', 'margin', 'margin-left', 'margin-right', 'margin-top', 'margin-bottom']);
	const kept: string[] = [];
	css
		.split(';')
		.map(p => p.trim())
		.filter(Boolean)
		.forEach(part => {
			const [kRaw, ...rest] = part.split(':');
			if (!kRaw || rest.length === 0) return;
			const k = kRaw.trim().toLowerCase();
			if (disallow.has(k)) return;
			kept.push(`${k}: ${rest.join(':').trim()}`);
		});
	return kept.join('; ');
}

function pickTypographyCss(css: string): string {
	const allow = new Set([
		'color',
		'opacity',
		'font-family',
		'font-size',
		'font-weight',
		'letter-spacing',
		'line-height',
		'text-transform',
		'text-decoration',
		'text-shadow',
	]);
	const kept: string[] = [];
	css
		.split(';')
		.map(p => p.trim())
		.filter(Boolean)
		.forEach(part => {
			const [kRaw, ...rest] = part.split(':');
			if (!kRaw || rest.length === 0) return;
			const k = kRaw.trim().toLowerCase();
			if (!allow.has(k)) return;
			const v = rest.join(':').trim();
			if (!v) return;
			kept.push(`${k}: ${v}`);
		});
	return kept.join('; ');
}

function pickBoxCss(css: string): string {
	const allow = new Set([
		'background',
		'background-color',
		'background-image',
		'background-size',
		'background-position',
		'background-repeat',
		'border',
		'border-color',
		'border-width',
		'border-style',
		'border-radius',
		'box-shadow',
		'padding',
		'padding-left',
		'padding-right',
		'padding-top',
		'padding-bottom',
		'filter',
		'backdrop-filter',
	]);
	const kept: string[] = [];
	css
		.split(';')
		.map(p => p.trim())
		.filter(Boolean)
		.forEach(part => {
			const [kRaw, ...rest] = part.split(':');
			if (!kRaw || rest.length === 0) return;
			const k = kRaw.trim().toLowerCase();
			if (!allow.has(k)) return;
			const v = rest.join(':').trim();
			if (!v) return;
			kept.push(`${k}: ${v}`);
		});
	return kept.join('; ');
}

function pickDividerCss(css: string): string {
	// Try to derive an <hr>-friendly style from the selected element.
	const kv = new Map<string, string>();
	css
		.split(';')
		.map(p => p.trim())
		.filter(Boolean)
		.forEach(part => {
			const [kRaw, ...rest] = part.split(':');
			if (!kRaw || rest.length === 0) return;
			const k = kRaw.trim().toLowerCase();
			const v = rest.join(':').trim();
			if (!v) return;
			kv.set(k, v);
		});

	let borderTop = kv.get('border-top');
	if (!borderTop) borderTop = kv.get('border-bottom');
	if (!borderTop) borderTop = kv.get('border');
	if (!borderTop) {
		const color = kv.get('border-top-color') ?? kv.get('border-bottom-color') ?? kv.get('border-color') ?? kv.get('background-color');
		const width = kv.get('border-top-width') ?? kv.get('border-bottom-width') ?? kv.get('border-width') ?? '1px';
		const style = kv.get('border-top-style') ?? kv.get('border-bottom-style') ?? kv.get('border-style') ?? 'solid';
		if (color) borderTop = `${width} ${style} ${color}`;
	}

	const margin = kv.get('margin');
	const marginTop = kv.get('margin-top');
	const marginBottom = kv.get('margin-bottom');
	const opacity = kv.get('opacity');

	const parts: string[] = [];
	parts.push('border: 0');
	parts.push(`border-top: ${borderTop ?? '1px solid rgba(255,255,255,0.22)'}`);
	if (opacity) parts.push(`opacity: ${opacity}`);
	if (margin) parts.push(`margin: ${margin}`);
	else if (marginTop || marginBottom) {
		if (marginTop) parts.push(`margin-top: ${marginTop}`);
		if (marginBottom) parts.push(`margin-bottom: ${marginBottom}`);
		// keep a sensible default for left/right spacing
		parts.push('margin-left: 0');
		parts.push('margin-right: 0');
	} else {
		parts.push('margin: 12px 0');
	}
	return parts.join('; ');
}

function getSelectedInlineOrComputedCss(selected: SelectedElement): string {
	if (selected.inlineStyle && selected.inlineStyle.trim()) return selected.inlineStyle;
	if (selected.computedStyle && Object.keys(selected.computedStyle).length > 0) return reactStyleToCss(selected.computedStyle);
	return '';
}

function appendSpacingCss(base: string, position: InsertPosition): string {
	const trimmed = base.trim();
	const sep = trimmed && !trimmed.endsWith(';') ? '; ' : '';
	if (position === 'before') return `${trimmed}${sep}margin-right: 12px`;
	if (position === 'after') return `${trimmed}${sep}margin-left: 12px`;
	return `${trimmed}${sep}margin-top: 12px`;
}

function parseInsertPosition(prompt: string): InsertPosition {
	const p = prompt.toLowerCase();
	if (/\binside\b|\bin\s+this\b|\bwithin\b/.test(p)) return 'inside';
	if (/\babove\b|\bbefore\b/.test(p)) return 'before';
	if (/\bbelow\b|\bafter\b|\bnext\s+to\b|\bbeside\b|\bto\s+the\s+right\b/.test(p)) return 'after';
	return 'after';
}

function parseAddIntent(prompt: string, selected: SelectedElement): AddIntent | undefined {
	const p = prompt.toLowerCase();
	const position = parseInsertPosition(prompt);
	const likeThis = /\blike\s+this\b|\bsame\s+style\b|\bmatch\s+this\b/i.test(prompt);

	// Wrap intent
	const wantsWrapBox = /\bwrap\b.*\bbox\b|\bbox\s+around\b|\bput\s+in\s+a\s+box\b|\badd\s+a\s+box\b.*\baround\b/i.test(prompt);
	if (wantsWrapBox) {
		const lineUnder = /\bline\s+under\b|\bunderline\b|\bdivider\b/i.test(prompt);
		return { kind: 'wrapBox', lineUnder };
	}

	// Add element intent
	if (!/\badd\b|\binsert\b|\bcreate\b/i.test(prompt)) return;

	const text = extractQuotedText(prompt);

	// Header/heading
	if (/\bheader\b|\bheading\b|\btitle\b|\bh[1-6]\b/.test(p)) {
		const levelMatch = p.match(/\bh([1-6])\b/);
		let level = levelMatch ? Number(levelMatch[1]) : 2;
		if (!levelMatch && likeThis) {
			const selTag = selected.elementContext?.tagName?.toLowerCase();
			const m = selTag?.match(/^h([1-6])$/);
			if (m?.[1]) level = Number(m[1]);
		}
		const tag = `h${Math.min(6, Math.max(1, level))}`;
		const label = 'header';
		const content = escapeHtmlText(text ?? 'New Header');
		const isJsx = /\.(tsx|jsx|ts|js)$/i.test(selected.uri.fsPath);
		if (likeThis) {
			const baseCss = stripLayoutCss(getSelectedInlineOrComputedCss(selected));
			const typoCss = pickTypographyCss(baseCss);
			if (typoCss.trim()) {
				if (isJsx) {
					const obj = cssToReactStyleObject(typoCss);
					const entries = Object.entries(obj)
						.map(([k, v]) => `${k}: '${String(v).replace(/'/g, "\\'")}'`)
						.join(', ');
					return { kind: 'add', position, label, markup: `<${tag} style={{ ${entries} }}>${content}</${tag}>` };
				}
				return { kind: 'add', position, label, markup: `<${tag} style="${escapeHtmlAttr(typoCss)}">${content}</${tag}>` };
			}
		}
		return { kind: 'add', position, label, markup: `<${tag}>${content}</${tag}>` };
	}

	// Button
	if (/\bbutton\b/.test(p)) {
		const label = 'button';
		const content = escapeHtmlText(text ?? 'New Button');
		const selectedTag = selected.elementContext?.tagName?.toLowerCase();
		const isJsx = /\.(tsx|jsx|ts|js)$/i.test(selected.uri.fsPath);

		// If we're adding near an existing button, clone its style.
		if (selectedTag === 'button') {
			if (isJsx) {
				// Prefer inlineStyle if present; otherwise fall back to computedStyle.
				const baseObj = selected.inlineStyle ? cssToReactStyleObject(selected.inlineStyle) : (selected.computedStyle ?? {});
				// Drop layout-ish keys.
				delete baseObj.width;
				delete baseObj.height;
				delete baseObj.transform;
				delete baseObj.margin;
				delete baseObj.marginLeft;
				delete baseObj.marginRight;
				delete baseObj.marginTop;
				delete baseObj.marginBottom;
				// Add a small gap.
				if (position === 'after') baseObj.marginLeft = '12px';
				else if (position === 'before') baseObj.marginRight = '12px';
				else baseObj.marginTop = '12px';
				const styleEntries = Object.entries(baseObj)
					.map(([k, v]) => `${k}: '${String(v).replace(/'/g, "\\'")}'`)
					.join(', ');
				return { kind: 'add', position, label, markup: `<button style={{ ${styleEntries} }}>${content}</button>` };
			}
			// HTML
			const baseCss = selected.inlineStyle ? stripLayoutCss(selected.inlineStyle) : stripLayoutCss(reactStyleToCss(selected.computedStyle ?? {}));
			const withGap = appendSpacingCss(baseCss, position);
			return { kind: 'add', position, label, markup: `<button style=\"${escapeHtmlAttr(withGap)}\">${content}</button>` };
		}

		// No nearby button: basic button.
		return { kind: 'add', position, label, markup: isJsx ? `<button>${content}</button>` : `<button>${content}</button>` };
	}

	// Line/divider
	if (/\bline\b|\bdivider\b|\bseparator\b|\bhr\b/.test(p)) {
		const label = 'divider';
		const isJsx = /\.(tsx|jsx|ts|js)$/i.test(selected.uri.fsPath);
		if (likeThis) {
			const baseCss = stripLayoutCss(getSelectedInlineOrComputedCss(selected));
			const dividerCss = pickDividerCss(baseCss);
			if (isJsx) {
				const obj = cssToReactStyleObject(dividerCss);
				const entries = Object.entries(obj)
					.map(([k, v]) => `${k}: '${String(v).replace(/'/g, "\\'")}'`)
					.join(', ');
				return { kind: 'add', position, label, markup: `<hr style={{ ${entries} }} />` };
			}
			return { kind: 'add', position, label, markup: `<hr style="${escapeHtmlAttr(dividerCss)}" />` };
		}
		return {
			kind: 'add',
			position,
			label,
			markup: `<hr style="border:0; border-top: 1px solid rgba(255,255,255,0.22); margin: 12px 0;" />`
		};
	}

	// Box/container
	if (/\bbox\b|\bcontainer\b|\bcard\b/.test(p)) {
		const label = 'box';
		const content = escapeHtmlText(text ?? 'Box content');
		const isJsx = /\.(tsx|jsx|ts|js)$/i.test(selected.uri.fsPath);
		if (likeThis) {
			const baseCss = stripLayoutCss(getSelectedInlineOrComputedCss(selected));
			const boxCss = pickBoxCss(baseCss);
			if (boxCss.trim()) {
				if (isJsx) {
					const obj = cssToReactStyleObject(boxCss);
					const entries = Object.entries(obj)
						.map(([k, v]) => `${k}: '${String(v).replace(/'/g, "\\'")}'`)
						.join(', ');
					return {
						kind: 'add',
						position,
						label,
						markup: `<div style={{ ${entries} }}><p style={{ margin: 0 }}>${content}</p></div>`
					};
				}
				return {
					kind: 'add',
					position,
					label,
					markup: `<div style="${escapeHtmlAttr(boxCss)}"><p style="margin: 0">${content}</p></div>`
				};
			}
		}
		return {
			kind: 'add',
			position,
			label,
			markup:
				`<div style="border: 1px solid rgba(255,255,255,0.18); border-radius: 12px; padding: 16px; background: rgba(255,255,255,0.04)">` +
				`<p style="margin: 0">${content}</p>` +
				`</div>`
		};
	}

	return;
}

function pickMimeType(fileName: string): string | undefined {
	const lower = fileName.toLowerCase();
	if (lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
	if (lower.endsWith('.gif')) return 'image/gif';
	if (lower.endsWith('.webp')) return 'image/webp';
	if (lower.endsWith('.svg')) return 'image/svg+xml';
	return;
}

async function imageUriToDataUrl(uri: vscode.Uri): Promise<string> {
	const bytes = await vscode.workspace.fs.readFile(uri);
	const mime = pickMimeType(uri.fsPath) ?? 'application/octet-stream';
	if (mime === 'image/svg+xml') {
		const text = new TextDecoder('utf-8').decode(bytes);
		return `data:${mime};utf8,${encodeURIComponent(text)}`;
	}
	const base64 = Buffer.from(bytes).toString('base64');
	return `data:${mime};base64,${base64}`;
}

const ALLOWED_STYLE_KEYS = new Set([
	'width',
	'height',
	'transform',
	'color',
	'background',
	'backgroundColor',
	'backgroundImage',
	'backgroundSize',
	'backgroundPosition',
	'backgroundRepeat',
	'border',
	'borderColor',
	'borderWidth',
	'borderStyle',
	'borderRadius',
	'boxShadow',
	'opacity',
	'fontFamily',
	'fontSize',
	'fontWeight',
	'letterSpacing',
	'lineHeight',
	'textTransform',
	'textDecoration',
	'textShadow',
	'padding',
	'paddingLeft',
	'paddingRight',
	'paddingTop',
	'paddingBottom',
	'margin',
	'marginLeft',
	'marginRight',
	'marginTop',
	'marginBottom',
	'backdropFilter',
	'filter',
]);

type ElementKind = 'text' | 'control' | 'image' | 'container' | 'unknown';

function inferElementKind(selected: SelectedElement): ElementKind {
	const tag = selected.elementContext?.tagName?.toLowerCase();
	const role = selected.elementContext?.role?.toLowerCase();
	if (!tag) return 'unknown';
	if (tag === 'img' || role === 'img') return 'image';
	if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return 'control';
	if (role === 'button' || role === 'switch' || role === 'checkbox' || role === 'radio') return 'control';
	if (tag === 'a' || tag === 'span' || tag === 'strong' || tag === 'em' || tag === 'small') return 'text';
	if (tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'text';
	if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'header' || tag === 'footer' || tag === 'main' || tag === 'nav') return 'container';
	return 'unknown';
}

function filterStylePatchForElement(kind: ElementKind, patch: Record<string, string>): Record<string, string> {
	// We want to prevent silly changes like rounding corners on plain text.
	// Keep this conservative: filter only the most obviously wrong properties.
	if (kind === 'text') {
		const disallow = new Set([
			'background',
			'backgroundColor',
			'backgroundImage',
			'backgroundSize',
			'backgroundPosition',
			'backgroundRepeat',
			'border',
			'borderColor',
			'borderWidth',
			'borderStyle',
			'borderRadius',
			'boxShadow',
			'padding',
			'paddingLeft',
			'paddingRight',
			'paddingTop',
			'paddingBottom',
			'margin',
			'marginLeft',
			'marginRight',
			'marginTop',
			'marginBottom',
			'backdropFilter',
		]);
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(patch)) {
			if (disallow.has(k)) continue;
			out[k] = v;
		}
		return out;
	}
	if (kind === 'image') {
		const disallow = new Set(['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textTransform', 'textDecoration', 'textShadow', 'color']);
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(patch)) {
			if (disallow.has(k)) continue;
			out[k] = v;
		}
		return out;
	}
	return patch;
}

function inferKindForTagName(tagName: string): ElementKind {
	const tag = tagName.toLowerCase();
	if (tag === 'img') return 'image';
	if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea') return 'control';
	if (tag === 'a' || tag === 'span' || tag === 'strong' || tag === 'em' || tag === 'small') return 'text';
	if (tag === 'p' || tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4' || tag === 'h5' || tag === 'h6') return 'text';
	if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'header' || tag === 'footer' || tag === 'main' || tag === 'nav') return 'container';
	return 'unknown';
}

// "Text" here means readable content on the page that is NOT a button or link.
// Keep this tag list conservative to avoid styling layout containers.
const TEXT_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'label', 'li', 'small', 'strong', 'em'] as const;

function wantsBulkTextSizing(prompt: string): boolean {
	return /\b(font\s*size|text\s*size|size|bigger|smaller|larger|tiny|huge|\d+(?:\.\d+)?(px|rem|em))\b/i.test(prompt);
}

function parseApplyAllTargets(prompt: string, selected: SelectedElement): { tagNames: string[]; label: string; kind: ElementKind } | undefined {
	const p = prompt.toLowerCase();
	const selectedTag = selected.elementContext?.tagName?.toLowerCase();
	const selectedKind = selectedTag ? inferKindForTagName(selectedTag) : inferElementKind(selected);

	// Explicit targets in the prompt.
	if (/\bbuttons?\b/.test(p)) return { tagNames: ['button'], label: 'buttons', kind: 'control' };
	// Explicit textarea control.
	if (/\btextarea\b/.test(p)) {
		return { tagNames: ['textarea'], label: 'textareas', kind: 'control' };
	}
	// Plain-English intent: "text areas" = all page text (excluding buttons + links).
	if (/\btext\s*areas?\b/.test(p) || /\ball\s+text\b/.test(p) || /\bpage\s+text\b/.test(p)) {
		return { tagNames: [...TEXT_TAGS], label: 'text on the page (excluding buttons/links)', kind: 'text' };
	}
	// Generic text content (headings/paragraphs/inline text)
	if (/\btypography\b/.test(p) || /\btext\b/.test(p) || /\bcopy\b/.test(p)) return { tagNames: [...TEXT_TAGS], label: 'text on the page (excluding buttons/links)', kind: 'text' };
	if (/\bheadings?\b|\btitles?\b/.test(p)) return { tagNames: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'], label: 'headings', kind: 'text' };
	if (/\bparagraphs?\b/.test(p)) return { tagNames: ['p'], label: 'paragraphs', kind: 'text' };
	if (/\blinks?\b|\banchors?\b/.test(p)) return { tagNames: ['a'], label: 'links', kind: 'text' };
	if (/\binputs?\b/.test(p)) return { tagNames: ['input'], label: 'inputs', kind: 'control' };

	// Default: apply to all tags of the selected element type.
	if (selectedTag) {
		return { tagNames: [selectedTag], label: `${selectedTag} elements`, kind: inferKindForTagName(selectedTag) };
	}

	return;
}

function hasIntentApplyCurrentStyle(prompt: string): boolean {
	return /\b(this|current|same)\b.*\bstyle\b/i.test(prompt) || /\bapply\b.*\bstyle\b.*\bto\s+all\b/i.test(prompt);
}

function wantsVisualBoxStyles(prompt: string): boolean {
	return /\b(background|border|shadow|box|pill|card|container|glass|glassmorphism)\b/i.test(prompt);
}

function filterPatchForTextStyleOnly(patch: Record<string, string>): Record<string, string> {
	const allow = new Set([
		'color',
		'opacity',
		'fontFamily',
		'fontWeight',
		'letterSpacing',
		'textTransform',
		'textDecoration',
		'textShadow',
	]);
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(patch)) {
		if (!allow.has(k)) continue;
		out[k] = v;
	}
	return out;
}

function stripTextSizing(patch: Record<string, string>): Record<string, string> {
	const out: Record<string, string> = { ...patch };
	delete out.fontSize;
	delete out.lineHeight;
	return out;
}

function validateStyleObject(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== 'object') return;
	const v = value as Record<string, unknown>;
	const out: Record<string, string> = {};
	for (const [k, raw] of Object.entries(v)) {
		if (!ALLOWED_STYLE_KEYS.has(k)) continue;
		if (typeof raw === 'string') {
			out[k] = raw;
			continue;
		}
		if (typeof raw === 'number' && Number.isFinite(raw)) {
			// Interpret numbers as px for common numeric properties.
			const pxKeys = new Set(['width', 'height', 'fontSize', 'borderRadius', 'padding', 'margin']);
			out[k] = pxKeys.has(k) ? `${Math.round(raw)}px` : String(raw);
		}
	}
	return Object.keys(out).length > 0 ? out : undefined;
}

async function getAnyCopilotModel(token: vscode.CancellationToken): Promise<vscode.LanguageModelChat | undefined> {
	try {
		const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
		return models[0];
	} catch {
		return;
	}
}

async function inferStylePatchWithModel(args: {
	model: vscode.LanguageModelChat;
	userPrompt: string;
	selectedSnippet?: string;
	selected?: SelectedElement;
	allowedKeys?: string[];
	historyText?: string;
	token: vscode.CancellationToken;
}): Promise<Record<string, string> | undefined> {
	const allowedKeys = (args.allowedKeys && args.allowedKeys.length > 0)
		? args.allowedKeys
		: Array.from(ALLOWED_STYLE_KEYS.values());
	const allowed = Array.from(new Set(allowedKeys)).sort().join(', ');
	const kind = args.selected ? inferElementKind(args.selected) : 'unknown';
	const elementCtx = args.selected?.elementContext
		? JSON.stringify(args.selected.elementContext)
		: '(none)';
	const system =
		`You are a senior UI designer + front-end engineer. You must output ONLY strict JSON with this exact shape: {"style":{...}}. ` +
		`No markdown, no backticks, no commentary. ` +
		`Only include keys from this allow-list: ${allowed}. ` +
		`All values should be strings like CSS (e.g. "#ff0000", "12px", "0.6", "0 8px 24px rgba(0,0,0,0.25)"). ` +
		`If the user wants a 3D look, prefer a subtle boxShadow + border + gradient backgroundColor/background. ` +
		`IMPORTANT: Respect element kind. If elementKind is "text", prefer typography/color/textDecoration and avoid borderRadius/boxShadow/backgroundImage unless user explicitly requests a pill/badge look.`;

	const snippet = args.selectedSnippet ? `\n\nSelected JSX/HTML snippet:\n${args.selectedSnippet}` : '';
	const history = args.historyText ? `\n\nConversation context:\n${args.historyText}` : '';
	const user = `Element kind: ${kind}\nElement context: ${elementCtx}\n\nUser request: ${args.userPrompt}${history}${snippet}\n\nReturn ONLY JSON.`;

	const messages = [
		vscode.LanguageModelChatMessage.User(system),
		vscode.LanguageModelChatMessage.User(user),
	];

	const chatResponse = await args.model.sendRequest(messages, {}, args.token);
	let out = '';
	for await (const fragment of chatResponse.text) {
		out += fragment;
	}
	const jsonText = stripJsonFences(out);
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch {
		return;
	}
	if (!parsed || typeof parsed !== 'object') return;
	const root = parsed as Record<string, unknown>;
	const validated = validateStyleObject(root.style);
	if (!validated) return;
	// Apply per-call allow-list filtering (useful for "only change text color" flows).
	if (args.allowedKeys && args.allowedKeys.length > 0) {
		const allow = new Set(args.allowedKeys);
		for (const k of Object.keys(validated)) {
			if (!allow.has(k)) delete validated[k];
		}
		if (Object.keys(validated).length === 0) return;
	}
	return args.selected ? filterStylePatchForElement(kind, validated) : validated;
}

function parseNumberPx(raw: string | undefined): number | undefined {
	if (!raw) return;
	const m = raw.match(/-?\d+(?:\.\d+)?/);
	if (!m) return;
	const n = Number(m[0]);
	return Number.isFinite(n) ? n : undefined;
}

function parseCommand(prompt: string): {
	setWidthPx?: number;
	setHeightPx?: number;
	moveDx?: number;
	moveDy?: number;
	moveToX?: number;
	moveToY?: number;
} {
	const p = prompt.trim().toLowerCase();

	// width / height
	const widthMatch = p.match(/\bwidth\b[^\d-]*(-?\d+(?:\.\d+)?)/);
	const heightMatch = p.match(/\bheight\b[^\d-]*(-?\d+(?:\.\d+)?)/);

	// move to x/y
	const xMatch = p.match(/\bx\b[^\d-]*(-?\d+(?:\.\d+)?)/);
	const yMatch = p.match(/\by\b[^\d-]*(-?\d+(?:\.\d+)?)/);

	// relative moves
	const rightMatch = p.match(/\bmove\b.*\bright\b[^\d-]*(-?\d+(?:\.\d+)?)/);
	const leftMatch = p.match(/\bmove\b.*\bleft\b[^\d-]*(-?\d+(?:\.\d+)?)/);
	const downMatch = p.match(/\bmove\b.*\bdown\b[^\d-]*(-?\d+(?:\.\d+)?)/);
	const upMatch = p.match(/\bmove\b.*\bup\b[^\d-]*(-?\d+(?:\.\d+)?)/);

	const setWidthPx = widthMatch ? parseNumberPx(widthMatch[1]) : undefined;
	const setHeightPx = heightMatch ? parseNumberPx(heightMatch[1]) : undefined;

	const moveToX = xMatch ? parseNumberPx(xMatch[1]) : undefined;
	const moveToY = yMatch ? parseNumberPx(yMatch[1]) : undefined;

	let moveDx = rightMatch ? parseNumberPx(rightMatch[1]) : undefined;
	if (leftMatch) {
		const v = parseNumberPx(leftMatch[1]);
		if (v !== undefined) moveDx = -v;
	}
	let moveDy = downMatch ? parseNumberPx(downMatch[1]) : undefined;
	if (upMatch) {
		const v = parseNumberPx(upMatch[1]);
		if (v !== undefined) moveDy = -v;
	}

	return { setWidthPx, setHeightPx, moveDx, moveDy, moveToX, moveToY };
}

async function applyUiEdit(codeModifier: CodeModifier, selected: SelectedElement, prompt: string): Promise<ApplyResult> {
	const cmd = parseCommand(prompt);
	const styles: Record<string, string> = {};

	if (cmd.setWidthPx !== undefined) {
		styles.width = `${Math.round(cmd.setWidthPx)}px`;
	}
	if (cmd.setHeightPx !== undefined) {
		styles.height = `${Math.round(cmd.setHeightPx)}px`;
	}

	// Positioning
	const wantsMoveTo = cmd.moveToX !== undefined || cmd.moveToY !== undefined;
	const wantsMoveBy = cmd.moveDx !== undefined || cmd.moveDy !== undefined;

	if (wantsMoveTo || wantsMoveBy) {
		const [currentX, currentY] = await codeModifier.getTranslate(selected.uri, selected.line);
		const nextX = wantsMoveTo ? (cmd.moveToX ?? currentX) : (currentX + (cmd.moveDx ?? 0));
		const nextY = wantsMoveTo ? (cmd.moveToY ?? currentY) : (currentY + (cmd.moveDy ?? 0));
		styles.transform = `translate(${Math.round(nextX)}px, ${Math.round(nextY)}px)`;
	}

	if (Object.keys(styles).length === 0) {
		return {
			changed: false,
			message: "Try: `width 240`, `height 48`, `move right 20`, `move up 10`, or `x 40 y 12`. For styling (color/font/shape/shadow/image), just describe what you want and I'll try to apply it using the model."
		};
	}

	const changed = await codeModifier.updateStyle(selected.uri, selected.line, styles);
	return {
		changed,
		message: changed
			? `Applied: ${Object.keys(styles).join(', ')}`
			: 'No change needed (already matched).'
	};
}

export function registerUiWizard(
	context: vscode.ExtensionContext,
	deps: {
		codeModifier: CodeModifier;
		getSelected: () => SelectedElement | undefined;
		getJsxSelectionAtLine: (uri: vscode.Uri, lineNumber: number) => Promise<{ range: vscode.Range; snippet: string } | undefined>;
		replaceSelectedJsxAtLine: (uri: vscode.Uri, lineNumber: number, newJsx: string) => Promise<boolean>;
		refreshWebviewIfOpen: (uri: vscode.Uri) => Promise<void>;
		previewStyleIfOpen: (file: string, line: number, style: Record<string, string>) => Promise<void>;
		clearPreviewIfOpen: () => Promise<void>;
		requestTargetsIfOpen: (selector: string) => Promise<Array<{ file: string; line: number }>>;
	}
) {
	// Undo stack for chat-driven changes (in-memory, current session only).
	// Each entry is a batch of file snapshots so "apply to all" can be reverted in one step.
	let undoStack: Array<{ label: string; files: Array<{ uri: vscode.Uri; beforeText: string }> }> = [];

	const pushUndoSnapshot = async (label: string, uris: vscode.Uri[]) => {
		const unique = Array.from(new Set(uris.map(u => u.toString()))).map(s => vscode.Uri.parse(s));
		const files: Array<{ uri: vscode.Uri; beforeText: string }> = [];
		for (const uri of unique) {
			const doc = await vscode.workspace.openTextDocument(uri);
			files.push({ uri, beforeText: doc.getText() });
		}
		undoStack.push({ label, files });
		// Cap memory.
		if (undoStack.length > 20) undoStack = undoStack.slice(-20);
	};

	const undoLast = async (selected: SelectedElement): Promise<string> => {
		const entry = undoStack.pop();
		if (!entry) {
			// Fallback: try VS Code's built-in undo on the selected file.
			try {
				const doc = await vscode.workspace.openTextDocument(selected.uri);
				await vscode.window.showTextDocument(doc, { preview: false });
				await vscode.commands.executeCommand('undo');
				return 'Undid last edit (VS Code undo).';
			} catch {
				return 'Nothing to undo yet.';
			}
		}
		for (const f of entry.files) {
			const doc = await vscode.workspace.openTextDocument(f.uri);
			const current = doc.getText();
			if (current === f.beforeText) continue;
			const edit = new vscode.WorkspaceEdit();
			edit.replace(f.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(current.length)), f.beforeText);
			await vscode.workspace.applyEdit(edit);
			await doc.save();
		}
		return `Reverted: ${entry.label}`;
	};

	// MVP multi-turn state (in-memory): last suggested styles + last previewed style.
	let lastSuggestions: Array<{ name: string; description: string; style: Record<string, string> }> = [];
	let lastPreview: { style: Record<string, string>; name?: string } | undefined;
	let pendingApplyScope: PendingApplyScope | undefined;

	// Keep a small amount of "what are we editing" state so follow-ups like
	// "try a different color" keep affecting the same thing.
	type StyleFocus = 'text' | 'box' | 'layout' | 'unknown';
	let lastSelectedKey: string | undefined;
	let lastFocus: StyleFocus | undefined;
	let lastPatchKeys: string[] = [];

	const TEXT_STYLE_KEYS = [
		'color',
		'opacity',
		'fontFamily',
		'fontSize',
		'fontWeight',
		'letterSpacing',
		'lineHeight',
		'textTransform',
		'textDecoration',
		'textShadow',
	];
	const BOX_STYLE_KEYS = [
		'background',
		'backgroundColor',
		'backgroundImage',
		'backgroundSize',
		'backgroundPosition',
		'backgroundRepeat',
		'border',
		'borderColor',
		'borderWidth',
		'borderStyle',
		'borderRadius',
		'boxShadow',
		'padding',
		'paddingLeft',
		'paddingRight',
		'paddingTop',
		'paddingBottom',
		'filter',
		'backdropFilter',
	];
	const LAYOUT_KEYS = ['width', 'height', 'transform', 'margin', 'marginLeft', 'marginRight', 'marginTop', 'marginBottom'];

	const inferFocusFromPrompt = (prompt: string): StyleFocus | undefined => {
		const p = prompt.toLowerCase();
		if (/\b(text|font|typography|label|letters|copy)\b/.test(p)) return 'text';
		if (/\b(background|border|shadow|glow|glass|glassmorphism|pill|card|container|button\s+style)\b/.test(p)) return 'box';
		if (/\b(width|height|move|position|x\b|y\b|align)\b/.test(p)) return 'layout';
		return;
	};

	const isShortFollowup = (prompt: string) => {
		const t = prompt.trim();
		if (t.length === 0) return false;
		if (t.length > 50) return false;
		if (/\b(apply|preview|suggest|ideas|undo|clear)\b/i.test(t)) return false;
		return true;
	};

	const parseChoiceIndex = (prompt: string): number | undefined => {
		const m = prompt.match(/\b(1|2|3)\b/);
		if (!m) return;
		return Number(m[1]) - 1;
	};

	const isApplyAll = (prompt: string) => /\bapply\b.*\b(all|every)\b/i.test(prompt) || /\b(all|every)\b.*\bapply\b/i.test(prompt);
	const isApply = (prompt: string) => /\bapply\b/i.test(prompt);
	const isPreview = (prompt: string) => /\b(preview|show me|what would that look like)\b/i.test(prompt);
	const isSuggest = (prompt: string) => /\b(suggest|ideas|improve|popular apps|modern|style)\b/i.test(prompt);
	const isClearPreview = (prompt: string) => /\b(clear|remove|revert)\b.*\b(preview)\b/i.test(prompt) || /^\s*clear\s*$/i.test(prompt);
	const isUndo = (prompt: string) => /\b(undo|revert that|rollback)\b/i.test(prompt) || /^\s*undo\s*$/i.test(prompt);
	const isHelp = (prompt: string) =>
		/^\s*(help|commands|\?)\b/i.test(prompt) ||
		/^\s*what\s+can\s+you\s+do\b/i.test(prompt) ||
		/\b(list|show)\b.*\b(commands|capabilities)\b/i.test(prompt);

	type HelpTopic = 'all' | 'layout' | 'suggest' | 'bulk' | 'structure' | 'images';

	const parseHelpTopic = (prompt: string): HelpTopic | undefined => {
		const p = prompt.toLowerCase().trim();
		const m = p.match(/\b(?:commands|help)\s+for\s+([a-z\-\s]+)\b/);
		const raw = (m?.[1] ?? '').trim();
		if (!raw) return;
		// Element-focused aliases
		if (/\b(button|buttons)\b/.test(raw)) return 'structure';
		if (/\b(text|typography|copy|paragraph|paragraphs)\b/.test(raw)) return 'bulk';
		if (/\b(heading|headings|header|headers|h1|h2|h3|h4|h5|h6|title|titles)\b/.test(raw)) return 'structure';
		if (/\b(link|links|anchor|anchors)\b/.test(raw)) return 'bulk';
		if (/\b(layout|move|position|drag|resize|size)\b/.test(raw)) return 'layout';
		if (/\b(suggest|preview|apply)\b/.test(raw)) return 'suggest';
		if (/\b(bulk|all|every)\b/.test(raw)) return 'bulk';
		if (/\b(structure|add|insert|wrap|divider|header|box|button)\b/.test(raw)) return 'structure';
		if (/\b(image|images|background image|photo)\b/.test(raw)) return 'images';
		if (/\b(all|everything)\b/.test(raw)) return 'all';
		return;
	};

	const inferDefaultHelpTopicFromSelection = (selected?: SelectedElement): HelpTopic => {
		const tag = selected?.elementContext?.tagName?.toLowerCase();
		if (!tag) return 'all';
		if (tag === 'img') return 'images';
		if (tag === 'button') return 'structure';
		if (tag === 'a') return 'bulk';
		if (/^h[1-6]$/.test(tag)) return 'structure';
		return 'all';
	};

	const renderHelp = (topic: HelpTopic) => {
		const header = [
			'### UI Wizard commands',
			'',
			'Say: `commands for layout`, `commands for bulk`, `commands for structure`, `commands for images`, or just `commands`.',
		];

		const layout = [
			'**Sizing & layout (deterministic)**',
			'- `width 240` / `height 48`',
			'- `move right 20` / `move up 10`',
			'- `x 40 y 12` (sets translate)',
		];

		const suggest = [
			'**Suggestions + preview/apply**',
			'- `suggest 3 modern button styles`',
			'- `preview 1` / `preview 2` / `preview 3`',
			'- `apply 1` (to the selected element)',
			'- `clear preview`',
			'- `undo`',
		];

		const bulk = [
			'**Bulk apply / targeting**',
			'- `apply 1 to all buttons`',
			'- `apply 2 to all headings`',
			'- `apply 3 to all links`',
			'- `apply this/current style to all text areas` (readable page text excluding buttons/links; avoids changing text size unless you ask)',
		];

		const structure = [
			'**Structural edits (adds/wraps elements)**',
			'- `add a button "Buy now" next to this` (clones style if selected is a button)',
			'- `add a header "Pricing" above this`',
			'- `add a box inside this`',
			'- `wrap this in a box` / `wrap this in a box with a line under it`',
			'- `add a header like this` / `add a box like this` / `add divider like this` (clones styles from selection)',
		];

		const images = [
			'**Images**',
			'- `use an image as the background` (opens a file picker and embeds as a data URL)',
		];

		const blocks: string[] = [];
		if (topic === 'layout') blocks.push(...layout);
		else if (topic === 'suggest') blocks.push(...suggest);
		else if (topic === 'bulk') blocks.push(...bulk);
		else if (topic === 'structure') blocks.push(...structure);
		else if (topic === 'images') blocks.push(...images);
		else {
			blocks.push(...layout, '', ...suggest, '', ...bulk, '', ...structure, '', ...images);
		}

		return [...header, '', ...blocks].filter(x => x !== undefined).join('\n');
	};

	async function suggestStyles(model: vscode.LanguageModelChat, userPrompt: string, snippet?: string, token?: vscode.CancellationToken) {
		const allowed = Array.from(ALLOWED_STYLE_KEYS.values()).sort().join(', ');
		const system =
			`You are a product designer. Output ONLY strict JSON with shape: {"suggestions":[{"name":"...","description":"...","style":{...}}, ...]}. ` +
			`No markdown. Provide exactly 3 suggestions. ` +
			`Each style may only use keys from allow-list: ${allowed}. ` +
			`Keep suggestions realistic for popular modern apps (2024-2026): e.g. rounded corners, subtle shadow, clean typography, tasteful accent colors, optional glassmorphism.`;
		const user = `User request: ${userPrompt}\n\nSelected snippet (context):\n${snippet ?? '(none)'}\n\nReturn ONLY JSON.`;

		const messages = [
			vscode.LanguageModelChatMessage.User(system),
			vscode.LanguageModelChatMessage.User(user),
		];
		const resp = await model.sendRequest(messages, {}, token);
		let out = '';
		for await (const fragment of resp.text) out += fragment;
		const jsonText = stripJsonFences(out);
		let parsed: any;
		try {
			parsed = JSON.parse(jsonText);
		} catch {
			return [];
		}
		const arr = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
		const normalized: Array<{ name: string; description: string; style: Record<string, string> }> = [];
		for (const s of arr.slice(0, 3)) {
			if (!s || typeof s !== 'object') continue;
			const name = typeof s.name === 'string' ? s.name : 'Style';
			const description = typeof s.description === 'string' ? s.description : '';
			const style = validateStyleObject(s.style) ?? undefined;
			if (!style) continue;
			normalized.push({ name, description, style });
		}
		return normalized;
	}

	const handler: vscode.ChatRequestHandler = async (request, _ctx, stream, token) => {
		if (token.isCancellationRequested) return;

		if (isHelp(request.prompt)) {
			const selected = deps.getSelected();
			const topic = parseHelpTopic(request.prompt) ?? inferDefaultHelpTopicFromSelection(selected);
			stream.markdown(renderHelp(topic));
			return;
		}

		const selected = deps.getSelected();
		if (!selected) {
			stream.markdown('Select an element in the Live UI view first, then ask me to change it. (App Mode: switch to **Edit** in the top bar, then click an element.)');
			stream.markdown("\n\nSay `commands` to see everything I can do.");
			stream.markdown("\n\nExamples: `width 240`, `height 48`, `move right 20`, `move up 10`, `x 40 y 12`.");
			return;
		}

		// Reset follow-up context if the selection changed.
		{
			const key = `${selected.uri.toString()}:${selected.line}`;
			if (lastSelectedKey !== key) {
				lastSelectedKey = key;
				lastFocus = undefined;
				lastPatchKeys = [];
				lastPreview = undefined;
				pendingApplyScope = undefined;
			}
		}

		// If we previously asked “apply to one vs all”, handle that choice now.
		if (pendingApplyScope && pendingApplyScope.key === `${selected.uri.toString()}:${selected.line}`) {
			const n = parseScopeChoice(request.prompt);
			const choice = n
				? pendingApplyScope.choices[Number(n) - 1]
				: undefined;
			if (!choice) {
				const lines = pendingApplyScope.choices.map((c, i) => {
					const sel = c.selector ? ` (\`${c.selector}\`)` : '';
					return `${i + 1}) ${c.label}${sel}`;
				});
				stream.markdown(`Reply with a number:\n\n${lines.join('\n')}`);
				return;
			}

			await deps.clearPreviewIfOpen();
			lastPreview = undefined;

			if (choice.id === 'element') {
				await pushUndoSnapshot('apply style to selected element', [selected.uri]);
				const changed = await deps.codeModifier.updateStyle(selected.uri, selected.line, pendingApplyScope.patch);
				stream.markdown(changed ? 'Applied to the selected element.' : 'No change needed.');
				if (changed) await deps.refreshWebviewIfOpen(selected.uri);
				pendingApplyScope = undefined;
				return;
			}

			// Anything else uses selector targeting.
			if (!choice.selector) {
				stream.markdown('Could not build a safe selector for that scope. Applying only to the selected element.');
				await pushUndoSnapshot('apply style to selected element', [selected.uri]);
				const changed = await deps.codeModifier.updateStyle(selected.uri, selected.line, pendingApplyScope.patch);
				stream.markdown(changed ? 'Applied to the selected element.' : 'No change needed.');
				if (changed) await deps.refreshWebviewIfOpen(selected.uri);
				pendingApplyScope = undefined;
				return;
			}

			let targets: Array<{ file: string; line: number }> = [];
			try {
				targets = await deps.requestTargetsIfOpen(choice.selector);
			} catch (err) {
				stream.markdown(`Couldn't find matching targets in the Live UI view (${String(err)}). Applying only to the selected element instead.`);
				await pushUndoSnapshot('apply style to selected element', [selected.uri]);
				const changed = await deps.codeModifier.updateStyle(selected.uri, selected.line, pendingApplyScope.patch);
				stream.markdown(changed ? 'Applied to the selected element.' : 'No change needed.');
				if (changed) await deps.refreshWebviewIfOpen(selected.uri);
				pendingApplyScope = undefined;
				return;
			}
			if (targets.length === 0) {
				stream.markdown('I couldn\'t enumerate matching targets in the Live UI view, so I\'m applying only to the selected element.');
				await pushUndoSnapshot('apply style to selected element', [selected.uri]);
				const changed = await deps.codeModifier.updateStyle(selected.uri, selected.line, pendingApplyScope.patch);
				stream.markdown(changed ? 'Applied to the selected element.' : 'No change needed.');
				if (changed) await deps.refreshWebviewIfOpen(selected.uri);
				pendingApplyScope = undefined;
				return;
			}

			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
			const byUri = new Map<string, { uri: vscode.Uri; lines: number[] }>();
			for (const t of targets) {
				const raw = String(t.file ?? '').trim();
				let uri: vscode.Uri | undefined;
				if (/^file:\/\//i.test(raw)) uri = vscode.Uri.parse(raw);
				else if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith('\\\\')) uri = vscode.Uri.file(raw);
				else {
					const normalized = raw.replace(/^\.[\\/]/, '').replace(/\\/g, '/');
					uri = workspaceRoot ? vscode.Uri.joinPath(workspaceRoot, normalized) : undefined;
				}
				if (!uri) continue;
				const key = uri.toString();
				const entry = byUri.get(key) ?? { uri, lines: [] };
				entry.lines.push(t.line);
				byUri.set(key, entry);
			}

			const uniqueUris = Array.from(byUri.values()).map(v => v.uri);
			await pushUndoSnapshot(`apply style to ${targets.length} element(s)`, uniqueUris);
			let anyChanged = false;
			for (const entry of byUri.values()) {
				const uniqueLines = Array.from(new Set(entry.lines)).sort((a, b) => a - b);
				for (const line of uniqueLines) {
					try {
						const changed = await deps.codeModifier.updateStyle(entry.uri, line, pendingApplyScope.patch);
						if (changed) anyChanged = true;
					} catch {
						// Ignore failed targets; we'll still apply to others.
					}
				}
			}

			stream.markdown(anyChanged ? `Applied to ${targets.length} element(s) in the current view.` : 'No change needed.');
			if (anyChanged) await deps.refreshWebviewIfOpen(selected.uri);
			pendingApplyScope = undefined;
			return;
		}

		try {
			// Data-driven builder: "scroll box with 10 cards".
			const dataIntent = parseDataDrivenIntent(request.prompt);
			if (dataIntent) {
				await deps.clearPreviewIfOpen();
				lastPreview = undefined;
				const ext = selected.uri.path.toLowerCase();
				const varName = 'items';
					const insertPos = inferDataDrivenInsertPosition(request.prompt, selected);
					const includeAuthors = /\bauthor(s)?\b/i.test(request.prompt);
				if (ext.endsWith('.tsx') || ext.endsWith('.jsx') || ext.endsWith('.ts') || ext.endsWith('.js')) {
					await pushUndoSnapshot(`insert scroll cards (${dataIntent.count})`, [selected.uri]);
					// Ensure we have a data array in the nearest component.
					await deps.codeModifier.ensureItemsArrayInNearestComponent(selected.uri, selected.line, { varName, count: dataIntent.count });
					const markup = buildJsxScrollCardsMarkup({ count: dataIntent.count, axis: dataIntent.axis, varName });
						const changed = await deps.codeModifier.insertElement(selected.uri, selected.line, insertPos, markup);
					stream.markdown(changed
						? `Added a ${dataIntent.axis === 'x' ? 'horizontal' : 'vertical'} scroll box rendering ${dataIntent.count} cards from \`${varName}\`.`
						: 'No change applied.');
					if (changed) await deps.refreshWebviewIfOpen(selected.uri);
					return;
				}

				// HTML fallback: render repeated cards (static).
				if (ext.endsWith('.html') || ext.endsWith('.htm')) {
					await pushUndoSnapshot(`insert scroll cards (${dataIntent.count})`, [selected.uri]);
					const markup = buildHtmlScrollCardsMarkup({ count: dataIntent.count, axis: dataIntent.axis, includeAuthors });
					const changed = await deps.codeModifier.insertElement(selected.uri, selected.line, insertPos, markup);
					stream.markdown(changed
						? `Added a ${dataIntent.axis === 'x' ? 'horizontal' : 'vertical'} scroll box with ${dataIntent.count} static cards.`
						: 'No change applied.');
					if (changed) await deps.refreshWebviewIfOpen(selected.uri);
					return;
				}
			}

			// Add/wrap elements (Phase 6-ish): deterministic edits that change structure.
			const addIntent = parseAddIntent(request.prompt, selected);
			if (addIntent) {
				await deps.clearPreviewIfOpen();
				lastPreview = undefined;
				if (addIntent.kind === 'wrapBox') {
					await pushUndoSnapshot(addIntent.lineUnder ? 'wrap with box + line' : 'wrap with box', [selected.uri]);
					const changed = await deps.codeModifier.wrapWithBox(selected.uri, selected.line, { lineUnder: addIntent.lineUnder });
					stream.markdown(changed ? 'Wrapped the selected element in a box.' : 'No change applied.');
					if (changed) await deps.refreshWebviewIfOpen(selected.uri);
					return;
				}
				await pushUndoSnapshot(`add ${addIntent.label}`, [selected.uri]);
				const changed = await deps.codeModifier.insertElement(selected.uri, selected.line, addIntent.position, addIntent.markup);
				stream.markdown(changed ? `Added a ${addIntent.label}.` : 'No change applied.');
				if (changed) await deps.refreshWebviewIfOpen(selected.uri);
				return;
			}

			// Fast-path: copy the currently-selected element's existing style to a group.
			// This is for workflows like: "I already styled this text how I want; apply this style to all text areas".
			if (isApplyAll(request.prompt) && hasIntentApplyCurrentStyle(request.prompt)) {
				const target = parseApplyAllTargets(request.prompt, selected);
				const source = selected.computedStyle;
				if (target && source && Object.keys(source).length > 0) {
					let sourcePatch: Record<string, string> = source;
					// If applying to text elements, default to typography-only unless user asked for visual box styles.
					if (target.kind === 'text' && !wantsVisualBoxStyles(request.prompt)) {
						sourcePatch = filterPatchForTextStyleOnly(sourcePatch);
					}
					// Bulk text updates should not change size unless explicitly requested.
					if (target.kind === 'text' && !wantsBulkTextSizing(request.prompt)) {
						sourcePatch = stripTextSizing(sourcePatch);
					}
					const filteredPatch = filterStylePatchForElement(target.kind, sourcePatch);
					await pushUndoSnapshot(`apply current style to all ${target.label}`, [selected.uri]);
					const changed = await deps.codeModifier.updateStyleAllMany(selected.uri, target.tagNames, filteredPatch);
					await deps.clearPreviewIfOpen();
					await deps.refreshWebviewIfOpen(selected.uri);
					stream.markdown(changed ? `Applied the selected element's current style to all ${target.label}.` : 'No change needed.');
					return;
				}
			}

			if (isUndo(request.prompt)) {
				await deps.clearPreviewIfOpen();
				lastPreview = undefined;
				stream.markdown(await undoLast(selected));
				await deps.refreshWebviewIfOpen(selected.uri);
				return;
			}

			if (isClearPreview(request.prompt)) {
				await deps.clearPreviewIfOpen();
				lastPreview = undefined;
				stream.markdown('Preview cleared.');
				return;
			}

			// First try: simple deterministic commands (width/height/move)
			const result = await applyUiEdit(deps.codeModifier, selected, request.prompt);
			if (result.changed) {
				stream.markdown(result.message);
				await deps.refreshWebviewIfOpen(selected.uri);
				return;
			}

			// Image helper: "use this image" / "background image"
			if (/\b(image|background image|use this image|use an image)\b/i.test(request.prompt)) {
				await pushUndoSnapshot('apply background image', [selected.uri]);
				const pick = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectMany: false,
					openLabel: 'Use as UI element image',
					filters: {
						Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']
					}
				});
				if (!pick || pick.length === 0) {
					stream.markdown('No image selected.');
					return;
				}
				const dataUrl = await imageUriToDataUrl(pick[0]);
				const styles = {
					backgroundImage: `url('${dataUrl}')`,
					backgroundSize: 'cover',
					backgroundPosition: 'center',
					backgroundRepeat: 'no-repeat',
				} satisfies Record<string, string>;
				const changed = await deps.codeModifier.updateStyle(selected.uri, selected.line, styles);
				stream.markdown(changed ? 'Applied background image (embedded as data URL).' : 'No change needed.');
				if (changed) await deps.refreshWebviewIfOpen(selected.uri);
				return;
			}

			const selection = await deps.getJsxSelectionAtLine(selected.uri, selected.line);
			const model = (request as unknown as { model?: vscode.LanguageModelChat }).model ?? (await getAnyCopilotModel(token));
			const historyText = _ctx.history
				.map(turn => {
					if (turn instanceof vscode.ChatRequestTurn) return `User: ${turn.prompt}`;
					if (turn instanceof vscode.ChatResponseTurn) {
						const text = turn.response
							.map(p => (p as any).value ?? '')
							.join(' ')
							.toString();
						return `Assistant: ${text}`;
					}
					return '';
				})
				.filter(Boolean)
				.slice(-6)
				.join('\n');

			// Conversational suggestions
			if (model && isSuggest(request.prompt) && !isApply(request.prompt) && !isPreview(request.prompt)) {
				stream.markdown('Here are a few modern style directions you could use:');
				lastSuggestions = await suggestStyles(model, request.prompt, selection?.snippet, token);
				if (lastSuggestions.length === 0) {
					stream.markdown('\n\nI couldn\'t generate suggestions. Try: “suggest 3 modern button styles”.');
					return;
				}
				lastPreview = undefined;
				stream.markdown(
					'\n\n' +
					lastSuggestions
						.map((s, i) => `${i + 1}) **${s.name}** — ${s.description}`)
						.join('\n') +
					'\n\nSay: “preview 1” / “preview 2”, or “apply 1 to all buttons / text / headings / links”.'
				);
				return;
			}

			// Preview/apply using lastSuggestions if present
			const choiceIdx = parseChoiceIndex(request.prompt);
			const chosen = (choiceIdx !== undefined && lastSuggestions[choiceIdx]) ? lastSuggestions[choiceIdx] : lastSuggestions[0];

			if ((isPreview(request.prompt) || /^\s*preview\s*\d?\s*$/i.test(request.prompt)) && chosen) {
				lastPreview = { style: chosen.style, name: chosen.name };
				await deps.previewStyleIfOpen(selected.fileId, selected.line, chosen.style);
				stream.markdown(`Previewing **${chosen.name}** on the selected element. Say “apply” or “apply to all buttons”. Say “clear preview” to revert.`);
				return;
			}

			if (isApply(request.prompt) && (lastPreview || chosen)) {
				const patch = lastPreview?.style ?? chosen?.style;
				if (!patch) {
					stream.markdown(result.message);
					return;
				}

				if (isApplyAll(request.prompt)) {
					const target = parseApplyAllTargets(request.prompt, selected);
					if (!target) {
						stream.markdown('Tell me what to apply to (e.g. “apply to all buttons”, “apply to all text”, “apply to all headings”).');
						return;
					}
					let sourcePatch: Record<string, string> = patch;
					// If the user says "apply this/current style", prefer the selected element's current computed style.
					if (hasIntentApplyCurrentStyle(request.prompt) && selected.computedStyle && Object.keys(selected.computedStyle).length > 0) {
						sourcePatch = selected.computedStyle;
					}
					// If they explicitly said "text style", avoid copying backgrounds/borders/padding.
					if (/\btext\s*style\b/i.test(request.prompt)) {
						sourcePatch = filterPatchForTextStyleOnly(sourcePatch);
					}
					if (target.kind === 'text' && !wantsBulkTextSizing(request.prompt)) {
						sourcePatch = stripTextSizing(sourcePatch);
					}
					const filteredPatch = filterStylePatchForElement(target.kind, sourcePatch);
					await pushUndoSnapshot(`apply style to all ${target.label}`, [selected.uri]);
					const changed = await deps.codeModifier.updateStyleAllMany(selected.uri, target.tagNames, filteredPatch);
					await deps.clearPreviewIfOpen();
					await deps.refreshWebviewIfOpen(selected.uri);
					stream.markdown(changed ? `Applied to all ${target.label} in this file.` : 'No change needed.');
					return;
				}

				// Repeated-item safety: if the selection looks like a list/card item, ask whether to
				// apply to element vs item vs scroll container.
				if (selected.selectionHints?.isRepeatedItem || selected.selectionHints?.isInsideScroll) {
					const explicit = parseScopeChoice(request.prompt);
					if (!explicit) {
						const choices: PendingApplyScope['choices'] = [];
						choices.push({ id: 'element', label: 'Selected element' });

						const leafSelector = buildScopedCssSelectorFromSelected(selected);
						if (leafSelector && selected.selectionHints?.isRepeatedItem) {
							choices.push({ id: 'allElements', label: 'All matching elements (in current view)', selector: leafSelector });
						}

						const itemRoot = findLikelyItemRoot(selected);
						const scSel = buildSelectorFromNodeSummary(selected.selectionHints?.scrollContainer ?? null);
						const itemSelRaw = buildSelectorFromNodeSummary(itemRoot);
						const itemSel = (itemSelRaw && scSel) ? `${scSel} ${itemSelRaw}` : itemSelRaw;
						if (itemSel) {
							choices.push({ id: 'itemRoots', label: 'This item/card (root)', selector: itemSel });
						}

						// If the selected element itself is a scroll container, let them target it.
						let containerSel = scSel;
						if (!containerSel && selected.selectionHints?.isScrollContainer) {
							containerSel = buildScopedCssSelectorFromSelected(selected);
						}
						if (containerSel) {
							choices.push({ id: 'scrollContainer', label: 'Scroll container', selector: containerSel });
						}

						if (choices.length >= 2) {
							pendingApplyScope = { key: `${selected.uri.toString()}:${selected.line}`, patch, choices };
							const lines = choices.map((c, i) => {
								const sel = c.selector ? ` (\`${c.selector}\`)` : '';
								return `${i + 1}) ${c.label}${sel}`;
							});
							stream.markdown(
								`Choose scope for this apply:\n\n${lines.join('\n')}\n\nReply with a number.`
							);
							return;
						}
					}
				}

				await pushUndoSnapshot('apply style to selected element', [selected.uri]);
				const changed = await deps.codeModifier.updateStyle(selected.uri, selected.line, patch);
				await deps.clearPreviewIfOpen();
				stream.markdown(changed ? 'Applied to the selected element.' : 'No change needed.');
				if (changed) await deps.refreshWebviewIfOpen(selected.uri);
				return;
			}

			// Model-based style patch (direct)
			if (model) {
				stream.markdown('Thinking…');
				// Decide what we are editing (text vs box) so follow-ups stay consistent.
				const focusFromPrompt = inferFocusFromPrompt(request.prompt);
				const focus: StyleFocus = focusFromPrompt ?? lastFocus ?? (inferElementKind(selected) === 'text' ? 'text' : 'box');

				// For controls, if we were editing text and the user gives a short follow-up like
				// "try gold" or "a bit brighter", restrict to text keys to avoid changing the button box.
				let allowedKeys: string[] | undefined;
				if (focus === 'text') {
					allowedKeys = TEXT_STYLE_KEYS;
					// If they were previously only changing color, keep it color-only for short follow-ups.
					if (isShortFollowup(request.prompt) && lastPatchKeys.length > 0 && lastPatchKeys.every(k => k === 'color' || k === 'opacity')) {
						allowedKeys = ['color', 'opacity'];
					}
				}
				if (focus === 'box') {
					allowedKeys = Array.from(new Set([...BOX_STYLE_KEYS, 'color', 'opacity', 'fontWeight']));
				}
				if (focus === 'layout') {
					allowedKeys = LAYOUT_KEYS;
				}

				const patch = await inferStylePatchWithModel({
					model,
					userPrompt: request.prompt,
					selectedSnippet: selection?.snippet,
					selected,
					allowedKeys,
					historyText,
					token,
				});
				if (patch) {
					lastFocus = focus;
					lastPatchKeys = Object.keys(patch);
					lastPreview = { style: patch };
					// Default behavior: preview first, so you can say “apply” or “apply to all buttons”.
					await deps.previewStyleIfOpen(selected.fileId, selected.line, patch);
					stream.markdown(`Preview applied. Say “apply”, or “apply to all …” (e.g. buttons / text / headings / textarea). Say “clear preview” to revert.`);
					return;
				}
			}

			// Last resort: LLM rewrite of JSX selection (best-effort). Useful for structural changes.
			if (!selection) {
				stream.markdown(result.message);
				return;
			}

			const rewriteModel = (request as unknown as { model?: vscode.LanguageModelChat }).model ?? (await getAnyCopilotModel(token));
			if (!rewriteModel) {
				stream.markdown(result.message);
				stream.markdown("\n\nNo language model is available for this request. Try a simple command like `width 240` or `move right 20`.");
				return;
			}

			const system =
				"You are a senior UI engineer. Modify the following JSX code according to the user's request. Return ONLY valid JSX for the selected snippet. No markdown. No backticks.";
			const user = `Selected JSX snippet:\n\n${selection.snippet}\n\nUser request:\n${request.prompt}\n\nReturn ONLY the updated JSX snippet.`;

			const messages = [
				vscode.LanguageModelChatMessage.User(system),
				vscode.LanguageModelChatMessage.User(user)
			];

			stream.markdown('Working on that…');
			const chatResponse = await rewriteModel.sendRequest(messages, {}, token);
			let out = '';
			for await (const fragment of chatResponse.text) {
				out += fragment;
			}
			const newJsx = stripCodeFences(out);
			if (!looksLikeJsx(newJsx)) {
				stream.markdown("\n\nI couldn't get a clean JSX snippet back. Try a more specific request (e.g. 'make it a primary button' or 'add padding 12px').");
				return;
			}

			const changed = await deps.replaceSelectedJsxAtLine(selected.uri, selected.line, newJsx);
			stream.markdown(changed ? "\n\nApplied JSX update." : "\n\nNo change applied.");
			if (changed) {
				await deps.refreshWebviewIfOpen(selected.uri);
			}
		} catch (e) {
			stream.markdown(`Failed to apply edit: ${String(e)}`);
		}
	};

	try {
		const participant = vscode.chat.createChatParticipant('live-ui.ui-wizard', handler);
		context.subscriptions.push(participant);
	} catch {
		// Chat API not available in this VS Code build.
	}
}
