import { describe, expect, it } from 'vitest';

import { kruskal } from '../src/algorithms/mst/kruskal';
import { prim } from '../src/algorithms/mst/prim';
import { build, weightSum } from './helpers';

/** A—B:4, A—C:2, B—C:1, B—D:5, C—D:8, D—E:6 — ACM minimal : 1 + 2 + 5 + 6 = 14 */
const g = build('A-B:4, A-C:2, B-C:1, B-D:5, C-D:8, D-E:6');

describe('Kruskal', () => {
  it('trouve un arbre couvrant de poids minimal', () => {
    const { result } = kruskal.run(g, {});
    expect(result.totalWeight).toBe(14);
    expect(result.treeEdges).toHaveLength(g.nodes.length - 1);
    expect(result.isSpanningTree).toBe(true);
  });

  it('annonce un poids total égal à la somme des arêtes retenues', () => {
    const { result } = kruskal.run(g, {});
    expect(weightSum(g, result.treeEdges)).toBe(result.totalWeight);
  });

  it('rejette une arête qui fermerait un cycle', () => {
    const { result } = kruskal.run(g, {});
    // A—B:4 arrive après B—C:1 et A—C:2, qui ont déjà relié A, B et C.
    const rejected = result.rejectedEdges.map(
      (id) => g.edges.find((e) => e.id === id) as (typeof g.edges)[number],
    );
    expect(rejected).toHaveLength(1);
    expect([rejected[0].from, rejected[0].to].sort()).toEqual(['A', 'B']);
  });

  it('s\'arrête sans examiner les arêtes devenues inutiles', () => {
    const { result, steps } = kruskal.run(g, {});
    // L'arbre est complet après 4 arêtes retenues : C—D:8 n'est jamais atteinte.
    const examined = result.treeEdges.length + result.rejectedEdges.length;
    expect(examined).toBe(5);
    expect(examined).toBeLessThan(g.edges.length);
    expect(steps.at(-1)?.action).toBe('Arbre complet');
  });

  it('rend une forêt sur un graphe non connexe', () => {
    const split = build('A-B:1, C-D:2');
    const { result } = kruskal.run(split, {});
    expect(result.isSpanningTree).toBe(false);
    expect(result.componentCount).toBe(2);
    expect(result.totalWeight).toBe(3);
  });

  it('refuse un graphe orienté', () => {
    const directed = build('A>B:1, B>C:2', { directed: true });
    const issues = kruskal.check(directed, {});
    expect(issues.some((i) => i.level === 'error' && /non orienté/.test(i.message))).toBe(true);
  });
});

describe('Prim', () => {
  it('atteint le même poids total que Kruskal', () => {
    const k = kruskal.run(g, {});
    const p = prim.run(g, { start: 'A' });
    expect(p.result.totalWeight).toBe(k.result.totalWeight);
    expect(p.result.spansGraph).toBe(true);
  });

  it('donne le même poids depuis n\'importe quel sommet de départ', () => {
    const totals = g.nodes.map((n) => prim.run(g, { start: n.id }).result.totalWeight);
    expect(new Set(totals).size).toBe(1);
    expect(totals[0]).toBe(14);
  });

  it('ne couvre que la composante du sommet de départ', () => {
    const split = build('A-B:1, C-D:2');
    const { result } = prim.run(split, { start: 'A' });
    expect(result.spansGraph).toBe(false);
    expect(result.outside.sort()).toEqual(['C', 'D']);
    expect(result.totalWeight).toBe(1);
  });

  it('refuse un graphe orienté', () => {
    const directed = build('A>B:1', { directed: true });
    const issues = prim.check(directed, { start: 'A' });
    expect(issues.some((i) => i.level === 'error')).toBe(true);
  });
});
