/**
 * Invariants.
 *
 * Three states per invariant: not yet evaluated, verified at this point in the
 * run, or violated. A violation is never hidden: it is the most informative
 * thing the panel can show, and on Bellman-Ford it is the expected signal of a
 * negative cycle.
 */

import { invariantReport, type Step, type Trace } from '../../core/trace';

interface Props {
  readonly trace: Trace<unknown>;
  readonly step: Step | null;
}

export function InvariantPanel({ trace, step }: Props) {
  if (trace.invariants.length === 0) return null;

  const report = invariantReport(trace);
  const atThisStep = new Map(step?.invariants.map((c) => [c.id, c]) ?? []);
  const violatedNow = report.filter((r) => r.violations.length > 0).length;

  return (
    <section className="block">
      <h2 className="block__title">
        Invariants
        <span className="count">
          {violatedNow === 0
            ? `${report.length} tenu(s)`
            : `${violatedNow} violé(s)`}
        </span>
      </h2>

      <ul className="inv">
        {report.map((line) => {
          const here = atThisStep.get(line.spec.id);
          const broken = line.violations.length > 0;
          const state = here ? (here.holds ? 'ok' : 'broken') : broken ? 'broken-elsewhere' : 'idle';
          return (
            <li key={line.spec.id} data-state={state}>
              <p className="inv__head">
                <span className="inv__flag" aria-hidden="true" />
                <span className="inv__label">
                  {state === 'ok'
                    ? 'Vérifié à cette étape'
                    : state === 'broken'
                      ? 'VIOLÉ à cette étape'
                      : state === 'broken-elsewhere'
                        ? `Violé à l'étape ${(line.violations[0].step ?? 0) + 1}`
                        : 'Pas encore évalué ici'}
                </span>
                <span className="inv__count">
                  {line.evaluations} contrôle{line.evaluations > 1 ? 's' : ''}
                </span>
              </p>
              <p className="inv__statement">{line.spec.statement}</p>
              {here?.detail ? <p className="inv__detail">{here.detail}</p> : null}
              {!here && broken && line.violations[0].detail ? (
                <p className="inv__detail">{line.violations[0].detail}</p>
              ) : null}
              <p className="inv__matters">{line.spec.matters}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
