export type SetDocumentMessage = {
	command: 'setDocument';
	file: string; // workspace-relative
	html: string; // injected HTML to render
};

export type PreviewStyleMessage = {
	command: 'previewStyle';
	file: string;
	line: number;
	style: Record<string, string>;
};

export type ClearPreviewMessage = {
	command: 'clearPreview';
};

export type RequestTargetsMessage = {
	command: 'requestTargets';
	requestId: string;
	selector: string;
};

export type ElementClickedMessage = {
	command: 'elementClicked';
	file: string; // workspace-relative
	line: number; // 1-based
	column?: number; // 1-based
	elementId?: string; // stable id when available (e.g. data-lui)
};

export type ElementSelectedMessage = {
	command: 'elementSelected';
	file: string; // workspace-relative when available, otherwise absolute fsPath
	line: number; // 1-based
	column?: number; // 1-based
	elementId?: string; // stable id when available (e.g. data-lui)
	elementContext?: {
		tagName: string;
		id?: string;
		classList?: string[];
		role?: string;
		href?: string;
		type?: string;
		text?: string;
	};
	inlineStyle?: string;
	computedStyle?: Record<string, string>;
};

export type ElementUnmappedMessage = {
	command: 'elementUnmapped';
	// When we can select a DOM element but cannot map it back to source code.
	// (Common in frameworks/build pipelines that don't provide React _debugSource.)
	elementId?: string;
	elementContext?: {
		tagName: string;
		id?: string;
		classList?: string[];
		role?: string;
		href?: string;
		type?: string;
		text?: string;
	};
	inlineStyle?: string;
	computedStyle?: Record<string, string>;
};

export type TargetsListMessage = {
	command: 'targetsList';
	requestId: string;
	targets: Array<{ file: string; line: number }>;
};

export type UpdateStyleMessage = {
	command: 'updateStyle';
	file: string; // workspace-relative when available, otherwise absolute fsPath
	line: number; // 1-based
	column?: number; // 1-based
	elementId?: string; // stable id when available (e.g. data-lui)
	elementContext?: {
		tagName: string;
		id?: string;
		classList?: string[];
		role?: string;
		href?: string;
		type?: string;
		text?: string;
	};
	computedStyle?: Record<string, string>;
	style: {
		width?: string;
		height?: string;
		transform?: string;
		margin?: string;
		marginTop?: string;
		marginRight?: string;
		marginBottom?: string;
		marginLeft?: string;
		padding?: string;
		paddingTop?: string;
		paddingRight?: string;
		paddingBottom?: string;
		paddingLeft?: string;
	};
};

export type UpdateTextMessage = {
	command: 'updateText';
	file: string; // workspace-relative when available, otherwise absolute fsPath
	line: number; // 1-based
	column?: number; // 1-based
	elementId?: string; // stable id when available (e.g. data-lui)
	elementContext?: {
		tagName: string;
		id?: string;
		classList?: string[];
		role?: string;
		href?: string;
		type?: string;
		text?: string;
	};
	text: string;
};

export type ApplyPendingEditsMessage = {
	command: 'applyPendingEdits';
	forceUnsafe?: boolean;
};

export type DiscardPendingEditsMessage = {
	command: 'discardPendingEdits';
};

export type SetLayoutApplyMessage = {
	command: 'setLayoutApply';
	enabled: boolean;
};

export type SetLayoutApplyModeMessage = {
	command: 'setLayoutApplyMode';
	mode: 'off' | 'safe' | 'full';
};

export type SetTauriShimMessage = {
	command: 'setTauriShim';
	enabled: boolean;
};

export type EnableStableIdsMessage = {
	command: 'enableStableIds';
};

export type FixTargetingMessage = {
	command: 'fixTargeting';
};

export type SetStyleApplyModeMessage = {
	command: 'setStyleApplyMode';
	mode: 'class' | 'inline';
};

export type SetStyleAdapterMessage = {
	command: 'setStyleAdapter';
	adapter: 'auto' | 'tailwind' | 'cssClass' | 'inline';
};

export type PickCssTargetMessage = {
	command: 'pickCssTarget';
};

export type StartBackendMessage = {
	command: 'startBackend';
};

export type OpenHelpMessage = {
	command: 'openHelp';
};

export type ToWebviewMessage = SetDocumentMessage | PreviewStyleMessage | ClearPreviewMessage | RequestTargetsMessage;
export type FromWebviewMessage =
	| ElementClickedMessage
	| ElementSelectedMessage
	| ElementUnmappedMessage
	| TargetsListMessage
	| UpdateStyleMessage
	| UpdateTextMessage
	| ApplyPendingEditsMessage
	| DiscardPendingEditsMessage
	| SetLayoutApplyMessage
	| SetLayoutApplyModeMessage
	| SetTauriShimMessage
	| EnableStableIdsMessage
	| FixTargetingMessage
	| SetStyleApplyModeMessage
	| SetStyleAdapterMessage
	| PickCssTargetMessage
	| StartBackendMessage
	| OpenHelpMessage;

export function isFromWebviewMessage(value: unknown): value is FromWebviewMessage {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	if (v.command === 'openHelp') {
		return true;
	}
	if (v.command === 'elementClicked') {
		const colOk = v.column === undefined || typeof v.column === 'number';
		const idOk = v.elementId === undefined || typeof v.elementId === 'string';
		return typeof v.file === 'string' && typeof v.line === 'number' && colOk && idOk;
	}
	if (v.command === 'elementSelected') {
		if (!(typeof v.file === 'string' && typeof v.line === 'number')) return false;
		const colOk = v.column === undefined || typeof v.column === 'number';
		if (!colOk) return false;
		const elementIdOk = v.elementId === undefined || typeof v.elementId === 'string';
		if (!elementIdOk) return false;
		const inlineOk = v.inlineStyle === undefined || typeof v.inlineStyle === 'string';
		if (!inlineOk) return false;
		if (v.computedStyle !== undefined) {
			if (!v.computedStyle || typeof v.computedStyle !== 'object') return false;
			const cs = v.computedStyle as Record<string, unknown>;
			for (const [k, val] of Object.entries(cs)) {
				if (typeof k !== 'string') return false;
				if (typeof val !== 'string') return false;
			}
		}
		if (v.elementContext === undefined) return true;
		if (!v.elementContext || typeof v.elementContext !== 'object') return false;
		const c = v.elementContext as Record<string, unknown>;
		if (typeof c.tagName !== 'string') return false;
		const ctxIdOk = c.id === undefined || typeof c.id === 'string';
		const roleOk = c.role === undefined || typeof c.role === 'string';
		const hrefOk = c.href === undefined || typeof c.href === 'string';
		const typeOk = c.type === undefined || typeof c.type === 'string';
		const textOk = c.text === undefined || typeof c.text === 'string';
		const classOk = c.classList === undefined || (Array.isArray(c.classList) && c.classList.every(x => typeof x === 'string'));
		return ctxIdOk && roleOk && hrefOk && typeOk && textOk && classOk;
	}
	if (v.command === 'elementUnmapped') {
		const elementIdOk = v.elementId === undefined || typeof v.elementId === 'string';
		if (!elementIdOk) return false;
		const inlineOk = v.inlineStyle === undefined || typeof v.inlineStyle === 'string';
		if (!inlineOk) return false;
		if (v.computedStyle !== undefined) {
			if (!v.computedStyle || typeof v.computedStyle !== 'object') return false;
			const cs = v.computedStyle as Record<string, unknown>;
			for (const [k, val] of Object.entries(cs)) {
				if (typeof k !== 'string') return false;
				if (typeof val !== 'string') return false;
			}
		}
		if (v.elementContext === undefined) return true;
		if (!v.elementContext || typeof v.elementContext !== 'object') return false;
		const c = v.elementContext as Record<string, unknown>;
		if (typeof c.tagName !== 'string') return false;
		const ctxIdOk = c.id === undefined || typeof c.id === 'string';
		const roleOk = c.role === undefined || typeof c.role === 'string';
		const hrefOk = c.href === undefined || typeof c.href === 'string';
		const typeOk = c.type === undefined || typeof c.type === 'string';
		const textOk = c.text === undefined || typeof c.text === 'string';
		const classOk = c.classList === undefined || (Array.isArray(c.classList) && c.classList.every(x => typeof x === 'string'));
		return ctxIdOk && roleOk && hrefOk && typeOk && textOk && classOk;
	}
	if (v.command === 'targetsList') {
		if (typeof v.requestId !== 'string') return false;
		if (!Array.isArray(v.targets)) return false;
		return v.targets.every(t => t && typeof t === 'object' && typeof (t as any).file === 'string' && typeof (t as any).line === 'number');
	}
	if (v.command === 'updateStyle') {
		if (!(typeof v.file === 'string' && typeof v.line === 'number')) return false;
		const colOk = v.column === undefined || typeof v.column === 'number';
		if (!colOk) return false;
		const idOk = v.elementId === undefined || typeof v.elementId === 'string';
		if (!idOk) return false;
		if (v.computedStyle !== undefined) {
			if (!v.computedStyle || typeof v.computedStyle !== 'object') return false;
			const cs = v.computedStyle as Record<string, unknown>;
			for (const [k, val] of Object.entries(cs)) {
				if (typeof k !== 'string') return false;
				if (typeof val !== 'string') return false;
			}
		}
		if (v.elementContext !== undefined) {
			if (!v.elementContext || typeof v.elementContext !== 'object') return false;
			const c = v.elementContext as Record<string, unknown>;
			if (typeof c.tagName !== 'string') return false;
			const idOk = c.id === undefined || typeof c.id === 'string';
			const roleOk = c.role === undefined || typeof c.role === 'string';
			const hrefOk = c.href === undefined || typeof c.href === 'string';
			const typeOk = c.type === undefined || typeof c.type === 'string';
			const textOk = c.text === undefined || typeof c.text === 'string';
			const classOk = c.classList === undefined || (Array.isArray(c.classList) && c.classList.every(x => typeof x === 'string'));
			if (!(idOk && roleOk && hrefOk && typeOk && textOk && classOk)) return false;
		}
		if (!v.style || typeof v.style !== 'object') return false;
		const style = v.style as Record<string, unknown>;
		const widthOk = style.width === undefined || typeof style.width === 'string';
		const heightOk = style.height === undefined || typeof style.height === 'string';
		const transformOk = style.transform === undefined || typeof style.transform === 'string';
		const marginOk = style.margin === undefined || typeof style.margin === 'string';
		const marginTopOk = style.marginTop === undefined || typeof style.marginTop === 'string';
		const marginRightOk = style.marginRight === undefined || typeof style.marginRight === 'string';
		const marginBottomOk = style.marginBottom === undefined || typeof style.marginBottom === 'string';
		const marginLeftOk = style.marginLeft === undefined || typeof style.marginLeft === 'string';
		const paddingOk = style.padding === undefined || typeof style.padding === 'string';
		const paddingTopOk = style.paddingTop === undefined || typeof style.paddingTop === 'string';
		const paddingRightOk = style.paddingRight === undefined || typeof style.paddingRight === 'string';
		const paddingBottomOk = style.paddingBottom === undefined || typeof style.paddingBottom === 'string';
		const paddingLeftOk = style.paddingLeft === undefined || typeof style.paddingLeft === 'string';
		return widthOk && heightOk && transformOk && marginOk && marginTopOk && marginRightOk && marginBottomOk && marginLeftOk && paddingOk && paddingTopOk && paddingRightOk && paddingBottomOk && paddingLeftOk;
	}
	if (v.command === 'updateText') {
		if (!(typeof v.file === 'string' && typeof v.line === 'number' && typeof v.text === 'string')) return false;
		const colOk = v.column === undefined || typeof v.column === 'number';
		if (!colOk) return false;
		const idOk = v.elementId === undefined || typeof v.elementId === 'string';
		if (!idOk) return false;
		if (v.elementContext !== undefined) {
			if (!v.elementContext || typeof v.elementContext !== 'object') return false;
			const c = v.elementContext as Record<string, unknown>;
			if (typeof c.tagName !== 'string') return false;
			const idOk = c.id === undefined || typeof c.id === 'string';
			const roleOk = c.role === undefined || typeof c.role === 'string';
			const hrefOk = c.href === undefined || typeof c.href === 'string';
			const typeOk = c.type === undefined || typeof c.type === 'string';
			const textOk = c.text === undefined || typeof c.text === 'string';
			const classOk = c.classList === undefined || (Array.isArray(c.classList) && c.classList.every(x => typeof x === 'string'));
			if (!(idOk && roleOk && hrefOk && typeOk && textOk && classOk)) return false;
		}
		return true;
	}
	if (v.command === 'setTauriShim') {
		return typeof v.enabled === 'boolean';
	}
	if (v.command === 'applyPendingEdits') {
		const forceOk = v.forceUnsafe === undefined || typeof v.forceUnsafe === 'boolean';
		return forceOk;
	}
	if (v.command === 'fixTargeting') {
		return true;
	}
	if (v.command === 'setStyleApplyMode') {
		return v.mode === 'class' || v.mode === 'inline';
	}
	if (v.command === 'setStyleAdapter') {
		return v.adapter === 'auto' || v.adapter === 'tailwind' || v.adapter === 'cssClass' || v.adapter === 'inline';
	}
	if (v.command === 'pickCssTarget') {
		return true;
	}
	if (v.command === 'startBackend') {
		return true;
	}
	if (v.command === 'discardPendingEdits') {
		return true;
	}
	if (v.command === 'setLayoutApply') {
		return typeof v.enabled === 'boolean';
	}
	if (v.command === 'setLayoutApplyMode') {
		return v.mode === 'off' || v.mode === 'safe' || v.mode === 'full';
	}
	if (v.command === 'enableStableIds') {
		return true;
	}
	return false;
}
