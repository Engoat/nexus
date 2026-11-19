/**
 * Maximum flow, Edmonds-Karp (Ford-Fulkerson with a BFS choice of augmenting
 * path). Picking the shortest augmenting path each time bounds the number of
 * augmentations by O(V·E), independently of the capacity values.
 *
 * The run ends by reading the minimum cut off the final residual graph, which is
 * the part that makes the result checkable by eye: cut capacity must equal flow.
 */

import type { EdgeId, MathGraph, NodeId } from '../../core/graph';
import { type InvariantSpec, type StructureView, Tracer } from '../../core/trace';
import {
  type AlgorithmSpec,
  asNodeId,
  type Issue,
  type ParamValues,
  requireNode,
  requireNodes,
} from '../types';

export interface EdmondsKarpResult {
  readonly maxFlow: number;
  readonly flowPerEdge: Record<EdgeId, number>;
  readonly augmentations: { path: string[]; bottleneck: number }[];
  readonly minCut: { sourceSide: NodeId[]; sinkSide: NodeId[]; edges: EdgeId[]; capacity: number };
}

const PSEUDO = [
  'flot ← 0 ; résiduel ← capacités',
  'tant qu\'il existe un chemin s → t dans le résiduel :',
  '    chercher ce chemin par parcours en largeur',
  '    b ← min des capacités résiduelles du chemin',
  '    pour chaque arc du chemin : résiduel[arc] −= b ; résiduel[inverse] += b',
  '    flot ← flot + b',
  'la coupe minimale sépare les sommets encore atteignables des autres',
] as const;

interface ResidualArc {
  readonly to: NodeId;
  readonly edgeId: EdgeId;
  /** Index of the paired arc in the same array. */
  readonly twin: number;
  /** True when this arc is the artificial back arc of a directed edge. */
  readonly synthetic: boolean;
  capacity: number;
}

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'ek-capacity',
    statement: 'Aucun arc ne transporte plus que sa capacité, et aucune capacité résiduelle ' +
      "n'est négative.",
    matters:
      "Un flot qui dépasse une capacité n'est pas un flot. C'est la contrainte physique " +
      'du problème.',
  },
  {
    id: 'ek-conservation',
    statement:
      'Sur chaque sommet autre que la source et le puits, il entre autant qu\'il en sort.',
    matters:
      'Sans conservation, le nombre annoncé ne mesure plus rien : du flot apparaîtrait ' +
      'ou disparaîtrait au milieu du réseau.',
  },
] as const;

export const edmondsKarp: AlgorithmSpec<EdmondsKarpResult> = {
  id: 'edmonds-karp',
  name: 'Flot maximal (Edmonds-Karp)',
  family: 'flot',
  summary: 'Flot maximal entre une source et un puits, et coupe minimale.',
  rationale:
    "Tant qu'un chemin de capacité résiduelle positive relie la source au puits, le flot " +
    "n'est pas maximal : on peut y pousser le minimum des capacités du chemin. " +
    'Quand plus aucun chemin ne subsiste, les sommets encore atteignables depuis la source ' +
    'forment une coupe dont la capacité égale le flot. Ce sont les deux faces du même théorème.',
  params: [
    { kind: 'node', id: 'source', label: 'Source', required: true },
    { kind: 'node', id: 'sink', label: 'Puits', required: true },
  ],
  invariants: INVARIANTS,

  check(graph, params): Issue[] {
    const issues = [
      ...requireNodes(graph, 2),
      ...requireNode(graph, params, 'source', 'La source'),
      ...requireNode(graph, params, 'sink', 'Le puits'),
    ];
    const s = asNodeId(params, 'source');
    const k = asNodeId(params, 'sink');
    if (s && k && s === k) {
      issues.push({
        level: 'error',
        message: 'La source et le puits sont le même sommet.',
        fix: 'Choisis deux sommets distincts.',
      });
    }
    const missing = graph.edges.filter((e) => e.capacity === undefined || e.capacity === null);
    if (missing.length > 0) {
      issues.push({
        level: 'error',
        message: `${missing.length} arête(s) sans capacité.`,
        fix: 'Renseigne une capacité sur chaque arête, ou passe le graphe en mode flot.',
      });
    }
    const negative = graph.edges.filter((e) => (e.capacity ?? 0) < 0);
    if (negative.length > 0) {
      issues.push({
        level: 'error',
        message: 'Une capacité négative n\'a pas de sens physique.',
        fix: 'Mets des capacités positives ou nulles.',
      });
    }
    if (!graph.flags.directed) {
      issues.push({
        level: 'warning',
        message:
          'Graphe non orienté : chaque arête est modélisée par deux arcs opposés ' +
          'de même capacité.',
      });
    }
    return issues;
  },

  run(graph: MathGraph, params: ParamValues) {
    const source = asNodeId(params, 'source') as NodeId;
    const sink = asNodeId(params, 'sink') as NodeId;
    const t = new Tracer(INVARIANTS);

    const labels = new Map<NodeId, string>();
    for (const n of graph.nodes) labels.set(n.id, n.label);
    const label = (id: NodeId) => labels.get(id) ?? id;

    const nodeIds = [...graph.nodes]
      .sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true }))
      .map((n) => n.id);

    /* ---------- residual network ---------- */
    const arcs: ResidualArc[] = [];
    const adjacency = new Map<NodeId, number[]>();
    for (const id of nodeIds) adjacency.set(id, []);

    /** Original capacity per arc index, to compute flow afterwards. */
    const initialCapacity: number[] = [];

    const link = (from: NodeId, to: NodeId, cap: number, edgeId: EdgeId, backCap: number) => {
      const i = arcs.length;
      arcs.push({ to, edgeId, twin: i + 1, synthetic: false, capacity: cap });
      arcs.push({ to: from, edgeId, twin: i, synthetic: backCap === 0, capacity: backCap });
      initialCapacity[i] = cap;
      initialCapacity[i + 1] = backCap;
      adjacency.get(from)?.push(i);
      adjacency.get(to)?.push(i + 1);
    };

    for (const e of graph.edges) {
      const cap = e.capacity ?? 0;
      // Undirected: both directions carry the same capacity.
      link(e.from, e.to, cap, e.id, graph.flags.directed ? 0 : cap);
    }

    t.markNode(source, 'source');
    t.markNode(sink, 'target');

    const residualView = (): StructureView => ({
      kind: 'table',
      name: 'Capacités résiduelles',
      columns: ['arc', 'résiduel', 'capacité'],
      rows: arcs
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !a.synthetic || a.capacity > 0)
        .map(({ a, i }) => {
          const twin = arcs[a.twin];
          return [
            `${label(twin.to)} → ${label(a.to)}`,
            a.capacity,
            initialCapacity[i] + (a.synthetic ? 0 : 0),
          ];
        }),
    });

    t.emit({
      line: 1,
      action: 'Réseau résiduel',
      detail:
        `Flot nul au départ. ${graph.edges.length} arête(s) deviennent ${arcs.length} arc(s) ` +
        'résiduels, chaque arc ayant son arc inverse.',
      structures: [residualView()],
    });

    /* ---------- augmenting loop ---------- */
    const augmentations: { path: string[]; bottleneck: number }[] = [];
    let maxFlow = 0;
    let round = 0;

    for (;;) {
      round += 1;
      // BFS over arcs with positive residual capacity.
      const cameFrom = new Map<NodeId, number>();
      const seen = new Set<NodeId>([source]);
      const queue: NodeId[] = [source];
      let reached = false;

      while (queue.length > 0 && !reached) {
        const u = queue.shift() as NodeId;
        for (const idx of adjacency.get(u) ?? []) {
          const arc = arcs[idx];
          if (arc.capacity <= 0 || seen.has(arc.to)) continue;
          seen.add(arc.to);
          cameFrom.set(arc.to, idx);
          queue.push(arc.to);
          if (arc.to === sink) {
            reached = true;
            break;
          }
        }
      }
      t.count('recherches de chemin');

      if (!reached) {
        t.emit({
          line: 2,
          action: `Recherche ${round} : aucun chemin`,
          detail:
            `Plus aucun chemin de ${label(source)} vers ${label(sink)} dans le réseau résiduel. ` +
            `Le flot ${maxFlow} est maximal.`,
          structures: [residualView()],
        });
        break;
      }

      // Walk the path back to find its bottleneck.
      const pathArcs: number[] = [];
      let cursor: NodeId = sink;
      while (cursor !== source) {
        const idx = cameFrom.get(cursor) as number;
        pathArcs.push(idx);
        cursor = arcs[arcs[idx].twin].to;
      }
      pathArcs.reverse();

      const bottleneck = Math.min(...pathArcs.map((i) => arcs[i].capacity));
      const pathNodes: NodeId[] = [source];
      for (const i of pathArcs) pathNodes.push(arcs[i].to);
      const pathLabels = pathNodes.map(label);

      for (const i of pathArcs) t.markEdge(arcs[i].edgeId, 'path');
      const residuals = [...new Set(pathArcs.map((i) => arcs[i].capacity))].sort((a, b) => a - b);
      if (residuals.length > 1) {
        t.ask({
          prompt: 'Quel est le goulot de ce chemin ?',
          kind: 'choice',
          answer: String(bottleneck),
          among: residuals.map((v) => ({ value: String(v), label: String(v) })),
          because:
            'On ne peut pousser que le minimum des capacités résiduelles du chemin, ' +
            `ici ${bottleneck}.`,
        });
      }
      t.emit({
        line: 3,
        action: `Chemin ${round}`,
        detail:
          `Chemin le plus court trouvé : ${pathLabels.join(' → ')}. ` +
          `Goulot d'étranglement : ${bottleneck}.`,
        structures: [residualView()],
      });

      for (const i of pathArcs) {
        arcs[i].capacity -= bottleneck;
        arcs[arcs[i].twin].capacity += bottleneck;
        if (arcs[i].capacity === 0) t.markEdge(arcs[i].edgeId, 'saturated');
      }
      maxFlow += bottleneck;
      augmentations.push({ path: pathLabels, bottleneck });
      t.count('augmentations');

      const negative = arcs.filter((a) => a.capacity < 0).length;
      const overflow = arcs.filter((a, i) => initialCapacity[i] - a.capacity > initialCapacity[i]).length;
      t.hold(
        'ek-capacity',
        negative === 0 && overflow === 0,
        negative === 0
          ? 'toutes les capacités résiduelles restent positives'
          : `${negative} arc(s) négatif(s)`,
      );

      // Net flow per edge pair, then balance at every intermediate node.
      const balance = new Map<NodeId, number>();
      for (let i = 0; i < arcs.length; i += 2) {
        const net = initialCapacity[i] - arcs[i].capacity;
        const tail = arcs[arcs[i].twin].to;
        const head = arcs[i].to;
        balance.set(tail, (balance.get(tail) ?? 0) + net);
        balance.set(head, (balance.get(head) ?? 0) - net);
      }
      const offenders = nodeIds.filter(
        (id) => id !== source && id !== sink && Math.abs(balance.get(id) ?? 0) > 1e-9,
      );
      t.hold(
        'ek-conservation',
        offenders.length === 0,
        offenders.length === 0
          ? `conservation vérifiée sur ${nodeIds.length - 2} sommet(s) intermédiaire(s)`
          : `déséquilibre en ${offenders.map(label).join(', ')}`,
      );

      t.emit({
        line: 6,
        action: `Flot = ${maxFlow}`,
        detail:
          `${bottleneck} unité(s) poussée(s) le long du chemin. ` +
          `Les arcs saturés disparaissent du résiduel, leurs inverses gagnent ${bottleneck}.`,
        structures: [residualView()],
      });

      if (round > arcs.length * nodeIds.length + 10) {
        // Defensive: Edmonds-Karp terminates, so reaching this means a bug.
        throw new Error('edmondsKarp: trop d\'itérations, invariant rompu');
      }
    }

    /* ---------- flow per original edge ---------- */
    const flowPerEdge: Record<EdgeId, number> = {};
    for (let i = 0; i < arcs.length; i += 2) {
      const forward = arcs[i];
      const sent = initialCapacity[i] - forward.capacity;
      const edgeId = forward.edgeId;
      flowPerEdge[edgeId] = (flowPerEdge[edgeId] ?? 0) + Math.max(0, sent);
    }

    /* ---------- minimum cut from the final residual ---------- */
    const sSide = new Set<NodeId>([source]);
    const stack: NodeId[] = [source];
    while (stack.length > 0) {
      const u = stack.pop() as NodeId;
      for (const idx of adjacency.get(u) ?? []) {
        const arc = arcs[idx];
        if (arc.capacity > 0 && !sSide.has(arc.to)) {
          sSide.add(arc.to);
          stack.push(arc.to);
        }
      }
    }
    const sinkSide = nodeIds.filter((id) => !sSide.has(id));
    const cutEdges: EdgeId[] = [];
    let cutCapacity = 0;
    for (const e of graph.edges) {
      const crosses = sSide.has(e.from) && !sSide.has(e.to);
      const crossesBack = !graph.flags.directed && sSide.has(e.to) && !sSide.has(e.from);
      if (crosses || crossesBack) {
        cutEdges.push(e.id);
        cutCapacity += e.capacity ?? 0;
      }
    }
    for (const id of sinkSide) if (id !== sink) t.markNode(id, 'excluded');
    for (const id of cutEdges) t.markEdge(id, 'saturated');

    t.emit({
      line: 7,
      action: 'Coupe minimale',
      detail:
        `Côté source : ${[...sSide].map(label).join(', ')}. ` +
        `Côté puits : ${sinkSide.map(label).join(', ') || '—'}. ` +
        `Capacité de la coupe : ${cutCapacity}.`,
      structures: [residualView()],
    });

    const conclusions: string[] = [
      `Flot maximal : ${maxFlow}, atteint en ${augmentations.length} augmentation(s).`,
      `Coupe minimale de capacité ${cutCapacity}` +
        (cutCapacity === maxFlow
          ? ' : égale au flot, comme le veut le théorème flot-max / coupe-min.'
          : ` : différente du flot (${maxFlow}), ce qui signalerait une erreur.`),
    ];
    if (augmentations.length > 0) {
      conclusions.push(
        'Chemins utilisés : ' +
          augmentations.map((a) => `${a.path.join('→')} (+${a.bottleneck})`).join(', ') +
          '.',
      );
    }

    return t.build<EdmondsKarpResult>({
      algorithmId: 'edmonds-karp',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O(V · E²)',
        space: 'O(V + E)',
        note:
          'Le choix du plus court chemin augmentant borne le nombre d\'augmentations par O(V·E), ' +
          'sans dépendre des valeurs de capacité.',
      },
      conclusions,
      result: {
        maxFlow,
        flowPerEdge,
        augmentations,
        minCut: {
          sourceSide: [...sSide],
          sinkSide,
          edges: cutEdges,
          capacity: cutCapacity,
        },
      },
    });
  },
};
