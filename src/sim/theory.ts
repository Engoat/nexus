/**
 * Analytical results for queueing models.
 *
 * Four routes, chosen by the pair of distributions, and each result says which
 * route produced it:
 *
 *  - M/M/c/K  → birth-death chain, solved numerically. Exact, any c, any K.
 *  - M/G/1    → Pollaczek-Khinchine. Exact for any service distribution.
 *  - D/D/c    → deterministic reasoning. Exact, and nobody ever waits.
 *  - the rest → Allen-Cunneen, an approximation, and it is labelled as such.
 *
 * When no usable formula exists (finite capacity with a non-exponential law),
 * the result says so instead of returning a plausible number. A wrong reference
 * value is worse than no reference value.
 */

export type DistKind = 'M' | 'D' | 'E2' | 'E4';

export interface DistInfo {
  readonly kind: DistKind;
  /** Kendall letter. */
  readonly letter: string;
  readonly name: string;
  /** Squared coefficient of variation: the spread of the law, relative to its mean. */
  readonly cv2: number;
  readonly explain: string;
}

export const DISTRIBUTIONS: Record<DistKind, DistInfo> = {
  M: {
    kind: 'M',
    letter: 'M',
    name: 'exponentielle (Markov)',
    cv2: 1,
    explain:
      'Durées très variables, sans mémoire : le temps déjà écoulé ne dit rien du temps restant. ' +
      "C'est le modèle de référence pour des arrivées indépendantes.",
  },
  D: {
    kind: 'D',
    letter: 'D',
    name: 'déterministe',
    cv2: 0,
    explain:
      'Toujours la même durée, sans aucun hasard. Un tapis roulant, un feu de circulation, ' +
      'une machine qui prend exactement trois minutes par pièce.',
  },
  E2: {
    kind: 'E2',
    letter: 'E₂',
    name: 'Erlang-2',
    cv2: 0.5,
    explain:
      "Somme de deux étapes exponentielles. Moitié moins dispersée que l'exponentielle : " +
      'un service en deux phases obligatoires, par exemple.',
  },
  E4: {
    kind: 'E4',
    letter: 'E₄',
    name: 'Erlang-4',
    cv2: 0.25,
    explain:
      'Somme de quatre étapes exponentielles. Proche du déterministe tout en gardant du hasard.',
  },
};

export interface QueueTheory {
  /** Kendall notation of the model solved. */
  readonly model: string;
  /** True when the formulas are exact for this model. */
  readonly exact: boolean;
  /** False when no usable formula exists: the numbers below are then unusable. */
  readonly available: boolean;
  /** How the result was obtained, phrased for a reader. */
  readonly method: string;
  /** Offered load λ/μ. */
  readonly offered: number;
  /** Utilisation per server, λ/(c·μ). */
  readonly rho: number;
  /** False when the queue grows without bound. */
  readonly stable: boolean;
  readonly p0: number;
  /** Probability an arriving client is turned away. */
  readonly blocking: number;
  readonly lambdaEffective: number;
  readonly L: number;
  readonly Lq: number;
  readonly W: number;
  readonly Wq: number;
  /** p(n) for n = 0…K, or truncated. Empty when not computed. */
  readonly distribution: readonly number[];
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i += 1) f *= i;
  return f;
}

const UNAVAILABLE = (model: string, why: string, offered: number, rho: number): QueueTheory => ({
  model,
  exact: false,
  available: false,
  method: why,
  offered,
  rho,
  stable: rho < 1,
  p0: 0,
  blocking: 0,
  lambdaEffective: 0,
  L: Number.NaN,
  Lq: Number.NaN,
  W: Number.NaN,
  Wq: Number.NaN,
  distribution: [],
});

const UNSTABLE = (model: string, offered: number, rho: number, method: string): QueueTheory => ({
  model,
  exact: true,
  available: true,
  method,
  offered,
  rho,
  stable: false,
  p0: 0,
  blocking: 0,
  lambdaEffective: 0,
  L: Number.POSITIVE_INFINITY,
  Lq: Number.POSITIVE_INFINITY,
  W: Number.POSITIVE_INFINITY,
  Wq: Number.POSITIVE_INFINITY,
  distribution: [],
});

/** M/M/c/K by the birth-death chain. Exact. */
export function mmck(
  lambda: number,
  mu: number,
  servers: number,
  capacity: number | null,
): QueueTheory {
  if (lambda <= 0 || mu <= 0 || servers < 1) {
    throw new Error('mmck : λ et μ doivent être positifs et c au moins 1');
  }
  const c = Math.floor(servers);
  const a = lambda / mu;
  const rho = a / c;
  const model = kendall('M', 'M', c, capacity);
  const weight = (n: number): number =>
    n <= c ? a ** n / factorial(n) : (a ** c / factorial(c)) * (a / c) ** (n - c);

  if (capacity === null) {
    if (rho >= 1) {
      return UNSTABLE(
        model,
        a,
        rho,
        'Chaîne de naissance et de mort : aucune loi stationnaire quand la charge atteint 1.',
      );
    }
    let head = 0;
    for (let n = 0; n < c; n += 1) head += a ** n / factorial(n);
    const tail = (a ** c / factorial(c)) * (1 / (1 - rho));
    const p0 = 1 / (head + tail);
    const Lq = (p0 * a ** c * rho) / (factorial(c) * (1 - rho) ** 2);
    const Wq = Lq / lambda;
    const W = Wq + 1 / mu;
    const L = lambda * W;

    const distribution: number[] = [];
    for (let n = 0; n <= 400; n += 1) {
      const p = p0 * weight(n);
      distribution.push(p);
      if (n > c && p < 1e-12) break;
    }
    return {
      model,
      exact: true,
      available: true,
      method:
        'Chaîne de naissance et de mort résolue exactement, puis loi de Little pour les temps.',
      offered: a,
      rho,
      stable: true,
      p0,
      blocking: 0,
      lambdaEffective: lambda,
      L,
      Lq,
      W,
      Wq,
      distribution,
    };
  }

  const K = Math.max(c, Math.floor(capacity));
  const weights: number[] = [];
  let total = 0;
  for (let n = 0; n <= K; n += 1) {
    const w = weight(n);
    weights.push(w);
    total += w;
  }
  const distribution = weights.map((w) => w / total);
  const p0 = distribution[0];
  const blocking = distribution[K];
  const lambdaEffective = lambda * (1 - blocking);

  let L = 0;
  let Lq = 0;
  for (let n = 0; n <= K; n += 1) {
    L += n * distribution[n];
    Lq += Math.max(0, n - c) * distribution[n];
  }
  const W = lambdaEffective > 0 ? L / lambdaEffective : 0;
  const Wq = lambdaEffective > 0 ? Lq / lambdaEffective : 0;

  return {
    model,
    exact: true,
    available: true,
    method:
      'Chaîne de naissance et de mort tronquée à K états, normalisée, puis loi de Little. ' +
      'Une capacité finie reste stable même au-delà de la charge 1 : le surplus est perdu.',
    offered: a,
    rho,
    stable: true,
    p0,
    blocking,
    lambdaEffective,
    L,
    Lq,
    W,
    Wq,
    distribution,
  };
}

/** M/G/1 by Pollaczek-Khinchine. Exact for any service law. */
export function mg1(lambda: number, mu: number, serviceCv2: number, model: string): QueueTheory {
  const rho = lambda / mu;
  if (rho >= 1) {
    return UNSTABLE(model, rho, rho, 'Formule de Pollaczek-Khinchine : définie seulement sous charge 1.');
  }
  const Lq = (rho ** 2 * (1 + serviceCv2)) / (2 * (1 - rho));
  const Wq = Lq / lambda;
  const W = Wq + 1 / mu;
  const L = lambda * W;
  return {
    model,
    exact: true,
    available: true,
    method:
      'Formule de Pollaczek-Khinchine, exacte pour une arrivée poissonienne et un service ' +
      "de loi quelconque. Seules la moyenne et la variance du service comptent.",
    offered: rho,
    rho,
    stable: true,
    p0: 1 - rho,
    blocking: 0,
    lambdaEffective: lambda,
    L,
    Lq,
    W,
    Wq,
    distribution: [],
  };
}

/** D/D/c : everything is regular, so a queue never forms below saturation. */
export function ddc(lambda: number, mu: number, servers: number, model: string): QueueTheory {
  const c = Math.floor(servers);
  const rho = lambda / (c * mu);
  if (rho >= 1) {
    return UNSTABLE(
      model,
      lambda / mu,
      rho,
      'Tout est régulier : dès que les arrivées dépassent la capacité de service, ' +
        'la file croît indéfiniment et de façon parfaitement prévisible.',
    );
  }
  const W = 1 / mu;
  const L = lambda * W;
  return {
    model,
    exact: true,
    available: true,
    method:
      'Raisonnement déterministe : les arrivées sont espacées de 1/λ et chaque service dure ' +
      '1/μ. Sous saturation, un serveur est toujours libre à l\'instant où un client arrive, ' +
      'donc personne n\'attend jamais.',
    offered: lambda / mu,
    rho,
    stable: true,
    p0: 1 - rho,
    blocking: 0,
    lambdaEffective: lambda,
    L,
    Lq: 0,
    W,
    Wq: 0,
    distribution: [],
  };
}

/** G/G/c by Allen-Cunneen. Approximation, and says so. */
export function ggc(
  lambda: number,
  mu: number,
  servers: number,
  arrivalCv2: number,
  serviceCv2: number,
  model: string,
): QueueTheory {
  const c = Math.floor(servers);
  const rho = lambda / (c * mu);
  if (rho >= 1) {
    return UNSTABLE(model, lambda / mu, rho, 'Approximation de Allen-Cunneen, valable sous charge 1.');
  }
  // Waiting time of the equivalent M/M/c, scaled by the variability of the two laws.
  const reference = mmck(lambda, mu, c, null);
  const Wq = reference.Wq * ((arrivalCv2 + serviceCv2) / 2);
  const Lq = lambda * Wq;
  const W = Wq + 1 / mu;
  const L = lambda * W;
  return {
    model,
    exact: false,
    available: true,
    method:
      "Approximation de Allen-Cunneen : on part de l'attente exacte du M/M/c de mêmes taux, " +
      'puis on la corrige par la variabilité des deux lois. Exacte quand les deux lois sont ' +
      'exponentielles, approchée sinon, et d\'autant plus fiable que la charge est forte.',
    offered: lambda / mu,
    rho,
    stable: true,
    p0: Number.NaN,
    blocking: 0,
    lambdaEffective: lambda,
    L,
    Lq,
    W,
    Wq,
    distribution: [],
  };
}

/**
 * Picks the right route for a pair of distributions.
 */
export function solve(
  arrival: DistKind,
  service: DistKind,
  lambda: number,
  mu: number,
  servers: number,
  capacity: number | null,
): QueueTheory {
  const c = Math.max(1, Math.floor(servers));
  const model = kendall(arrival, service, c, capacity);
  const a = DISTRIBUTIONS[arrival];
  const s = DISTRIBUTIONS[service];

  if (arrival === 'M' && service === 'M') return mmck(lambda, mu, c, capacity);

  if (capacity !== null) {
    return UNAVAILABLE(
      model,
      'Aucune formule exploitable pour une capacité finie avec une loi non exponentielle. ' +
        'La simulation reste valable, mais elle est sans point de comparaison analytique.',
      lambda / mu,
      lambda / (c * mu),
    );
  }

  if (arrival === 'D' && service === 'D') return ddc(lambda, mu, c, model);
  if (arrival === 'M' && c === 1) return mg1(lambda, mu, s.cv2, model);

  return ggc(lambda, mu, c, a.cv2, s.cv2, model);
}

/** Kendall notation: arrivée / service / serveurs / capacité. */
export function kendall(
  arrival: DistKind,
  service: DistKind,
  servers: number,
  capacity: number | null,
): string {
  const c = Math.floor(servers);
  const head = `${DISTRIBUTIONS[arrival].letter}/${DISTRIBUTIONS[service].letter}/${c}`;
  return capacity === null ? head : `${head}/${Math.max(c, Math.floor(capacity))}`;
}
