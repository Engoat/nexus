/**
 * Topological sort, Kahn's algorithm.
 *
 * Also doubles as a cycle test: if fewer than V nodes come out, the nodes left
 * behind each still have an incoming arc, which can only happen inside a cycle.
 */

import { buildAdjacency } from '../../core/adjacency';
import type { MathGraph, NodeId } from '../../core/graph';
import { type InvariantSpec, type StructureView, Tracer } from '../../core/trace';
import { type AlgorithmSpec, type Issue, type ParamValues, requireNodes, warnNoEdges } from '../types';

export interface TopoResult {
  readonly order: NodeId[];
  readonly isComplete: boolean;
  readonly blocked: NodeId[];
  /** Longest chain of dependencies, in number of nodes. */
  readonly levels: Record<NodeId, number>;
}

const PSEUDO = [
  'calculer deg⁻(v) pour chaque sommet',
  'S ← sommets de degré entrant nul',
  'tant que S non vide :',
  '    u ← retirer un sommet de S ; ajouter u à l\'ordre',
  '    pour chaque arc u → v :',
  '        deg⁻(v) ← deg⁻(v) − 1',
  '        si deg⁻(v) = 0 : ajouter v à S',
  'si |ordre| < V : le graphe contient un cycle',
] as const;

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'topo-prefix',
    statement: 'Tout sommet déjà sorti a tous ses prédécesseurs sortis avant lui.',
    matters:
      "C'est la définition même d'un ordre topologique. Si elle tombe en cours de route, " +
      "l'ordre produit est inutilisable comme planning.",
  },
] as const;

export const topologicalSort: AlgorithmSpec<TopoResult> = {
  id: 'topological-sort',
  name: 'Tri topologique (Kahn)',
  family: 'ordre',
  summary: 'Ordonne les sommets pour que chaque arc aille de gauche à droite.',
  rationale:
    "Un sommet sans arc entrant ne dépend de rien : il peut partir en premier. " +
    'Le retirer diminue le degré entrant de ses successeurs, ce qui en libère de nouveaux. ' +
    "Si le procédé se bloque avant d'avoir sorti tous les sommets, les sommets restants " +
    'ont tous un prédécesseur restant, donc forment un cycle.',
  params: [],
  invariants: INVARIANTS,

  check(graph): Issue[] {
    const issues: Issue[] = [...requireNodes(graph, 2), ...warnNoEdges(graph)];
    if (!graph.flags.directed) {
      issues.push({
        level: 'error',
        message: "Le tri topologique n'a de sens que sur un graphe orienté.",
        fix: 'Passe le graphe en orienté.',
      });
    }
    const loops = graph.edges.filter((e) => e.from === e.to);
    if (loops.length > 0) {
      issues.push({
        level: 'warning',
        message: `${loops.length} boucle(s) : un sommet qui dépend de lui-même bloque le tri.`,
      });
    }
    return issues;
  },

  run(graph: MathGraph, _params: ParamValues) {
    const adj = buildAdjacency(graph);
    const t = new Tracer(INVARIANTS);

    const indegree = new Map<NodeId, number>();
    for (const id of adj.nodeIds) indegree.set(id, 0);
    for (const e of graph.edges) indegree.set(e.to, (indegree.get(e.to) ?? 0) + 1);

    const levels = new Map<NodeId, number>();
    const order: NodeId[] = [];
    // Deterministic: ready nodes are consumed in label order.
    let ready = adj.nodeIds.filter((id) => (indegree.get(id) ?? 0) === 0);

    const label = (id: NodeId) => adj.label(id);
    const view = (): StructureView[] => [
      { kind: 'set', name: 'Prêts (deg⁻ = 0)', items: ready.map(label) },
      { kind: 'sequence', name: 'Ordre', semantics: 'list', items: order.map(label) },
      {
        kind: 'table',
        name: 'Degrés entrants',
        columns: ['sommet', 'deg⁻', 'niveau'],
        rows: adj.nodeIds.map((id) => [label(id), indegree.get(id) ?? 0, levels.get(id) ?? '—']),
      },
    ];

    for (const id of ready) {
      levels.set(id, 0);
      t.markNode(id, 'frontier');
    }
    t.emit({
      line: 2,
      action: 'Degrés entrants',
      detail:
        ready.length > 0
          ? `Sommets sans dépendance : ${ready.map(label).join(', ')}.`
          : 'Aucun sommet de degré entrant nul : le graphe est entièrement cyclique.',
      structures: view(),
    });

    while (ready.length > 0) {
      if (ready.length > 1) {
        t.ask({
          prompt: 'Quel sommet peut sortir maintenant ?',
          kind: 'node',
          answer: ready[0],
          among: ready.map((id) => ({ value: id, label: label(id) })),
          because:
            `${ready.length} sommets ont un degré entrant nul. ` +
            "Tous sont valides ; cette implémentation prend le premier dans l'ordre des libellés, " +
            `donc ${label(ready[0])}.`,
        });
      }

      const u = ready[0];
      ready = ready.slice(1);
      order.push(u);

      const placed = new Set(order);
      const respected = order.every((id) =>
        graph.edges.filter((e) => e.to === id).every((e) => placed.has(e.from)),
      );
      t.hold(
        'topo-prefix',
        respected,
        `${order.length} sommet(s) placé(s) : ${order.map(label).join(' → ')}`,
      );
      t.count('sommets sortis');
      t.markNode(u, 'settled');
      t.emit({
        line: 4,
        action: `Sort ${label(u)}`,
        detail:
          `${label(u)} n'a plus aucune dépendance en attente, il prend la position ` +
          `${order.length} dans l'ordre.`,
        structures: view(),
      });

      for (const arc of adj.out(u)) {
        t.count('arcs retirés');
        const next = (indegree.get(arc.to) ?? 0) - 1;
        indegree.set(arc.to, next);
        levels.set(arc.to, Math.max(levels.get(arc.to) ?? 0, (levels.get(u) ?? 0) + 1));
        t.markEdge(arc.edgeId, 'tree');

        if (next === 0) {
          ready = [...ready, arc.to].sort((a, b) =>
            adj.label(a).localeCompare(adj.label(b), 'fr', { numeric: true }),
          );
          t.markNode(arc.to, 'frontier');
          t.emit({
            line: 7,
            action: `Libère ${label(arc.to)}`,
            detail: `Dernière dépendance de ${label(arc.to)} levée : il devient prêt.`,
            structures: view(),
          });
        } else {
          t.emit({
            line: 6,
            action: `${label(arc.to)} attend`,
            detail: `${label(arc.to)} attend encore ${next} prédécesseur(s).`,
            structures: view(),
          });
        }
      }
    }

    const blocked = adj.nodeIds.filter((id) => !order.includes(id));
    for (const id of blocked) t.markNode(id, 'excluded');
    const isComplete = blocked.length === 0;

    if (!isComplete) {
      t.emit({
        line: 8,
        action: 'Blocage',
        detail:
          `${blocked.length} sommet(s) n'ont jamais atteint un degré entrant nul : ` +
          `${blocked.map(label).join(', ')}. Ils forment au moins un cycle, ` +
          'aucun ordre topologique n\'existe.',
        structures: view(),
      });
    }

    const depth = order.length > 0 ? Math.max(...order.map((id) => levels.get(id) ?? 0)) : 0;
    const conclusions: string[] = isComplete
      ? [
          `Ordre topologique : ${order.map(label).join(' → ')}.`,
          `Chaîne de dépendances la plus longue : ${depth + 1} sommet(s). ` +
            'Cette valeur donne le nombre minimal d\'étapes si les tâches indépendantes ' +
            'peuvent avancer en parallèle.',
        ]
      : [
          `Aucun ordre topologique : ${blocked.length} sommet(s) pris dans un cycle ` +
            `(${blocked.map(label).join(', ')}).`,
          `${order.length} sommet(s) ont tout de même pu être ordonnés avant le blocage.`,
        ];

    return t.build<TopoResult>({
      algorithmId: 'topological-sort',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O(V + E)',
        space: 'O(V)',
        note: "Chaque arc est retiré une seule fois.",
      },
      conclusions,
      result: { order, isComplete, blocked, levels: Object.fromEntries(levels) },
    });
  },
};
