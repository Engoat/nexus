/**
 * Graph domain model.
 *
 * Two distinct types on purpose:
 *
 *  - `GraphDocument` is what the editor owns. It carries layout (x, y) and
 *    presentation concerns.
 *  - `MathGraph` is what algorithms receive. It has no coordinates at all, so
 *    an algorithm physically cannot read a node position. The compiler enforces
 *    the separation the spec asks for.
 */

export type NodeId = string;
export type EdgeId = string;

/** Node as the editor knows it: maths + layout. */
export interface GraphNode {
  readonly id: NodeId;
  readonly label: string;
  /** View-only. Never read by an algorithm. */
  readonly x: number;
  readonly y: number;
}

/** Edge attributes shared by both views. */
export interface EdgeAttributes {
  /** Present when the graph is weighted. May be negative. */
  readonly weight?: number;
  /** Present for flow problems. Must be >= 0. */
  readonly capacity?: number;
}

export interface GraphEdge extends EdgeAttributes {
  readonly id: EdgeId;
  readonly from: NodeId;
  readonly to: NodeId;
}

export interface GraphFlags {
  readonly directed: boolean;
  readonly weighted: boolean;
  /** Self-loops allowed. */
  readonly loops: boolean;
  /** Several edges between the same ordered pair allowed. */
  readonly multi: boolean;
}

export const DEFAULT_FLAGS: GraphFlags = {
  directed: false,
  weighted: false,
  loops: false,
  multi: false,
};

export interface GraphDocument {
  readonly flags: GraphFlags;
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

/** Algorithm-facing view: structure only, no layout. */
export interface MathNode {
  readonly id: NodeId;
  readonly label: string;
}

export interface MathGraph {
  readonly flags: GraphFlags;
  readonly nodes: readonly MathNode[];
  readonly edges: readonly GraphEdge[];
}

export function emptyDocument(flags: Partial<GraphFlags> = {}): GraphDocument {
  return { flags: { ...DEFAULT_FLAGS, ...flags }, nodes: [], edges: [] };
}

/**
 * Strip layout. The returned object is frozen, so an algorithm that tries to
 * write into the graph it was handed fails loudly instead of corrupting the
 * editor's document.
 */
export function toMathGraph(doc: GraphDocument): MathGraph {
  const g: MathGraph = {
    flags: Object.freeze({ ...doc.flags }),
    nodes: Object.freeze(doc.nodes.map((n) => Object.freeze({ id: n.id, label: n.label }))),
    edges: Object.freeze(doc.edges.map((e) => Object.freeze({ ...e }))),
  };
  return Object.freeze(g);
}

/* ------------------------------------------------------------------ *
 * Pure document operations. Every one returns a new document.
 * ------------------------------------------------------------------ */

export function addNode(doc: GraphDocument, node: GraphNode): GraphDocument {
  if (doc.nodes.some((n) => n.id === node.id)) {
    throw new Error(`addNode: identifiant déjà utilisé (${node.id})`);
  }
  return { ...doc, nodes: [...doc.nodes, node] };
}

export function updateNode(
  doc: GraphDocument,
  id: NodeId,
  patch: Partial<Omit<GraphNode, 'id'>>,
): GraphDocument {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

/** Removing a node removes every edge touching it. */
export function removeNode(doc: GraphDocument, id: NodeId): GraphDocument {
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => n.id !== id),
    edges: doc.edges.filter((e) => e.from !== id && e.to !== id),
  };
}

export function addEdge(doc: GraphDocument, edge: GraphEdge): GraphDocument {
  const known = new Set(doc.nodes.map((n) => n.id));
  if (!known.has(edge.from) || !known.has(edge.to)) {
    throw new Error(`addEdge: extrémité inconnue (${edge.from} → ${edge.to})`);
  }
  if (!doc.flags.loops && edge.from === edge.to) {
    throw new Error('addEdge: les boucles sont désactivées sur ce graphe');
  }
  if (!doc.flags.multi && hasEdgeBetween(doc, edge.from, edge.to)) {
    throw new Error('addEdge: les arêtes parallèles sont désactivées sur ce graphe');
  }
  if (doc.edges.some((e) => e.id === edge.id)) {
    throw new Error(`addEdge: identifiant déjà utilisé (${edge.id})`);
  }
  return { ...doc, edges: [...doc.edges, edge] };
}

export function updateEdge(
  doc: GraphDocument,
  id: EdgeId,
  patch: Partial<Omit<GraphEdge, 'id'>>,
): GraphDocument {
  return { ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

export function removeEdge(doc: GraphDocument, id: EdgeId): GraphDocument {
  return { ...doc, edges: doc.edges.filter((e) => e.id !== id) };
}

export function setFlags(doc: GraphDocument, patch: Partial<GraphFlags>): GraphDocument {
  return { ...doc, flags: { ...doc.flags, ...patch } };
}

/* ------------------------------------------------------------------ *
 * Queries. `undirected` means an edge counts in both directions.
 * ------------------------------------------------------------------ */

export function hasEdgeBetween(doc: GraphDocument | MathGraph, a: NodeId, b: NodeId): boolean {
  return doc.edges.some(
    (e) => (e.from === a && e.to === b) || (!doc.flags.directed && e.from === b && e.to === a),
  );
}

export function nodeById(g: GraphDocument | MathGraph, id: NodeId): MathNode | undefined {
  return g.nodes.find((n) => n.id === id);
}

export function degree(g: MathGraph, id: NodeId): number {
  let d = 0;
  for (const e of g.edges) {
    if (e.from === id) d += 1;
    if (e.to === id) d += 1;
  }
  return d;
}

export function outDegree(g: MathGraph, id: NodeId): number {
  if (!g.flags.directed) return degree(g, id);
  return g.edges.filter((e) => e.from === id).length;
}

export function inDegree(g: MathGraph, id: NodeId): number {
  if (!g.flags.directed) return degree(g, id);
  return g.edges.filter((e) => e.to === id).length;
}

/** Weight used by algorithms. Unweighted graphs behave as uniform weight 1. */
export function weightOf(g: MathGraph, e: GraphEdge): number {
  if (!g.flags.weighted) return 1;
  return e.weight ?? 1;
}

export function capacityOf(e: GraphEdge): number {
  return e.capacity ?? 0;
}
