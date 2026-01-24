import React from 'react';

export const SampleCards = () => (
	<main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial' }}>
		<h2 style={{ margin: 0 }}>SampleCards (TSX)</h2>
		<p style={{ marginTop: 8, opacity: 0.8 }}>Select an element and ask @ui-wizard to insert a scroll box with N cards.</p>

		<div className="toolbar" style={{ display: 'flex', gap: 12, marginTop: 16 }}>
			<button style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)' }}>Primary</button>
			<button style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.12)' }}>Secondary</button>
		</div>

		<div className="target" style={{ marginTop: 18, padding: 12, border: '1px dashed rgba(0,0,0,0.25)', borderRadius: 12 }}>
			Target area (select me). The wizard should insert the scroll list after this.
		</div>
	</main>
);
