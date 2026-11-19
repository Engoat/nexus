/**
 * Adjacency structures derived from a MathGraph.
 *
 * Built once per algorithm run. Neighbour order is deterministic (sorted by
 * node label then edge id) so a trace is reproducible: the same graph always
 * produces the same step sequence. Without this, two runs could differ and the
 * trace would stop being a verifiable artefact.
 */

import { type EdgeId, type GraphEdge, type MathGraph, type NodeId, weightOf } from './graph';

/** One traversable arc. For an undirected edge both directions appear. */
export interface Arc {
  readonly edgeId: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
  readonly weight: number;
  /** True when this arc walks an undirected edge backwards. */
  readonly reversed: boolean;
}

export interface Adjacency {
  readonly graph: MathGraph;
  readonly nodeIds: readonly NodeId[];
  /** Outgoing arcs, deterministic order. */
  out(id: NodeId): readonly Arc[];
  /** Incoming arcs. Equals `out` on an undirected graph. */
  in(id: NodeId): readonly Arc[];
  label(id: NodeId): string;
  edge(id: EdgeId): GraphEdge;
}

export function buildAdjacency(graph: MathGraph): Adjacency {
  const labels = new Map<NodeId, string>();
  for (const n of graph.nodes) labels.set(n.id, n.label);

  const edges = new Map<EdgeId, GraphEdge>();
  for (const e of graph.edges) edges.set(e.id, e);

  const rank = new Map<NodeId, number>();
  const ordered = [...graph.nodes].sort((a, b) =>
    a.label.localeCompare(b.label, 'fr', { numeric: true }),
  );
  ordered.forEach((n, i) => rank.set(n.id, i));

  const outMap = new Map<NodeId, Arc[]>();
  const inMap = new Map<NodeId, Arc[]>();
  for (const n of graph.nodes) {
    outMap.set(n.id, []);
    inMap.set(n.id, []);
  }

  const push = (map: Map<NodeId, Arc[]>, key: NodeId, arc: Arc) => {
    map.get(key)?.push(arc);
  };

  for (const e of graph.edges) {
    const w = weightOf(graph, e);
    const forward: Arc = { edgeId: e.id, from: e.from, to: e.to, weight: w, reversed: false };
    push(outMap, e.from, forward);
    push(inMap, e.to, forward);

    if (!graph.flags.directed && e.from !== e.to) {
      const back: Arc = { edgeId: e.id, from: e.to, to: e.from, weight: w, reversed: true };
      push(outMap, e.to, back);
      push(inMap, e.from, back);
    }
  }

  const sortArcs = (arcs: Arc[]) =>
    arcs.sort((a, b) => {
      const ra = rank.get(a.to) ?? 0;
      const rb = rank.get(b.to) ?? 0;
      return ra !== rb ? ra - rb : a.edgeId.localeCompare(b.edgeId);
    });

  for (const arcs of outMap.values()) sortArcs(arcs);
  for (const arcs of inMap.values()) sortArcs(arcs);

  return {
    graph,
    nodeIds: ordered.map((n) => n.id),
    out: (id) => outMap.get(id) ?? [],
    in: (id) => inMap.get(id) ?? [],
    label: (id) => labels.get(id) ?? id,
    edge: (id) => {
      const e = edges.get(id);
      if (!e) throw new Error(`arête inconnue : ${id}`);
      return e;
    },
  };
}
