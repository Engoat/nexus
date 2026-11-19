/**
 * Settings tab of the graph bench.
 *
 * Numbered so a first-time visitor knows where to start: choose, adjust, run.
 * The controls come from `spec.params`, the conditions from `spec.check`, and a
 * blocked run always says what blocks it.
 */

import { byFamily } from '../../algorithms/registry';
import type { AlgorithmSpec, Issue, ParamValue, ParamValues } from '../../algorithms/types';
import type { GraphDocument } from '../../core/graph';
import { IssueList, ParamFields } from './ParamFields';
import { blockingSummary, WhyDisabled } from './WhyDisabled';

interface Props {
  readonly doc: GraphDocument;
  readonly algo: AlgorithmSpec<unknown>;
  onAlgo(id: string): void;
  readonly params: ParamValues;
  onParam(id: string, value: ParamValue): void;
  readonly issues: readonly Issue[];
  readonly hasTrace: boolean;
  readonly runError: string | null;
  onRun(): void;
  onClear(): void;
  onOpenLesson(): void;
}

export function AlgorithmPanel(props: Props) {
  const { doc, algo, onAlgo, params, onParam, issues, hasTrace, runError, onRun, onClear } = props;
  const blocking = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  return (
    <>
      <section className="block">
        <h2 className="block__title">
          <span className="block__step">1</span>
          Choisis un algorithme
        </h2>
        {byFamily().map((group) => (
          <div className="algo-group" key={group.family}>
            <p>{group.family}</p>
            {group.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className="algo"
                aria-pressed={item.id === algo.id}
                onClick={() => onAlgo(item.id)}
              >
                <b>{item.name}</b>
                <span>{item.summary}</span>
              </button>
            ))}
          </div>
        ))}
      </section>

      <section className="block block--tint">
        <h2 className="block__title">Pourquoi ça marche</h2>
        <p className="rationale">{algo.rationale}</p>
        <button
          type="button"
          className="btn btn--wide"
          style={{ marginTop: 'var(--sp3)' }}
          onClick={props.onOpenLesson}
        >
          Lire le cours complet
        </button>
      </section>

      {algo.params.length > 0 ? (
        <section className="block">
          <h2 className="block__title">
            <span className="block__step">2</span>
            Règle les paramètres
          </h2>
          <ParamFields
            params={algo.params}
            values={params}
            onChange={onParam}
            nodes={doc.nodes}
            idPrefix="algo"
          />
        </section>
      ) : null}

      <section className="block">
        <h2 className="block__title">
          <span className="block__step">{algo.params.length > 0 ? 3 : 2}</span>
          Exécute
          <span className="count">
            {blocking.length === 0 ? 'conditions réunies' : `${blocking.length} blocage(s)`}
          </span>
        </h2>

        <WhyDisabled issues={issues} />

        {runError ? (
          <p className="issue issue--error">
            <span className="issue__mark">ERR</span>
            <span>
              <b>L'exécution a échoué.</b>
              <em>{runError}</em>
            </span>
          </p>
        ) : null}

        <div className="btn-row">
          <button
            type="button"
            className="btn btn--accent btn--big"
            style={{ flex: 1 }}
            disabled={blocking.length > 0}
            title={blockingSummary(issues)}
            onClick={onRun}
          >
            Exécuter
          </button>
          <button type="button" className="btn btn--big" disabled={!hasTrace} onClick={onClear}>
            Effacer la trace
          </button>
        </div>

        {warnings.length > 0 ? (
          <div style={{ marginTop: 'var(--sp3)' }}>
            <p className="struct__name">À savoir</p>
            <IssueList issues={warnings} />
          </div>
        ) : null}
      </section>
    </>
  );
}
