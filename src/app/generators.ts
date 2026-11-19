/**
 * Graph generators.
 *
 * Declared the same way as algorithms: parameters as data, so the panel builds
 * itself. Every generator draws from a seeded source, so a given seed always
 * produces the same graph. Reproducibility matters here as much as in the
 * algorithms: an exercise built on a generated graph has to be the same graph
 * for everyone who opens it.
 *
 * Some generators exist to produce a specific trap rather than a pretty picture.
 * A student learns more from a disconnected graph or a negative cycle than from
 * a well-behaved one.
 */

import type { ParamSpec, ParamValues } from '../algorithms/types';
import { asBoolean, asNumber } from '../algorithms/types';
import { addEdge, addNode, emptyDocument, type GraphDocument } from '../core/graph';
import { freeLabel, nextEdgeId, nextNodeId } from '../core/ids';
import { Rng } from '../core/rng';

export interface GeneratorSpec {
  readonly id: string;
  readonly name: string;
  /** One sentence for the picker. */
  readonly summary: string;
  /** What this shape is good for, pedagogically. */
  readonly purpose: string;
  readonly params: readonly ParamSpec[];
  build(params: ParamValues): GraphDocument;
}

const SIZE = (max = 40, def = 10): ParamSpec => ({
  kind: 'number',
  id: 'nodes',
  label: 'Sommets',
  min: 2,
  max,
  step: 1,
  default: def,
});

const SEED: ParamSpec = {
  kind: 'number',
  id: 'seed',
  label: 'Graine',
  min: 1,
  max: 999,
  step: 1,
  default: 7,
  help: 'Même graine, même graphe. Change-la pour en tirer un autre.',
};

const DENSITY: ParamSpec = {
  kind: 'number',
  id: 'density',
  label: 'Densité',
  min: 0.05,
  max: 1,
  step: 0.05,
  default: 0.3,
  help: 'Probabilité que deux sommets soient reliés.',
};

const WEIGHTED: ParamSpec = {
  kind: 'boolean',
  id: 'weighted',
  label: 'Pondéré (généré)',
  default: true,
};

const DIRECTED: ParamSpec = {
  kind: 'boolean',
  id: 'directed',
  label: 'Orienté (généré)',
  default: false,
};

const MAX_WEIGHT: ParamSpec = {
  kind: 'number',
  id: 'maxWeight',
  label: 'Poids maximal',
  min: 1,
  max: 30,
  step: 1,
  default: 9,
};

/** Builder shared by every generator: places nodes, then adds the edges asked for. */
interface Builder {
  readonly rng: Rng;
  readonly ids: string[];
  doc: GraphDocument;
  weight(): number | undefined;
  link(a: number, b: number): void;
}

function start(params: ParamValues, count: number, directed: boolean): Builder {
  const weighted = asBoolean(params, 'weighted', false);
  const maxWeight = Math.max(1, Math.floor(asNumber(params, 'maxWeight', 9)));
  const rng = new Rng(Math.floor(asNumber(params, 'seed', 7)));

  let doc = emptyDocument({ directed, weighted, loops: false, multi: false });
  const ids: string[] = [];
  const taken: string[] = [];

  // Nodes are seeded on a circle; the app runs a layout right after loading.
  const radius = 40 + count * 14;
  for (let i = 0; i < count; i += 1) {
    const id = nextNodeId();
    const label = freeLabel(taken);
    taken.push(label);
    ids.push(id);
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / count;
    doc = addNode(doc, {
      id,
      label,
      x: Math.round(480 + radius * Math.cos(angle)),
      y: Math.round(320 + radius * Math.sin(angle)),
    });
  }

  const builder: Builder = {
    rng,
    ids,
    doc,
    weight: () => (weighted ? 1 + Math.floor(rng.next() * maxWeight) : undefined),
    link(a, b) {
      if (a === b) return;
      const w = builder.weight();
      try {
        builder.doc = addEdge(builder.doc, {
          id: nextEdgeId(),
          from: ids[a],
          to: ids[b],
          ...(w === undefined ? {} : { weight: w }),
        });
      } catch {
        // Parallel edge on a simple graph: the model refuses, and that is fine.
      }
    },
  };
  return builder;
}

export const GENERATORS: readonly GeneratorSpec[] = [
  {
    id: 'random',
    name: 'Aléatoire',
    summary: 'Chaque paire de sommets reliée avec une probabilité donnée.',
    purpose:
      "Le modèle d'Erdős-Rényi. Baisse la densité pour obtenir plusieurs composantes, " +
      'monte-la pour tout relier.',
    params: [SIZE(40, 10), DENSITY, DIRECTED, WEIGHTED, MAX_WEIGHT, SEED],
    build(params) {
      const n = Math.floor(asNumber(params, 'nodes', 10));
      const p = asNumber(params, 'density', 0.3);
      const directed = asBoolean(params, 'directed', false);
      const b = start(params, n, directed);
      for (let i = 0; i < n; i += 1) {
        for (let j = 0; j < n; j += 1) {
          if (i === j) continue;
          if (!directed && j < i) continue;
          if (b.rng.next() < p) b.link(i, j);
        }
      }
      return b.doc;
    },
  },
  {
    id: 'grid',
    name: 'Grille',
    summary: 'Un quadrillage de sommets, chacun relié à ses voisins.',
    purpose:
      'La forme où BFS montre le mieux ses couches concentriques, et où un plus court ' +
      'chemin se vérifie à la main.',
    params: [
      { kind: 'number', id: 'rows', label: 'Lignes', min: 2, max: 8, step: 1, default: 4 },
      { kind: 'number', id: 'cols', label: 'Colonnes', min: 2, max: 8, step: 1, default: 5 },
      WEIGHTED,
      MAX_WEIGHT,
      SEED,
    ],
    build(params) {
      const rows = Math.floor(asNumber(params, 'rows', 4));
      const cols = Math.floor(asNumber(params, 'cols', 5));
      const b = start(params, rows * cols, false);
      // The circle seed is wrong for a grid: place the nodes properly.
      b.doc = {
        ...b.doc,
        nodes: b.doc.nodes.map((node, i) => ({
          ...node,
          x: 180 + (i % cols) * 120,
          y: 140 + Math.floor(i / cols) * 110,
        })),
      };
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const here = r * cols + c;
          if (c + 1 < cols) b.link(here, here + 1);
          if (r + 1 < rows) b.link(here, here + cols);
        }
      }
      return b.doc;
    },
  },
  {
    id: 'tree',
    name: 'Arbre',
    summary: 'Chaque sommet accroché à un sommet déjà placé. Aucun cycle.',
    purpose:
      "Un arbre a toujours n − 1 arêtes et aucun cycle : de quoi vérifier qu'un parcours " +
      "en profondeur ne trouve aucun arc arrière.",
    params: [SIZE(40, 12), WEIGHTED, MAX_WEIGHT, SEED],
    build(params) {
      const n = Math.floor(asNumber(params, 'nodes', 12));
      const b = start(params, n, false);
      for (let i = 1; i < n; i += 1) {
        b.link(Math.floor(b.rng.next() * i), i);
      }
      return b.doc;
    },
  },
  {
    id: 'dag',
    name: 'Dépendances',
    summary: 'Orienté et sans cycle, par construction.',
    purpose:
      'Le terrain du tri topologique. Comme les arcs vont toujours du plus petit indice ' +
      'au plus grand, aucun cycle ne peut apparaître.',
    params: [SIZE(30, 9), DENSITY, WEIGHTED, MAX_WEIGHT, SEED],
    build(params) {
      const n = Math.floor(asNumber(params, 'nodes', 9));
      const p = asNumber(params, 'density', 0.3);
      const b = start(params, n, true);
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          if (b.rng.next() < p) b.link(i, j);
        }
      }
      return b.doc;
    },
  },
  {
    id: 'bipartite',
    name: 'Biparti',
    summary: 'Deux groupes, des arêtes seulement entre les groupes.',
    purpose:
      'Aucun cycle de longueur impaire. Sert aux problèmes de couplage, et montre une ' +
      'coloration en deux couleurs.',
    params: [
      { kind: 'number', id: 'left', label: 'Groupe gauche', min: 1, max: 12, step: 1, default: 4 },
      { kind: 'number', id: 'right', label: 'Groupe droit', min: 1, max: 12, step: 1, default: 4 },
      DENSITY,
      WEIGHTED,
      MAX_WEIGHT,
      SEED,
    ],
    build(params) {
      const left = Math.floor(asNumber(params, 'left', 4));
      const right = Math.floor(asNumber(params, 'right', 4));
      const p = asNumber(params, 'density', 0.4);
      const b = start(params, left + right, false);
      b.doc = {
        ...b.doc,
        nodes: b.doc.nodes.map((node, i) => ({
          ...node,
          x: i < left ? 260 : 700,
          y: 130 + (i < left ? i : i - left) * 95,
        })),
      };
      for (let i = 0; i < left; i += 1) {
        for (let j = 0; j < right; j += 1) {
          if (b.rng.next() < p) b.link(i, left + j);
        }
      }
      return b.doc;
    },
  },
  {
    id: 'complete',
    name: 'Complet',
    summary: 'Toutes les paires reliées.',
    purpose:
      'Le pire cas : E vaut V(V−1)/2. Utile pour sentir la différence entre O(V+E) et ' +
      'O(V·E) sans attendre.',
    params: [SIZE(14, 6), WEIGHTED, MAX_WEIGHT, SEED],
    build(params) {
      const n = Math.floor(asNumber(params, 'nodes', 6));
      const b = start(params, n, false);
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) b.link(i, j);
      }
      return b.doc;
    },
  },
  {
    id: 'disconnected',
    name: 'Composantes séparées',
    summary: 'Plusieurs groupes sans aucun lien entre eux.',
    purpose:
      "Le piège classique : un parcours ne voit que la composante de sa source. " +
      'Kruskal rend une forêt, Prim laisse des sommets dehors.',
    params: [
      { kind: 'number', id: 'groups', label: 'Groupes', min: 2, max: 5, step: 1, default: 3 },
      { kind: 'number', id: 'size', label: 'Taille d\'un groupe', min: 2, max: 6, step: 1, default: 3 },
      WEIGHTED,
      MAX_WEIGHT,
      SEED,
    ],
    build(params) {
      const groups = Math.floor(asNumber(params, 'groups', 3));
      const size = Math.floor(asNumber(params, 'size', 3));
      const b = start(params, groups * size, false);
      b.doc = {
        ...b.doc,
        nodes: b.doc.nodes.map((node, i) => ({
          ...node,
          x: 220 + Math.floor(i / size) * 230,
          y: 180 + (i % size) * 120,
        })),
      };
      for (let g = 0; g < groups; g += 1) {
        const base = g * size;
        for (let i = 1; i < size; i += 1) {
          b.link(base + i - 1, base + i);
        }
        if (size > 2) b.link(base, base + size - 1);
      }
      return b.doc;
    },
  },
  {
    id: 'negative-cycle',
    name: 'Cycle négatif',
    summary: 'Orienté, pondéré, avec un circuit de poids total négatif.',
    purpose:
      "Le cas où le problème n'a pas de solution. Dijkstra refuse, Bellman-Ford détecte, " +
      'et son invariant des prédécesseurs se brise.',
    params: [
      { kind: 'number', id: 'nodes', label: 'Sommets', min: 4, max: 12, step: 1, default: 6 },
      SEED,
    ],
    build(params) {
      const n = Math.max(4, Math.floor(asNumber(params, 'nodes', 6)));
      const b = start({ ...params, weighted: true, maxWeight: 6 }, n, true);
      // Un chemin depuis la source, puis un circuit dont la somme est négative.
      for (let i = 1; i < n - 2; i += 1) b.link(i - 1, i);
      const a = n - 3;
      const c = n - 2;
      const d = n - 1;
      b.doc = { ...b.doc, flags: { ...b.doc.flags, weighted: true } };
      const put = (from: number, to: number, w: number) => {
        b.doc = addEdge(b.doc, {
          id: nextEdgeId(),
          from: b.ids[from],
          to: b.ids[to],
          weight: w,
        });
      };
      put(a, c, 2);
      put(c, d, -5);
      put(d, a, 1);
      return b.doc;
    },
  },
];

export function generatorById(id: string): GeneratorSpec | undefined {
  return GENERATORS.find((g) => g.id === id);
}
