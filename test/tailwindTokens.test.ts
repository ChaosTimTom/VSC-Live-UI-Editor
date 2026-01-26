import { describe, expect, test } from 'vitest';
import { tailwindTokensFromStylePatch } from '../src/appMode/styleAdapters';

describe('tailwindTokensFromStylePatch', () => {
	test('maps common style props to tokens', () => {
		const tokens = tailwindTokensFromStylePatch({
			width: '10px',
			height: '20px',
			backgroundColor: 'rgb(0, 0, 0)',
			borderRadius: '12px',
			display: 'flex',
			position: 'absolute',
			top: '1px',
		});

		expect(tokens).toContain('w-[10px]');
		expect(tokens).toContain('h-[20px]');
		expect(tokens).toContain('bg-[rgb(0,_0,_0)]');
		expect(tokens).toContain('rounded-[12px]');
		expect(tokens).toContain('flex');
		expect(tokens).toContain('absolute');
		expect(tokens).toContain('top-[1px]');
	});
});
