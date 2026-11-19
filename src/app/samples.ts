/**
 * Example graphs. Each one exists to make a specific behaviour visible, and the
 * description says which. "Reference" graphs come from textbooks so a reader can
 * check the result against a known figure.
 */

import { addEdge, addNode, emptyDocument, type GraphDocument } from '../core/graph';
import { nextEdgeId, nextNodeId } from '../core/ids';

export interface Sample {
  readonly id: string;
  readonly name: string;
  /** What this graph is good for. Shown next to the name. */
  readonly purpose: string;
  readonly suggests: string;
  build(): GraphDocument;
}

interface Spec {
  readonly directed: boolean;
  readonly weighted: boolean;
  /** "A-B:4" undirected, "A>B:4" directed. The number is weight or capacity. */
  readonly edges: readonly string[];
  readonly isolated?: readonly string[];
  readonly asCapacity?: boolean;
}

function make(spec: Spec): GraphDocument {
  let doc = emptyDocument({
    directed: spec.directed,
    weighted: spec.weighted,
    loops: false,
    multi: false,
  });

  const labels: string[] = [];
  for (const entry of spec.edges) {
    const [pair] = entry.split(':');
    const sep = pair.includes('>') ? '>' : '-';
    for (const label of pair.split(sep).map((s) => s.trim())) {
      if (!labels.includes(label)) labels.push(label);
    }
  }
  for (const label of spec.isolated ?? []) {
    if (!labels.includes(label)) labels.push(label);
  }

  // Identifiers come from the shared generator, never from the position in this
  // list: a sample must not mint ids the editor could hand out again later.
  const idByLabel = new Map<string, string>();
  const r = 240;
  labels.forEach((label, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / labels.length;
    const id = nextNodeId();
    idByLabel.set(label, id);
    doc = addNode(doc, {
      id,
      label,
      x: Math.round(460 + r * Math.cos(a)),
      y: Math.round(300 + r * Math.sin(a)),
    });
  });

  const idOf = (label: string) => idByLabel.get(label) as string;
  spec.edges.forEach((entry) => {
    const [pair, value] = entry.split(':');
    const sep = pair.includes('>') ? '>' : '-';
    const [from, to] = pair.split(sep).map((s) => s.trim());
    const num = value === undefined ? undefined : Number(value);
    doc = addEdge(doc, {
      id: nextEdgeId(),
      from: idOf(from),
      to: idOf(to),
      ...(num === undefined ? {} : spec.asCapacity ? { capacity: num } : { weight: num }),
    });
  });

  return doc;
}

export const SAMPLES: readonly Sample[] = [
  {
    id: 'starter',
    name: 'Premier graphe',
    purpose: 'Six sommets, non orienté, non pondéré. Pour voir BFS et DFS diverger.',
    suggests: 'bfs',
    build: () =>
      make({
        directed: false,
        weighted: false,
        edges: ['A-B', 'A-C', 'B-D', 'C-D', 'D-E', 'C-F'],
      }),
  },
  {
    id: 'two-components',
    name: 'Deux composantes',
    purpose: 'Un sommet isolé et deux groupes séparés. Montre ce qu\'un parcours ne voit pas.',
    suggests: 'bfs',
    build: () =>
      make({
        directed: false,
        weighted: false,
        edges: ['A-B', 'B-C', 'C-A', 'D-E'],
        isolated: ['F'],
      }),
  },
  {
    id: 'weighted-detour',
    name: 'Le détour payant',
    purpose: 'A—B coûte 4, mais A—C—B coûte 3. Dijkstra doit préférer le détour.',
    suggests: 'dijkstra',
    build: () =>
      make({
        directed: false,
        weighted: true,
        edges: ['A-B:4', 'A-C:2', 'C-B:1', 'B-D:5', 'C-D:8', 'D-E:6', 'C-E:10'],
      }),
  },
  {
    id: 'negative-arc',
    name: 'Arc négatif',
    purpose: 'Dijkstra refuse, Bellman-Ford trouve dist(B) = 2. La différence en un graphe.',
    suggests: 'bellman-ford',
    build: () =>
      make({ directed: true, weighted: true, edges: ['A>B:4', 'A>C:5', 'C>B:-3', 'B>D:2'] }),
  },
  {
    id: 'negative-cycle',
    name: 'Cycle négatif',
    purpose: 'Tourner dans le cycle fait baisser le coût sans fin. Bellman-Ford le nomme.',
    suggests: 'bellman-ford',
    build: () =>
      make({ directed: true, weighted: true, edges: ['A>B:1', 'B>C:-3', 'C>B:1', 'C>D:2'] }),
  },
  {
    id: 'mst',
    name: 'Arbre couvrant',
    purpose: 'Poids minimal 14. Kruskal et Prim doivent tomber d\'accord.',
    suggests: 'kruskal',
    build: () =>
      make({
        directed: false,
        weighted: true,
        edges: ['A-B:4', 'A-C:2', 'B-C:1', 'B-D:5', 'C-D:8', 'D-E:6'],
      }),
  },
  {
    id: 'dag',
    name: 'Dépendances',
    purpose: 'Graphe orienté acyclique. Le tri topologique donne un ordre de tâches.',
    suggests: 'topological-sort',
    build: () =>
      make({
        directed: true,
        weighted: false,
        edges: ['A>C', 'B>C', 'C>D', 'B>D', 'D>E', 'C>F'],
      }),
  },
  {
    id: 'cyclic-dag',
    name: 'Dépendance circulaire',
    purpose: 'S est ordonnable, puis A, B, C se bloquent mutuellement.',
    suggests: 'topological-sort',
    build: () =>
      make({ directed: true, weighted: false, edges: ['S>A', 'A>B', 'B>C', 'C>A'] }),
  },
  {
    id: 'flow',
    name: 'Réseau de référence',
    purpose: 'Figure 26.1 de CLRS. Flot maximal 23, coupe minimale 23.',
    suggests: 'edmonds-karp',
    build: () =>
      make({
        directed: true,
        weighted: false,
        asCapacity: true,
        edges: [
          's>A:16',
          's>B:13',
          'A>B:10',
          'B>A:4',
          'A>C:12',
          'C>B:9',
          'B>D:14',
          'D>C:7',
          'C>t:20',
          'D>t:4',
        ],
      }),
  },
];

export function sampleById(id: string): Sample | undefined {
  return SAMPLES.find((s) => s.id === id);
}
