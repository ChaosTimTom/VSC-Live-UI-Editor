import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  source: 'export default function App() { return <p>Old</p>; }',
  handler: undefined as any,
  replacements: [] as string[],
  css: [] as string[],
  save: true,
  apply: true,
  requestCount: 0,
  candidate: 'export default function App() { return <main><p>New</p></main>; }',
  commands: new Map<string, (...args: any[]) => any>(),
  executed: [] as string[],
  doc: undefined as any,
}));

vi.mock('vscode', () => ({
  Uri: { from: (value: any) => ({ ...value, toString: () => `${value.scheme}:${value.path}?${value.query}` }),
    parse: () => ({ path: '/App.tsx', toString: () => 'file:/App.tsx' }) },
  Range: class { constructor(..._args: any[]) {} },
  WorkspaceEdit: class { replace(_uri: any, _range: any, source: string) { state.replacements.push(source); } },
  LanguageModelChatMessage: { User: (content: string) => ({ content }) },
  workspace: {
    registerTextDocumentContentProvider: () => ({ dispose() {} }),
    asRelativePath: () => 'App.tsx',
    openTextDocument: async () => state.doc,
    applyEdit: async () => {
      if (state.apply) state.source = state.replacements.at(-1)!;
      return state.apply;
    },
  },
  commands: {
    registerCommand: (name: string, fn: any) => { state.commands.set(name, fn); return { dispose() {} }; },
    executeCommand: async (name: string) => { state.executed.push(name); },
  },
  chat: { createChatParticipant: (_id: string, handler: any) => { state.handler = handler; return { dispose() {} }; } },
  window: { showInformationMessage: vi.fn() },
}));

import { registerUiWizard } from '../src/chat/uiWizard';

const uri = { path: '/App.tsx', toString: () => 'file:/App.tsx' } as any;
const token = { isCancellationRequested: false } as any;
const output: string[] = [];
const stream = { markdown: (message: string) => output.push(message), button: vi.fn() } as any;

async function send(prompt: string) {
  const model = { sendRequest: async () => {
    state.requestCount++;
    const text = state.requestCount % 2 === 1 ? 'p { color: blue; }' : state.candidate;
    return { text: (async function* () { yield text; })() };
  } };
  await state.handler({ prompt, model }, {}, stream, token);
}

beforeEach(() => {
  state.source = 'export default function App() { return <p>Old</p>; }';
  state.candidate = 'export default function App() { return <main><p>New</p></main>; }';
  state.requestCount = 0;
  state.replacements = [];
  state.css = [];
  state.commands.clear();
  state.executed = [];
  state.apply = true;
  state.save = true;
  output.length = 0;
  token.isCancellationRequested = false;
  state.doc = { getText: () => state.source, positionAt: (n: number) => n, version: 1, save: async () => state.save };
  registerUiWizard({ subscriptions: [] } as any, {
    codeModifier: {} as any,
    getSelected: () => undefined,
    getPageTarget: async () => uri,
    getJsxSelectionAtLine: async () => undefined,
    replaceSelectedJsxAtLine: async () => false,
    refreshWebviewIfOpen: async () => {},
    previewStyleIfOpen: async () => {},
    clearPreviewIfOpen: async () => {},
    injectPageCssIfOpen: async css => { state.css.push(css); },
    clearPageCssIfOpen: async () => { state.css.push(''); },
    requestTargetsIfOpen: async () => [],
  });
});

describe('page redesign chat workflow', () => {
  it('previews without a selected element, reviews a diff, and applies the exact staged source', async () => {
    await send('redesign this page as a portfolio');
    expect(state.source).toContain('Old');
    expect(state.replacements).toEqual([]);
    expect(state.css).toContain('p { color: blue; }');
    await send('review');
    expect(state.executed).toContain('vscode.diff');
    await send('apply');
    expect(state.source).toBe(state.candidate);
    expect(state.requestCount).toBe(2); // Apply does not generate another, unreviewed rewrite.
  });
  it('preserves edits made after preview instead of replacing them', async () => {
    await send('redesign this page');
    state.source = 'export default function App() { return <p>My newer work</p>; }';
    await send('apply');
    expect(state.replacements).toEqual([]);
    expect(state.source).toContain('My newer work');
    expect(output.join('\n')).toContain('changed since this preview');
  });
  it('rejects malformed generated JSX before staging or saving', async () => {
    state.candidate = 'export default function App() { return <main>broken';
    await send('redesign this page');
    await send('apply');
    expect(state.replacements).toEqual([]);
    expect(output.join('\n')).toContain('syntax error');
  });
  it('retains a valid staged rewrite after a failed apply so it can be retried', async () => {
    await send('redesign this page');
    state.apply = false;
    await send('apply');
    expect(state.source).toContain('Old');
    state.apply = true;
    await send('apply');
    expect(state.source).toBe(state.candidate);
    expect(state.requestCount).toBe(2);
  });
  it('clears preview on cancel without changing source', async () => {
    await send('redesign this page');
    await send('cancel');
    expect(state.css.at(-1)).toBe('');
    expect(state.replacements).toEqual([]);
  });
  it('reports save failures without falsely claiming the file was saved', async () => {
    await send('redesign this page');
    state.save = false;
    await send('apply');
    expect(output.join('\n')).toContain('saving failed');
  });
});
