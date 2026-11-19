/**
 * Guard on the French shown to a user.
 *
 * Exists because of a real regression: a patch script that avoided accents to
 * dodge an encoding problem shipped "aretes examinees" into an algorithm, and
 * silently renamed a counter in the process. A test is cheaper than vigilance.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ALGORITHMS } from '../src/algorithms/registry';
import { SIMULATIONS } from '../src/sim/registry';

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Words that only appear when someone dropped the accents. */
const UNACCENTED = [
  'aretes',
  'arete ',
  'predecesseur',
  'propriete',
  'capacite',
  'residuel',
  'desequilibre',
  'intermediaire',
  'implementation',
  'libelles',
  'egalite',
  'caracterise',
  'detectee',
  'ameliorer',
  'apparaitrait',
  'disparaitrait',
  'verifiee',
  'legere',
  'etape ',
  'donnee ',
  'resultat',
  'probleme',
  'frontiere',
];

describe('qualité du texte affiché', () => {
  const files = [...sourceFiles('src')];

  it('couvre bien les sources', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(files)('%s écrit le français avec ses accents', (file) => {
    const content = readFileSync(file, 'utf8');
    const found = UNACCENTED.filter((word) => content.includes(word));
    expect(found, `mots sans accent dans ${file}`).toEqual([]);
  });

  it('nomme les compteurs de façon cohérente entre algorithmes', () => {
    // Un compteur mal orthographié crée une deuxième série silencieuse.
    const keys = new Set<string>();
    for (const file of files) {
      const content = readFileSync(file, 'utf8');
      for (const m of content.matchAll(/t\.count\('([^']+)'/g)) keys.add(m[1]);
    }
    for (const key of keys) {
      expect(key, `compteur douteux : ${key}`).not.toMatch(/aretes|sommets defiles|ameliorations/);
    }
    expect(keys.size).toBeGreaterThan(5);
  });
});

describe('texte des énoncés', () => {
  const specs = [...ALGORITHMS, ...SIMULATIONS];

  it.each(specs.map((s) => [s.name, s] as const))('%s rédige ses invariants', (_name, spec) => {
    for (const inv of spec.invariants) {
      // Une phrase, ponctuée, assez longue pour dire quelque chose.
      expect(inv.statement.trim().endsWith('.')).toBe(true);
      expect(inv.statement.length).toBeGreaterThan(25);
      expect(inv.matters.length).toBeGreaterThan(40);
      // Les identifiants restent en kebab-case, sans accent.
      expect(inv.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it.each(specs.map((s) => [s.name, s] as const))('%s rédige ses paramètres', (_name, spec) => {
    for (const p of spec.params) {
      expect(p.label.length).toBeGreaterThan(2);
      expect(p.id).toMatch(/^[a-zA-Z0-9]+$/);
    }
  });
});
