export type SampleUiType = 'html' | 'react-tsx' | 'react-jsx';

export type SampleDefinition = {
	id: string;
	uiType: SampleUiType;
	label: string;
	relativePath: string; // repo/workspace-relative
	description?: string;
};

export const SAMPLE_SET: readonly SampleDefinition[] = [
	{
		id: 'html-basic',
		uiType: 'html',
		label: 'HTML: Basic',
		relativePath: 'samples/html/sample-ui.html',
		description: 'Simple HTML page with inline styles.'
	},
	{
		id: 'react-tsx-cards',
		uiType: 'react-tsx',
		label: 'React (TSX): Cards',
		relativePath: 'samples/react-tsx/SampleCards.tsx',
		description: 'TSX component for testing data-driven scroll cards insertion.'
	},
	{
		id: 'react-jsx-cards',
		uiType: 'react-jsx',
		label: 'React (JSX): Cards',
		relativePath: 'samples/react-jsx/SampleCards.jsx',
		description: 'JSX component for testing edits in non-TSX files.'
	}
] as const;

export const DEFAULT_SAMPLE = SAMPLE_SET[0];
