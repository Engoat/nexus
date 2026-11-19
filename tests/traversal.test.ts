import { describe, expect, it } from 'vitest';

import { bfs, type BfsResult } from '../src/algorithms/traversal/bfs';
import { dfs, type DfsResult } from '../src/algorithms/traversal/dfs';
import { build, labels } from './helpers';

describe('BFS', () => {
  const g = build('A-B, A-C, B-D, C-D, D-E', { isolated: ['F'] });

  it('calcule les distances en nombre d\'arêtes', () => {
    const { result } = bfs.run(g, { source: 'A', target: null, stopAtTarget: false });
    expect(result.dist).toMatchObject({ A: 0, B: 1, C: 1, D: 2, E: 3 });
  });

  it('laisse les sommets isolés hors du parcours', () => {
    const { result } = bfs.run(g, { source: 'A', target: null, stopAtTarget: false });
    expect(result.unreached).toEqual(['F']);
    expect(result.dist.F).toBeUndefined();
  });

  it('reconstruit un plus court chemin vers la cible', () => {
    const { result } = bfs.run(g, { source: 'A', target: 'E', stopAtTarget: false });
    expect(labels(g, result.pathToTarget ?? [])).toEqual(['A', 'B', 'D', 'E']);
    expect(result.dist.E).toBe(3);
  });

  it('respecte le sens des arcs', () => {
    const directed = build('A>B, B>C, D>A', { directed: true });
    const { result } = bfs.run(directed, { source: 'A', target: null, stopAtTarget: false });
    expect(result.dist).toMatchObject({ A: 0, B: 1, C: 2 });
    expect(result.unreached).toEqual(['D']);
  });

  it('s\'arrête à la cible quand on le demande', () => {
    const full = bfs.run(g, { source: 'A', target: 'B', stopAtTarget: false })
      .result as BfsResult;
    const early = bfs.run(g, { source: 'A', target: 'B', stopAtTarget: true })
      .result as BfsResult;
    expect(early.reached).toBeLessThan(full.reached);
    expect(early.dist.B).toBe(1);
  });

  it('prévient que les poids sont ignorés', () => {
    const weighted = build('A-B:5, B-C:1');
    const issues = bfs.check(weighted, { source: 'A' });
    expect(issues.some((i) => i.level === 'warning' && /poids/.test(i.message))).toBe(true);
  });

  it('bloque un run sans source', () => {
    const issues = bfs.check(g, { source: null });
    expect(issues.some((i) => i.level === 'error')).toBe(true);
  });
});

describe('DFS', () => {
  it('détecte un cycle non orienté par un arc arrière', () => {
    const g = build('A-B, B-C, C-A');
    const { result } = dfs.run(g, { source: 'A', allComponents: true });
    expect(result.hasCycle).toBe(true);
    expect(result.backEdges.length).toBeGreaterThan(0);
  });

  it('ne voit aucun cycle dans un arbre', () => {
    const g = build('A-B, A-C, B-D');
    const { result } = dfs.run(g, { source: 'A', allComponents: true });
    expect(result.hasCycle).toBe(false);
    expect(result.treeEdges).toHaveLength(3);
  });

  it('ne confond pas l\'arête de retour avec un arc arrière', () => {
    // A-B seul : revenir de B vers A n'est pas un cycle.
    const g = build('A-B');
    const { result } = dfs.run(g, { source: 'A', allComponents: true });
    expect(result.backEdges).toHaveLength(0);
  });

  it('emboîte les dates de début et de fin', () => {
    const g = build('A-B, B-C, A-D');
    const { result } = dfs.run(g, { source: 'A', allComponents: true });
    for (const id of Object.keys(result.discovery)) {
      expect(result.finish[id]).toBeGreaterThan(result.discovery[id]);
    }
    // La racine est découverte en premier et terminée en dernier.
    expect(result.discovery.A).toBe(1);
    expect(result.finish.A).toBe(2 * g.nodes.length);
  });

  it('classe les arcs d\'un graphe orienté', () => {
    const g = build('A>B, B>C, A>C', { directed: true });
    const { result } = dfs.run(g, { source: 'A', allComponents: true });
    expect(result.treeEdges).toHaveLength(2);
    expect(result.forwardEdges).toHaveLength(1);
    expect(result.backEdges).toHaveLength(0);
    expect(result.hasCycle).toBe(false);
  });

  it('détecte un cycle orienté', () => {
    const g = build('A>B, B>A', { directed: true });
    const { result } = dfs.run(g, { source: 'A', allComponents: true });
    expect(result.hasCycle).toBe(true);
  });

  it('compte les composantes quand on les parcourt toutes', () => {
    const g = build('A-B, C-D');
    const all = dfs.run(g, { source: 'A', allComponents: true }).result as DfsResult;
    const one = dfs.run(g, { source: 'A', allComponents: false }).result as DfsResult;
    expect(all.components).toBe(2);
    expect(all.discoveryOrder).toHaveLength(4);
    expect(one.components).toBe(1);
    expect(one.discoveryOrder).toHaveLength(2);
  });
});
