/**
 * Import and export.
 *
 * The file format carries a version. Parsing validates every field and refuses a
 * malformed file with a message naming the problem, rather than building a
 * half-broken graph that fails later inside an algorithm.
 */

import { DEFAULT_FLAGS, type GraphDocument, type GraphEdge, type GraphNode } from '../core/graph';
import { reseedFrom } from '../core/ids';
import type { Trace } from '../core/trace';

export const FORMAT_VERSION = 1;

interface FileShape {
  format: 'nexus';
  version: number;
  flags: GraphDocument['flags'];
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function serializeDocument(doc: GraphDocument): string {
  const file: FileShape = {
    format: 'nexus',
    version: FORMAT_VERSION,
    flags: doc.flags,
    nodes: doc.nodes.map((n) => ({ ...n })),
    edges: doc.edges.map((e) => ({ ...e })),
  };
  return JSON.stringify(file, null, 2);
}

function fail(message: string): never {
  throw new Error(`Fichier illisible : ${message}`);
}

export function parseDocument(text: string): GraphDocument {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail("ce n'est pas du JSON valide.");
  }
  if (typeof raw !== 'object' || raw === null) fail('le contenu attendu est un objet.');

  const obj = raw as Partial<FileShape>;
  if (obj.format !== 'nexus') fail("le champ « format » devrait valoir « nexus ».");
  if (typeof obj.version !== 'number') fail('version manquante.');
  if (obj.version > FORMAT_VERSION) {
    fail(`version ${obj.version} produite par une version plus récente de Nexus.`);
  }
  if (!Array.isArray(obj.nodes)) fail('la liste des sommets est absente.');
  if (!Array.isArray(obj.edges)) fail('la liste des arêtes est absente.');

  const nodes: GraphNode[] = obj.nodes.map((n, i) => {
    if (typeof n?.id !== 'string') fail(`sommet ${i} sans identifiant.`);
    if (typeof n.label !== 'string') fail(`sommet ${n.id} sans libellé.`);
    const x = Number(n.x);
    const y = Number(n.y);
    return {
      id: n.id,
      label: n.label,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };
  });

  const known = new Set(nodes.map((n) => n.id));
  const edges: GraphEdge[] = obj.edges.map((e, i) => {
    if (typeof e?.id !== 'string') fail(`arête ${i} sans identifiant.`);
    if (!known.has(e.from)) fail(`arête ${e.id} : sommet « ${e.from} » inconnu.`);
    if (!known.has(e.to)) fail(`arête ${e.id} : sommet « ${e.to} » inconnu.`);
    const edge: GraphEdge = { id: e.id, from: e.from, to: e.to };
    const weight = e.weight === undefined ? undefined : Number(e.weight);
    const capacity = e.capacity === undefined ? undefined : Number(e.capacity);
    if (weight !== undefined && !Number.isFinite(weight)) fail(`arête ${e.id} : poids invalide.`);
    if (capacity !== undefined && !Number.isFinite(capacity)) {
      fail(`arête ${e.id} : capacité invalide.`);
    }
    if (capacity !== undefined && capacity < 0) fail(`arête ${e.id} : capacité négative.`);
    return {
      ...edge,
      ...(weight === undefined ? {} : { weight }),
      ...(capacity === undefined ? {} : { capacity }),
    };
  });

  const ids = new Set<string>();
  for (const n of nodes) {
    if (ids.has(n.id)) fail(`identifiant de sommet en double : ${n.id}.`);
    ids.add(n.id);
  }
  const edgeIds = new Set<string>();
  for (const e of edges) {
    if (edgeIds.has(e.id)) fail(`identifiant d'arête en double : ${e.id}.`);
    edgeIds.add(e.id);
  }

  reseedFrom({ nodes: nodes.map((n) => n.id), edges: edges.map((e) => e.id) });

  return {
    flags: { ...DEFAULT_FLAGS, ...(obj.flags ?? {}) },
    nodes,
    edges,
  };
}

export function serializeTrace(trace: Trace, doc: GraphDocument): string {
  const labels = Object.fromEntries(doc.nodes.map((n) => [n.id, n.label]));
  return JSON.stringify(
    {
      format: 'nexus-trace',
      version: FORMAT_VERSION,
      algorithm: trace.algorithmId,
      labels,
      pseudocode: trace.pseudocode,
      complexity: trace.complexity,
      conclusions: trace.conclusions,
      result: trace.result,
      steps: trace.steps,
    },
    null,
    2,
  );
}

export function download(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
