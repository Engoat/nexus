/**
 * Queueing: the analytical solutions, then the simulator against them.
 *
 * The strongest tests here are identities: Little's law must hold exactly on a
 * drained run, the finite-capacity chain must agree with the closed forms when
 * the capacity is large, and M/D/1 must show exactly half the waiting of M/M/1.
 * Each would catch an algebra slip that eyeballing a chart would not.
 */

import { describe, expect, it } from 'vitest';

import { invariantReport } from '../src/core/trace';
import { queueSim } from '../src/sim/queueSim';
import { DISTRIBUTIONS, kendall, mmck, solve } from '../src/sim/theory';

describe('notation de Kendall', () => {
  it('nomme les modèles', () => {
    expect(kendall('M', 'M', 1, null)).toBe('M/M/1');
    expect(kendall('M', 'M', 3, null)).toBe('M/M/3');
    expect(kendall('M', 'M', 2, 5)).toBe('M/M/2/5');
    expect(kendall('M', 'D', 1, null)).toBe('M/D/1');
    expect(kendall('D', 'D', 1, null)).toBe('D/D/1');
    expect(kendall('E2', 'M', 1, null)).toBe('E₂/M/1');
    // Une capacité inférieure au nombre de serveurs est relevée.
    expect(kendall('M', 'M', 4, 2)).toBe('M/M/4/4');
  });

  it('décrit chaque loi par sa dispersion', () => {
    expect(DISTRIBUTIONS.M.cv2).toBe(1);
    expect(DISTRIBUTIONS.D.cv2).toBe(0);
    expect(DISTRIBUTIONS.E2.cv2).toBe(0.5);
    expect(DISTRIBUTIONS.E4.cv2).toBe(0.25);
    for (const d of Object.values(DISTRIBUTIONS)) {
      expect(d.explain.length).toBeGreaterThan(40);
    }
  });
});

describe('théorie M/M/c/K', () => {
  it('retrouve les formules connues de M/M/1', () => {
    // λ=0.5, μ=1 : ρ=0.5, L=1, Lq=0.5, W=2, Wq=1.
    const r = mmck(0.5, 1, 1, null);
    expect(r.rho).toBeCloseTo(0.5, 10);
    expect(r.L).toBeCloseTo(1, 10);
    expect(r.Lq).toBeCloseTo(0.5, 10);
    expect(r.W).toBeCloseTo(2, 10);
    expect(r.Wq).toBeCloseTo(1, 10);
    expect(r.p0).toBeCloseTo(0.5, 10);
    expect(r.exact).toBe(true);
    expect(r.available).toBe(true);
  });

  it('déclare instable un M/M/1 saturé plutôt que de rendre un nombre', () => {
    const r = mmck(1.2, 1, 1, null);
    expect(r.stable).toBe(false);
    expect(r.L).toBe(Number.POSITIVE_INFINITY);
  });

  it('accepte une charge supérieure à 1 quand la capacité est finie', () => {
    const r = mmck(2, 1, 1, 5);
    expect(r.stable).toBe(true);
    expect(r.blocking).toBeGreaterThan(0);
    expect(r.L).toBeLessThanOrEqual(5);
  });

  it('a une distribution de probabilités normalisée', () => {
    for (const [l, m, c, k] of [
      [0.8, 1, 1, null],
      [2.5, 1, 3, null],
      [2, 1, 2, 6],
      [5, 1, 1, 3],
    ] as const) {
      const r = mmck(l, m, c, k);
      const total = r.distribution.reduce((s, p) => s + p, 0);
      expect(total).toBeCloseTo(1, 8);
      expect(r.distribution.every((p) => p >= 0)).toBe(true);
    }
  });

  it('vérifie la loi de Little', () => {
    for (const [l, m, c, k] of [
      [0.8, 1, 1, null],
      [2.5, 1, 3, null],
      [2, 1, 2, 8],
    ] as const) {
      const r = mmck(l, m, c, k);
      expect(r.L).toBeCloseTo(r.lambdaEffective * r.W, 8);
      expect(r.Lq).toBeCloseTo(r.lambdaEffective * r.Wq, 8);
    }
  });

  it('fait coïncider la chaîne finie et les formules fermées pour K grand', () => {
    const closed = mmck(2.5, 1, 3, null);
    const finite = mmck(2.5, 1, 3, 400);
    expect(finite.L).toBeCloseTo(closed.L, 6);
    expect(finite.W).toBeCloseTo(closed.W, 6);
    expect(finite.Lq).toBeCloseTo(closed.Lq, 6);
    expect(finite.blocking).toBeLessThan(1e-9);
  });

  it("ajouter un serveur réduit l'attente", () => {
    expect(mmck(1.8, 1, 3, null).Wq).toBeLessThan(mmck(1.8, 1, 2, null).Wq);
  });
});

describe('autres modèles', () => {
  it('M/D/1 attend exactement deux fois moins que M/M/1', () => {
    const mm1 = solve('M', 'M', 0.8, 1, 1, null);
    const md1 = solve('M', 'D', 0.8, 1, 1, null);
    expect(md1.model).toBe('M/D/1');
    expect(md1.exact).toBe(true);
    expect(md1.Lq).toBeCloseTo(mm1.Lq / 2, 10);
    expect(md1.Wq).toBeCloseTo(mm1.Wq / 2, 10);
  });

  it('M/E₂/1 se place entre les deux', () => {
    const mm1 = solve('M', 'M', 0.8, 1, 1, null);
    const me1 = solve('M', 'E2', 0.8, 1, 1, null);
    const md1 = solve('M', 'D', 0.8, 1, 1, null);
    expect(me1.Wq).toBeLessThan(mm1.Wq);
    expect(me1.Wq).toBeGreaterThan(md1.Wq);
    // Pollaczek-Khinchine : le facteur est (1 + Cs²)/2.
    expect(me1.Lq).toBeCloseTo((mm1.Lq * (1 + 0.5)) / 2, 10);
  });

  it('M/M/1 par Pollaczek-Khinchine redonne la chaîne de naissance et de mort', () => {
    // Même modèle par deux routes : les deux doivent concorder.
    const chain = mmck(0.7, 1, 1, null);
    const pk = solve('M', 'M', 0.7, 1, 1, null);
    expect(pk.L).toBeCloseTo(chain.L, 10);
  });

  it('D/D/1 ne fait jamais attendre personne', () => {
    const dd1 = solve('D', 'D', 0.8, 1, 1, null);
    expect(dd1.model).toBe('D/D/1');
    expect(dd1.exact).toBe(true);
    expect(dd1.Wq).toBe(0);
    expect(dd1.Lq).toBe(0);
    expect(dd1.W).toBeCloseTo(1, 10);
    expect(dd1.L).toBeCloseTo(0.8, 10);
  });

  it('D/D/1 saturé est déclaré instable', () => {
    expect(solve('D', 'D', 1.5, 1, 1, null).stable).toBe(false);
  });

  it('marque les cas sans formule exacte comme approchés', () => {
    const e2m = solve('E2', 'M', 0.8, 1, 1, null);
    expect(e2m.available).toBe(true);
    expect(e2m.exact).toBe(false);
    expect(e2m.method).toMatch(/Allen-Cunneen/);
    // Des arrivées plus régulières font moins attendre qu'en M/M/1.
    expect(e2m.Wq).toBeLessThan(solve('M', 'M', 0.8, 1, 1, null).Wq);
  });

  it('refuse de donner un chiffre quand aucune formule ne vaut', () => {
    const r = solve('M', 'D', 0.8, 1, 1, 6);
    expect(r.available).toBe(false);
    expect(Number.isNaN(r.L)).toBe(true);
    expect(r.method).toMatch(/Aucune formule/);
  });

  it("l'approximation reste exacte quand les deux lois sont exponentielles", () => {
    // Allen-Cunneen appliqué à M/M/c doit redonner le résultat exact.
    const approx = solve('M', 'M', 2.5, 1, 3, null);
    const exact = mmck(2.5, 1, 3, null);
    expect(approx.Wq).toBeCloseTo(exact.Wq, 10);
  });
});

const BASE = {
  arrival: 'M',
  service: 'M',
  lambda: 0.8,
  mu: 1,
  servers: 1,
  capacity: 0,
  clients: 60,
  seed: 7,
};

describe('simulation événementielle', () => {
  it('produit une trace et vide le système à la fin', () => {
    const trace = queueSim.run(BASE);
    expect(trace.steps.length).toBeGreaterThan(50);
    expect(trace.result.served).toBe(trace.result.admitted);
    expect(trace.result.arrivals).toBe(60);
    expect(trace.result.model).toBe('M/M/1');
  });

  it('maintient tous ses invariants, loi de Little comprise', () => {
    const trace = queueSim.run(BASE);
    for (const line of invariantReport(trace)) {
      expect(line.evaluations, `jamais évalué : ${line.spec.id}`).toBeGreaterThan(0);
      expect(line.violations, `violé : ${line.spec.id}`).toEqual([]);
    }
  });

  it('est reproductible à graine égale, et différente sinon', () => {
    const a = queueSim.run(BASE);
    const b = queueSim.run(BASE);
    const c = queueSim.run({ ...BASE, seed: 8 });
    expect(b.result.horizon).toBe(a.result.horizon);
    expect(JSON.stringify(b.steps)).toBe(JSON.stringify(a.steps));
    expect(c.result.horizon).not.toBe(a.result.horizon);
  });

  it('ne perd aucun client quand la capacité est illimitée', () => {
    const trace = queueSim.run(BASE);
    expect(trace.result.lost).toBe(0);
    expect(trace.result.empirical.blocking).toBe(0);
  });

  it('perd des clients quand la capacité est petite et la charge forte', () => {
    const trace = queueSim.run({ ...BASE, lambda: 3, capacity: 3, clients: 80 });
    expect(trace.result.lost).toBeGreaterThan(0);
    expect(trace.result.empirical.blocking).toBeGreaterThan(0);
    for (const line of invariantReport(trace)) {
      expect(line.violations).toEqual([]);
    }
  });

  it('approche la théorie quand on simule beaucoup de clients', () => {
    const trace = queueSim.run({ ...BASE, clients: 300, seed: 12345 });
    const { empirical, theory } = trace.result;
    expect(empirical.L).toBeGreaterThan(theory.L * 0.5);
    expect(empirical.L).toBeLessThan(theory.L * 1.8);
    expect(empirical.rho).toBeGreaterThan(theory.rho * 0.6);
    expect(empirical.rho).toBeLessThan(theory.rho * 1.4);
  });

  it('occupe moins chaque serveur quand on en ajoute', () => {
    const one = queueSim.run({ ...BASE, lambda: 1.6, servers: 2, clients: 120 });
    const two = queueSim.run({ ...BASE, lambda: 1.6, servers: 4, clients: 120 });
    expect(two.result.empirical.rho).toBeLessThan(one.result.empirical.rho);
    expect(two.result.empirical.Wq).toBeLessThan(one.result.empirical.Wq);
  });

  it('ne fait jamais la queue en D/D/1 sous saturation', () => {
    const trace = queueSim.run({ ...BASE, arrival: 'D', service: 'D', clients: 40 });
    expect(trace.result.model).toBe('D/D/1');
    expect(trace.result.maxQueue).toBe(0);
    expect(trace.result.empirical.Wq).toBeCloseTo(0, 9);
  });

  it('fait moins attendre avec un service régulier, à taux égaux', () => {
    const mm = queueSim.run({ ...BASE, clients: 200, seed: 99 });
    const md = queueSim.run({ ...BASE, service: 'D', clients: 200, seed: 99 });
    expect(md.result.model).toBe('M/D/1');
    // Même λ, même μ : seule la régularité du service change.
    expect(md.result.empirical.Wq).toBeLessThan(mm.result.empirical.Wq);
  });

  it('respecte le modèle choisi dans la trace comme dans le résultat', () => {
    const trace = queueSim.run({ ...BASE, arrival: 'E2', service: 'D', capacity: 4 });
    expect(trace.result.model).toBe('E₂/D/1/4');
    expect(trace.steps[0].detail).toContain('E₂/D/1/4');
  });

  it('refuse un système instable au lieu de simuler sans fin', () => {
    const issues = queueSim.check({ ...BASE, lambda: 2 });
    expect(issues.some((i) => i.level === 'error' && /stationnaire/.test(i.message))).toBe(true);
  });

  it('accepte la même charge dès que la capacité est bornée', () => {
    const issues = queueSim.check({ ...BASE, lambda: 2, capacity: 6 });
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('prévient quand la capacité est inférieure au nombre de serveurs', () => {
    const issues = queueSim.check({ ...BASE, servers: 4, capacity: 2 });
    expect(issues.some((i) => i.level === 'warning' && /serveurs/.test(i.message))).toBe(true);
  });

  it('prévient quand la théorie est une approximation', () => {
    const issues = queueSim.check({ ...BASE, arrival: 'E2' });
    expect(issues.some((i) => /approximation/.test(i.message))).toBe(true);
  });

  it("prévient qu'aucune formule n'existe pour le modèle choisi", () => {
    const issues = queueSim.check({ ...BASE, service: 'D', capacity: 5 });
    expect(issues.some((i) => /Aucune formule exacte/.test(i.message))).toBe(true);
  });

  it('prévient que D/D ne fera jamais de file', () => {
    const issues = queueSim.check({ ...BASE, arrival: 'D', service: 'D' });
    expect(issues.some((i) => /aucune file ne se formera/.test(i.message))).toBe(true);
  });

  it('pose des questions dont la réponse est dans les propositions', () => {
    const trace = queueSim.run(BASE);
    const asked = trace.steps.filter((s) => s.ask !== null);
    expect(asked.length).toBeGreaterThan(10);
    for (const step of asked) {
      const ask = step.ask;
      if (!ask) continue;
      expect(ask.among.map((o) => o.value)).toContain(ask.answer);
      expect(ask.among.length).toBeGreaterThan(1);
    }
  });

  it('pointe toujours une ligne de pseudocode qui existe', () => {
    const trace = queueSim.run(BASE);
    for (const step of trace.steps) {
      expect(step.line).toBeLessThanOrEqual(trace.pseudocode.length);
      expect(step.line).toBeGreaterThanOrEqual(0);
    }
  });

  it('produit une trace sérialisable', () => {
    const trace = queueSim.run(BASE);
    const round = JSON.parse(JSON.stringify(trace));
    expect(round.steps.length).toBe(trace.steps.length);
  });
});

describe('scène à afficher', () => {
  type Scene = {
    people: { id: string; state: string; rank: number | null; slot: number | null }[];
    servers: { client: string | null }[];
    queueLength: number;
    model: string;
  };

  const scenes = (params: Record<string, unknown>): Scene[] =>
    queueSim
      .run(params as never)
      .steps.map((s) => s.scene as Scene)
      .filter((s): s is Scene => Boolean(s));

  it('accompagne chaque étape', () => {
    const trace = queueSim.run(BASE);
    expect(trace.steps.every((s) => s.scene !== null)).toBe(true);
  });

  it('place chaque personne dans un seul état cohérent', () => {
    for (const scene of scenes(BASE)) {
      for (const person of scene.people) {
        if (person.state === 'waiting') {
          expect(person.rank).not.toBeNull();
          expect(person.slot).toBeNull();
        }
        if (person.state === 'serving') {
          expect(person.slot).not.toBeNull();
          expect(person.rank).toBeNull();
        }
      }
    }
  });

  it('fait correspondre les gens et les guichets', () => {
    for (const scene of scenes(BASE)) {
      const waiting = scene.people.filter((p) => p.state === 'waiting');
      const serving = scene.people.filter((p) => p.state === 'serving');
      const busy = scene.servers.filter((s) => s.client !== null);
      expect(waiting.length).toBe(scene.queueLength);
      expect(serving.length).toBe(busy.length);
    }
  });

  it('numérote la file sans trou, le prochain servi en premier', () => {
    for (const scene of scenes({ ...BASE, lambda: 2.5, capacity: 0, clients: 40, mu: 1, servers: 1 })) {
      const ranks = scene.people
        .filter((p) => p.state === 'waiting')
        .map((p) => p.rank as number)
        .sort((a, b) => a - b);
      ranks.forEach((rank, i) => expect(rank).toBe(i));
    }
  });

  it('montre le client refusé au moment du refus', () => {
    const withLoss = scenes({ ...BASE, lambda: 3, capacity: 2, clients: 40 });
    expect(withLoss.some((s) => s.people.some((p) => p.state === 'lost'))).toBe(true);
  });

  it('montre le client qui part au moment du départ', () => {
    expect(scenes(BASE).some((s) => s.people.some((p) => p.state === 'leaving'))).toBe(true);
  });
});
