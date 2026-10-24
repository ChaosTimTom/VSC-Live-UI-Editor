import React, { useLayoutEffect, useRef } from 'react';

export interface StaticDocumentProps {
  html: string;
  onCanvas: (canvas: HTMLDivElement | null) => void;
}

export function staticPageCss(css: string): string {
  return css.replace(/(^|[{}])([^{}]+)\{/g,
    (_match, boundary, selector) => `${boundary}${selector.replace(/:root\b/g, 'html')}{`);
}

/** Keep the edited page's html/body/* rules out of the editor's own UI. */
export function StaticDocument({ html, onCanvas }: StaticDocumentProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
    const reset = document.createElement('style');
    reset.textContent = ':host { all: initial; display: block; min-width: 0; }';
    const canvas = document.createElement('div');
    canvas.setAttribute('data-live-ui-canvas', '1');
    canvas.style.cssText = 'position:relative; display:flow-root; min-width:0; min-height:100%;';
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    // Static mode never executes project scripts. App Mode runs interactive apps.
    parsed.querySelectorAll('script, base, meta[http-equiv]').forEach(node => node.remove());
    for (const style of parsed.querySelectorAll('style')) {
      // A shadow tree has no :root element; retain the page's root custom properties.
      style.textContent = staticPageCss(style.textContent ?? '');
    }
    canvas.appendChild(document.importNode(parsed.documentElement, true));
    shadow.replaceChildren(reset, canvas);
    onCanvas(canvas);
    return () => onCanvas(null);
  }, [html, onCanvas]);

  return <div ref={hostRef} data-live-ui-document="1" style={{ display: 'block', minWidth: 0 }} />;
}
