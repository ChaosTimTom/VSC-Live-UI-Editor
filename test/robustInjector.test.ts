import { describe, expect, test } from 'vitest';
import { injectSourceMetadataRobust } from '../src/injector/robustInjector';

describe('injectSourceMetadataRobust', () => {
	test('HTML: injects data-source-* attributes', () => {
		const input = [
			'<div>',
			'  <button>Click</button>',
			'</div>',
		].join('\n');
		const out = injectSourceMetadataRobust(input, 'index.html');
		expect(out).toContain('data-source-file="index.html"');
		expect(out).toMatch(/data-source-line="\d+"/);
		expect(out).toMatch(/data-source-column="\d+"/);
	});

	test('JSX/TSX: injects data-source-* attributes into JSX elements', () => {
		const input = [
			"import React from 'react';",
			'',
			'export const Demo = () => (',
			'\t<div>',
			'\t\t<button>Hi</button>',
			'\t</div>',
			');',
		].join('\n');
		const out = injectSourceMetadataRobust(input, 'Demo.tsx', { cacheKey: 'Demo.tsx', version: 1 });
		expect(out).toContain('data-source-file=\"Demo.tsx\"');
		expect(out).toMatch(/data-source-line=\"\d+\"/);
		expect(out).toMatch(/data-source-column=\"\d+\"/);
	});
});
