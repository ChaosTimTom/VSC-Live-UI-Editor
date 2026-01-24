import * as vscode from 'vscode';
import { DEFAULT_SAMPLE } from '../samples/sampleSet';

export type LoadedTarget = {
	uri: vscode.Uri;
	fileId: string; // workspace-relative when available, otherwise absolute fsPath
	text: string;
};

function isLikelyRenderableFile(uri: vscode.Uri): boolean {
	return /\.(html?|tsx|jsx)$/i.test(uri.fsPath);
}

export async function loadTargetFile(): Promise<LoadedTarget | undefined> {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

	const active = vscode.window.activeTextEditor?.document;
	if (active && active.uri.scheme === 'file' && isLikelyRenderableFile(active.uri)) {
		const fileId = workspaceFolder
			? vscode.workspace.asRelativePath(active.uri, false)
			: active.uri.fsPath;
		return { uri: active.uri, fileId, text: active.getText() };
	}

	// Default to sample file if present.
	if (workspaceFolder) {
		const sample = vscode.Uri.joinPath(workspaceFolder.uri, DEFAULT_SAMPLE.relativePath);
		try {
			await vscode.workspace.fs.stat(sample);
			const bytes = await vscode.workspace.fs.readFile(sample);
			return {
				uri: sample,
				fileId: vscode.workspace.asRelativePath(sample, false),
				text: Buffer.from(bytes).toString('utf8')
			};
		} catch {
			// ignore
		}
	}

	const selection = await vscode.window.showOpenDialog({
		canSelectMany: false,
		openLabel: 'Render in Live UI',
		filters: {
			'HTML / React': ['html', 'htm', 'tsx', 'jsx']
		}
	});

	const uri = selection?.[0];
	if (!uri) return;

	const bytes = await vscode.workspace.fs.readFile(uri);
	const fileId = workspaceFolder ? vscode.workspace.asRelativePath(uri, false) : uri.fsPath;
	return { uri, fileId, text: Buffer.from(bytes).toString('utf8') };
}
