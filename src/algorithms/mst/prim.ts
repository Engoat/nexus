/**
 * Prim's minimum spanning tree.
 *
 * Grows one tree from a start node instead of sorting all edges. Reaches the
 * same total weight as Kruskal on a connected graph, by a different argument,
 * which is the point of offering both.
 */

import { type Arc, buildAdjacency } from '../../core/adjacency';
import type { EdgeId, MathGraph, NodeId } from '../../core/graph';
import { MinHeap } from '../../core/structures/minheap';
import { type InvariantSpec, type StructureView, Tracer } from '../../core/trace';
import {
  type AlgorithmSpec,
  asNodeId,
  type Issue,
  type ParamValues,
  requireNode,
  requireNodes,
  warnNoEdges,
} from '../types';

export interface PrimResult {
  readonly treeEdges: EdgeId[];
  readonly order: NodeId[];
  readonly totalWeight: number;
  readonly spansGraph: boolean;
  readonly outside: NodeId[];
}

const PSEUDO = [
  'T ← {s}',
  'tas ← arêtes incidentes à s',
  'tant que tas non vide et |T| < V :',
  '    (w, u → v) ← extraire-min(tas)',
  '    si v ∈ T : passer (arête interne)',
  '    T ← T ∪ {v} ; retenir (u, v)',
  '    insérer dans le tas les arêtes de v vers l\'extérieur',
] as const;

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'prim-cut',
    statement:
      "L'arête retenue est la plus légère de toutes celles qui sortent de l'arbre construit.",
    matters:
      "C'est la propriété de coupe, et c'est tout l'argument de correction de Prim. " +
      'Retenir une arête plus lourde que nécessaire donnerait un arbre non minimal.',
  },
  {
    id: 'prim-tree',
    statement: "L'ensemble construit reste un arbre : une arête de moins que de sommets.",
    matters: 'Sinon ce ne serait plus un arbre couvrant mais un graphe avec cycle.',
  },
] as const;

export const prim: AlgorithmSpec<PrimResult> = {
  id: 'prim',
  name: 'Prim',
  family: 'arbre couvrant',
  summary: "Arbre couvrant de poids minimal, par croissance depuis un sommet.",
  rationale:
    "L'arête la plus légère qui sort de l'ensemble déjà construit appartient à un arbre " +
    'couvrant minimal : la coupe entre T et le reste doit bien être franchie une fois, ' +
    'et la franchir au prix le plus bas ne peut pas nuire. ' +
    "Prim ne voit que les composantes reliées à son point de départ.",
  params: [{ kind: 'node', id: 'start', label: 'Sommet de départ', required: true }],
  invariants: INVARIANTS,

  check(graph, params): Issue[] {
    const issues = [
      ...requireNodes(graph, 2),
      ...requireNode(graph, params, 'start', 'Le sommet de départ'),
      ...warnNoEdges(graph),
    ];
    if (graph.flags.directed) {
      issues.push({
        level: 'error',
        message: "L'arbre couvrant minimal n'est défini que sur un graphe non orienté.",
        fix: 'Passe le graphe en non orienté.',
      });
    }
    if (!graph.flags.weighted) {
      issues.push({
        level: 'warning',
        message: 'Graphe non pondéré : tout arbre couvrant est minimal.',
      });
    }
    return issues;
  },

  run(graph: MathGraph, params: ParamValues) {
    const adj = buildAdjacency(graph);
    const start = asNodeId(params, 'start') as NodeId;
    const t = new Tracer(INVARIANTS);

    const inTree = new Set<NodeId>();
    const order: NodeId[] = [];
    const treeEdges: EdgeId[] = [];
    const heap = new MinHeap<Arc>();
    let totalWeight = 0;

    const label = (id: NodeId) => adj.label(id);
    const view = (): StructureView[] => [
      {
        kind: 'heap',
        name: 'Tas des arêtes sortantes',
        items: heap
          .entries()
          .map((e) => ({ key: String(e.key), value: `${label(e.value.from)} — ${label(e.value.to)}` })),
      },
      { kind: 'set', name: 'Dans l\'arbre', items: order.map(label) },
    ];

    const openFrom = (node: NodeId) => {
      for (const arc of adj.out(node)) {
        if (inTree.has(arc.to)) continue;
        heap.push(arc.weight, arc);
      }
    };

    inTree.add(start);
    order.push(start);
    t.markNode(start, 'source');
    openFrom(start);
    t.emit({
      line: 2,
      action: `Départ en ${label(start)}`,
      detail: `${label(start)} entre dans l'arbre. Ses ${heap.size} arête(s) sortante(s) entrent dans le tas.`,
      structures: view(),
    });

    while (!heap.isEmpty() && inTree.size < adj.nodeIds.length) {
      const entry = heap.pop();
      if (!entry) break;
      const arc = entry.value;
      t.count('arêtes examinées');

      if (inTree.has(arc.to)) {
        t.markEdge(arc.edgeId, 'rejected');
        t.emit({
          line: 5,
          action: `Ignore ${label(arc.from)}—${label(arc.to)}`,
          detail:
            `${label(arc.to)} est déjà dans l'arbre : cette arête est devenue interne ` +
            'et fermerait un cycle.',
          structures: view(),
        });
        continue;
      }

      // All edges leaving the tree right now, cheapest first.
      const crossing: Arc[] = [];
      for (const id of order) {
        for (const a of adj.out(id)) {
          if (inTree.has(a.to)) continue;
          if (crossing.some((c) => c.edgeId === a.edgeId)) continue;
          crossing.push(a);
        }
      }
      const cheapest = crossing.reduce(
        (best, c) => (best === null || c.weight < best.weight ? c : best),
        null as Arc | null,
      );
      t.hold(
        'prim-cut',
        cheapest !== null && arc.weight === cheapest.weight,
        `retenue à ${arc.weight}, minimum sortant à ${cheapest ? cheapest.weight : '—'}`,
      );
      if (crossing.length > 1) {
        t.ask({
          prompt: "Quelle arête sort de l'arbre au moindre coût ?",
          kind: 'edge',
          answer: arc.edgeId,
          among: crossing.map((c) => ({
            value: c.edgeId,
            label: `${label(c.from)} - ${label(c.to)} (${c.weight})`,
          })),
          because:
            `Parmi les ${crossing.length} arêtes qui sortent de l'arbre, ` +
            `${label(arc.from)} — ${label(arc.to)} est la plus légère avec ${arc.weight}.`,
        });
      }

      inTree.add(arc.to);
      order.push(arc.to);
      treeEdges.push(arc.edgeId);
      totalWeight += arc.weight;
      t.count('arêtes retenues');
      t.markEdge(arc.edgeId, 'tree');
      t.markNode(arc.to, 'settled');
      openFrom(arc.to);
      t.hold(
        'prim-tree',
        treeEdges.length === inTree.size - 1,
        `${treeEdges.length} arête(s) pour ${inTree.size} sommet(s)`,
      );
      t.emit({
        line: 6,
        action: `Retient ${label(arc.from)}—${label(arc.to)}`,
        detail:
          `C'est la plus légère des arêtes sortantes (poids ${arc.weight}). ` +
          `${label(arc.to)} rejoint l'arbre, poids total ${totalWeight}.`,
        structures: view(),
      });
    }

    const outside = adj.nodeIds.filter((id) => !inTree.has(id));
    for (const id of outside) t.markNode(id, 'excluded');

    const spansGraph = outside.length === 0;
    const conclusions: string[] = [
      spansGraph
        ? `Arbre couvrant minimal : ${treeEdges.length} arête(s), poids total ${totalWeight}.`
        : `${outside.length} sommet(s) hors d'atteinte depuis ${label(start)} : ` +
          `${outside.map(label).join(', ')}. Prim ne couvre qu'une composante.`,
    ];
    conclusions.push(`Ordre d'entrée dans l'arbre : ${order.map(label).join(' → ')}.`);

    return t.build<PrimResult>({
      algorithmId: 'prim',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O(E log V)',
        space: 'O(E)',
        note: 'Chaque arête entre au plus une fois dans le tas depuis chacune de ses extrémités.',
      },
      conclusions,
      result: { treeEdges, order, totalWeight, spansGraph, outside },
    });
  },
};
