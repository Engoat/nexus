/**
 * Bellman-Ford.
 *
 * Accepts negative arcs and reports a negative cycle instead of looping. On an
 * undirected graph a single negative edge is already a negative cycle (walk it
 * back and forth), so that case is rejected up front.
 */

import { buildAdjacency } from '../../core/adjacency';
import type { EdgeId, MathGraph, NodeId } from '../../core/graph';
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

export interface BellmanFordResult {
  readonly dist: Record<NodeId, number>;
  readonly prev: Record<NodeId, NodeId | null>;
  readonly passes: number;
  readonly negativeCycle: NodeId[] | null;
  readonly unreachable: NodeId[];
  readonly pathToTarget: { nodes: NodeId[]; cost: number } | null;
}

const PSEUDO = [
  'dist[s] ← 0 ; dist[v] ← ∞ pour v ≠ s',
  'répéter V − 1 fois :',
  '    pour chaque arc (u → v) de poids w :',
  '        si dist[u] + w < dist[v] :',
  '            dist[v] ← dist[u] + w ; prev[v] ← u',
  'pour chaque arc (u → v) de poids w :',
  '    si dist[u] + w < dist[v] : cycle de poids négatif',
] as const;

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'bf-prev-forest',
    statement:
      'Les prédécesseurs forment une forêt enracinée en la source : remonter prev depuis ' +
      "n'importe quel sommet atteint ramène à la source sans boucler.",
    matters:
      "C'est la frontière entre un résultat exploitable et un problème sans solution : " +
      "une boucle dans prev est la signature d'un cycle de poids négatif, et cet invariant " +
      'doit alors être violé.',
  },
] as const;

export const bellmanFord: AlgorithmSpec<BellmanFordResult> = {
  id: 'bellman-ford',
  name: 'Bellman-Ford',
  family: 'plus courts chemins',
  summary: 'Plus courts chemins avec poids négatifs, et détection de cycle négatif.',
  rationale:
    "Après k passes, toute distance atteignable par un chemin de k arcs au plus est correcte. " +
    'Un plus court chemin sans cycle compte au plus V − 1 arcs, donc V − 1 passes suffisent. ' +
    "Si une V-ième passe améliore encore quelque chose, c'est qu'un cycle de poids négatif " +
    'est atteignable depuis la source.',
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
    const negative = graph.edges.filter((e) => (e.weight ?? 1) < 0);
    if (!graph.flags.directed && graph.flags.weighted && negative.length > 0) {
      issues.push({
        level: 'error',
        message:
          'Arête non orientée de poids négatif : elle forme déjà un cycle négatif ' +
          '(aller-retour). Le problème n\'a pas de solution.',
        fix: 'Oriente le graphe ou remets des poids positifs.',
      });
    }
    if (graph.flags.weighted && negative.length === 0) {
      issues.push({
        level: 'warning',
        message: 'Tous les poids sont positifs.',
        fix: 'Dijkstra est plus rapide ici : O((V+E) log V) contre O(V·E).',
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
    const viaEdge = new Map<NodeId, EdgeId>();

    for (const id of adj.nodeIds) {
      dist.set(id, Number.POSITIVE_INFINITY);
      prev.set(id, null);
    }
    dist.set(source, 0);

    // Every arc, in a fixed order, so passes are reproducible.
    const arcs = adj.nodeIds.flatMap((id) => adj.out(id));

    const label = (id: NodeId) => adj.label(id);
    const view = (pass: number): StructureView[] => [
      {
        kind: 'table',
        name: `Distances (passe ${pass})`,
        columns: ['sommet', 'dist', 'prev'],
        rows: adj.nodeIds.map((id) => [
          label(id),
          fmtDist(dist.get(id) as number),
          prev.get(id) ? label(prev.get(id) as NodeId) : '—',
        ]),
      },
    ];

    t.markNode(source, 'source');
    if (target) t.markNode(target, 'target');
    t.emit({
      line: 1,
      action: 'Initialisation',
      detail: `dist(${label(source)}) = 0, le reste à l'infini. ${arcs.length} arc(s) à relâcher par passe.`,
      structures: view(0),
    });

    const maxPasses = Math.max(0, adj.nodeIds.length - 1);
    let passes = 0;

    for (let pass = 1; pass <= maxPasses; pass += 1) {
      let changed = false;
      passes = pass;

      for (const arc of arcs) {
        const du = dist.get(arc.from) as number;
        if (!Number.isFinite(du)) continue; // nothing to propagate yet
        t.count('arcs relâchés');
        const dv = dist.get(arc.to) as number;
        const candidate = du + arc.weight;
        if (candidate < dv) {
          dist.set(arc.to, candidate);
          prev.set(arc.to, arc.from);
          viaEdge.set(arc.to, arc.edgeId);
          changed = true;
          t.count('améliorations');
          t.markEdge(arc.edgeId, 'inspected');
          t.markNode(arc.to, arc.to === target ? 'target' : 'frontier');
          t.emit({
            line: 5,
            action: `Passe ${pass} : ${label(arc.to)}`,
            detail:
              `${label(arc.from)} → ${label(arc.to)} : ${fmtDist(du)} + ${arc.weight} = ${candidate}, ` +
              `mieux que ${fmtDist(dv)}.`,
            structures: view(pass),
          });
        }
      }

      // Walking prev from every reached node must land on the source.
      const forest = (() => {
        for (const id of adj.nodeIds) {
          if (!Number.isFinite(dist.get(id) as number)) continue;
          const seen = new Set<NodeId>();
          let cur: NodeId | null = id;
          while (cur !== null) {
            if (seen.has(cur)) return { ok: false, at: id };
            seen.add(cur);
            cur = prev.get(cur) ?? null;
          }
          if (!seen.has(source)) return { ok: false, at: id };
        }
        return { ok: true, at: null as NodeId | null };
      })();
      t.hold(
        'bf-prev-forest',
        forest.ok,
        forest.ok
          ? 'tous les chemins de prédécesseurs remontent à la source'
          : `boucle détectée en remontant depuis ${label(forest.at as NodeId)}`,
      );

      // Computable right now, without looking ahead: does any arc still relax?
      const willImprove = arcs.some((arc) => {
        const du = dist.get(arc.from) as number;
        return Number.isFinite(du) && du + arc.weight < (dist.get(arc.to) as number);
      });
      t.ask({
        prompt: `La passe ${pass + 1} va-t-elle encore améliorer une distance ?`,
        kind: 'choice',
        answer: willImprove ? 'oui' : 'non',
        among: [
          { value: 'oui', label: 'Oui, au moins une' },
          { value: 'non', label: 'Non, tout est stable' },
        ],
        because: willImprove
          ? 'Au moins un arc vérifie encore dist[u] + w < dist[v] : la passe suivante changera quelque chose.'
          : 'Aucun arc ne vérifie plus dist[u] + w < dist[v] : le point fixe est atteint.',
      });

      if (!changed) {
        t.emit({
          line: 2,
          action: `Passe ${pass} stable`,
          detail:
            `Aucune distance n'a bougé pendant cette passe. Les ${maxPasses - pass} passe(s) ` +
            'restantes ne changeraient rien, on arrête.',
          structures: view(pass),
        });
        break;
      }
      t.emit({
        line: 2,
        action: `Fin de passe ${pass}`,
        detail: `Passe ${pass} terminée sur ${maxPasses}.`,
        structures: view(pass),
      });
    }

    // Negative cycle detection
    let negativeCycle: NodeId[] | null = null;
    for (const arc of arcs) {
      const du = dist.get(arc.from) as number;
      if (!Number.isFinite(du)) continue;
      if (du + arc.weight < (dist.get(arc.to) as number)) {
        // Walk the predecessors V times to land inside the cycle, then unroll it.
        let cursor: NodeId = arc.to;
        for (let i = 0; i < adj.nodeIds.length; i += 1) {
          cursor = (prev.get(cursor) ?? cursor) as NodeId;
        }
        const cycle: NodeId[] = [];
        let walk: NodeId = cursor;
        do {
          cycle.push(walk);
          t.markNode(walk, 'excluded');
          const e = viaEdge.get(walk);
          if (e) t.markEdge(e, 'rejected');
          walk = (prev.get(walk) ?? walk) as NodeId;
        } while (walk !== cursor && cycle.length <= adj.nodeIds.length);
        cycle.reverse();
        negativeCycle = cycle;
        t.emit({
          line: 7,
          action: 'Cycle négatif',
          detail:
            `L'arc ${label(arc.from)} → ${label(arc.to)} améliore encore après ${maxPasses} passes. ` +
            `Un cycle de poids négatif existe : ${cycle.map(label).join(' → ')}. ` +
            'Les distances concernées ne sont pas définies.',
          structures: view(passes),
        });
        break;
      }
    }

    const unreachable = adj.nodeIds.filter((id) => !Number.isFinite(dist.get(id) as number));
    let pathToTarget: BellmanFordResult['pathToTarget'] = null;
    if (!negativeCycle && target && Number.isFinite(dist.get(target) as number)) {
      const nodes: NodeId[] = [];
      let cur: NodeId | null = target;
      const guard = new Set<NodeId>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
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
        detail: `${nodes.map(label).join(' → ')} pour un coût de ${pathToTarget.cost}.`,
        structures: view(passes),
      });
    }

    const conclusions: string[] = [];
    if (negativeCycle) {
      conclusions.push(
        `Cycle de poids négatif détecté : ${negativeCycle.map(label).join(' → ')}. ` +
          'Aucun plus court chemin ne peut être défini vers les sommets concernés.',
      );
    } else {
      conclusions.push(
        `Distances stabilisées après ${passes} passe(s) sur ${maxPasses} autorisée(s).`,
      );
      if (passes < maxPasses) {
        conclusions.push("L'arrêt anticipé est licite : une passe sans changement est un point fixe.");
      }
      if (target) {
        conclusions.push(
          pathToTarget
            ? `Coût minimal ${label(source)} → ${label(target)} : ${pathToTarget.cost}.`
            : `Aucun chemin de ${label(source)} vers ${label(target)}.`,
        );
      }
    }
    if (unreachable.length > 0) {
      conclusions.push(`Inatteignables : ${unreachable.map(label).join(', ')}.`);
    }

    return t.build<BellmanFordResult>({
      algorithmId: 'bellman-ford',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O(V · E)',
        space: 'O(V)',
        note: "V − 1 passes sur les E arcs, plus une passe de vérification.",
      },
      conclusions,
      result: {
        dist: Object.fromEntries(dist),
        prev: Object.fromEntries(prev),
        passes,
        negativeCycle,
        unreachable,
        pathToTarget,
      },
    });
  },
};
