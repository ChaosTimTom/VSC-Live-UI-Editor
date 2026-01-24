export type SourceLocator = { file: string; line: number; column?: number };

export type SelectionMode = 'element' | 'group';

export type ElementContext = {
  tagName: string;
  id?: string;
  classList?: string[];
  role?: string;
  href?: string;
  type?: string;
  text?: string;
};

export type SelectionModel = {
  mode: SelectionMode;
  // What the user actually clicked (best-effort).
  leafEl: HTMLElement;
  // Nearest source-mapped element for persistence.
  mappedEl: HTMLElement;
  // The element the editor operates on (leaf vs group root).
  selectedEl: HTMLElement;
  groupRootEl?: HTMLElement;
  locator: SourceLocator;
};
