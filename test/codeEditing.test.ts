import { describe, expect, test } from 'vitest';
import { __testExports } from '../src/codeModifier/CodeModifier';

function lineOf(text: string, needle: string): number {
	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		if (lines[i]?.includes(needle)) return i + 1;
	}
	throw new Error(`Needle not found: ${needle}`);
}

describe('UI editing → code updates (pure helpers)', () => {
	test('HTML: updateHtmlTextAtLine replaces simple inline text', () => {
		const input = [
			'<div>',
			'  <button>Old</button>',
			'</div>',
		].join('\n');
		const out = __testExports.updateHtmlTextAtLine(input, 2, 'New');
		expect(out).toContain('<button>New</button>');
		expect(out).not.toContain('<button>Old</button>');
	});

	test('HTML: updateHtmlInlineStyle merges style on tag occurrence at line', () => {
		const input = [
			'<div>',
			'  <button style="color: red; padding: 4px">Click</button>',
			'</div>',
		].join('\n');
		const out = __testExports.updateHtmlInlineStyle(input, 2, { color: 'blue', marginTop: '10px' });
		expect(out).toContain('color: blue');
		expect(out).toContain('padding: 4px');
		expect(out).toContain('margin-top: 10px');
	});

	test('JSX: updateJsxTextAtLine updates simple element text', () => {
		const input = [
			"import React from 'react';",
			'',
			'export default function SampleCards() {',
			'\treturn (',
			'\t\t<main>',
			'\t\t\t<h2>SampleCards (JSX)</h2>',
			'\t\t</main>',
			'\t);',
			'}',
		].join('\n');
		const line = lineOf(input, 'SampleCards (JSX)');
		const col = input.split(/\r?\n/)[line - 1]!.indexOf('<h2') + 1;
		const out = __testExports.updateJsxTextAtLine(
			input,
			// ts-morph reliably parses JSX when the in-memory filename ends with .tsx
			'SampleCards.tsx',
			line,
			'Renamed',
			col,
			{ tagName: 'h2', text: 'SampleCards (JSX)' }
		);
		expect(out).toContain('<h2>Renamed</h2>');
	});

	test('TSX/JSX: updateJsxInlineStyle adds/updates keys in style object', () => {
		const input = [
			"import React from 'react';",
			'',
			'export const Demo = () => (',
			'\t<div className="target" style={{ marginTop: 18, padding: 12 }}>',
			'\t\tHello',
			'\t</div>',
			');',
		].join('\n');
		const line = lineOf(input, 'className="target"');
		const out = __testExports.updateJsxInlineStyle(
			input,
			'Demo.tsx',
			line,
			{ backgroundColor: 'red', padding: '16px' },
			undefined,
			{ tagName: 'div', classList: ['target'] }
		);
		expect(out).toContain("backgroundColor: 'red'");
		// Existing number literal stays unless overwritten; padding is overwritten to string literal.
		expect(out).toContain("padding: '16px'");
		expect(out).toContain('marginTop: 18');
	});

	test('JSX: ensureJsxClassNamesAtLocation appends missing className tokens', () => {
		const input = [
			"import React from 'react';",
			'',
			'export default function C() {',
			'\treturn <div className="target">X</div>;',
			'}',
		].join('\n');
		const line = lineOf(input, 'className="target"');
		const out = __testExports.ensureJsxClassNamesAtLocation(
			input,
			'C.tsx',
			line,
			['target', 'bg-red-500'],
			undefined,
			{ tagName: 'div', classList: ['target'] }
		);
		expect(out).toMatch(/className=['"]target bg-red-500['"]/);
	});

	test('JSX: update-by-element-id (data-lui) updates text and style', () => {
		const input = [
			"import React from 'react';",
			'',
			'export const Demo = () => (',
			'\t<button data-lui="btn1" style={{ padding: 10 }}>Old</button>',
			');',
		].join('\n');

		const styleOut = __testExports.updateJsxInlineStyleByDataLui(input, 'Demo.tsx', 'btn1', { width: '120px' });
		expect(styleOut).toContain("width: '120px'");

		// Text update is independent of style changes.
		const textOut = __testExports.updateJsxTextByDataLui(input, 'Demo.tsx', 'btn1', 'New');
		expect(textOut).toMatch(/>\s*New\s*<\/button>/);
	});
});
