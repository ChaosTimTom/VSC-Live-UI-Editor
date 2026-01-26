// Minimal runtime mock for the 'vscode' module so we can import extension code in Node tests.
// Only implements shapes that are referenced at module load time; most methods throw if called.

export class Uri {
	public fsPath = '';
	public path = '';
	public scheme = 'file';

	static file(fsPath: string): Uri {
		const u = new Uri();
		u.fsPath = fsPath;
		u.path = fsPath.replace(/\\/g, '/');
		return u;
	}

	static joinPath(_base: Uri, ..._paths: string[]): Uri {
		throw new Error('Uri.joinPath not implemented in tests');
	}
}

export class RelativePattern {
	constructor(_base: Uri, _pattern: string) {}
}

export class Range {
	constructor(_start: any, _end: any) {}
}

export class WorkspaceEdit {
	replace(_uri: Uri, _range: Range, _newText: string): void {
		throw new Error('WorkspaceEdit.replace not implemented in tests');
	}
}

export const workspace = {
	openTextDocument: async (_uri: Uri) => {
		throw new Error('workspace.openTextDocument not implemented in tests');
	},
	applyEdit: async (_edit: WorkspaceEdit) => {
		throw new Error('workspace.applyEdit not implemented in tests');
	},
	findFiles: async (_include: any, _exclude?: any, _maxResults?: number) => {
		return [] as Uri[];
	},
	asRelativePath: (_uriOrPath: any, _includeWorkspaceFolder?: boolean) => {
		return '';
	},
	fs: {
		stat: async (_uri: Uri) => {
			throw new Error('workspace.fs.stat not implemented in tests');
		},
		readFile: async (_uri: Uri) => {
			throw new Error('workspace.fs.readFile not implemented in tests');
		},
	},
};

// Types used in some signatures; not used at runtime in these tests.
export type TextDocument = any;
