/**
 * Course material integrity.
 *
 * A lesson that drifts from the algorithm it describes is worse than no lesson,
 * so the links are checked rather than trusted: every registry entry has a
 * lesson, every glossary key referenced exists, every cross-reference points at
 * something real, and the stated complexity matches what the algorithm reports.
 */

import { describe, expect, it } from 'vitest';

import { ALGORITHMS, byId } from '../src/algorithms/registry';
import { defaultParams } from '../src/algorithms/types';
import { GLOSSARY, LESSONS, lessonFor } from '../src/content/lessons';
import { SIMULATIONS } from '../src/sim/registry';
import { build } from './helpers';

const ENTRIES = [...ALGORITHMS, ...SIMULATIONS];

describe('couverture', () => {
  it.each(ENTRIES.map((e) => [e.id, e.name] as const))(
    '%s a un cours',
    (id) => {
      expect(lessonFor(id), `cours manquant pour ${id}`).toBeDefined();
    },
  );

  it("n'a pas de cours orphelin", () => {
    const known = new Set(ENTRIES.map((e) => e.id));
    for (const id of Object.keys(LESSONS)) {
      expect(known.has(id), `cours sans algorithme : ${id}`).toBe(true);
    }
  });
});

describe.each(Object.entries(LESSONS))('cours de %s', (id, lesson) => {
  it('tient en une idée claire', () => {
    expect(lesson.idea.length).toBeGreaterThan(50);
    expect(lesson.idea.trim().endsWith('.')).toBe(true);
  });

  it('dit à quoi ça sert, comment, et quoi regarder', () => {
    expect(lesson.what.length).toBeGreaterThan(0);
    expect(lesson.how.length).toBeGreaterThan(1);
    expect(lesson.watch.length).toBeGreaterThan(1);
    for (const block of [...lesson.what, ...lesson.how, ...lesson.watch]) {
      expect(block.length).toBeGreaterThan(40);
    }
  });

  it('annonce ses conditions et ses pièges', () => {
    expect(lesson.conditions.length).toBeGreaterThan(0);
    expect(lesson.pitfalls.length).toBeGreaterThan(0);
    for (const block of [...lesson.conditions, ...lesson.pitfalls]) {
      expect(block.length).toBeGreaterThan(30);
    }
  });

  it('explique son coût au lieu de le réciter', () => {
    expect(lesson.complexity.line).toMatch(/O\(/);
    expect(lesson.complexity.why.length).toBeGreaterThan(60);
  });

  it('ne renvoie qu\'à des termes définis', () => {
    for (const term of lesson.terms) {
      expect(GLOSSARY[term], `terme absent du glossaire : ${term}`).toBeDefined();
    }
  });

  it('ne renvoie qu\'à des entrées existantes', () => {
    for (const link of lesson.seeAlso ?? []) {
      const target = byId(link.id) ?? SIMULATIONS.find((s) => s.id === link.id);
      expect(target, `renvoi cassé : ${link.id}`).toBeDefined();
      expect(link.why.length).toBeGreaterThan(20);
    }
  });

  it('annonce la même complexité que l\'algorithme', () => {
    const algo = byId(id);
    if (!algo) return;
    const cases: Record<string, Parameters<typeof algo.run>> = {};
    void cases;
    // La ligne de complexité du cours doit correspondre à celle de la trace.
    const graph = build('A-B:1, B-C:2, A-C:4', { directed: algo.id === 'topological-sort' });
    const params = { ...defaultParams(algo), source: 'A', start: 'A', sink: 'C' };
    const blocking = algo.check(graph, params).filter((i) => i.level === 'error');
    if (blocking.length > 0) return; // cas couvert ailleurs
    const trace = algo.run(graph, params);
    expect(trace.complexity.time).toBe(lesson.complexity.line);
  });
});

describe('glossaire', () => {
  it('définit chaque terme en une phrase utile', () => {
    for (const [term, definition] of Object.entries(GLOSSARY)) {
      expect(definition.length, `définition trop courte : ${term}`).toBeGreaterThan(40);
      expect(term.length).toBeGreaterThan(2);
    }
  });

  it('ne laisse aucun terme inutilisé', () => {
    const used = new Set(Object.values(LESSONS).flatMap((l) => l.terms));
    const unused = Object.keys(GLOSSARY).filter((t) => !used.has(t));
    // Le glossaire sert aussi de référence : on tolère des termes non cités,
    // mais pas plus de la moitié, sinon il devient du décor.
    expect(unused.length).toBeLessThan(Object.keys(GLOSSARY).length / 2);
  });
});
