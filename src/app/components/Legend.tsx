/**
 * State legend.
 *
 * Shown only while a trace exists, and listing only the states the current trace
 * actually uses. A legend full of states that never appear teaches nothing.
 */

import type { EdgeMark, NodeMark, Step } from '../../core/trace';

const NODE_LABELS: Record<NodeMark, string> = {
  idle: 'non visité',
  source: 'source / puits',
  target: 'source / puits',
  current: 'en cours',
  frontier: 'en attente',
  settled: 'fixé',
  excluded: 'hors d\'atteinte',
};

const EDGE_LABELS: Record<EdgeMark, string> = {
  idle: 'non examinée',
  inspected: 'examinée',
  tree: 'retenue',
  rejected: 'rejetée',
  path: 'chemin',
  saturated: 'saturée',
};

/** La légende est posée sur le plateau clair : encres du plateau, pas de la charpente. */
const NODE_COLOURS: Record<NodeMark, string> = {
  idle: 'var(--board-2)',
  source: 'var(--on-board)',
  target: 'var(--on-board)',
  current: 'var(--st-current)',
  frontier: 'var(--st-frontier)',
  settled: 'var(--st-settled)',
  excluded: 'transparent',
};

const EDGE_COLOURS: Record<EdgeMark, string> = {
  idle: 'var(--pencil)',
  inspected: 'var(--st-current)',
  tree: 'var(--st-tree)',
  rejected: 'var(--pencil-soft)',
  path: 'var(--st-path)',
  saturated: 'var(--st-saturated)',
};

export function Legend({ steps }: { readonly steps: readonly Step[] }) {
  const nodeStates = new Set<NodeMark>();
  const edgeStates = new Set<EdgeMark>();
  for (const s of steps) {
    for (const m of Object.values(s.nodeMarks)) nodeStates.add(m);
    for (const m of Object.values(s.edgeMarks)) edgeStates.add(m);
  }
  // `target` and `source` share one entry.
  if (nodeStates.has('source')) nodeStates.delete('target');

  if (nodeStates.size + edgeStates.size === 0) return null;

  return (
    <div className="legend">
      {[...nodeStates].map((m) => (
        <span key={`n-${m}`}>
          <i
            style={{
              background: NODE_COLOURS[m],
              border:
                m === 'excluded'
                  ? '1.5px dashed var(--st-excluded)'
                  : m === 'idle'
                    ? '1.5px solid var(--on-board-3)'
                    : 'none',
            }}
          />
          {NODE_LABELS[m]}
        </span>
      ))}
      {[...edgeStates].map((m) => (
        <span key={`e-${m}`}>
          <i
            data-kind="edge"
            style={{
              borderTopColor: EDGE_COLOURS[m],
              borderTopStyle: m === 'rejected' || m === 'saturated' ? 'dashed' : 'solid',
            }}
          />
          {EDGE_LABELS[m]}
        </span>
      ))}
    </div>
  );
}
