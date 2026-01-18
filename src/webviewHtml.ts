import * as vscode from 'vscode';

function getNonce(): string {
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let nonce = '';
	for (let i = 0; i < 32; i++) {
		nonce += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return nonce;
}

function rewriteAssetUris(html: string, webview: vscode.Webview, distRoot: vscode.Uri): string {
	// Rewrites relative asset URLs (e.g. assets/foo.js) into webview-safe URIs.
	return html.replace(/(src|href)="([^"]+)"/g, (_m, attr, rawValue) => {
		// Handle Vite outputs like "./assets/...", "assets/...", or "/assets/...".
		let relPath: string | undefined;
		if (rawValue.startsWith('./assets/')) relPath = rawValue.slice(2);
		else if (rawValue.startsWith('assets/')) relPath = rawValue;
		else if (rawValue.startsWith('/assets/')) relPath = rawValue.slice(1);
		if (!relPath) return `${attr}="${rawValue}"`;

		const onDisk = vscode.Uri.joinPath(distRoot, relPath);
		const asWebview = webview.asWebviewUri(onDisk);
		return `${attr}="${asWebview}"`;
	});
}

function injectNonceIntoScripts(html: string, nonce: string): string {
	// Add nonce to any script tags produced by Vite.
	return html.replace(/<script\b([^>]*)>/g, (m) => {
		if (m.includes(' nonce=')) return m;
		return m.replace('<script', `<script nonce="${nonce}"`);
	});
}

function injectCsp(html: string, webview: vscode.Webview, nonce: string): string {
	const csp = [
		`default-src 'none'`,
		`img-src ${webview.cspSource} https: data:`,
		// react-moveable injects runtime <style> tags; allow inline styles in the webview.
		`style-src ${webview.cspSource} 'unsafe-inline'`,
		`script-src 'nonce-${nonce}'`
	].join('; ');

	if (html.includes('http-equiv="Content-Security-Policy"')) {
		return html;
	}

	return html.replace(
		/<head>/i,
		`<head>\n<meta http-equiv="Content-Security-Policy" content="${csp}">`
	);
}

export async function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): Promise<string> {
	const nonce = getNonce();
	const distRoot = vscode.Uri.joinPath(extensionUri, 'webview-ui', 'dist');
	const indexUri = vscode.Uri.joinPath(distRoot, 'index.html');

	const bytes = await vscode.workspace.fs.readFile(indexUri);
	let html = Buffer.from(bytes).toString('utf8');

	html = rewriteAssetUris(html, webview, distRoot);
	html = injectNonceIntoScripts(html, nonce);
	html = injectCsp(html, webview, nonce);

	return html;
}
