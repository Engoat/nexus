/**
 * Document state with undo/redo.
 *
 * Kept strictly separate from run state, as the spec requires: stepping through
 * a trace is not an edit, and undoing an edit is not stepping backwards. Mixing
 * the two is the classic bug of this kind of tool.
 *
 * History holds whole documents. They are immutable and small (a few hundred
 * nodes at most), so snapshotting is simpler and safer than diffing.
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import type { GraphDocument } from '../../core/graph';

const LIMIT = 80;

interface History {
  readonly past: readonly GraphDocument[];
  readonly present: GraphDocument;
  readonly future: readonly GraphDocument[];
}

export interface DocumentStore {
  readonly doc: GraphDocument;
  /** Records a history entry. Use for anything the user would want to undo. */
  commit(next: GraphDocument | ((prev: GraphDocument) => GraphDocument), label?: string): void;
  /** No history entry. Use for continuous gestures such as dragging a node. */
  touch(next: GraphDocument | ((prev: GraphDocument) => GraphDocument)): void;
  /** Closes a gesture: pushes the state captured when the gesture started. */
  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  reset(next: GraphDocument): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly lastLabel: string | null;
}

export function useDocument(initial: GraphDocument): DocumentStore {
  const [history, setHistory] = useState<History>({ past: [], present: initial, future: [] });
  const [lastLabel, setLastLabel] = useState<string | null>(null);
  const gestureStart = useRef<GraphDocument | null>(null);

  const resolve = useCallback(
    (next: GraphDocument | ((prev: GraphDocument) => GraphDocument), prev: GraphDocument) =>
      typeof next === 'function' ? next(prev) : next,
    [],
  );

  const commit = useCallback<DocumentStore['commit']>(
    (next, label) => {
      setHistory((h) => {
        const value = resolve(next, h.present);
        if (value === h.present) return h;
        return {
          past: [...h.past, h.present].slice(-LIMIT),
          present: value,
          future: [],
        };
      });
      if (label !== undefined) setLastLabel(label);
    },
    [resolve],
  );

  const touch = useCallback<DocumentStore['touch']>(
    (next) => {
      setHistory((h) => ({ ...h, present: resolve(next, h.present) }));
    },
    [resolve],
  );

  const beginGesture = useCallback(() => {
    setHistory((h) => {
      gestureStart.current = h.present;
      return h;
    });
  }, []);

  const endGesture = useCallback(() => {
    const start = gestureStart.current;
    gestureStart.current = null;
    if (!start) return;
    setHistory((h) => {
      if (h.present === start) return h;
      return { past: [...h.past, start].slice(-LIMIT), present: h.present, future: [] };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (h.past.length === 0) return h;
      const previous = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present: previous,
        future: [h.present, ...h.future].slice(0, LIMIT),
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      if (h.future.length === 0) return h;
      const next = h.future[0];
      return {
        past: [...h.past, h.present].slice(-LIMIT),
        present: next,
        future: h.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((next: GraphDocument) => {
    setHistory({ past: [], present: next, future: [] });
    setLastLabel(null);
  }, []);

  return useMemo(
    () => ({
      doc: history.present,
      commit,
      touch,
      beginGesture,
      endGesture,
      undo,
      redo,
      reset,
      canUndo: history.past.length > 0,
      canRedo: history.future.length > 0,
      lastLabel,
    }),
    [history, commit, touch, beginGesture, endGesture, undo, redo, reset, lastLabel],
  );
}
