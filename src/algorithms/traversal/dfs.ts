/**
 * Depth-first search, iterative.
 *
 * Written with an explicit stack rather than recursion so every push and pop is
 * a traceable step, and so a large graph cannot blow the call stack. Keeps
 * discovery and finish times, and classifies every edge, which is what makes
 * DFS useful beyond "visiting everything".
 */

import { buildAdjacency } from '../../core/adjacency';
import type { EdgeId, MathGraph, NodeId } from '../../core/graph';
import { type InvariantSpec, type StructureView, Tracer } from '../../core/trace';
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

export interface DfsResult {
  readonly discoveryOrder: NodeId[];
  readonly finishOrder: NodeId[];
  readonly discovery: Record<NodeId, number>;
  readonly finish: Record<NodeId, number>;
  readonly parent: Record<NodeId, NodeId | null>;
  readonly treeEdges: EdgeId[];
  readonly backEdges: EdgeId[];
  readonly forwardEdges: EdgeId[];
  readonly crossEdges: EdgeId[];
  readonly hasCycle: boolean;
  readonly components: number;
}

const PSEUDO = [
  'pour chaque sommet s non visité :',
  '    empiler s ; couleur[s] ← gris',
  '    tant que pile non vide :',
  '        u ← sommet du haut',
  '        si u a un voisin v non visité :',
  '            parent[v] ← u ; empiler v ; couleur[v] ← gris',
  '        sinon :',
  '            dépiler u ; couleur[u] ← noir',
] as const;

type Colour = 'white' | 'grey' | 'black';

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'dfs-grey-path',
    statement:
      "Les sommets gris forment exactement le chemin courant, de la racine au sommet exploré.",
    matters:
      "C'est ce qui donne un sens aux arcs arrière : rencontrer un sommet gris, c'est " +
      'retomber sur un ancêtre du chemin courant, donc fermer un cycle.',
  },
  {
    id: 'dfs-times',
    statement: "Un sommet gris a une date de début et pas encore de date de fin.",
    matters:
      'Les intervalles [début, fin] doivent former un emboîtement strict. ' +
      'Le tri topologique et les composantes fortement connexes en dépendent.',
  },
] as const;

export const dfs: AlgorithmSpec<DfsResult> = {
  id: 'dfs',
  name: 'Parcours en profondeur (DFS)',
  family: 'parcours',
  summary: "Suit un chemin jusqu'au bout avant de revenir en arrière.",
  rationale:
    'Un sommet reste gris tant que son exploration est en cours. Rencontrer un arc vers ' +
    'un sommet gris signifie donc retomber sur un ancêtre : il y a un cycle. ' +
    'Les dates de début et de fin forment un emboîtement qui sert de base au tri ' +
    'topologique et aux composantes fortement connexes.',
  params: [
    { kind: 'node', id: 'source', label: 'Source', required: true },
    {
      kind: 'boolean',
      id: 'allComponents',
      label: 'Parcourir aussi les autres composantes',
      default: true,
    },
  ],
  invariants: INVARIANTS,

  check(graph, params): Issue[] {
    return [
      ...requireNodes(graph, 1),
      ...requireNode(graph, params, 'source', 'La source'),
      ...warnNoEdges(graph),
    ];
  },

  run(graph: MathGraph, params: ParamValues) {
    const adj = buildAdjacency(graph);
    const source = asNodeId(params, 'source') as NodeId;
    const allComponents = asBoolean(params, 'allComponents', true);
    const directed = graph.flags.directed;

    const t = new Tracer(INVARIANTS);
    const colour = new Map<NodeId, Colour>();
    const disc = new Map<NodeId, number>();
    const fin = new Map<NodeId, number>();
    const parent = new Map<NodeId, NodeId | null>();
    const treeEdges: EdgeId[] = [];
    const backEdges: EdgeId[] = [];
    const forwardEdges: EdgeId[] = [];
    const crossEdges: EdgeId[] = [];
    const discoveryOrder: NodeId[] = [];
    const finishOrder: NodeId[] = [];

    for (const id of adj.nodeIds) colour.set(id, 'white');

    let clock = 0;
    let components = 0;

    interface Frame {
      readonly node: NodeId;
      cursor: number;
      readonly viaEdge: EdgeId | null;
    }
    const stack: Frame[] = [];

    const label = (id: NodeId) => adj.label(id);
    const view = (): StructureView[] => [
      {
        kind: 'sequence',
        name: 'Pile',
        semantics: 'stack',
        items: stack.map((f) => label(f.node)),
      },
      {
        kind: 'table',
        name: 'Dates',
        columns: ['sommet', 'début', 'fin', 'couleur'],
        rows: adj.nodeIds.map((id) => [
          label(id),
          disc.get(id) ?? '—',
          fin.get(id) ?? '—',
          colour.get(id) === 'white' ? 'blanc' : colour.get(id) === 'grey' ? 'gris' : 'noir',
        ]),
      },
    ];

    const open = (node: NodeId, viaEdge: EdgeId | null) => {
      colour.set(node, 'grey');
      clock += 1;
      disc.set(node, clock);
      discoveryOrder.push(node);
      stack.push({ node, cursor: 0, viaEdge });
      t.markNode(node, node === source ? 'source' : 'current');
      t.count('sommets découverts');
    };

    const roots = allComponents ? [source, ...adj.nodeIds.filter((id) => id !== source)] : [source];

    for (const root of roots) {
      if (colour.get(root) !== 'white') continue;
      components += 1;
      parent.set(root, null);
      open(root, null);
      t.emit({
        line: 2,
        action: `Départ en ${label(root)}`,
        detail:
          components === 1
            ? `${label(root)} est empilé et passe au gris (début ${disc.get(root)}).`
            : `Nouvelle composante : ${label(root)} n'avait pas été atteint.`,
        structures: view(),
      });

      while (stack.length > 0) {
        const frame = stack[stack.length - 1];
        const arcs = adj.out(frame.node);

        // The grey set must be exactly the stack, and the stack must be a path.
        const greys = adj.nodeIds.filter((id) => colour.get(id) === 'grey');
        const stackIds = stack.map((f) => f.node);
        let isPath = greys.length === stackIds.length;
        for (let k = 1; k < stackIds.length && isPath; k += 1) {
          isPath = adj.out(stackIds[k - 1]).some((a) => a.to === stackIds[k]);
        }
        t.hold(
          'dfs-grey-path',
          isPath && greys.every((id) => stackIds.includes(id)),
          `pile : ${stackIds.map(label).join(' → ') || '—'}`,
        );
        t.hold(
          'dfs-times',
          greys.every((id) => disc.has(id) && !fin.has(id)),
          `${greys.length} sommet(s) gris`,
        );

        if (frame.cursor < arcs.length) {
          const arc = arcs[frame.cursor];
          frame.cursor += 1;

          // On an undirected graph, the edge we came in by is not a back edge.
          if (!directed && arc.edgeId === frame.viaEdge) continue;

          t.count('arcs examinés');
          const c = colour.get(arc.to) as Colour;

          if (c === 'white') {
            const whites: { value: string; label: string }[] = [];
            for (const a of arcs) {
              if (colour.get(a.to) !== 'white') continue;
              if (whites.some((w) => w.value === a.to)) continue;
              whites.push({ value: a.to, label: label(a.to) });
            }
            if (whites.length > 1) {
              t.ask({
                prompt: `Vers quel voisin de ${label(frame.node)} la descente se fait-elle ?`,
                kind: 'node',
                answer: arc.to,
                among: whites,
                because:
                  "DFS prend le premier voisin non visité dans l'ordre des libellés, " +
                  `ici ${label(arc.to)}.`,
              });
            }
            parent.set(arc.to, frame.node);
            treeEdges.push(arc.edgeId);
            t.markEdge(arc.edgeId, 'tree');
            open(arc.to, arc.edgeId);
            t.emit({
              line: 6,
              action: `Descend vers ${label(arc.to)}`,
              detail: `Arc de l'arbre : ${label(frame.node)} → ${label(arc.to)} (début ${disc.get(arc.to)}).`,
              structures: view(),
            });
            continue;
          }

          if (c === 'grey') {
            backEdges.push(arc.edgeId);
            t.markEdge(arc.edgeId, 'rejected');
            t.emit({
              line: 5,
              action: 'Arc arrière',
              detail:
                `${label(arc.to)} est encore gris : son exploration n'est pas terminée. ` +
                `L'arc ${label(frame.node)} → ${label(arc.to)} referme un cycle.`,
              structures: view(),
            });
            continue;
          }

          // black
          if (directed) {
            const isForward = (disc.get(frame.node) as number) < (disc.get(arc.to) as number);
            if (isForward) forwardEdges.push(arc.edgeId);
            else crossEdges.push(arc.edgeId);
            t.markEdge(arc.edgeId, 'rejected');
            t.emit({
              line: 5,
              action: isForward ? 'Arc avant' : 'Arc transverse',
              detail:
                `${label(arc.to)} est déjà terminé. L'arc est ` +
                (isForward
                  ? 'un raccourci vers un descendant déjà exploré.'
                  : "un passage vers une autre branche déjà explorée."),
              structures: view(),
            });
          } else {
            t.markEdge(arc.edgeId, 'rejected');
            t.emit({
              line: 5,
              action: `${label(arc.to)} terminé`,
              detail: `${label(arc.to)} est noir, l'arc ne mène nulle part de neuf.`,
              structures: view(),
            });
          }
          continue;
        }

        // no arc left: close the node
        stack.pop();
        colour.set(frame.node, 'black');
        clock += 1;
        fin.set(frame.node, clock);
        finishOrder.push(frame.node);
        t.markNode(frame.node, 'settled');
        t.emit({
          line: 8,
          action: `Termine ${label(frame.node)}`,
          detail: `Plus de voisin à explorer : ${label(frame.node)} passe au noir (fin ${clock}).`,
          structures: view(),
        });
      }
    }

    for (const id of adj.nodeIds) {
      if (colour.get(id) === 'white') t.markNode(id, 'excluded');
    }

    const hasCycle = backEdges.length > 0;
    const conclusions: string[] = [
      `${discoveryOrder.length} sommet(s) visité(s), ${components} composante(s) explorée(s).`,
      `Ordre de fin : ${finishOrder.map(label).join(' → ') || '—'}.`,
    ];
    conclusions.push(
      hasCycle
        ? `${backEdges.length} arc(s) arrière : le graphe contient au moins un cycle.`
        : directed
          ? 'Aucun arc arrière : le graphe orienté est acyclique, un tri topologique existe.'
          : 'Aucun arc arrière : la composante explorée est une forêt.',
    );
    if (directed && (forwardEdges.length > 0 || crossEdges.length > 0)) {
      conclusions.push(
        `Classification : ${treeEdges.length} arbre, ${backEdges.length} arrière, ` +
          `${forwardEdges.length} avant, ${crossEdges.length} transverse.`,
      );
    }

    return t.build<DfsResult>({
      algorithmId: 'dfs',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O(V + E)',
        space: 'O(V)',
        note: "La pile contient au plus un sommet par niveau du chemin courant.",
      },
      conclusions,
      result: {
        discoveryOrder,
        finishOrder,
        discovery: Object.fromEntries(disc),
        finish: Object.fromEntries(fin),
        parent: Object.fromEntries(parent),
        treeEdges,
        backEdges,
        forwardEdges,
        crossEdges,
        hasCycle,
        components,
      },
    });
  },
};
