/**
 * Left rail of the queue bench: the model in Kendall notation, the two laws
 * explained, the parameters, and the analytical reference the simulation will be
 * compared against.
 *
 * The reference says how it was obtained and whether it is exact. A number whose
 * status is unknown teaches nothing.
 */

import type { Issue, ParamValue, ParamValues } from '../../algorithms/types';
import { asChoice, asNumber } from '../../algorithms/types';
import { type DistKind, DISTRIBUTIONS, kendall, solve } from '../../sim/theory';
import type { SimulationSpec } from '../../sim/types';
import { IssueList, ParamFields } from './ParamFields';
import { blockingSummary, WhyDisabled } from './WhyDisabled';

interface Props {
  readonly sim: SimulationSpec<unknown>;
  readonly params: ParamValues;
  onParam(id: string, value: ParamValue): void;
  readonly issues: readonly Issue[];
  readonly hasTrace: boolean;
  readonly runError: string | null;
  onRun(): void;
  onClear(): void;
  onOpenLesson(): void;
}

const fmt = (v: number, d = 3) => (Number.isFinite(v) ? v.toFixed(d) : '∞');

export function SimulationPanel(props: Props) {
  const { sim, params, onParam, issues, hasTrace, runError, onRun, onClear } = props;
  const blocking = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  const arrival = asChoice(params, 'arrival', 'M') as DistKind;
  const service = asChoice(params, 'service', 'M') as DistKind;
  const lambda = asNumber(params, 'lambda', 0.8);
  const mu = asNumber(params, 'mu', 1);
  const servers = Math.max(1, Math.floor(asNumber(params, 'servers', 1)));
  const rawCapacity = Math.floor(asNumber(params, 'capacity', 0));
  const capacity = rawCapacity === 0 ? null : Math.max(servers, rawCapacity);
  const model = kendall(arrival, service, servers, capacity);
  const theory = solve(arrival, service, lambda, mu, servers, capacity);

  return (
    <>
      <section className="block">
        <h2 className="block__title">
          <span className="block__step">1</span>
          Le modèle
          <span className="count">notation de Kendall</span>
        </h2>

        <p className="kendall">
          <span className="kendall__code">{model}</span>
        </p>
        <dl className="kendall__legend">
          <div>
            <dt>{DISTRIBUTIONS[arrival].letter}</dt>
            <dd>
              arrivées <strong>{DISTRIBUTIONS[arrival].name}</strong>
              <em>{DISTRIBUTIONS[arrival].explain}</em>
            </dd>
          </div>
          <div>
            <dt>{DISTRIBUTIONS[service].letter}</dt>
            <dd>
              services <strong>{DISTRIBUTIONS[service].name}</strong>
              <em>{DISTRIBUTIONS[service].explain}</em>
            </dd>
          </div>
          <div>
            <dt>{servers}</dt>
            <dd>
              {servers === 1 ? 'un seul guichet' : `${servers} guichets en parallèle`}
              <em>Une seule file commune, servie par le premier guichet libre.</em>
            </dd>
          </div>
          <div>
            <dt>{capacity === null ? '∞' : capacity}</dt>
            <dd>
              {capacity === null ? 'capacité illimitée' : `au plus ${capacity} clients présents`}
              <em>
                {capacity === null
                  ? 'Personne n\'est jamais refusé : la file peut grandir sans limite.'
                  : 'Un client qui arrive sur un système plein repart sans être servi.'}
              </em>
            </dd>
          </div>
        </dl>

        <button
          type="button"
          className="btn btn--wide"
          style={{ marginTop: 'var(--sp3)' }}
          onClick={props.onOpenLesson}
        >
          Lire le cours sur les files
        </button>
      </section>

      <section className="block">
        <h2 className="block__title">
          <span className="block__step">2</span>
          Règle le système
        </h2>
        <ParamFields params={sim.params} values={params} onChange={onParam} idPrefix="sim" />
      </section>

      <section className="block block--tint">
        <h2 className="block__title">
          Ce que dit la théorie
          <span className="count">
            {!theory.available ? 'indisponible' : theory.exact ? 'exact' : 'approché'}
          </span>
        </h2>

        {!theory.available ? (
          <p className="lesson__warn">{theory.method}</p>
        ) : !theory.stable ? (
          <p className="lesson__warn">
            Charge ρ = {theory.rho.toFixed(2)} : aucun régime stationnaire. {theory.method}
          </p>
        ) : (
          <>
            <table className="data">
              <tbody>
                <tr>
                  <th scope="row">ρ par guichet</th>
                  <td>{fmt(theory.rho)}</td>
                </tr>
                <tr>
                  <th scope="row">L</th>
                  <td>{fmt(theory.L)}</td>
                </tr>
                <tr>
                  <th scope="row">Lq</th>
                  <td>{fmt(theory.Lq)}</td>
                </tr>
                <tr>
                  <th scope="row">W</th>
                  <td>{fmt(theory.W)}</td>
                </tr>
                <tr>
                  <th scope="row">Wq</th>
                  <td>{fmt(theory.Wq)}</td>
                </tr>
                {Number.isFinite(theory.p0) ? (
                  <tr>
                    <th scope="row">système vide</th>
                    <td>{fmt(theory.p0)}</td>
                  </tr>
                ) : null}
                {capacity !== null && theory.exact ? (
                  <tr>
                    <th scope="row">pertes</th>
                    <td>{fmt(theory.blocking)}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <p className="field__help" style={{ marginTop: 'var(--sp2)' }}>
              {theory.method}
            </p>
          </>
        )}
      </section>

      <section className="block">
        <h2 className="block__title">
          <span className="block__step">3</span>
          Simule
          <span className="count">
            {blocking.length === 0 ? 'conditions réunies' : `${blocking.length} blocage(s)`}
          </span>
        </h2>

        <WhyDisabled issues={issues} />

        {runError ? (
          <p className="issue issue--error">
            <span className="issue__mark">ERR</span>
            <span>
              <b>La simulation a échoué.</b>
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
            Simuler
          </button>
          <button type="button" className="btn btn--big" disabled={!hasTrace} onClick={onClear}>
            Effacer
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
