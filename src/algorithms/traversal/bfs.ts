/**
 * Breadth-first search.
 * Discovers nodes by increasing number of edges from the source, which is why
 * it yields shortest paths when every edge counts the same.
 */

import { buildAdjacency } from '../../core/adjacency';
import type { EdgeId, MathGraph, NodeId } from '../../core/graph';
import { fmtDist, type InvariantSpec, type StructureView, Tracer } from '../../core/trace';
import {
  type AlgorithmSpec,
  asBoolean,
  asNodeId,
  type Issue,
  type ParamValues,
  requireNode,
  requireNodes,
  warnNoEdges,
} from '../types';

export interface BfsResult {
  readonly order: NodeId[];
  readonly dist: Record<NodeId, number>;
  readonly parent: Record<NodeId, NodeId | null>;
  readonly treeEdges: EdgeId[];
  readonly reached: number;
  readonly unreached: NodeId[];
  /** Shortest path to the target when one was requested and found. */
  readonly pathToTarget: NodeId[] | null;
}

const PSEUDO = [
  'dist[s] ← 0 ; file ← [s]',
  'tant que file non vide :',
  '    u ← défiler(file)',
  '    pour chaque voisin v de u :',
  '        si dist[v] est indéfini :',
  '            dist[v] ← dist[u] + 1 ; parent[v] ← u',
  '            enfiler(file, v)',
] as const;

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'bfs-two-levels',
    statement: "La file ne contient que des sommets de deux niveaux consécutifs, k et k+1.",
    matters:
      "C'est ce qui garantit l'ordre : si la file mélangeait trois niveaux, un sommet lointain " +
      'pourrait sortir avant un sommet proche et sa distance serait fausse.',
  },
  {
    id: 'bfs-monotone',
    statement: 'Les sommets sortent de la file par distance non décroissante.',
    matters:
      'Une sortie hors ordre signifierait que la distance trouvée pour un sommet ' +
      "n'est pas la plus courte.",
  },
] as const;

export const bfs: AlgorithmSpec<BfsResult> = {
  id: 'bfs',
  name: 'Parcours en largeur (BFS)',
  family: 'parcours',
  summary: 'Découvre les sommets couche par couche depuis une source.',
  rationale:
    "La file garantit qu'un sommet à distance k sort avant tout sommet à distance k+1. " +
    'Chaque sommet est donc découvert par le chemin le plus court en nombre d\'arêtes, ' +
    'et chaque arête est examinée une seule fois dans chaque sens.',
  params: [
    { kind: 'node', id: 'source', label: 'Source', required: true },
    { kind: 'node', id: 'target', label: 'Cible (optionnelle)', required: false },
    {
      kind: 'boolean',
      id: 'stopAtTarget',
      label: 'Arrêter dès que la cible est atteinte',
      default: false,
    },
  ],
  invariants: INVARIANTS,

  check(graph, params): Issue[] {
    const issues = [
      ...requireNodes(graph, 1),
      ...requireNode(graph, params, 'source', 'La source'),
      ...warnNoEdges(graph),
    ];
    if (graph.flags.weighted) {
      issues.push({
        level: 'warning',
        message: 'Le graphe est pondéré, mais BFS ignore les poids.',
        fix: 'Utilise Dijkstra pour tenir compte des poids.',
      });
    }
    return issues;
  },

  run(graph: MathGraph, params: ParamValues) {
    const adj = buildAdjacency(graph);
    const source = asNodeId(params, 'source') as NodeId;
    const target = asNodeId(params, 'target');
    const stopAtTarget = asBoolean(params, 'stopAtTarget', false);

    const t = new Tracer(INVARIANTS);
    const dist = new Map<NodeId, number>();
    const parent = new Map<NodeId, NodeId | null>();
    const treeEdges: EdgeId[] = [];
    const order: NodeId[] = [];
    const queue: NodeId[] = [];

    const label = (id: NodeId) => adj.label(id);
    const view = (): StructureView[] => [
      { kind: 'sequence', name: 'File', semantics: 'queue', items: queue.map(label) },
      {
        kind: 'table',
        name: 'Distances',
        columns: ['sommet', 'dist', 'parent'],
        rows: adj.nodeIds.map((id) => [
          label(id),
          dist.has(id) ? fmtDist(dist.get(id) as number) : '∞',
          parent.get(id) ? label(parent.get(id) as NodeId) : '—',
        ]),
      },
    ];

    dist.set(source, 0);
    parent.set(source, null);
    queue.push(source);
    t.markNode(source, 'source');
    if (target) t.markNode(target, 'target');
    t.emit({
      line: 1,
      action: 'Initialisation',
      detail: `La source ${label(source)} est à distance 0 et entre dans la file.`,
      structures: view(),
    });

    let stopped = false;
    let lastOut = -1;
    while (queue.length > 0) {
      // Checked before dequeuing, on the real queue contents.
      const levels = queue.map((id) => dist.get(id) as number);
      const spread = Math.max(...levels) - Math.min(...levels);
      t.hold(
        'bfs-two-levels',
        spread <= 1,
        `niveaux présents : ${[...new Set(levels)].sort((a, b) => a - b).join(', ')}`,
      );

      if (queue.length > 1) {
        t.ask({
          prompt: 'Quel sommet sort de la file maintenant ?',
          kind: 'node',
          answer: queue[0],
          among: queue.map((id) => ({ value: id, label: label(id) })),
          because:
            `La file est premier entré, premier sorti. ${label(queue[0])} y est entré avant ` +
            'les autres, il sort donc en premier.',
        });
      }

      const u = queue.shift() as NodeId;
      const du = dist.get(u) as number;
      t.hold('bfs-monotone', du >= lastOut, `sortie précédente à ${lastOut < 0 ? '—' : lastOut}, celle-ci à ${du}`);
      lastOut = du;
      order.push(u);
      t.count('sommets défilés');
      if (t.nodeMark(u) !== 'source' && u !== target) t.markNode(u, 'current');
      t.emit({
        line: 3,
        action: `Défile ${label(u)}`,
        detail: `${label(u)} sort de la file à la distance ${dist.get(u)}. On examine ses voisins.`,
        structures: view(),
      });

      for (const arc of adj.out(u)) {
        t.count('arcs examinés');
        t.markEdge(arc.edgeId, 'inspected');
        if (dist.has(arc.to)) {
          t.emit({
            line: 5,
            action: `${label(arc.to)} déjà vu`,
            detail: `${label(arc.to)} a déjà une distance (${dist.get(arc.to)}). L'arc est ignoré.`,
            structures: view(),
          });
          if (!treeEdges.includes(arc.edgeId)) t.markEdge(arc.edgeId, 'rejected');
          continue;
        }

        dist.set(arc.to, (dist.get(u) as number) + 1);
        parent.set(arc.to, u);
        treeEdges.push(arc.edgeId);
        queue.push(arc.to);
        t.markEdge(arc.edgeId, 'tree');
        if (arc.to !== target) t.markNode(arc.to, 'frontier');
        t.count('sommets découverts');
        t.emit({
          line: 6,
          action: `Découvre ${label(arc.to)}`,
          detail:
            `${label(arc.to)} est atteint depuis ${label(u)} à la distance ` +
            `${dist.get(arc.to)}. Il entre dans la file.`,
          structures: view(),
        });

        if (stopAtTarget && target && arc.to === target) {
          stopped = true;
          break;
        }
      }

      if (t.nodeMark(u) === 'current') t.markNode(u, 'settled');
      if (stopped) {
        t.emit({
          line: 2,
          action: 'Arrêt demandé',
          detail: `La cible ${label(target as NodeId)} est atteinte, le parcours s'arrête ici.`,
          structures: view(),
        });
        break;
      }
    }

    for (const id of adj.nodeIds) {
      if (!dist.has(id)) t.markNode(id, 'excluded');
    }

    const unreached = adj.nodeIds.filter((id) => !dist.has(id));
    let pathToTarget: NodeId[] | null = null;
    if (target && dist.has(target)) {
      const path: NodeId[] = [];
      let cur: NodeId | null = target;
      while (cur) {
        path.unshift(cur);
        cur = parent.get(cur) ?? null;
      }
      pathToTarget = path;
      for (let i = 1; i < path.length; i += 1) {
        const arc = adj.out(path[i - 1]).find((a) => a.to === path[i]);
        if (arc) t.markEdge(arc.edgeId, 'path');
      }
      t.emit({
        line: 0,
        action: 'Chemin reconstruit',
        detail:
          `En remontant les parents : ${path.map(label).join(' → ')} ` +
          `(${path.length - 1} arête${path.length - 1 > 1 ? 's' : ''}).`,
        structures: view(),
      });
    }

    const conclusions: string[] = [
      `${order.length} sommet${order.length > 1 ? 's' : ''} atteint${order.length > 1 ? 's' : ''} sur ${adj.nodeIds.length}.`,
    ];
    if (unreached.length > 0) {
      conclusions.push(
        `Hors d'atteinte depuis ${label(source)} : ${unreached.map(label).join(', ')}. ` +
          'Le graphe a donc plusieurs composantes, ou des arcs mal orientés.',
      );
    }
    if (target) {
      conclusions.push(
        pathToTarget
          ? `Distance ${label(source)} → ${label(target)} : ${dist.get(target)} arête(s).`
          : `Aucun chemin de ${label(source)} vers ${label(target)}.`,
      );
    }
    if (!stopped && order.length === adj.nodeIds.length && adj.nodeIds.length > 0) {
      conclusions.push('Tous les sommets sont atteignables depuis la source.');
    }

    return t.build<BfsResult>({
      algorithmId: 'bfs',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O(V + E)',
        space: 'O(V)',
        note: 'Chaque sommet entre une fois dans la file, chaque arc est lu une fois.',
      },
      conclusions,
      result: {
        order,
        dist: Object.fromEntries(dist),
        parent: Object.fromEntries(parent),
        treeEdges,
        reached: order.length,
        unreached,
        pathToTarget,
      },
    });
  },
};
