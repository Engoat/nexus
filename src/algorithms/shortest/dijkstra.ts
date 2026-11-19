/**
 * Dijkstra's shortest paths from a single source.
 *
 * Refuses negative weights instead of returning a wrong answer: with a negative
 * arc, a settled node can still be improved later, and the invariant the
 * algorithm rests on no longer holds.
 */

import { buildAdjacency } from '../../core/adjacency';
import type { EdgeId, MathGraph, NodeId } from '../../core/graph';
import { MinHeap } from '../../core/structures/minheap';
import { fmtDist, type InvariantSpec, type StructureView, Tracer } from '../../core/trace';
import {
  type AlgorithmSpec,
  asNodeId,
  type Issue,
  type ParamValues,
  requireNode,
  requireNodes,
  warnNoEdges,
} from '../types';

export interface DijkstraResult {
  readonly dist: Record<NodeId, number>;
  readonly prev: Record<NodeId, NodeId | null>;
  readonly settledOrder: NodeId[];
  readonly treeEdges: EdgeId[];
  readonly unreachable: NodeId[];
  readonly pathToTarget: { nodes: NodeId[]; cost: number } | null;
}

const PSEUDO = [
  'dist[s] ← 0 ; dist[v] ← ∞ pour v ≠ s',
  'tas ← {(0, s)}',
  'tant que tas non vide :',
  '    (d, u) ← extraire-min(tas)',
  '    si u déjà fixé : passer',
  '    fixer u',
  '    pour chaque arc (u → v) de poids w :',
  '        si dist[u] + w < dist[v] :',
  '            dist[v] ← dist[u] + w ; prev[v] ← u ; insérer (dist[v], v)',
] as const;

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'dij-order',
    statement: 'Les sommets sont fixés par distance non décroissante.',
    matters:
      "C'est l'argument de correction lui-même : si un sommet se fixait à une distance " +
      'plus petite que le précédent, un chemin plus court aurait été manqué.',
  },
  {
    id: 'dij-final',
    statement: "Aucune relaxation n'améliore la distance d'un sommet déjà fixé.",
    matters:
      'Un sommet fixé est censé être définitif. Une amélioration tardive signalerait ' +
      "un poids négatif, cas où l'algorithme ne s'applique pas.",
  },
] as const;

export const dijkstra: AlgorithmSpec<DijkstraResult> = {
  id: 'dijkstra',
  name: 'Dijkstra',
  family: 'plus courts chemins',
  summary: 'Plus courts chemins depuis une source, poids positifs.',
  rationale:
    "À chaque tour, le sommet de distance provisoire minimale ne peut plus être amélioré : " +
    'tout autre chemin vers lui passerait par un sommet déjà plus loin, et les poids ' +
    'étant positifs, allonger un chemin ne le raccourcit jamais. On peut donc le fixer ' +
    'définitivement. Cet argument tombe dès qu\'un poids est négatif.',
  params: [
    { kind: 'node', id: 'source', label: 'Source', required: true },
    { kind: 'node', id: 'target', label: 'Cible (optionnelle)', required: false },
  ],
  invariants: INVARIANTS,

  check(graph, params): Issue[] {
    const issues = [
      ...requireNodes(graph, 2),
      ...requireNode(graph, params, 'source', 'La source'),
      ...warnNoEdges(graph),
    ];
    if (!graph.flags.weighted) {
      issues.push({
        level: 'warning',
        message: 'Le graphe est non pondéré : chaque arête compte pour 1.',
        fix: 'BFS donne le même résultat en O(V + E).',
      });
    }
    const negative = graph.edges.filter((e) => (e.weight ?? 1) < 0);
    if (graph.flags.weighted && negative.length > 0) {
      issues.push({
        level: 'error',
        message: `${negative.length} arête(s) de poids négatif. Dijkstra ne s'applique pas.`,
        fix: 'Utilise Bellman-Ford, qui accepte les poids négatifs.',
      });
    }
    return issues;
  },

  run(graph: MathGraph, params: ParamValues) {
    const adj = buildAdjacency(graph);
    const source = asNodeId(params, 'source') as NodeId;
    const target = asNodeId(params, 'target');

    const t = new Tracer(INVARIANTS);
    const dist = new Map<NodeId, number>();
    const prev = new Map<NodeId, NodeId | null>();
    const settled = new Set<NodeId>();
    const settledOrder: NodeId[] = [];
    const viaEdge = new Map<NodeId, EdgeId>();
    const heap = new MinHeap<NodeId>();

    for (const id of adj.nodeIds) {
      dist.set(id, Number.POSITIVE_INFINITY);
      prev.set(id, null);
    }
    dist.set(source, 0);

    const label = (id: NodeId) => adj.label(id);
    const view = (): StructureView[] => [
      {
        kind: 'heap',
        name: 'Tas (clé = distance provisoire)',
        items: heap.entries().map((e) => ({ key: fmtDist(e.key), value: label(e.value) })),
      },
      { kind: 'set', name: 'Fixés', items: settledOrder.map(label) },
      {
        kind: 'table',
        name: 'Distances',
        columns: ['sommet', 'dist', 'prev', 'état'],
        rows: adj.nodeIds.map((id) => [
          label(id),
          fmtDist(dist.get(id) as number),
          prev.get(id) ? label(prev.get(id) as NodeId) : '—',
          settled.has(id) ? 'fixé' : 'provisoire',
        ]),
      },
    ];

    let lastSettledDist = Number.NEGATIVE_INFINITY;
    t.markNode(source, 'source');
    if (target) t.markNode(target, 'target');
    heap.push(0, source);
    t.emit({
      line: 2,
      action: 'Initialisation',
      detail: `dist(${label(source)}) = 0, toutes les autres distances sont infinies.`,
      structures: view(),
    });

    while (!heap.isEmpty()) {
      const entry = heap.pop();
      if (!entry) break;
      const u = entry.value;

      if (settled.has(u)) {
        t.count('entrées périmées');
        t.emit({
          line: 5,
          action: `${label(u)} périmé`,
          detail:
            `Cette entrée vaut ${fmtDist(entry.key)} alors que ${label(u)} est déjà fixé ` +
            `à ${fmtDist(dist.get(u) as number)}. On la jette.`,
          structures: view(),
        });
        continue;
      }

      // Candidates still open at this instant, with a finite provisional distance.
      const open = adj.nodeIds
        .filter((id) => !settled.has(id) && Number.isFinite(dist.get(id) as number))
        .sort((a, b) => (dist.get(a) as number) - (dist.get(b) as number));
      if (open.length > 1) {
        t.ask({
          prompt: 'Quel sommet va être fixé ?',
          kind: 'node',
          answer: u,
          among: open.map((id) => ({
            value: id,
            label: `${label(id)} (${fmtDist(dist.get(id) as number)})`,
          })),
          because:
            `On fixe toujours la plus petite distance provisoire, ici ` +
            `${label(u)} à ${fmtDist(dist.get(u) as number)}.`,
        });
      }

      const du0 = dist.get(u) as number;
      t.hold(
        'dij-order',
        du0 >= lastSettledDist,
        `fixation précédente à ${lastSettledDist === Number.NEGATIVE_INFINITY ? '—' : lastSettledDist}, celle-ci à ${fmtDist(du0)}`,
      );
      lastSettledDist = du0;

      settled.add(u);
      settledOrder.push(u);
      t.count('sommets fixés');
      if (u !== source && u !== target) t.markNode(u, 'settled');
      const inEdge = viaEdge.get(u);
      if (inEdge) t.markEdge(inEdge, 'tree');
      t.emit({
        line: 6,
        action: `Fixe ${label(u)}`,
        detail:
          `${label(u)} est le plus proche non fixé (${fmtDist(dist.get(u) as number)}). ` +
          'Sa distance est définitive.',
        structures: view(),
      });

      if (target && u === target) {
        t.emit({
          line: 3,
          action: 'Cible fixée',
          detail: `La cible ${label(target)} est fixée : sa distance ne changera plus.`,
          structures: view(),
        });
        break;
      }

      for (const arc of adj.out(u)) {
        t.count('arcs relâchés');
        const du = dist.get(u) as number;
        const dv = dist.get(arc.to) as number;
        const candidate = du + arc.weight;

        t.hold(
          'dij-final',
          !(settled.has(arc.to) && candidate < dv),
          settled.has(arc.to)
            ? `${label(arc.to)} est fixé à ${fmtDist(dv)}, la proposition vaut ${candidate}`
            : `${label(arc.to)} n'est pas encore fixé`,
        );

        if (candidate < dv) {
          dist.set(arc.to, candidate);
          prev.set(arc.to, u);
          viaEdge.set(arc.to, arc.edgeId);
          heap.push(candidate, arc.to);
          t.count('améliorations');
          t.markEdge(arc.edgeId, 'inspected');
          if (!settled.has(arc.to) && arc.to !== target) t.markNode(arc.to, 'frontier');
          t.emit({
            line: 9,
            action: `Améliore ${label(arc.to)}`,
            detail:
              `${fmtDist(du)} + ${arc.weight} = ${candidate} fait mieux que ${fmtDist(dv)}. ` +
              `${label(arc.to)} passe par ${label(u)}.`,
            structures: view(),
          });
        } else {
          t.markEdge(arc.edgeId, 'rejected');
          t.emit({
            line: 8,
            action: `Garde ${label(arc.to)}`,
            detail:
              `${fmtDist(du)} + ${arc.weight} = ${candidate} ne bat pas ${fmtDist(dv)}. ` +
              'Rien ne change.',
            structures: view(),
          });
        }
      }
    }

    const unreachable = adj.nodeIds.filter((id) => !Number.isFinite(dist.get(id) as number));
    for (const id of unreachable) t.markNode(id, 'excluded');

    let pathToTarget: DijkstraResult['pathToTarget'] = null;
    if (target && Number.isFinite(dist.get(target) as number)) {
      const nodes: NodeId[] = [];
      let cur: NodeId | null = target;
      while (cur) {
        nodes.unshift(cur);
        cur = prev.get(cur) ?? null;
      }
      pathToTarget = { nodes, cost: dist.get(target) as number };
      for (let i = 1; i < nodes.length; i += 1) {
        const e = viaEdge.get(nodes[i]);
        if (e) t.markEdge(e, 'path');
      }
      t.emit({
        line: 0,
        action: 'Chemin reconstruit',
        detail:
          `${nodes.map(label).join(' → ')} pour un coût de ${pathToTarget.cost}, ` +
          'obtenu en remontant prev depuis la cible.',
        structures: view(),
      });
    }

    const conclusions: string[] = [
      `${settledOrder.length} sommet(s) fixé(s) dans l'ordre : ${settledOrder.map(label).join(', ')}.`,
    ];
    if (unreachable.length > 0) {
      conclusions.push(`Inatteignables depuis ${label(source)} : ${unreachable.map(label).join(', ')}.`);
    }
    if (target) {
      conclusions.push(
        pathToTarget
          ? `Coût minimal ${label(source)} → ${label(target)} : ${pathToTarget.cost}.`
          : `Aucun chemin de ${label(source)} vers ${label(target)}.`,
      );
    }
    conclusions.push(
      `${t.metric('améliorations')} amélioration(s) de distance pour ${t.metric('arcs relâchés')} arc(s) examiné(s).`,
    );

    return t.build<DijkstraResult>({
      algorithmId: 'dijkstra',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O((V + E) log V)',
        space: 'O(V + E)',
        note: "Avec un tas binaire et insertion paresseuse : au plus E entrées dans le tas.",
      },
      conclusions,
      result: {
        dist: Object.fromEntries(dist),
        prev: Object.fromEntries(prev),
        settledOrder,
        treeEdges: [...viaEdge.values()],
        unreachable,
        pathToTarget,
      },
    });
  },
};
