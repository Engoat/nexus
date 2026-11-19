import { describe, expect, it } from 'vitest';

import { edmondsKarp } from '../src/algorithms/flow/edmondsKarp';
import { topologicalSort } from '../src/algorithms/order/topologicalSort';
import { build } from './helpers';

describe('Tri topologique', () => {
  it('produit un ordre qui respecte tous les arcs', () => {
    const g = build('A>C, B>C, C>D, B>D', { directed: true });
    const { result } = topologicalSort.run(g, {});
    expect(result.isComplete).toBe(true);
    const position = new Map(result.order.map((id, i) => [id, i]));
    for (const e of g.edges) {
      expect(position.get(e.from)).toBeLessThan(position.get(e.to) as number);
    }
  });

  it('calcule la profondeur des dépendances', () => {
    const g = build('A>C, B>C, C>D, B>D', { directed: true });
    const { result } = topologicalSort.run(g, {});
    expect(result.levels).toMatchObject({ A: 0, B: 0, C: 1, D: 2 });
  });

  it('se bloque sur un cycle et nomme les sommets concernés', () => {
    const g = build('A>B, B>C, C>A', { directed: true });
    const { result } = topologicalSort.run(g, {});
    expect(result.isComplete).toBe(false);
    expect(result.order).toHaveLength(0);
    expect(result.blocked.sort()).toEqual(['A', 'B', 'C']);
  });

  it('ordonne ce qui précède le cycle avant de bloquer', () => {
    const g = build('S>A, A>B, B>C, C>A', { directed: true });
    const { result } = topologicalSort.run(g, {});
    expect(result.isComplete).toBe(false);
    expect(result.order).toEqual(['S']);
    expect(result.blocked.sort()).toEqual(['A', 'B', 'C']);
  });

  it('refuse un graphe non orienté', () => {
    const issues = topologicalSort.check(build('A-B'), {});
    expect(issues.some((i) => i.level === 'error' && /orienté/.test(i.message))).toBe(true);
  });
});

describe('Edmonds-Karp', () => {
  /**
   * Réseau de référence (CLRS, figure 26.1) : flot maximal attendu 23.
   * s→A:16, s→B:13, A→B:10, B→A:4, A→C:12, C→B:9, B→D:14, D→C:7, C→t:20, D→t:4
   */
  const net = build(
    's>A:16, s>B:13, A>B:10, B>A:4, A>C:12, C>B:9, B>D:14, D>C:7, C>t:20, D>t:4',
    { directed: true, asCapacity: true, weighted: false },
  );

  it('trouve le flot maximal du réseau de référence', () => {
    const { result } = edmondsKarp.run(net, { source: 's', sink: 't' });
    expect(result.maxFlow).toBe(23);
  });

  it('vérifie le théorème flot-max / coupe-min', () => {
    const { result } = edmondsKarp.run(net, { source: 's', sink: 't' });
    expect(result.minCut.capacity).toBe(result.maxFlow);
    expect(result.minCut.sourceSide).toContain('s');
    expect(result.minCut.sinkSide).toContain('t');
  });

  it('ne dépasse aucune capacité', () => {
    const { result } = edmondsKarp.run(net, { source: 's', sink: 't' });
    for (const e of net.edges) {
      expect(result.flowPerEdge[e.id]).toBeLessThanOrEqual(e.capacity ?? 0);
      expect(result.flowPerEdge[e.id]).toBeGreaterThanOrEqual(0);
    }
  });

  it('conserve le flot sur chaque sommet intermédiaire', () => {
    const { result } = edmondsKarp.run(net, { source: 's', sink: 't' });
    for (const n of net.nodes) {
      if (n.id === 's' || n.id === 't') continue;
      let incoming = 0;
      let outgoing = 0;
      for (const e of net.edges) {
        if (e.to === n.id) incoming += result.flowPerEdge[e.id] ?? 0;
        if (e.from === n.id) outgoing += result.flowPerEdge[e.id] ?? 0;
      }
      expect(incoming).toBe(outgoing);
    }
  });

  it('sort du flot de la source exactement le flot maximal', () => {
    const { result } = edmondsKarp.run(net, { source: 's', sink: 't' });
    const out = net.edges
      .filter((e) => e.from === 's')
      .reduce((sum, e) => sum + (result.flowPerEdge[e.id] ?? 0), 0);
    const into = net.edges
      .filter((e) => e.to === 't')
      .reduce((sum, e) => sum + (result.flowPerEdge[e.id] ?? 0), 0);
    expect(out).toBe(result.maxFlow);
    expect(into).toBe(result.maxFlow);
  });

  it('rend un flot nul quand le puits est isolé', () => {
    const g = build('s>A:5', { directed: true, asCapacity: true, isolated: ['t'] });
    const { result } = edmondsKarp.run(g, { source: 's', sink: 't' });
    expect(result.maxFlow).toBe(0);
    expect(result.minCut.capacity).toBe(0);
  });

  it('refuse une source égale au puits', () => {
    const issues = edmondsKarp.check(net, { source: 's', sink: 's' });
    expect(issues.some((i) => i.level === 'error' && /même sommet/.test(i.message))).toBe(true);
  });

  it('refuse une arête sans capacité', () => {
    const g = build('A>B', { directed: true });
    const issues = edmondsKarp.check(g, { source: 'A', sink: 'B' });
    expect(issues.some((i) => i.level === 'error' && /capacité/.test(i.message))).toBe(true);
  });
});
