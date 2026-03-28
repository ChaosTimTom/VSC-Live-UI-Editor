import { useCallback, useRef } from 'react';

export type EditEntry = {
  /** The DOM element that was changed (must still be connected). */
  el: HTMLElement;
  /** CSS property name (camelCase). */
  prop: string;
  /** Value before the change. */
  prev: string;
  /** Value after the change. */
  next: string;
  /** Source-mapped file locator. */
  file: string;
  line: number;
};

export type UndoRedoActions = {
  push: (entry: EditEntry) => void;
  undo: () => EditEntry | null;
  redo: () => EditEntry | null;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
};

const MAX_HISTORY = 100;

export function useUndoRedo(): UndoRedoActions {
  const stackRef = useRef<EditEntry[]>([]);
  const indexRef = useRef<number>(-1);

  const push = useCallback((entry: EditEntry) => {
    const stack = stackRef.current;
    const idx = indexRef.current;
    // Trim future entries (we're branching from a past state).
    stackRef.current = stack.slice(0, idx + 1);
    stackRef.current.push(entry);
    if (stackRef.current.length > MAX_HISTORY) {
      stackRef.current = stackRef.current.slice(stackRef.current.length - MAX_HISTORY);
    }
    indexRef.current = stackRef.current.length - 1;
  }, []);

  const undo = useCallback((): EditEntry | null => {
    const idx = indexRef.current;
    if (idx < 0) return null;
    const entry = stackRef.current[idx];
    indexRef.current = idx - 1;

    // Revert the visual change.
    if (entry.el.isConnected) {
      (entry.el.style as any)[entry.prop] = entry.prev;
    }
    return entry;
  }, []);

  const redo = useCallback((): EditEntry | null => {
    const idx = indexRef.current;
    if (idx >= stackRef.current.length - 1) return null;
    indexRef.current = idx + 1;
    const entry = stackRef.current[indexRef.current];

    // Re-apply the visual change.
    if (entry.el.isConnected) {
      (entry.el.style as any)[entry.prop] = entry.next;
    }
    return entry;
  }, []);

  const canUndo = useCallback(() => indexRef.current >= 0, []);
  const canRedo = useCallback(() => indexRef.current < stackRef.current.length - 1, []);
  const clear = useCallback(() => {
    stackRef.current = [];
    indexRef.current = -1;
  }, []);

  return { push, undo, redo, canUndo, canRedo, clear };
}
