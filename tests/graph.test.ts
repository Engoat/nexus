import { describe, expect, it } from 'vitest';

import {
  addEdge,
  addNode,
  degree,
  emptyDocument,
  inDegree,
  outDegree,
  removeNode,
  toMathGraph,
  weightOf,
} from '../src/core/graph';
import { buildDocument } from './helpers';

const node = (id: string) => ({ id, label: id, x: 0, y: 0 });

describe('document du graphe', () => {
  it('refuse deux sommets de même identifiant', () => {
    const doc = addNode(emptyDocument(), node('A'));
    expect(() => addNode(doc, node('A'))).toThrow(/déjà utilisé/);
  });

  it('refuse une arête vers un sommet inconnu', () => {
    const doc = addNode(emptyDocument(), node('A'));
    expect(() => addEdge(doc, { id: 'e1', from: 'A', to: 'Z' })).toThrow(/extrémité inconnue/);
  });

  it('refuse une boucle quand les boucles sont désactivées', () => {
    const doc = addNode(emptyDocument({ loops: false }), node('A'));
    expect(() => addEdge(doc, { id: 'e1', from: 'A', to: 'A' })).toThrow(/boucles/);
  });

  it('accepte une boucle quand elles sont activées', () => {
    const doc = addNode(emptyDocument({ loops: true }), node('A'));
    expect(() => addEdge(doc, { id: 'e1', from: 'A', to: 'A' })).not.toThrow();
  });

  it('refuse une arête parallèle hors mode multigraphe', () => {
    let doc = emptyDocument();
    doc = addNode(doc, node('A'));
    doc = addNode(doc, node('B'));
    doc = addEdge(doc, { id: 'e1', from: 'A', to: 'B' });
    expect(() => addEdge(doc, { id: 'e2', from: 'A', to: 'B' })).toThrow(/parallèles/);
  });

  it('traite A-B et B-A comme la même arête sur un graphe non orienté', () => {
    let doc = emptyDocument({ directed: false });
    doc = addNode(doc, node('A'));
    doc = addNode(doc, node('B'));
    doc = addEdge(doc, { id: 'e1', from: 'A', to: 'B' });
    expect(() => addEdge(doc, { id: 'e2', from: 'B', to: 'A' })).toThrow(/parallèles/);
  });

  it('supprime les arêtes incidentes avec le sommet', () => {
    const doc = buildDocument('A-B, B-C, C-A');
    const after = removeNode(doc, 'B');
    expect(after.nodes.map((n) => n.id)).toEqual(['A', 'C']);
    expect(after.edges.map((e) => e.id)).toEqual(['e3']);
  });

  it('ne modifie pas le document original', () => {
    const doc = buildDocument('A-B');
    const before = JSON.stringify(doc);
    removeNode(doc, 'A');
    addNode(doc, node('Z'));
    expect(JSON.stringify(doc)).toBe(before);
  });
});

describe('vue mathématique', () => {
  it("retire les coordonnées de l'objet remis aux algorithmes", () => {
    const g = toMathGraph(buildDocument('A-B'));
    for (const n of g.nodes) {
      expect(Object.keys(n).sort()).toEqual(['id', 'label']);
    }
  });

  it('est gelée : un algorithme ne peut pas écrire dedans', () => {
    const g = toMathGraph(buildDocument('A-B'));
    expect(Object.isFrozen(g)).toBe(true);
    expect(Object.isFrozen(g.nodes)).toBe(true);
    expect(Object.isFrozen(g.edges[0])).toBe(true);
    expect(() => {
      (g as { nodes: unknown }).nodes = [];
    }).toThrow();
  });
});

describe('degrés et poids', () => {
  it('compte les degrés sur un graphe non orienté', () => {
    const g = toMathGraph(buildDocument('A-B, A-C, B-C'));
    expect(degree(g, 'A')).toBe(2);
    expect(outDegree(g, 'A')).toBe(2);
    expect(inDegree(g, 'A')).toBe(2);
  });

  it('distingue entrant et sortant sur un graphe orienté', () => {
    const g = toMathGraph(buildDocument('A>B, A>C, B>C', { directed: true }));
    expect(outDegree(g, 'A')).toBe(2);
    expect(inDegree(g, 'A')).toBe(0);
    expect(inDegree(g, 'C')).toBe(2);
  });

  it('donne un poids de 1 à chaque arête d\'un graphe non pondéré', () => {
    const g = toMathGraph(buildDocument('A-B, B-C'));
    expect(g.edges.every((e) => weightOf(g, e) === 1)).toBe(true);
  });
});
