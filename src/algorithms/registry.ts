/**
 * Algorithm registry.
 *
 * Adding an algorithm means writing its module and adding one line here. No UI
 * change is required: the settings panel reads `params`, the run button reads
 * `check`, the analysis panel reads the trace.
 */

import { edmondsKarp } from './flow/edmondsKarp';
import { kruskal } from './mst/kruskal';
import { prim } from './mst/prim';
import { topologicalSort } from './order/topologicalSort';
import { bellmanFord } from './shortest/bellmanFord';
import { dijkstra } from './shortest/dijkstra';
import { bfs } from './traversal/bfs';
import { dfs } from './traversal/dfs';
import type { AlgorithmFamily, AlgorithmSpec } from './types';

export const ALGORITHMS: readonly AlgorithmSpec<unknown>[] = [
  bfs as AlgorithmSpec<unknown>,
  dfs as AlgorithmSpec<unknown>,
  dijkstra as AlgorithmSpec<unknown>,
  bellmanFord as AlgorithmSpec<unknown>,
  kruskal as AlgorithmSpec<unknown>,
  prim as AlgorithmSpec<unknown>,
  topologicalSort as AlgorithmSpec<unknown>,
  edmondsKarp as AlgorithmSpec<unknown>,
];

export const FAMILY_ORDER: readonly AlgorithmFamily[] = [
  'parcours',
  'plus courts chemins',
  'arbre couvrant',
  'ordre',
  'flot',
];

export function byId(id: string): AlgorithmSpec<unknown> | undefined {
  return ALGORITHMS.find((a) => a.id === id);
}

export function byFamily(): { family: AlgorithmFamily; items: AlgorithmSpec<unknown>[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    items: ALGORITHMS.filter((a) => a.family === family),
  })).filter((group) => group.items.length > 0);
}

export { bellmanFord, bfs, dfs, dijkstra, edmondsKarp, kruskal, prim, topologicalSort };
