/**
 * Event-driven simulation of a single queue, for any pair of laws among
 * exponential, deterministic and Erlang.
 *
 * Nothing is sampled on a fixed time grid: the clock jumps from one event to the
 * next, which is both exact and what makes every step worth showing. Durations
 * are drawn from a seeded generator, so a given seed always produces the same
 * trace.
 *
 * The run drains completely before measuring. That matters: over an interval
 * where the system starts and ends empty, Little's law is an identity rather
 * than an approximation, so it can be checked exactly instead of loosely.
 */

import type { Issue, ParamValues } from '../algorithms/types';
import { asChoice, asNumber } from '../algorithms/types';
import { Rng } from '../core/rng';
import { type InvariantSpec, type StructureView, Tracer } from '../core/trace';
import { type DistKind, DISTRIBUTIONS, kendall, type QueueTheory, solve } from './theory';
import type { SimulationSpec } from './types';

/** One client as the scene renderer needs it. */
export interface Person {
  readonly id: string;
  readonly state: 'waiting' | 'serving' | 'leaving' | 'lost';
  /** Place in the waiting line, 0 being the next one served. */
  readonly rank: number | null;
  /** Desk index while being served. */
  readonly slot: number | null;
  /** Share of the service already done, between 0 and 1. */
  readonly progress: number | null;
  /** How long this client has already waited, at the current clock. */
  readonly waited: number;
}

export interface QueueScene {
  readonly clock: number;
  readonly model: string;
  readonly capacity: number | null;
  readonly full: boolean;
  readonly people: readonly Person[];
  readonly servers: readonly {
    readonly slot: number;
    readonly client: string | null;
    readonly endsAt: number | null;
  }[];
  readonly queueLength: number;
  readonly arrivals: number;
  readonly lost: number;
  readonly served: number;
  readonly L: number;
  readonly Lq: number;
  readonly rho: number;
  readonly nextArrival: number | null;
  readonly highlight: 'start' | 'arrival' | 'queued' | 'loss' | 'departure' | 'end';
}

export interface QueueMeasures {
  readonly L: number;
  readonly Lq: number;
  readonly W: number;
  readonly Wq: number;
  readonly rho: number;
  readonly blocking: number;
}

export interface QueueResult {
  readonly model: string;
  readonly arrivals: number;
  readonly admitted: number;
  readonly lost: number;
  readonly served: number;
  readonly horizon: number;
  readonly maxQueue: number;
  readonly empirical: QueueMeasures;
  readonly theory: QueueTheory;
}

const PSEUDO = [
  'échéancier ← { première arrivée }',
  "tant que l'échéancier n'est pas vide :",
  '    e ← événement de date minimale ; horloge ← date(e)',
  '    si e est une arrivée :',
  '        si un serveur est libre : début de service',
  '        sinon si la file a de la place : mise en file',
  '        sinon : client perdu',
  "        planifier l'arrivée suivante tant que l'horizon n'est pas atteint",
  '    si e est une fin de service :',
  '        libérer le serveur ; si la file est non vide : servir le suivant',
] as const;

const INVARIANTS: readonly InvariantSpec[] = [
  {
    id: 'q-split',
    statement:
      'Le nombre de clients dans le système vaut toujours ceux en file plus ceux en service.',
    matters:
      "C'est la comptabilité de base du modèle. Si elle dérive, toutes les moyennes " +
      'calculées ensuite sont fausses sans que rien ne le signale.',
  },
  {
    id: 'q-calendar',
    statement: "L'échéancier ne contient que des dates postérieures ou égales à l'horloge.",
    matters:
      'Un événement daté dans le passé voudrait dire que la simulation a sauté quelque chose, ' +
      'et le temps simulé ne serait plus ordonné.',
  },
  {
    id: 'q-capacity',
    statement: 'Le nombre de clients présents ne dépasse jamais la capacité du système.',
    matters:
      'La capacité est une contrainte physique : la dépasser ferait disparaître les pertes ' +
      'que le modèle est censé mesurer.',
  },
  {
    id: 'q-fifo',
    statement: "La file est servie dans l'ordre d'arrivée : le plus ancien passe le premier.",
    matters:
      "Avec une autre discipline, le temps d'attente moyen peut rester le même alors que " +
      'sa dispersion explose. Les formules utilisées ici supposent cet ordre.',
  },
  {
    id: 'q-little',
    statement:
      'Sur un système qui commence et finit vide, la loi de Little est exacte : L = λ_eff × W.',
    matters:
      "Ce n'est pas une approximation ici mais une identité comptable : l'aire sous la courbe " +
      'du nombre de clients égale la somme des temps de séjour. Un écart signale un bug de mesure.',
  },
] as const;

interface ServerSlot {
  client: number | null;
  startedAt: number;
  endsAt: number;
}

interface ClientRecord {
  readonly id: number;
  readonly arrivedAt: number;
  startedAt: number | null;
  leftAt: number | null;
  lost: boolean;
}

interface CalendarEntry {
  readonly key: string;
  readonly kind: 'arrival' | 'departure';
  readonly at: number;
  readonly server: number;
  readonly label: string;
}

const fmt = (v: number, digits = 2): string => (Number.isFinite(v) ? v.toFixed(digits) : '∞');

const DIST_OPTIONS = (['M', 'D', 'E2', 'E4'] as const).map((kind) => ({
  value: kind,
  label: `${DISTRIBUTIONS[kind].letter} — ${DISTRIBUTIONS[kind].name}`,
}));

/** Draws one duration of mean 1/rate from the chosen law. */
function draw(rng: Rng, kind: DistKind, rate: number): number {
  switch (kind) {
    case 'M':
      return rng.exponential(rate);
    case 'D':
      return 1 / rate;
    case 'E2':
      return rng.erlang(2, rate);
    case 'E4':
      return rng.erlang(4, rate);
  }
}

export const queueSim: SimulationSpec<QueueResult> = {
  id: 'queue',
  name: "File d'attente",
  summary: 'Arrivées, attente, service, départs. Un événement après l\'autre.',
  rationale:
    "Un seul guichet, une seule file, et deux lois à choisir : celle des arrivées et celle " +
    'des services. La notation de Kendall résume le tout. Changer une lettre change le ' +
    "comportement du système sans toucher ni aux taux ni au nombre de serveurs : c'est la " +
    'variabilité, et non la moyenne, qui fabrique les files.',
  params: [
    {
      kind: 'choice',
      id: 'arrival',
      label: 'Loi des arrivées',
      options: DIST_OPTIONS,
      default: 'M',
      help: 'La première lettre de la notation de Kendall.',
    },
    {
      kind: 'choice',
      id: 'service',
      label: 'Loi des services',
      options: DIST_OPTIONS,
      default: 'M',
      help: 'La deuxième lettre.',
    },
    {
      kind: 'number',
      id: 'lambda',
      label: "Taux d'arrivée λ",
      min: 0.1,
      max: 10,
      step: 0.1,
      default: 0.8,
      help: 'Nombre moyen de clients qui arrivent par unité de temps.',
    },
    {
      kind: 'number',
      id: 'mu',
      label: 'Taux de service μ',
      min: 0.1,
      max: 10,
      step: 0.1,
      default: 1,
      help: "Nombre moyen de clients qu'un serveur traite par unité de temps.",
    },
    { kind: 'number', id: 'servers', label: 'Serveurs c', min: 1, max: 8, step: 1, default: 1 },
    {
      kind: 'number',
      id: 'capacity',
      label: 'Capacité K',
      min: 0,
      max: 30,
      step: 1,
      default: 0,
      help: '0 signifie illimitée. Sinon, un client qui arrive sur un système plein est perdu.',
    },
    {
      kind: 'number',
      id: 'clients',
      label: 'Clients à simuler',
      min: 5,
      max: 300,
      step: 5,
      default: 30,
      help: 'Plus de clients rapproche les mesures de la théorie, et allonge la trace.',
    },
    {
      kind: 'number',
      id: 'seed',
      label: 'Graine aléatoire',
      min: 1,
      max: 9999,
      step: 1,
      default: 7,
      help: 'Même graine, même simulation. Changer la graine donne un autre échantillon.',
    },
  ],
  invariants: INVARIANTS,

  check(params): Issue[] {
    const issues: Issue[] = [];
    const arrival = asChoice(params, 'arrival', 'M') as DistKind;
    const service = asChoice(params, 'service', 'M') as DistKind;
    const lambda = asNumber(params, 'lambda', 0.8);
    const mu = asNumber(params, 'mu', 1);
    const c = Math.max(1, Math.floor(asNumber(params, 'servers', 1)));
    const rawCapacity = Math.floor(asNumber(params, 'capacity', 0));
    const capacity = rawCapacity === 0 ? null : Math.max(c, rawCapacity);
    const clients = Math.floor(asNumber(params, 'clients', 30));
    const rho = lambda / (c * mu);
    const model = kendall(arrival, service, c, capacity);

    if (capacity === null && rho >= 1) {
      issues.push({
        level: 'error',
        message:
          `Dans un ${model}, la charge par serveur vaut ${rho.toFixed(2)}, donc au moins 1 : ` +
          "la file grandit sans limite et il n'existe aucun régime stationnaire.",
        fix: 'Augmente μ, ajoute un serveur, baisse λ, ou fixe une capacité K finie.',
      });
    }
    if (rawCapacity > 0 && rawCapacity < c) {
      issues.push({
        level: 'warning',
        message: `La capacité ${rawCapacity} est inférieure au nombre de serveurs ${c}.`,
        fix: `Elle sera relevée à ${c}, sinon des serveurs resteraient inutilisables.`,
      });
    }
    if (rho >= 0.95 && capacity === null) {
      issues.push({
        level: 'warning',
        message: `Charge ${rho.toFixed(2)} très proche de 1 : la convergence vers la théorie est lente.`,
        fix: 'Simule davantage de clients pour que les moyennes se stabilisent.',
      });
    }

    const theory = solve(arrival, service, lambda, mu, c, capacity);
    if (!theory.available) {
      issues.push({
        level: 'warning',
        message: `Aucune formule exacte connue pour un ${model}.`,
        fix: 'La simulation reste juste, mais elle sera affichée sans valeur de référence.',
      });
    } else if (!theory.exact) {
      issues.push({
        level: 'warning',
        message: `Les valeurs théoriques d'un ${model} sont une approximation, pas un résultat exact.`,
        fix: "Un écart de quelques pourcents avec la simulation ne veut pas dire qu'il y a une erreur.",
      });
    }
    if (arrival === 'D' && service === 'D' && capacity === null && rho < 1) {
      issues.push({
        level: 'warning',
        message: 'Tout est régulier : aucune file ne se formera jamais.',
        fix: "Ce n'est pas un bug, c'est le résultat. Repasse les arrivées en M pour voir la file apparaître.",
      });
    }
    if (clients > 150) {
      issues.push({
        level: 'warning',
        message: `${clients} clients produiront environ ${clients * 2} étapes.`,
      });
    }
    return issues;
  },

  run(params: ParamValues) {
    const arrival = asChoice(params, 'arrival', 'M') as DistKind;
    const service = asChoice(params, 'service', 'M') as DistKind;
    const lambda = asNumber(params, 'lambda', 0.8);
    const mu = asNumber(params, 'mu', 1);
    const c = Math.max(1, Math.floor(asNumber(params, 'servers', 1)));
    const rawCapacity = Math.floor(asNumber(params, 'capacity', 0));
    const capacity = rawCapacity === 0 ? null : Math.max(c, rawCapacity);
    const horizonClients = Math.floor(asNumber(params, 'clients', 30));
    const seed = Math.floor(asNumber(params, 'seed', 7));
    const model = kendall(arrival, service, c, capacity);

    const rng = new Rng(seed);
    const t = new Tracer(INVARIANTS);

    const servers: ServerSlot[] = Array.from({ length: c }, () => ({
      client: null,
      startedAt: 0,
      endsAt: 0,
    }));
    const queue: number[] = [];
    const clients: ClientRecord[] = [];

    let clock = 0;
    let lastClock = 0;
    let area = 0;
    let areaQueue = 0;
    let busyTime = 0;
    let arrivals = 0;
    let lost = 0;
    let maxQueue = 0;
    let nextArrival: number | null = draw(rng, arrival, lambda);

    const busyCount = () => servers.filter((s) => s.client !== null).length;
    const inSystem = () => queue.length + busyCount();
    const name = (id: number) => `C${id}`;
    const record = (id: number) => clients.find((x) => x.id === id);

    const calendar = (): CalendarEntry[] => {
      const entries: CalendarEntry[] = [];
      if (nextArrival !== null) {
        entries.push({
          key: 'arrival',
          kind: 'arrival',
          at: nextArrival,
          server: -1,
          label: 'arrivée',
        });
      }
      servers.forEach((s, i) => {
        if (s.client === null) return;
        entries.push({
          key: `dep-${i}`,
          kind: 'departure',
          at: s.endsAt,
          server: i,
          label: `fin de service, guichet ${i + 1} (${name(s.client)})`,
        });
      });
      // Earliest first; a departure wins a tie so a server frees up before the
      // next arrival is handled. Deterministic, and documented as a convention.
      return entries.sort((a, b) =>
        a.at !== b.at
          ? a.at - b.at
          : a.kind === b.kind
            ? a.key.localeCompare(b.key)
            : a.kind === 'departure'
              ? -1
              : 1,
      );
    };

    const measures = (): QueueMeasures => {
      const span = clock > 0 ? clock : 1;
      const left = clients.filter((x) => x.leftAt !== null);
      const sojourn = left.reduce((sum, x) => sum + ((x.leftAt as number) - x.arrivedAt), 0);
      const started = clients.filter((x) => x.startedAt !== null);
      const waiting = started.reduce((sum, x) => sum + ((x.startedAt as number) - x.arrivedAt), 0);
      return {
        L: area / span,
        Lq: areaQueue / span,
        W: left.length > 0 ? sojourn / left.length : 0,
        Wq: started.length > 0 ? waiting / started.length : 0,
        rho: busyTime / (c * span),
        blocking: arrivals > 0 ? lost / arrivals : 0,
      };
    };

    const people = (transient?: { id: number; state: 'leaving' | 'lost' }): Person[] => {
      const out: Person[] = [];
      queue.forEach((id, rank) => {
        out.push({
          id: name(id),
          state: 'waiting',
          rank,
          slot: null,
          progress: null,
          waited: clock - (record(id)?.arrivedAt ?? clock),
        });
      });
      servers.forEach((s, slot) => {
        if (s.client === null) return;
        const span = s.endsAt - s.startedAt;
        out.push({
          id: name(s.client),
          state: 'serving',
          rank: null,
          slot,
          progress: span > 0 ? Math.min(1, Math.max(0, (clock - s.startedAt) / span)) : 0,
          waited: (record(s.client)?.startedAt ?? clock) - (record(s.client)?.arrivedAt ?? clock),
        });
      });
      if (transient) {
        const r = record(transient.id);
        out.push({
          id: name(transient.id),
          state: transient.state,
          rank: null,
          slot: null,
          progress: null,
          waited: r ? ((r.startedAt ?? clock) - r.arrivedAt) : 0,
        });
      }
      return out;
    };

    const scene = (
      highlight: QueueScene['highlight'],
      transient?: { id: number; state: 'leaving' | 'lost' },
    ): QueueScene => {
      const m = measures();
      return {
        clock,
        model,
        capacity,
        full: capacity !== null && inSystem() >= capacity,
        people: people(transient),
        servers: servers.map((s, i) => ({
          slot: i,
          client: s.client === null ? null : name(s.client),
          endsAt: s.client === null ? null : s.endsAt,
        })),
        queueLength: queue.length,
        arrivals,
        lost,
        served: clients.filter((x) => x.leftAt !== null).length,
        L: m.L,
        Lq: m.Lq,
        rho: m.rho,
        nextArrival,
        highlight,
      };
    };

    const view = (): StructureView[] => {
      const m = measures();
      return [
        {
          kind: 'sequence',
          name: `File d'attente (${queue.length})`,
          semantics: 'queue',
          items: queue.map(name),
        },
        {
          kind: 'table',
          name: 'Guichets',
          columns: ['guichet', 'client', 'fin de service'],
          rows: servers.map((s, i) => [
            `#${i + 1}`,
            s.client === null ? 'libre' : name(s.client),
            s.client === null ? '—' : fmt(s.endsAt),
          ]),
        },
        {
          kind: 'table',
          name: 'Échéancier',
          columns: ['événement', 'date'],
          rows: calendar().map((e) => [e.label, fmt(e.at)]),
        },
        {
          kind: 'table',
          name: 'Mesures courantes',
          columns: ['grandeur', 'valeur'],
          rows: [
            ['horloge', fmt(clock)],
            ['arrivés', arrivals],
            ['perdus', lost],
            ['servis', clients.filter((x) => x.leftAt !== null).length],
            ['L (dans le système)', fmt(m.L)],
            ['Lq (en file)', fmt(m.Lq)],
            ['W (séjour)', fmt(m.W)],
            ['Wq (attente)', fmt(m.Wq)],
            ['ρ (occupation)', fmt(m.rho)],
          ],
        },
      ];
    };

    const startService = (clientId: number, at: number): number => {
      const slot = servers.findIndex((s) => s.client === null);
      const duration = draw(rng, service, mu);
      servers[slot] = { client: clientId, startedAt: at, endsAt: at + duration };
      const r = record(clientId);
      if (r) r.startedAt = at;
      t.count('services commencés');
      return slot;
    };

    const checkInvariants = () => {
      t.hold(
        'q-split',
        inSystem() === queue.length + busyCount(),
        `${inSystem()} présent(s) = ${queue.length} en file + ${busyCount()} en service`,
      );
      const entries = calendar();
      const sorted = entries.every((e, i) => i === 0 || entries[i - 1].at <= e.at);
      const future = entries.every((e) => e.at >= clock - 1e-9);
      t.hold(
        'q-calendar',
        sorted && future,
        `${entries.length} événement(s) en attente, horloge à ${fmt(clock)}`,
      );
      t.hold(
        'q-capacity',
        capacity === null || inSystem() <= capacity,
        capacity === null ? 'capacité illimitée' : `${inSystem()} ≤ ${capacity}`,
      );
      // The queue must stay sorted by arrival date.
      const dates = queue.map((id) => record(id)?.arrivedAt ?? 0);
      t.hold(
        'q-fifo',
        dates.every((d, i) => i === 0 || dates[i - 1] <= d),
        queue.length === 0 ? 'file vide' : `file : ${queue.map(name).join(', ')}`,
      );
    };

    /* ------------------------------------------------ run */

    checkInvariants();
    t.emit({
      line: 1,
      action: 'Système vide',
      detail:
        `${model} avec λ=${lambda} et μ=${mu}. Arrivées ${DISTRIBUTIONS[arrival].name}, ` +
        `services ${DISTRIBUTIONS[service].name}. ` +
        `Première arrivée prévue à ${fmt(nextArrival as number)}.`,
      structures: view(),
      scene: scene('start'),
    });

    for (;;) {
      const entries = calendar();
      if (entries.length === 0) break;
      const event = entries[0];

      if (entries.length > 1) {
        t.ask({
          prompt: 'Quel sera le prochain événement ?',
          kind: 'choice',
          answer: event.key,
          among: entries.map((e) => ({ value: e.key, label: `${e.label} — ${fmt(e.at)}` })),
          because:
            `La simulation saute toujours à la date la plus proche, ici ${fmt(event.at)} : ` +
            `${event.label}.`,
        });
      }

      // Time-weighted accumulation over the interval that just elapsed, using
      // the state as it was before this event.
      clock = event.at;
      const elapsed = clock - lastClock;
      area += inSystem() * elapsed;
      areaQueue += queue.length * elapsed;
      busyTime += busyCount() * elapsed;
      lastClock = clock;

      if (event.kind === 'arrival') {
        arrivals += 1;
        const id = arrivals;
        t.count('arrivées');
        clients.push({ id, arrivedAt: clock, startedAt: null, leftAt: null, lost: false });

        const full = capacity !== null && inSystem() >= capacity;
        if (full) {
          const r = record(id);
          if (r) r.lost = true;
          lost += 1;
          t.count('pertes');
          checkInvariants();
          t.emit({
            line: 7,
            action: `${name(id)} perdu`,
            detail:
              `${name(id)} arrive à ${fmt(clock)} sur un système plein ` +
              `(${inSystem()} présents pour une capacité de ${capacity}). Il repart sans être servi.`,
            structures: view(),
            scene: scene('loss', { id, state: 'lost' }),
          });
        } else if (busyCount() < c) {
          const slot = startService(id, clock);
          checkInvariants();
          t.emit({
            line: 5,
            action: `${name(id)} servi`,
            detail:
              `${name(id)} arrive à ${fmt(clock)} et trouve le guichet ${slot + 1} libre. ` +
              `Service immédiat, fin prévue à ${fmt(servers[slot].endsAt)}, aucune attente.`,
            structures: view(),
            scene: scene('arrival'),
          });
        } else {
          queue.push(id);
          maxQueue = Math.max(maxQueue, queue.length);
          checkInvariants();
          t.emit({
            line: 6,
            action: `${name(id)} en file`,
            detail:
              `${name(id)} arrive à ${fmt(clock)}, les ${c} guichet(s) sont occupés. ` +
              `Il prend la place ${queue.length} dans la file.`,
            structures: view(),
            scene: scene('queued'),
          });
        }

        nextArrival = arrivals < horizonClients ? clock + draw(rng, arrival, lambda) : null;
        continue;
      }

      // departure
      const slot = servers[event.server];
      const leaving = slot.client as number;
      const r = record(leaving);
      if (r) r.leftAt = clock;
      servers[event.server] = { client: null, startedAt: 0, endsAt: 0 };
      t.count('départs');

      if (queue.length > 0) {
        const nextClient = queue.shift() as number;
        const startedSlot = startService(nextClient, clock);
        const waited = clock - (record(nextClient)?.arrivedAt ?? clock);
        checkInvariants();
        t.emit({
          line: 10,
          action: `${name(leaving)} part`,
          detail:
            `${name(leaving)} quitte le guichet ${event.server + 1} à ${fmt(clock)}. ` +
            `${name(nextClient)} prend sa place au guichet ${startedSlot + 1} ` +
            `après ${fmt(waited)} d'attente.`,
          structures: view(),
          scene: scene('departure', { id: leaving, state: 'leaving' }),
        });
      } else {
        checkInvariants();
        t.emit({
          line: 10,
          action: `${name(leaving)} part`,
          detail:
            `${name(leaving)} quitte le guichet ${event.server + 1} à ${fmt(clock)}. ` +
            'La file est vide, le guichet reste libre.',
          structures: view(),
          scene: scene('departure', { id: leaving, state: 'leaving' }),
        });
      }
    }

    /* ------------------------------------------------ results */

    const empirical = measures();
    const theory = solve(arrival, service, lambda, mu, c, capacity);
    const served = clients.filter((x) => x.leftAt !== null).length;
    const lambdaEffective = clock > 0 ? served / clock : 0;

    const little = lambdaEffective * empirical.W;
    t.hold(
      'q-little',
      Math.abs(little - empirical.L) <= 1e-9 * Math.max(1, empirical.L),
      `L = ${empirical.L.toFixed(6)}, λ_eff × W = ${little.toFixed(6)}`,
    );
    t.emit({
      line: 0,
      action: 'Fin de simulation',
      detail:
        `${arrivals} client(s) arrivé(s), ${served} servi(s), ${lost} perdu(s) ` +
        `sur ${fmt(clock)} unités de temps. Le système est vide, les mesures sont closes.`,
      structures: view(),
      scene: scene('end'),
    });

    const gap = (sim: number, th: number) =>
      Number.isFinite(th) && th !== 0 ? `${(((sim - th) / th) * 100).toFixed(1)} %` : '—';

    const conclusions: string[] = [
      `${model} : charge par serveur ρ = ${theory.rho.toFixed(3)}, ` +
        `occupation mesurée ${empirical.rho.toFixed(3)}.`,
      `File la plus longue observée : ${maxQueue} client(s).`,
    ];

    if (theory.available) {
      const kind = theory.exact ? 'théorie exacte' : 'approximation';
      conclusions.push(
        `Clients dans le système : ${empirical.L.toFixed(3)} mesuré contre ` +
          `${fmt(theory.L, 3)} en ${kind} (écart ${gap(empirical.L, theory.L)}).`,
        `Temps de séjour : ${empirical.W.toFixed(3)} mesuré contre ${fmt(theory.W, 3)} ` +
          `en ${kind} (écart ${gap(empirical.W, theory.W)}).`,
        `Attente avant service : ${empirical.Wq.toFixed(3)} mesuré contre ` +
          `${fmt(theory.Wq, 3)} en ${kind}.`,
      );
      if (capacity !== null && theory.exact) {
        conclusions.push(
          `Pertes : ${(empirical.blocking * 100).toFixed(1)} % mesuré contre ` +
            `${(theory.blocking * 100).toFixed(1)} % en théorie.`,
        );
      }
    } else {
      conclusions.push(
        `Aucune valeur de référence : ${theory.method} ` +
          'Les mesures ci-dessus restent exactes pour cette simulation.',
      );
    }

    conclusions.push(
      `La loi de Little tient à ${Math.abs(little - empirical.L).toExponential(1)} près, ` +
        "ce qui est de l'ordre de l'erreur d'arrondi : c'est une identité sur cet intervalle, " +
        'pas une coïncidence.',
      `Un échantillon de ${arrivals} client(s) explique l'écart résiduel. Augmente le nombre ` +
        'de clients, ou change la graine, pour voir les mesures bouger autour des valeurs visées.',
    );

    return t.build<QueueResult>({
      algorithmId: 'queue',
      pseudocode: PSEUDO,
      complexity: {
        time: 'O(n · c)',
        space: 'O(n + c)',
        note:
          "n événements traités, chacun demandant de relire l'échéancier : " +
          'un tas le ramènerait à O(n log c), inutile aux tailles visées ici.',
      },
      conclusions,
      result: {
        model,
        arrivals,
        admitted: arrivals - lost,
        lost,
        served,
        horizon: clock,
        maxQueue,
        empirical,
        theory,
      },
    });
  },
};
