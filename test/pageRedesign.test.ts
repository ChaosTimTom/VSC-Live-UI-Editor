import { describe, expect, test } from 'vitest';
import { __testExports } from '../src/chat/uiWizard';

const { isPageRedesign, isPageRedesignApply, isPageRedesignReject, stripCodeFences, stripJsonFences } = __testExports;

// ---------------------------------------------------------------------------
// isPageRedesign — intent detection
// ---------------------------------------------------------------------------
describe('isPageRedesign', () => {
	const positives = [
		'redesign this page as a modern marketing site',
		'redo this whole page',
		'restyle the entire layout',
		'revamp this site — make it professional',
		'overhaul this page with a dark theme',
		'rework the whole thing',
		'transform this page into something modern',
		'reimagine the entire site',
		'rebuild this page from scratch',
		'make this look like a SaaS landing page',
		'make it look more professional',
		'make the page feel like a startup site',
		'turn this into a marketing site',
		'turn it into a portfolio',
		'convert this into a landing page',
		'change this into a modern blog',
		'this is a marketing site, make it professional',
		'this is a portfolio, keep all content but make it modern',
		'give this page a dark mode look',
		'give the site a glassmorphic feel',
		'apply a dark theme to this page',
		'apply a minimalist theme to the whole page',
		'style the whole page like a dashboard',
		'style the entire layout as a blog',
		'Redesign this page',
		'REDO THE ENTIRE SITE',
		'redo this page, this is a marketing site, keep all the current features but make it look like a professional marketing site',
	];

	test.each(positives)('detects "%s" as page redesign', (prompt) => {
		expect(isPageRedesign(prompt)).toBe(true);
	});

	const negatives = [
		'width 240',
		'height 48',
		'move right 20',
		'suggest 3 button styles',
		'apply 1',
		'preview 2',
		'undo',
		'clear preview',
		'make this button blue',
		'change the font size to 16px',
		'add a header above this',
		'wrap this in a box',
		'commands',
		'help',
		'use an image as the background',
		'apply to all buttons',
		'apply this style to all text areas',
	];

	test.each(negatives)('rejects "%s" as NOT page redesign', (prompt) => {
		expect(isPageRedesign(prompt)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isPageRedesignApply
// ---------------------------------------------------------------------------
describe('isPageRedesignApply', () => {
	const positives = [
		'apply',
		'Apply',
		'APPLY',
		'apply it',
		'yes',
		'Yes',
		'go',
		'do it',
		'looks good',
		'ship it',
		'save',
		'  apply  ',
	];

	test.each(positives)('detects "%s" as apply', (prompt) => {
		expect(isPageRedesignApply(prompt)).toBe(true);
	});

	const negatives = [
		'redesign the page',
		'make it blue',
		'preview 1',
		'undo',
		'cancel',
		'no',
		'width 240',
	];

	test.each(negatives)('rejects "%s" as NOT apply', (prompt) => {
		expect(isPageRedesignApply(prompt)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isPageRedesignReject
// ---------------------------------------------------------------------------
describe('isPageRedesignReject', () => {
	const positives = [
		'no',
		'cancel',
		'reject',
		'nevermind',
		'revert',
		'undo',
		'clear',
		'No',
		'CANCEL',
		'  revert  ',
	];

	test.each(positives)('detects "%s" as reject', (prompt) => {
		expect(isPageRedesignReject(prompt)).toBe(true);
	});

	const negatives = [
		'apply',
		'yes',
		'redesign the page',
		'make it blue',
		'go',
		'looks good',
	];

	test.each(negatives)('rejects "%s" as NOT reject', (prompt) => {
		expect(isPageRedesignReject(prompt)).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// stripCodeFences — helper used by streaming
// ---------------------------------------------------------------------------
describe('stripCodeFences', () => {
	test('strips css code fence', () => {
		const input = '```css\nbody { color: red; }\n```';
		expect(stripCodeFences(input)).toBe('body { color: red; }');
	});

	test('strips generic code fence', () => {
		const input = '```\n.foo { padding: 8px; }\n```';
		expect(stripCodeFences(input)).toBe('.foo { padding: 8px; }');
	});

	test('returns raw CSS when no fences', () => {
		const input = 'body { color: red; }';
		expect(stripCodeFences(input)).toBe('body { color: red; }');
	});

	test('handles partial fence (streaming)', () => {
		const input = '```css\nbody { color: red; }';
		// stripCodeFences expects both fences; when only opening is present it strips the first line
		const result = stripCodeFences(input);
		expect(result).toContain('body');
	});

	test('handles empty input', () => {
		expect(stripCodeFences('')).toBe('');
	});

	test('preserves multiline CSS', () => {
		const input = [
			':root { --accent: teal; }',
			'body { font-family: sans-serif; }',
			'h1 { color: var(--accent); }',
		].join('\n');
		expect(stripCodeFences(input)).toBe(input);
	});
});

// ---------------------------------------------------------------------------
// stripJsonFences
// ---------------------------------------------------------------------------
describe('stripJsonFences', () => {
	test('strips json code fence', () => {
		const input = '```json\n{"style":{"color":"red"}}\n```';
		expect(stripJsonFences(input)).toBe('{"style":{"color":"red"}}');
	});

	test('returns raw JSON when no fences', () => {
		const input = '{"style":{"color":"red"}}';
		expect(stripJsonFences(input)).toBe(input);
	});
});

// ---------------------------------------------------------------------------
// isPageRedesign — edge cases and boundary tests
// ---------------------------------------------------------------------------
describe('isPageRedesign edge cases', () => {
	test('empty string', () => expect(isPageRedesign('')).toBe(false));
	test('whitespace only', () => expect(isPageRedesign('   ')).toBe(false));
	test('very long prompt with page intent', () => {
		const long = 'I want you to ' + 'please '.repeat(50) + 'redesign this page';
		expect(isPageRedesign(long)).toBe(true);
	});
	test('mixed case "ReDeSiGn ThIs PaGe"', () => {
		expect(isPageRedesign('ReDeSiGn ThIs PaGe')).toBe(true);
	});
	test('special characters around keywords', () => {
		// em dashes are non-word chars, so \b still matches around them
		expect(isPageRedesign('redesign—this—page')).toBe(true);
		expect(isPageRedesign('redesign this page!')).toBe(true);
	});
	test('similar but non-matching prompts', () => {
		expect(isPageRedesign('redo my homework')).toBe(false);
		expect(isPageRedesign('rebuild the backend')).toBe(false);
		expect(isPageRedesign('redesign the API')).toBe(false);
	});
	test('"apply a theme" matches page redesign', () => {
		expect(isPageRedesign('apply a cyberpunk theme to this')).toBe(true);
	});
	test('"style the full layout" matches', () => {
		expect(isPageRedesign('style the full layout as a portfolio')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// isPageRedesignApply / isPageRedesignReject — edge cases
// ---------------------------------------------------------------------------
describe('apply/reject edge cases', () => {
	test('apply with trailing text', () => {
		expect(isPageRedesignApply('apply it now')).toBe(true);
	});
	test('reject empty string', () => {
		expect(isPageRedesignReject('')).toBe(false);
	});
	test('apply empty string', () => {
		expect(isPageRedesignApply('')).toBe(false);
	});
	test('apply does not match "reapply"', () => {
		expect(isPageRedesignApply('reapply')).toBe(false);
	});
	test('reject does not match "uncancelable"', () => {
		expect(isPageRedesignReject('uncancelable')).toBe(false);
	});
	test('apply trims leading whitespace', () => {
		expect(isPageRedesignApply('   yes please')).toBe(true);
	});
	test('reject trims leading whitespace', () => {
		expect(isPageRedesignReject('   cancel everything')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// stripCodeFences — additional edge cases
// ---------------------------------------------------------------------------
describe('stripCodeFences extra', () => {
	test('strips scss fence', () => {
		expect(stripCodeFences('```scss\n$c: red;\n```')).toBe('$c: red;');
	});
	test('strips fence with language-suffix', () => {
		expect(stripCodeFences('```css-module\n.a{}\n```')).toBe('.a{}');
	});
	test('handles only closing fence', () => {
		const input = 'body { color: red; }\n```';
		// no opening fence, so not stripped
		expect(stripCodeFences(input)).toBe(input);
	});
	test('handles nested triple backticks in content', () => {
		const input = '```css\n/* comment with ``` inside */\n.a{}\n```';
		const result = stripCodeFences(input);
		expect(result).toContain('.a{}');
	});
	test('handles windows line endings', () => {
		const input = '```css\r\nbody { color: red; }\r\n```';
		const result = stripCodeFences(input);
		expect(result).toContain('body');
	});
});

// ---------------------------------------------------------------------------
// Message types — structural validation
// ---------------------------------------------------------------------------
describe('message types (bridge)', () => {
	test('InjectPageCssMessage shape is valid', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		// Positive case
		expect(isToWebviewMessage({ command: 'injectPageCss', css: 'body { color: red; }' })).toBe(true);
		// Negative: missing css
		expect(isToWebviewMessage({ command: 'injectPageCss' })).toBe(false);
	});

	test('ClearPageCssMessage shape is valid', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		expect(isToWebviewMessage({ command: 'clearPageCss' })).toBe(true);
	});

	test('InjectPageCss rejects non-string css', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		expect(isToWebviewMessage({ command: 'injectPageCss', css: 123 })).toBe(false);
		expect(isToWebviewMessage({ command: 'injectPageCss', css: null })).toBe(false);
	});

	test('InjectPageCss accepts empty string css', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		expect(isToWebviewMessage({ command: 'injectPageCss', css: '' })).toBe(true);
	});

	test('unknown command returns false', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		expect(isToWebviewMessage({ command: 'fooBarBaz' })).toBe(false);
	});

	test('null/undefined/primitives return false', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		expect(isToWebviewMessage(null)).toBe(false);
		expect(isToWebviewMessage(undefined)).toBe(false);
		expect(isToWebviewMessage(42)).toBe(false);
		expect(isToWebviewMessage('hello')).toBe(false);
	});

	test('existing message types still validate', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		expect(isToWebviewMessage({ command: 'previewStyle', file: 'a.html', line: 1, style: { color: 'red' } })).toBe(true);
		expect(isToWebviewMessage({ command: 'clearPreview' })).toBe(true);
		expect(isToWebviewMessage({ command: 'setDocument', file: 'a.html', html: '<div/>' })).toBe(true);
	});

	test('workspaceConfig validates', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		expect(isToWebviewMessage({ command: 'workspaceConfig', config: { key: 'val' } })).toBe(true);
		expect(isToWebviewMessage({ command: 'workspaceConfig', config: null })).toBe(false);
		expect(isToWebviewMessage({ command: 'workspaceConfig' })).toBe(false);
	});

	test('diffResult validates', async () => {
		const { isToWebviewMessage } = await import('../webview-ui/src/bridge/messages');
		expect(isToWebviewMessage({ command: 'diffResult', file: 'a.html', original: '<a/>', modified: '<b/>' })).toBe(true);
		expect(isToWebviewMessage({ command: 'diffResult', file: 'a.html', original: '<a/>' })).toBe(false);
	});
});
