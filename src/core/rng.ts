/**
 * Seeded pseudo-random generator.
 *
 * A simulation whose results change between two runs cannot be checked against
 * anything, so randomness here is reproducible by construction: same seed, same
 * sequence, same trace. Mulberry32 is small, fast and has a long enough period
 * for the sizes this tool handles.
 */

export class Rng {
  private state: number;

  constructor(seed: number) {
    // Any 32-bit state works; keep it away from zero.
    this.state = (Math.floor(seed) || 1) >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Exponential variate of rate `rate`, by inverse transform.
   * Guards against log(0), which would return Infinity and freeze a clock.
   */
  exponential(rate: number): number {
    if (rate <= 0) throw new Error('Rng.exponential : le taux doit être positif');
    const u = 1 - this.next();
    return -Math.log(u <= 0 ? Number.EPSILON : u) / rate;
  }

  /**
   * Erlang-k variate of mean 1/rate: the sum of k exponential stages, each of
   * rate k·rate. Same mean as the exponential, k times less dispersed, which is
   * exactly what makes it useful for teaching where queues come from.
   */
  erlang(k: number, rate: number): number {
    if (k < 1) throw new Error('Rng.erlang : k doit valoir au moins 1');
    let total = 0;
    for (let i = 0; i < k; i += 1) total += this.exponential(k * rate);
    return total;
  }
}
