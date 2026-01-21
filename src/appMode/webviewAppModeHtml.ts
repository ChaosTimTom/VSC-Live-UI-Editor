import * as vscode from 'vscode';
import { getAppModeWebviewHtmlFromVite } from '../webviewHtml';

export async function getAppModeWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri, opts: {
	iframeUrl: string;
	appLabel: string;
	tauriShimEnabled?: boolean;
}): Promise<string> {
	const iframeOrigin = new URL(opts.iframeUrl).origin;
	return getAppModeWebviewHtmlFromVite(webview, extensionUri, {
		iframeUrl: opts.iframeUrl,
		iframeOrigin,
		appLabel: opts.appLabel,
		tauriShimEnabled: !!opts.tauriShimEnabled,
	});
}
