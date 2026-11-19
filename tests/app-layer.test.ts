/**
 * Tests for the app-layer modules that are pure: layouts and the file format.
 * Both are places where a silent bug would be hard to notice by eye.
 */

import { describe, expect, it } from 'vitest';

import { applyLayout, type LayoutKind } from '../src/app/layouts';
import { parseDocument, serializeDocument } from '../src/app/io';
import { SAMPLES } from '../src/app/samples';
import { toMathGraph } from '../src/core/graph';
import { buildDocument } from './helpers';

const VIEW = { width: 900, height: 600 };
const KINDS: LayoutKind[] = ['circle', 'grid', 'force', 'layers'];

describe('dispositions', () => {
  const doc = buildDocument('A-B, A-C, B-D, C-D, D-E, C-F');

  it.each(KINDS)('%s ne touche pas à la structure', (kind) => {
    const laid = applyLayout(doc, kind, VIEW);
    expect(toMathGraph(laid)).toEqual(toMathGraph(doc));
  });

  it.each(KINDS)('%s est déterministe', (kind) => {
    const a = applyLayout(doc, kind, VIEW);
    const b = applyLayout(doc, kind, VIEW);
    expect(b.nodes).toEqual(a.nodes);
  });

  it.each(KINDS)('%s garde les sommets dans le cadre', (kind) => {
    const laid = applyLayout(doc, kind, VIEW);
    for (const n of laid.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(VIEW.width);
      expect(n.y).toBeLessThanOrEqual(VIEW.height);
    }
  });

  it('ne superpose pas deux sommets avec les ressorts', () => {
    const laid = applyLayout(doc, 'force', VIEW);
    for (let i = 0; i < laid.nodes.length; i += 1) {
      for (let j = i + 1; j < laid.nodes.length; j += 1) {
        const d = Math.hypot(
          laid.nodes[i].x - laid.nodes[j].x,
          laid.nodes[i].y - laid.nodes[j].y,
        );
        expect(d).toBeGreaterThan(40);
      }
    }
  });

  it('place les niveaux de gauche à droite sur un graphe acyclique', () => {
    const dag = buildDocument('A>C, B>C, C>D, D>E', { directed: true });
    const laid = applyLayout(dag, 'layers', VIEW);
    const x = new Map(laid.nodes.map((n) => [n.id, n.x]));
    for (const e of dag.edges) {
      expect(x.get(e.from)).toBeLessThan(x.get(e.to) as number);
    }
  });

  it('accepte un graphe vide', () => {
    const empty = buildDocument('');
    for (const kind of KINDS) {
      expect(() => applyLayout(empty, kind, VIEW)).not.toThrow();
    }
  });
});

describe('format de fichier', () => {
  it('fait un aller-retour sans perte', () => {
    const doc = buildDocument('A-B:4, A-C:2, B-C:1');
    const back = parseDocument(serializeDocument(doc));
    expect(back).toEqual(doc);
  });

  it('conserve les capacités et les drapeaux', () => {
    const doc = buildDocument('A>B:5, B>C:3', { directed: true, asCapacity: true });
    const back = parseDocument(serializeDocument(doc));
    expect(back.flags.directed).toBe(true);
    expect(back.edges[0].capacity).toBe(5);
  });

  it.each(SAMPLES.map((s) => [s.name, s] as const))(
    'exporte et relit l\'exemple « %s »',
    (_name, sample) => {
      const doc = sample.build();
      expect(parseDocument(serializeDocument(doc))).toEqual(doc);
    },
  );

  it('refuse un JSON invalide', () => {
    expect(() => parseDocument('{nope')).toThrow(/JSON valide/);
  });

  it('refuse un fichier étranger', () => {
    expect(() => parseDocument('{"format":"autre","version":1}')).toThrow(/nexus/);
  });

  it('refuse une arête vers un sommet absent', () => {
    const broken = JSON.stringify({
      format: 'nexus',
      version: 1,
      flags: { directed: false, weighted: false, loops: false, multi: false },
      nodes: [{ id: 'n1', label: 'A', x: 0, y: 0 }],
      edges: [{ id: 'e1', from: 'n1', to: 'n9' }],
    });
    expect(() => parseDocument(broken)).toThrow(/inconnu/);
  });

  it('refuse une capacité négative', () => {
    const broken = JSON.stringify({
      format: 'nexus',
      version: 1,
      flags: { directed: true, weighted: false, loops: false, multi: false },
      nodes: [
        { id: 'n1', label: 'A', x: 0, y: 0 },
        { id: 'n2', label: 'B', x: 0, y: 0 },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', capacity: -3 }],
    });
    expect(() => parseDocument(broken)).toThrow(/négative/);
  });

  it('refuse un fichier produit par une version plus récente', () => {
    const future = JSON.stringify({
      format: 'nexus',
      version: 99,
      flags: {},
      nodes: [],
      edges: [],
    });
    expect(() => parseDocument(future)).toThrow(/plus récente/);
  });
});

describe('exemples', () => {
  it('ont des identifiants uniques et un algorithme suggéré valide', () => {
    const ids = SAMPLES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SAMPLES) {
      expect(s.purpose.length).toBeGreaterThan(20);
      expect(s.build().nodes.length).toBeGreaterThan(1);
    }
  });
});
