export type HitTestResult = {
  leafEl: HTMLElement;
  mappedEl: HTMLElement;
};

const isElement = (v: unknown): v is HTMLElement => v instanceof HTMLElement;

export function hitTestAtPoint(args: {
  canvasEl: HTMLElement;
  clientX: number;
  clientY: number;
}): HitTestResult | null {
  const { canvasEl, clientX, clientY } = args;

  let elements: Element[] = [];
  try {
    elements = document.elementsFromPoint(clientX, clientY);
  } catch {
    return null;
  }

  for (const el of elements) {
    if (!isElement(el)) continue;
    if (!canvasEl.contains(el)) continue;
    // Ignore overlay UI.
    if (el.closest('[data-live-ui-overlay="1"]')) continue;

    const leafEl = el;
    const mappedEl = leafEl.closest<HTMLElement>('[data-source-file][data-source-line]');
    if (!mappedEl) continue;

    return { leafEl, mappedEl };
  }

  return null;
}
