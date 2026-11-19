/**
 * Contract every algorithm must honour, checked across the whole registry.
 * Adding an algorithm to the registry subjects it to these tests automatically,
 * which is the point: the interface trusts the contract, so the contract is
 * what gets tested.
 */

import { describe, expect, it } from 'vitest';

import { ALGORITHMS, bellmanFord } from '../src/algorithms/registry';
import { defaultParams, type ParamValues } from '../src/algorithms/types';
import type { MathGraph } from '../src/core/graph';
import { invariantReport } from '../src/core/trace';
import { build } from './helpers';

/** A graph and parameters on which the algorithm is allowed to run. */
const CASES: Record<string, { graph: MathGraph; params: ParamValues }> = {
  bfs: { graph: build('A-B, A-C, B-D, C-D'), params: { source: 'A', target: 'D' } },
  dfs: { graph: build('A-B, B-C, C-A'), params: { source: 'A', allComponents: true } },
  dijkstra: {
    graph: build('A-B:4, A-C:2, C-B:1, B-D:5'),
    params: { source: 'A', target: 'D' },
  },
  'bellman-ford': {
    graph: build('A>B:4, A>C:5, C>B:-3', { directed: true }),
    params: { source: 'A', target: 'B' },
  },
  kruskal: { graph: build('A-B:4, A-C:2, B-C:1, B-D:5'), params: {} },
  prim: { graph: build('A-B:4, A-C:2, B-C:1, B-D:5'), params: { start: 'A' } },
  'topological-sort': {
    graph: build('A>C, B>C, C>D', { directed: true }),
    params: {},
  },
  'edmonds-karp': {
    graph: build('s>A:3, A>t:2, s>t:1', { directed: true, asCapacity: true }),
    params: { source: 's', sink: 't' },
  },
};

describe('registre', () => {
  it('expose des identifiants uniques', () => {
    const ids = ALGORITHMS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('couvre chaque algorithme par un cas de test', () => {
    for (const algo of ALGORITHMS) {
      expect(CASES[algo.id], `cas manquant pour ${algo.id}`).toBeDefined();
    }
  });

  it('documente chaque algorithme', () => {
    for (const algo of ALGORITHMS) {
      expect(algo.name.length).toBeGreaterThan(2);
      expect(algo.summary.length).toBeGreaterThan(10);
      expect(algo.rationale.length).toBeGreaterThan(40);
    }
  });
});

describe.each(ALGORITHMS.map((a) => [a.id, a] as const))('contrat de trace — %s', (id, algo) => {
  const { graph, params } = CASES[id];

  it('passe ses propres préconditions sur le cas de référence', () => {
    const blocking = algo.check(graph, params).filter((i) => i.level === 'error');
    expect(blocking).toEqual([]);
  });

  it('produit au moins une étape', () => {
    const trace = algo.run(graph, params);
    expect(trace.steps.length).toBeGreaterThan(0);
  });

  it('numérote les étapes sans trou', () => {
    const trace = algo.run(graph, params);
    trace.steps.forEach((s, i) => expect(s.index).toBe(i));
  });

  it('pointe une ligne de pseudocode existante', () => {
    const trace = algo.run(graph, params);
    for (const s of trace.steps) {
      expect(s.line).toBeGreaterThanOrEqual(0);
      expect(s.line).toBeLessThanOrEqual(trace.pseudocode.length);
    }
  });

  it('ne marque que des sommets et des arêtes du graphe', () => {
    const trace = algo.run(graph, params);
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const edgeIds = new Set(graph.edges.map((e) => e.id));
    for (const s of trace.steps) {
      for (const key of Object.keys(s.nodeMarks)) expect(nodeIds.has(key)).toBe(true);
      for (const key of Object.keys(s.edgeMarks)) expect(edgeIds.has(key)).toBe(true);
    }
  });

  it('écrit une action et une explication à chaque étape', () => {
    const trace = algo.run(graph, params);
    for (const s of trace.steps) {
      expect(s.action.trim().length).toBeGreaterThan(0);
      expect(s.detail.trim().length).toBeGreaterThan(5);
    }
  });

  it('ne fait que croître ses compteurs', () => {
    const trace = algo.run(graph, params);
    const previous = new Map<string, number>();
    for (const s of trace.steps) {
      for (const [k, v] of Object.entries(s.metrics)) {
        expect(v).toBeGreaterThanOrEqual(previous.get(k) ?? 0);
        previous.set(k, v);
      }
    }
  });

  it('annonce une complexité et au moins une conclusion', () => {
    const trace = algo.run(graph, params);
    expect(trace.complexity.time).toMatch(/O\(/);
    expect(trace.complexity.space).toMatch(/O\(/);
    expect(trace.conclusions.length).toBeGreaterThan(0);
  });

  it('produit une trace sérialisable', () => {
    const trace = algo.run(graph, params);
    const round = JSON.parse(JSON.stringify(trace));
    expect(round.steps.length).toBe(trace.steps.length);
    expect(round.algorithmId).toBe(trace.algorithmId);
  });

  it('est déterministe : deux exécutions donnent la même trace', () => {
    const a = algo.run(graph, params);
    const b = algo.run(graph, params);
    expect(JSON.stringify(b.steps)).toBe(JSON.stringify(a.steps));
  });

  it('ne touche pas au graphe qu\'on lui confie', () => {
    const before = JSON.stringify(graph);
    algo.run(graph, params);
    expect(JSON.stringify(graph)).toBe(before);
  });

  it('fournit des paramètres par défaut cohérents avec sa déclaration', () => {
    const defaults = defaultParams(algo);
    expect(Object.keys(defaults).sort()).toEqual(algo.params.map((p) => p.id).sort());
  });

  /* ---------------- invariants ---------------- */

  it('déclare au moins un invariant, énoncé et justifié', () => {
    expect(algo.invariants.length).toBeGreaterThan(0);
    for (const inv of algo.invariants) {
      expect(inv.statement.length).toBeGreaterThan(25);
      expect(inv.matters.length).toBeGreaterThan(40);
    }
  });

  it('évalue chacun de ses invariants au moins une fois', () => {
    const trace = algo.run(graph, params);
    for (const line of invariantReport(trace)) {
      expect(line.evaluations, `invariant jamais évalué : ${line.spec.id}`).toBeGreaterThan(0);
    }
  });

  it('maintient tous ses invariants sur le cas de référence', () => {
    const trace = algo.run(graph, params);
    for (const line of invariantReport(trace)) {
      expect(line.violations, `invariant violé : ${line.spec.id}`).toEqual([]);
    }
  });

  it("n'évalue que des invariants déclarés", () => {
    const trace = algo.run(graph, params);
    const declared = new Set(algo.invariants.map((i) => i.id));
    for (const step of trace.steps) {
      for (const check of step.invariants) expect(declared.has(check.id)).toBe(true);
    }
  });

  /* ---------------- questions ---------------- */

  it('pose des questions dont la réponse figure parmi les propositions', () => {
    const trace = algo.run(graph, params);
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    const edgeIds = new Set(graph.edges.map((e) => e.id));

    for (const step of trace.steps) {
      const ask = step.ask;
      if (!ask) continue;
      expect(ask.prompt.trim().length).toBeGreaterThan(10);
      expect(ask.because.trim().length).toBeGreaterThan(20);
      expect(ask.among.length).toBeGreaterThan(1);
      expect(ask.among.map((o) => o.value)).toContain(ask.answer);
      // Pas de doublon : deux propositions identiques rendraient la question fausse.
      expect(new Set(ask.among.map((o) => o.value)).size).toBe(ask.among.length);
      for (const option of ask.among) {
        expect(option.label.trim().length).toBeGreaterThan(0);
        if (ask.kind === 'node') expect(nodeIds.has(option.value)).toBe(true);
        if (ask.kind === 'edge') expect(edgeIds.has(option.value)).toBe(true);
      }
    }
  });
});

describe('invariants : les cas où ils doivent tomber', () => {
  it('Bellman-Ford viole la forêt de prédécesseurs sur un cycle négatif', () => {
    const g = build('A>B:1, B>C:-3, C>B:1', { directed: true });
    const trace = bellmanFord.run(g, { source: 'A', target: null });
    const line = invariantReport(trace).find((l) => l.spec.id === 'bf-prev-forest');

    expect(line).toBeDefined();
    // La violation est le signal attendu, pas un défaut : prev boucle dans le cycle.
    expect(line?.violations.length).toBeGreaterThan(0);
    expect(line?.violations[0].detail).toMatch(/boucle/);
  });

  it('et les maintient quand le même graphe perd son cycle négatif', () => {
    const g = build('A>B:1, B>C:-3, C>D:1', { directed: true });
    const trace = bellmanFord.run(g, { source: 'A', target: null });
    for (const line of invariantReport(trace)) {
      expect(line.violations).toEqual([]);
    }
  });
});
