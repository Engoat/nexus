/**
 * Right rail in comparison mode: pick the second algorithm, then read what the
 * two runs actually differ on. Every line comes from comparing the two results,
 * never from an assumption about the two families.
 */

import { ALGORITHMS } from '../../algorithms/registry';
import type { Issue } from '../../algorithms/types';
import type { Trace } from '../../core/trace';
import { compareTraces, type Verdict } from '../compare';
import { blockingSummary, WhyDisabled } from './WhyDisabled';

interface Side {
  readonly name: string;
  readonly trace: Trace<unknown> | null;
}

interface Props {
  readonly a: Side;
  readonly b: Side & { readonly error: string | null };
  readonly selectedB: string;
  onSelectB(id: string): void;
  /** The algorithm already shown on the left. */
  readonly excludeId: string;
  readonly labelOf: (id: string) => string;
  onRun(): void;
  readonly canRun: boolean;
  /** Conditions of the algorithm on the left, so a blocked run says why. */
  readonly issues: readonly Issue[];
}

export function ComparePanel({
  a,
  b,
  selectedB,
  onSelectB,
  excludeId,
  labelOf,
  onRun,
  canRun,
  issues,
}: Props) {
  const verdicts: Verdict[] =
    a.trace && b.trace
      ? compareTraces({ name: a.name, trace: a.trace }, { name: b.name, trace: b.trace }, labelOf)
      : [];

  return (
    <>
      <section className="block">
        <h2 className="block__title">Comparaison</h2>
        <div className="field">
          <label htmlFor="cmp-b">Deuxième algorithme</label>
          <select
            id="cmp-b"
            className="control"
            value={selectedB}
            onChange={(e) => onSelectB(e.target.value)}
          >
            {ALGORITHMS.filter((x) => x.id !== excludeId).map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <span className="field__help">
            Les deux tournent sur le même graphe. Le curseur de lecture avance les deux ;
            celui qui finit le premier reste sur sa dernière étape.
          </span>
        </div>

        <WhyDisabled issues={issues} />

        <div className="btn-row">
          <button
            type="button"
            className="btn btn--accent btn--wide btn--big"
            disabled={!canRun}
            title={blockingSummary(issues)}
            onClick={onRun}
          >
            Exécuter les deux
          </button>
        </div>
      </section>

      {b.error ? (
        <section className="block">
          <h2 className="block__title">{b.name}</h2>
          <p className="issue issue--error">
            <span className="issue__mark">STOP</span>
            <span>
              <b>Cet algorithme ne s'applique pas à ce graphe.</b>
              <em>{b.error}</em>
            </span>
          </p>
        </section>
      ) : null}

      <section className="block">
        <h2 className="block__title">
          Ce qui diffère
          <span className="count">
            {verdicts.length === 0
              ? 'en attente'
              : `${verdicts.filter((v) => v.kind === 'differs').length} écart(s)`}
          </span>
        </h2>

        {verdicts.length === 0 ? (
          <p className="hint">
            Lance les deux exécutions pour comparer les résultats : distances, poids total,
            arêtes retenues, ordre de visite et compteurs communs.
          </p>
        ) : (
          <ul className="verdicts">
            {verdicts.map((v) => (
              <li key={v.label} data-kind={v.kind}>
                <p className="verdicts__label">
                  <span className="verdicts__flag" aria-hidden="true" />
                  {v.label}
                </p>
                <p className="verdicts__detail">{v.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {a.trace && b.trace ? (
        <section className="block">
          <h2 className="block__title">Conclusions de chacun</h2>
          <p className="struct__name">{a.name}</p>
          <ul className="conclusions" style={{ marginBottom: 'var(--sp4)' }}>
            {a.trace.conclusions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          <p className="struct__name">{b.name}</p>
          <ul className="conclusions">
            {b.trace.conclusions.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
