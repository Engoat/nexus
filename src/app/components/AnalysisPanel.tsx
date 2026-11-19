/**
 * Right rail, bottom: what the current step is doing.
 *
 * Everything here is read from the trace. No panel recomputes anything, which is
 * why the display can never drift from what the algorithm actually did.
 */

import type { Step, StructureView, Trace } from '../../core/trace';

interface Props {
  readonly trace: Trace<unknown> | null;
  readonly step: Step | null;
  readonly index: number;
}

export function AnalysisPanel({ trace, step, index }: Props) {
  if (!trace || !step) {
    return (
      <section className="block">
        <h2 className="block__title">Exécution</h2>
        <p className="hint">
          Aucune trace. Choisis un algorithme, règle ses paramètres et lance l'exécution :
          chaque étape apparaîtra ici avec la ligne de pseudocode correspondante et l'état
          des structures de données.
        </p>
      </section>
    );
  }

  const metrics = Object.entries(step.metrics);

  return (
    <>
      {/* La seule région qui change à chaque pas : elle est annoncée. */}
      <section className="block" aria-live="polite" aria-atomic="true">
        <h2 className="block__title">
          Étape
          <span className="count">
            {index + 1} / {trace.steps.length}
          </span>
        </h2>
        <div className="step-head">
          <b>{step.action}</b>
        </div>
        <p className="step-detail">{step.detail}</p>
        <p className="sr">
          Étape {index + 1} sur {trace.steps.length}. {step.action}. {step.detail}
          {step.invariants.length > 0
            ? ` Invariants vérifiés : ${step.invariants
                .map((c) => (c.holds ? 'tenu' : 'VIOLÉ'))
                .join(', ')}.`
            : ''}
        </p>
      </section>

      <section className="block">
        <h2 className="block__title">Pseudocode</h2>
        <ol className="pseudo">
          {trace.pseudocode.map((line, i) => (
            <li key={i} data-active={step.line === i + 1}>
              <i aria-hidden="true">{i + 1}</i>
              <span>{line}</span>
            </li>
          ))}
        </ol>
        {step.line === 0 ? (
          <p className="hint" style={{ marginTop: 'var(--sp2)' }}>
            Cette étape se situe hors de la boucle principale.
          </p>
        ) : null}
      </section>

      {step.structures.length > 0 ? (
        <section className="block">
          <h2 className="block__title">Structures de données</h2>
          {step.structures.map((s, i) => (
            <StructureBlock key={`${s.name}-${i}`} view={s} />
          ))}
        </section>
      ) : null}

      {metrics.length > 0 ? (
        <section className="block">
          <h2 className="block__title">Compteurs</h2>
          <div className="metrics">
            {metrics.map(([key, value]) => (
              <div key={key}>
                <b>{value}</b>
                <span>{key}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="block">
        <h2 className="block__title">Complexité</h2>
        <dl className="cx">
          <div>
            <dt>Temps</dt>
            <dd>{trace.complexity.time}</dd>
          </div>
          <div>
            <dt>Espace</dt>
            <dd>{trace.complexity.space}</dd>
          </div>
        </dl>
        {trace.complexity.note ? <p>{trace.complexity.note}</p> : null}
      </section>

      <section className="block">
        <h2 className="block__title">
          Ce que le run établit
          <span className="count">fin d'exécution</span>
        </h2>
        <ul className="conclusions">
          {trace.conclusions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

function StructureBlock({ view }: { readonly view: StructureView }) {
  return (
    <div className="struct">
      <p className="struct__name">{view.name}</p>
      {view.kind === 'sequence' ? (
        view.items.length === 0 ? (
          <p className="cells__empty">vide</p>
        ) : (
          <div className={`cells cells--${view.semantics}`}>
            {view.items.map((item, i) => (
              <span key={`${item}-${i}`}>{item}</span>
            ))}
          </div>
        )
      ) : null}

      {view.kind === 'set' ? (
        view.items.length === 0 ? (
          <p className="cells__empty">vide</p>
        ) : (
          <div className="cells">
            {view.items.map((item, i) => (
              <span key={`${item}-${i}`}>{item}</span>
            ))}
          </div>
        )
      ) : null}

      {view.kind === 'heap' ? (
        view.items.length === 0 ? (
          <p className="cells__empty">vide</p>
        ) : (
          <div className="heap">
            {view.items.map((item, i) => (
              <div key={`${item.value}-${i}`}>
                <b>{item.key}</b>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        )
      ) : null}

      {view.kind === 'table' ? (
        <table className="data">
          <thead>
            <tr>
              {view.columns.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
