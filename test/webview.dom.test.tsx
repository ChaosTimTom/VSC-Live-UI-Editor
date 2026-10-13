// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from '../webview-ui/node_modules/react';
import { createRoot, type Root } from '../webview-ui/node_modules/react-dom/client';
import App from '../webview-ui/src/App';
import AppModeShell from '../webview-ui/src/appMode/AppModeShell';

let root: Root;
let container: HTMLDivElement;
const messages: any[] = [];

beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  messages.length = 0;
  (window as any).acquireVsCodeApi = () => ({ postMessage: (msg: any) => messages.push(msg), getState: () => ({}), setState() {} });
  (window as any).__LIVE_UI_APP_MODE_OPTS__ = { iframeUrl: 'about:blank', iframeOrigin: 'null', appLabel: 'Sample app' };
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function post(data: any) {
  await act(async () => window.dispatchEvent(new MessageEvent('message', { data })));
}

describe('rendered extension webviews', () => {
  it('loads and refreshes static documents through the real setDocument handler', async () => {
    await act(async () => root.render(<App />));
    await post({ command: 'setDocument', file: 'sample.html', html: '<main><h1>Loaded preview</h1></main>' });
    expect(container.querySelector('h1')?.textContent).toBe('Loaded preview');
    await post({ command: 'setDocument', file: 'sample.html', html: '<main><h1>Updated preview</h1></main>' });
    expect(container.querySelector('h1')?.textContent).toBe('Updated preview');
  });
  it('shows actionable App Mode hints and keeps failed apply reports visible', async () => {
    await act(async () => root.render(<AppModeShell />));
    expect(messages).toContainEqual({ command: 'appModeReady' });
    await post({ command: 'appModeHint', text: 'Restart the app to enable source mapping.' });
    expect(container.textContent).toContain('Restart the app');
    await post({ command: 'appModeApplyReport', applied: 0, failed: 1, skipped: 0, items: [{ ok: false, file: 'App.tsx', line: 1, reason: 'Source changed' }] });
    expect(container.textContent).toContain('Source changed');
    const redesign = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Redesign with UI Wizard')!;
    await act(async () => redesign.click());
    expect(messages).toContainEqual({ command: 'redesignPage' });
  });
  it('disables apply and discard while a batch is being saved', async () => {
    await act(async () => root.render(<AppModeShell />));
    await post({ command: 'appModePendingCount', count: 2 });
    await post({ command: 'appModeApplying', applying: true });
    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.find(button => button.textContent === 'Applying…')?.disabled).toBe(true);
    expect(buttons.find(button => button.textContent === 'Discard')?.disabled).toBe(true);
  });
});
