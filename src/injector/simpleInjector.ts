const OPENING_TAG = /<(?!\/|!|\?)([A-Za-z][A-Za-z0-9:_-]*)\b/g;

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

export function injectSourceMetadata(input: string, workspaceRelativeFile: string): string {
	const lines = input.split(/\r?\n/);

	return lines
		.map((lineText, index) => {
			// Skip lines that obviously cannot contain tags.
			if (!lineText.includes('<')) return lineText;
			// Don't touch script/style blocks content lines (very naive, MVP).
			// If the tag starts on this line, it will still be injected.

			const lineNumber = index + 1;

			return lineText.replace(OPENING_TAG, (match, tagName, offset: number) => {
				// Avoid double-injecting if the line already contains our attrs.
				if (
					lineText.includes('data-source-file=') ||
					lineText.includes('data-source-line=') ||
					lineText.includes('data-source-column=')
				) {
					return match;
				}

				const fileAttr = escapeHtmlAttribute(workspaceRelativeFile);
				const columnNumber = Math.max(1, (typeof offset === 'number' ? offset : 0) + 1);
				return `${match} data-source-file="${fileAttr}" data-source-line="${lineNumber}" data-source-column="${columnNumber}"`;
			});
		})
		.join('\n');
}
