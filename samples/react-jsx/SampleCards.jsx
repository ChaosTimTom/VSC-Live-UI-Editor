import React from 'react';

export default function SampleCards() {
	return (
		<main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
			<h2 style={{ margin: 0 }}>SampleCards (JSX)</h2>
			<p style={{ marginTop: 8, opacity: 0.8 }}>Use this to test JSX (non-TSX) edits.</p>

			<div className="target" style={{ marginTop: 18, padding: 12, border: '1px dashed rgba(0,0,0,0.25)', borderRadius: 12 }}>
				Target area (select me). The wizard should insert the scroll list after this.
			</div>
		</main>
	);
}
