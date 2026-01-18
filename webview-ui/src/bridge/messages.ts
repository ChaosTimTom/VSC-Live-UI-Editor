export type SetDocumentMessage = {
  command: 'setDocument';
  file: string;
  html: string;
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
  file: string;
  line: number;
  column?: number;
};

export type ElementSelectedMessage = {
  command: 'elementSelected';
  file: string;
  line: number;
  column?: number;
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
  file: string;
  line: number;
  style: {
    width?: string;
    height?: string;
    transform?: string;
  };
};

export type ToWebviewMessage = SetDocumentMessage | PreviewStyleMessage | ClearPreviewMessage | RequestTargetsMessage;
export type FromWebviewMessage = ElementClickedMessage | ElementSelectedMessage | TargetsListMessage | UpdateStyleMessage;

export function isToWebviewMessage(value: unknown): value is ToWebviewMessage {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.command === 'setDocument') {
    return typeof v.file === 'string' && typeof v.html === 'string';
  }
  if (v.command === 'previewStyle') {
    return typeof v.file === 'string' && typeof v.line === 'number' && typeof v.style === 'object' && !!v.style;
  }
  if (v.command === 'clearPreview') {
    return true;
  }
  if (v.command === 'requestTargets') {
    return typeof v.requestId === 'string' && typeof v.selector === 'string';
  }
  return false;
}
