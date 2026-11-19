/**
 * Comparing two runs.
 *
 * Only states what it actually computed from the two results. No claim of
 * equivalence is made on the basis of two algorithms having the same family:
 * either the numbers were compared, or nothing is said.
 */

import type { Trace } from '../core/trace';

export interface Verdict {
  readonly label: string;
  readonly detail: string;
  /** 'same' and 'differs' are both findings; 'info' is neither. */
  readonly kind: 'same' | 'differs' | 'info';
}

type Dict = Record<string, unknown>;

const asDict = (v: unknown): Dict | null =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Dict) : null;

const numberMap = (v: unknown): Record<string, number> | null => {
  const d = asDict(v);
  if (!d) return null;
  const out: Record<string, number> = {};
  for (const [k, value] of Object.entries(d)) {
    if (typeof value !== 'number') return null;
    out[k] = value;
  }
  return out;
};

const stringList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null;

export function compareTraces(
  a: { name: string; trace: Trace<unknown> },
  b: { name: string; trace: Trace<unknown> },
  labelOf: (id: string) => string,
): Verdict[] {
  const out: Verdict[] = [];

  out.push({
    kind: 'info',
    label: 'Nombre d\'étapes',
    detail:
      `${a.name} : ${a.trace.steps.length} étapes. ${b.name} : ${b.trace.steps.length}. ` +
      "Le compte dépend du grain de la trace, pas seulement du travail effectué, " +
      'il ne mesure donc pas une performance.',
  });

  const ra = asDict(a.trace.result);
  const rb = asDict(b.trace.result);
  if (!ra || !rb) return out;

  /* ---------------- distances ---------------- */
  const da = numberMap(ra.dist);
  const db = numberMap(rb.dist);
  if (da && db) {
    const keys = [...new Set([...Object.keys(da), ...Object.keys(db)])];
    const diff = keys.filter((k) => (da[k] ?? Infinity) !== (db[k] ?? Infinity));
    out.push(
      diff.length === 0
        ? {
            kind: 'same',
            label: 'Distances',
            detail: `Identiques sur les ${keys.length} sommets. Les deux algorithmes trouvent le même optimum.`,
          }
        : {
            kind: 'differs',
            label: 'Distances',
            detail:
              `Écart sur ${diff.length} sommet(s) : ` +
              diff
                .slice(0, 6)
                .map((k) => `${labelOf(k)} (${fmt(da[k])} contre ${fmt(db[k])})`)
                .join(', ') +
              (diff.length > 6 ? '…' : '') +
              '. Un seul des deux peut avoir raison : vérifie les hypothèses de chacun.',
          },
    );
  }

  /* ---------------- spanning tree weight ---------------- */
  if (typeof ra.totalWeight === 'number' && typeof rb.totalWeight === 'number') {
    const same = ra.totalWeight === rb.totalWeight;
    out.push({
      kind: same ? 'same' : 'differs',
      label: 'Poids total',
      detail: same
        ? `${ra.totalWeight} des deux côtés. Deux chemins différents vers le même optimum, ` +
          "ce qui est attendu : l'arbre couvrant minimal est unique en poids, pas en forme."
        : `${ra.totalWeight} contre ${rb.totalWeight}. Sur un graphe connexe, cet écart ` +
          "signalerait une erreur ; sur un graphe non connexe, il vient du périmètre couvert.",
    });
  }

  /* ---------------- retained edges ---------------- */
  const ea = stringList(ra.treeEdges);
  const eb = stringList(rb.treeEdges);
  if (ea && eb) {
    const sa = new Set(ea);
    const sb = new Set(eb);
    const only = [...sa].filter((x) => !sb.has(x)).length + [...sb].filter((x) => !sa.has(x)).length;
    out.push({
      kind: only === 0 ? 'same' : 'differs',
      label: 'Arêtes retenues',
      detail:
        only === 0
          ? `Les mêmes ${sa.size} arêtes.`
          : `${only} arête(s) ne figurent que d'un côté, pour ${sa.size} et ${sb.size} retenues. ` +
            'Des arbres de forme différente peuvent être tous deux minimaux.',
    });
  }

  /* ---------------- visiting order ---------------- */
  const oa = stringList(ra.order) ?? stringList(ra.discoveryOrder) ?? stringList(ra.settledOrder);
  const ob = stringList(rb.order) ?? stringList(rb.discoveryOrder) ?? stringList(rb.settledOrder);
  if (oa && ob) {
    const sameSet =
      oa.length === ob.length && new Set(oa).size === new Set([...oa, ...ob]).size;
    const sameSequence = oa.length === ob.length && oa.every((x, i) => x === ob[i]);
    out.push({
      kind: sameSequence ? 'same' : 'differs',
      label: 'Ordre de visite',
      detail: sameSequence
        ? `Identique : ${oa.map(labelOf).join(' → ')}.`
        : `${a.name} : ${oa.map(labelOf).join(' → ')}. ` +
          `${b.name} : ${ob.map(labelOf).join(' → ')}.` +
          (sameSet ? ' Mêmes sommets, ordre différent.' : ' Les ensembles visités diffèrent aussi.'),
    });
  }

  /* ---------------- shared counters ---------------- */
  const ma = a.trace.steps.at(-1)?.metrics ?? {};
  const mb = b.trace.steps.at(-1)?.metrics ?? {};
  const shared = Object.keys(ma).filter((k) => k in mb);
  if (shared.length > 0) {
    out.push({
      kind: 'info',
      label: 'Compteurs communs',
      detail: shared
        .map((k) => `${k} : ${ma[k]} contre ${mb[k]}`)
        .join(' · ')
        .concat('. Ces compteurs comptent du travail réel, pas des étapes d\'affichage.'),
    });
  }

  return out;
}

function fmt(v: number | undefined): string {
  if (v === undefined) return '—';
  return Number.isFinite(v) ? String(v) : '∞';
}
