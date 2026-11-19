/**
 * Kruskal's minimum spanning tree / forest.
 *
 * Sorts edges by weight and keeps one when it joins two different components.
 * The union-find structure answers that question, and showing its components
 * is what makes the accept/reject decision readable.
 */

import { buildAdjacency } from '../../core/adjacency';
import type { EdgeId, MathGraph, NodeId } from '../../core/graph';
import { DisjointSet } from '../../core/structures/dsu';
import { type InvariantSpec, type StructureView, Tracer } from '../../core/trace';
import { type AlgorithmSpec, type Issue, type ParamValues, requireNodes, warnNoEdges } from '../types';

export interface KruskalResult {
  readonly treeEdges: EdgeId[];
  readonly rejectedEdges: EdgeId[];
  readonly totalWeight: number;
  readonly componentCount: number;
  readonly isSpanningTree: boolean;
}

const PSEUDO = [
  'trier les arêtes par poids croissant',
  'F ← ∅ ; chaque sommet est sa propre composante',
  'pour chaque arête (u, v) de poids w, dans cet ordre :',
  '    si trouver(u) ≠ trouver(v) :',
  '        F ← F ∪ {(u, v)} ; union(u, v)',
  '    sinon : rejeter (u, v) — elle fermerait un cycle',
] as const;

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'kr-acyclic',
    statement: 'Les arêtes retenues ne forment jamais de cycle.',
    matters:
      "Un arbre couvrant est par définition sans cycle. L'union-find existe uniquement " +
      'pour garantir cette propriété à chaque décision.',
  },
  {
    id: 'kr-count',
    statement:
      "Le nombre d'arêtes retenues vaut toujours le nombre de sommets moins le nombre " +
      'de composantes.',
    matters:
      'Cette égalité caractérise une forêt. Elle vaut à chaque étape, pas seulement à la fin, ' +
      "et c'est elle qui garantit V − 1 arêtes sur un graphe connexe.",
  },
] as const;

export const kruskal: AlgorithmSpec<KruskalResult> = {
  id: 'kruskal',
  name: 'Kruskal',
  family: 'arbre couvrant',
  summary: 'Arbre couvrant de poids minimal, par arêtes triées.',
  rationale:
    "À chaque étape, l'arête la plus légère qui relie deux composantes distinctes appartient " +
    'à un arbre couvrant minimal : si on ne la prenait pas, il faudrait relier ces deux ' +
    "composantes par une arête au moins aussi lourde, ce qui ne peut pas donner mieux. " +
    'Rejeter une arête interne à une composante est sans perte, elle ne ferait qu\'un cycle.',
  params: [],
  invariants: INVARIANTS,

  check(graph): Issue[] {
    const issues: Issue[] = [...requireNodes(graph, 2), ...warnNoEdges(graph)];
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
        message: 'Graphe non pondéré : toutes les arêtes valent 1, tout arbre couvrant est minimal.',
      });
    }
    return issues;
  },

  run(graph: MathGraph, _params: ParamValues) {
    const adj = buildAdjacency(graph);
    const t = new Tracer(INVARIANTS);
    const dsu = new DisjointSet<NodeId>(adj.nodeIds);

    const weight = (e: { weight?: number }) => (graph.flags.weighted ? (e.weight ?? 1) : 1);
    const sorted = [...graph.edges].sort((a, b) => {
      const d = weight(a) - weight(b);
      return d !== 0 ? d : a.id.localeCompare(b.id);
    });

    const treeEdges: EdgeId[] = [];
    const rejectedEdges: EdgeId[] = [];
    let totalWeight = 0;

    const label = (id: NodeId) => adj.label(id);
    const view = (): StructureView[] => [
      {
        kind: 'set',
        name: 'Composantes',
        items: dsu
          .groups()
          .map((g) => `{${g.map(label).sort((a, b) => a.localeCompare(b, 'fr')).join(', ')}}`)
          .sort((a, b) => a.localeCompare(b, 'fr')),
      },
      {
        kind: 'table',
        name: 'Arêtes triées',
        columns: ['arête', 'poids', 'décision'],
        rows: sorted.map((e) => [
          `${label(e.from)} — ${label(e.to)}`,
          weight(e),
          treeEdges.includes(e.id) ? 'retenue' : rejectedEdges.includes(e.id) ? 'rejetée' : '—',
        ]),
      },
    ];

    t.emit({
      line: 1,
      action: 'Tri des arêtes',
      detail:
        `${sorted.length} arête(s) triée(s) par poids croissant. ` +
        `Chaque sommet forme sa propre composante (${dsu.componentCount}).`,
      structures: view(),
    });

    for (const e of sorted) {
      const w = weight(e);
      t.count('arêtes examinées');
      t.markEdge(e.id, 'inspected');

      const accepts = !dsu.connected(e.from, e.to);
      t.ask({
        prompt: `L'arête ${label(e.from)} — ${label(e.to)} (poids ${w}) sera-t-elle retenue ?`,
        kind: 'choice',
        answer: accepts ? 'oui' : 'non',
        among: [
          { value: 'oui', label: 'Retenue' },
          { value: 'non', label: 'Rejetée, elle ferait un cycle' },
        ],
        because: accepts
          ? `${label(e.from)} et ${label(e.to)} sont dans deux composantes différentes : ` +
            'la retenir les relie sans créer de cycle.'
          : `${label(e.from)} et ${label(e.to)} sont déjà reliés : la retenir fermerait un cycle.`,
      });

      if (dsu.connected(e.from, e.to)) {
        rejectedEdges.push(e.id);
        t.markEdge(e.id, 'rejected');
        t.emit({
          line: 6,
          action: `Rejette ${label(e.from)}—${label(e.to)}`,
          detail:
            `${label(e.from)} et ${label(e.to)} sont déjà dans la même composante : ` +
            'cette arête fermerait un cycle.',
          structures: view(),
        });
        continue;
      }

      dsu.union(e.from, e.to);
      treeEdges.push(e.id);
      totalWeight += w;
      t.count('arêtes retenues');
      t.markEdge(e.id, 'tree');
      t.markNode(e.from, 'settled');
      t.markNode(e.to, 'settled');
      t.emit({
        line: 5,
        action: `Retient ${label(e.from)}—${label(e.to)}`,
        detail:
          `Poids ${w}. Les deux composantes fusionnent, il en reste ${dsu.componentCount}. ` +
          `Poids total : ${totalWeight}.`,
        structures: view(),
      });

      // Recomputed from scratch on the retained set, with a fresh union-find.
      const audit = new DisjointSet<NodeId>(adj.nodeIds);
      let cycle = false;
      for (const id of treeEdges) {
        const kept = graph.edges.find((x) => x.id === id);
        if (kept && !audit.union(kept.from, kept.to)) cycle = true;
      }
      t.hold('kr-acyclic', !cycle, `${treeEdges.length} arête(s) retenue(s) auditée(s)`);
      t.hold(
        'kr-count',
        treeEdges.length === adj.nodeIds.length - dsu.componentCount,
        `${treeEdges.length} = ${adj.nodeIds.length} - ${dsu.componentCount}`,
      );

      if (treeEdges.length === adj.nodeIds.length - 1) {
        t.emit({
          line: 3,
          action: 'Arbre complet',
          detail:
            `${treeEdges.length} arête(s) pour ${adj.nodeIds.length} sommets : ` +
            "l'arbre couvrant est terminé, les arêtes restantes seraient toutes rejetées.",
          structures: view(),
        });
        break;
      }
    }

    const componentCount = dsu.componentCount;
    const isSpanningTree = componentCount === 1;
    const conclusions: string[] = [
      isSpanningTree
        ? `Arbre couvrant minimal : ${treeEdges.length} arête(s), poids total ${totalWeight}.`
        : `Le graphe a ${componentCount} composantes : le résultat est une forêt couvrante ` +
          `de poids ${totalWeight}, pas un arbre.`,
    ];
    if (isSpanningTree) {
      conclusions.push(
        `Un arbre couvrant d'un graphe à ${adj.nodeIds.length} sommets compte toujours ` +
          `${adj.nodeIds.length - 1} arêtes, ce qui est vérifié ici.`,
      );
    }
    conclusions.push(
      `${t.metric('arêtes retenues')} retenue(s), ${rejectedEdges.length} rejetée(s) pour cause de cycle.`,
    );

    return t.build<KruskalResult>({
      algorithmId: 'kruskal',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O(E log E)',
        space: 'O(V)',
        note: 'Le tri domine ; union-find avec compression de chemin est quasi constant.',
      },
      conclusions,
      result: { treeEdges, rejectedEdges, totalWeight, componentCount, isSpanningTree },
    });
  },
};
