import { describe, expect, it } from 'vitest';

import { bellmanFord } from '../src/algorithms/shortest/bellmanFord';
import { dijkstra } from '../src/algorithms/shortest/dijkstra';
import { build, labels } from './helpers';

/** A—B:4, A—C:2, C—B:1, B—D:5, C—D:8, D—E:6, C—E:10 */
const classic = build('A-B:4, A-C:2, C-B:1, B-D:5, C-D:8, D-E:6, C-E:10');

describe('Dijkstra', () => {
  it('trouve les distances minimales', () => {
    const { result } = dijkstra.run(classic, { source: 'A', target: null });
    expect(result.dist).toMatchObject({ A: 0, C: 2, B: 3, D: 8, E: 12 });
  });

  it('préfère A→C→B à l\'arête directe A—B', () => {
    const { result } = dijkstra.run(classic, { source: 'A', target: 'B' });
    expect(labels(classic, result.pathToTarget?.nodes ?? [])).toEqual(['A', 'C', 'B']);
    expect(result.pathToTarget?.cost).toBe(3);
  });

  it('fixe les sommets par distance croissante', () => {
    const { result } = dijkstra.run(classic, { source: 'A', target: null });
    const order = result.settledOrder;
    const dists = order.map((id) => result.dist[id]);
    const sorted = [...dists].sort((a, b) => a - b);
    expect(dists).toEqual(sorted);
  });

  it('refuse un poids négatif au lieu de répondre faux', () => {
    const g = build('A>B:2, B>C:-5, A>C:1', { directed: true });
    const issues = dijkstra.check(g, { source: 'A' });
    expect(issues.some((i) => i.level === 'error' && /négatif/.test(i.message))).toBe(true);
  });

  it('signale les sommets inatteignables', () => {
    const g = build('A-B:1', { isolated: ['Z'] });
    const { result } = dijkstra.run(g, { source: 'A', target: null });
    expect(result.unreachable).toEqual(['Z']);
    expect(result.dist.Z).toBe(Number.POSITIVE_INFINITY);
  });

  it('jette les entrées périmées du tas', () => {
    // B est inséré à 4 puis à 3 : la première entrée doit être ignorée.
    const trace = dijkstra.run(classic, { source: 'A', target: null });
    const stale = trace.steps.filter((s) => s.action.includes('périmé'));
    expect(stale.length).toBeGreaterThan(0);
  });
});

describe('Bellman-Ford', () => {
  it('donne les mêmes distances que Dijkstra quand les poids sont positifs', () => {
    const bf = bellmanFord.run(classic, { source: 'A', target: null });
    const dj = dijkstra.run(classic, { source: 'A', target: null });
    for (const n of classic.nodes) {
      expect(bf.result.dist[n.id]).toBe(dj.result.dist[n.id]);
    }
  });

  it('gère un poids négatif sans cycle négatif', () => {
    const g = build('A>B:4, A>C:5, C>B:-3', { directed: true });
    const { result } = bellmanFord.run(g, { source: 'A', target: 'B' });
    expect(result.dist.B).toBe(2);
    expect(result.negativeCycle).toBeNull();
    expect(labels(g, result.pathToTarget?.nodes ?? [])).toEqual(['A', 'C', 'B']);
  });

  it('détecte un cycle de poids négatif', () => {
    const g = build('A>B:1, B>C:-3, C>B:1', { directed: true });
    const { result } = bellmanFord.run(g, { source: 'A', target: null });
    expect(result.negativeCycle).not.toBeNull();
    expect(result.negativeCycle?.length).toBeGreaterThanOrEqual(2);
  });

  it('s\'arrête dès qu\'une passe ne change rien', () => {
    const g = build('A>B:1, B>C:1, C>D:1', { directed: true });
    const { result } = bellmanFord.run(g, { source: 'A', target: null });
    expect(result.dist.D).toBe(3);
    // V − 1 = 3 passes autorisées ; l'ordre des arcs permet de finir plus tôt.
    expect(result.passes).toBeLessThanOrEqual(3);
  });

  it('refuse une arête non orientée négative', () => {
    const g = build('A-B:-2');
    const issues = bellmanFord.check(g, { source: 'A' });
    expect(issues.some((i) => i.level === 'error' && /cycle négatif/.test(i.message))).toBe(true);
  });

  it('conseille Dijkstra quand aucun poids n\'est négatif', () => {
    const issues = bellmanFord.check(classic, { source: 'A' });
    expect(issues.some((i) => i.level === 'warning' && /Dijkstra/.test(i.fix ?? ''))).toBe(true);
  });
});
