/**
 * Test helpers: build a graph from a compact literal so the tests read like the
 * textbook figures they come from.
 *
 *   build('A-B:4, A-C:2, B-C:1')  → undirected weighted
 *   build('A>B:3, B>C:1', { directed: true })
 */

import {
  addEdge,
  addNode,
  type GraphDocument,
  type GraphFlags,
  emptyDocument,
  type MathGraph,
  toMathGraph,
} from '../src/core/graph';

export interface BuildOptions extends Partial<GraphFlags> {
  /** Nodes with no edge, listed separately. */
  isolated?: string[];
  /** Read the number after ':' as a capacity rather than a weight. */
  asCapacity?: boolean;
}

export function build(spec: string, opts: BuildOptions = {}): MathGraph {
  return toMathGraph(buildDocument(spec, opts));
}

export function buildDocument(spec: string, opts: BuildOptions = {}): GraphDocument {
  const entries = spec
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const weighted = opts.weighted ?? entries.some((e) => e.includes(':'));
  const directed = opts.directed ?? entries.some((e) => e.includes('>'));

  let doc = emptyDocument({
    directed,
    weighted,
    loops: opts.loops ?? false,
    multi: opts.multi ?? false,
  });

  const seen = new Set<string>();
  const ensure = (label: string) => {
    if (seen.has(label)) return;
    seen.add(label);
    // Layout is irrelevant to the maths; a circle keeps it readable if dumped.
    const i = seen.size - 1;
    doc = addNode(doc, {
      id: label,
      label,
      x: Math.round(300 + 220 * Math.cos((i * 2 * Math.PI) / 8)),
      y: Math.round(300 + 220 * Math.sin((i * 2 * Math.PI) / 8)),
    });
  };

  let n = 0;
  for (const entry of entries) {
    const [pair, value] = entry.split(':');
    const sep = pair.includes('>') ? '>' : '-';
    const [from, to] = pair.split(sep).map((s) => s.trim());
    ensure(from);
    ensure(to);
    n += 1;
    const num = value === undefined ? undefined : Number(value);
    doc = addEdge(doc, {
      id: `e${n}`,
      from,
      to,
      ...(num === undefined ? {} : opts.asCapacity ? { capacity: num } : { weight: num }),
    });
  }

  for (const label of opts.isolated ?? []) ensure(label);
  return doc;
}

/** Labels of a node id list, for readable assertions. */
export function labels(g: MathGraph, ids: readonly string[]): string[] {
  const map = new Map(g.nodes.map((n) => [n.id, n.label]));
  return ids.map((id) => map.get(id) ?? id);
}

/** Sum of the weights of the given edges. */
export function weightSum(g: MathGraph, edgeIds: readonly string[]): number {
  let total = 0;
  for (const id of edgeIds) {
    const e = g.edges.find((x) => x.id === id);
    if (!e) throw new Error(`arête inconnue dans l'assertion : ${id}`);
    total += e.weight ?? 1;
  }
  return total;
}
