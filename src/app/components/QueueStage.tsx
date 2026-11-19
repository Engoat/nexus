/**
 * The queue bench, drawn as a counter with people.
 *
 * Reads the typed `scene` carried by each step. Each client keeps its own DOM
 * node across steps, so CSS transitions do the walking: a client slides from the
 * door to the line, steps forward as the line advances, moves to a desk, then
 * leaves through the exit. Nothing here recomputes a number.
 */

import type { Person, QueueScene } from '../../sim/queueSim';
import type { Step } from '../../core/trace';

function isScene(value: unknown): value is QueueScene {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Partial<QueueScene>;
  return Array.isArray(s.people) && Array.isArray(s.servers) && typeof s.clock === 'number';
}

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '∞');

/** Where a client stands, in percentages of the scene. */
function placeOf(person: Person, serverCount: number): { left: number; top: number } {
  switch (person.state) {
    case 'waiting': {
      const rank = person.rank ?? 0;
      return { left: Math.max(9, 44 - rank * 6.4), top: 58 };
    }
    case 'serving': {
      const slot = person.slot ?? 0;
      const spread = 15;
      const first = 50 - ((serverCount - 1) * spread) / 2;
      return { left: 64, top: first + slot * spread };
    }
    case 'leaving':
      return { left: 93, top: 58 };
    case 'lost':
      return { left: 26, top: 90 };
  }
}

/** A client, drawn rather than written. */
function Figure({ person }: { readonly person: Person }) {
  const label = person.id;
  return (
    <svg viewBox="0 0 34 52" aria-hidden="true" className="figure">
      <g className="figure__body">
        {/* tête */}
        <circle cx="17" cy="11" r="8" className="figure__head" />
        {/* buste */}
        <path d="M6 44 C6 30 10 21 17 21 C24 21 28 30 28 44 Z" className="figure__torso" />
        {/* jambes */}
        <rect x="12" y="43" width="3.6" height="9" rx="1.6" className="figure__leg" />
        <rect x="18.4" y="43" width="3.6" height="9" rx="1.6" className="figure__leg" />
      </g>
      <text x="17" y="12.6" className="figure__tag">
        {label.replace('C', '')}
      </text>
    </svg>
  );
}

export function QueueStage({ step }: { readonly step: Step | null }) {
  if (!step || !isScene(step.scene)) {
    return (
      <div className="empty">
        <h2>Aucune simulation</h2>
        <p>
          Choisis les deux lois, règle les taux dans le panneau de gauche, puis lance la
          simulation. Chaque événement devient une étape : une arrivée, une mise en file, un
          début de service, un départ.
        </p>
      </div>
    );
  }

  const scene = step.scene;
  const serverCount = scene.servers.length;
  const busy = scene.servers.filter((s) => s.client !== null).length;
  const servingProgress = new Map(
    scene.people.filter((p) => p.state === 'serving').map((p) => [p.slot, p.progress ?? 0]),
  );

  return (
    <div className="qstage" data-highlight={scene.highlight}>
      <header className="qstage__top">
        <span className="qstage__model">{scene.model}</span>
        <span className="qstage__clock">
          <em>horloge</em>
          <b>{fmt(scene.clock)}</b>
        </span>
        <span className="qstage__counters">
          <span>
            <b>{scene.arrivals}</b> arrivé{scene.arrivals > 1 ? 's' : ''}
          </span>
          <span>
            <b>{scene.served}</b> servi{scene.served > 1 ? 's' : ''}
          </span>
          {scene.capacity !== null ? (
            <span data-warn={scene.lost > 0}>
              <b>{scene.lost}</b> perdu{scene.lost > 1 ? 's' : ''}
            </span>
          ) : null}
        </span>
        <span className="qstage__cap">
          {scene.capacity === null ? 'capacité illimitée' : `capacité ${scene.capacity}`}
        </span>
        {scene.full ? <span className="qstage__full">complet</span> : null}
      </header>

      <div className="qscene">
        {/* --- décor --- */}
        <div className="qscene__floor" aria-hidden="true" />

        <div className="qscene__door" aria-hidden="true">
          <span className="qscene__doorframe" />
          <span className="qscene__label">entrée</span>
          {scene.nextArrival !== null ? (
            <span className="qscene__next">suivant à {fmt(scene.nextArrival)}</span>
          ) : (
            <span className="qscene__next">plus d'arrivée prévue</span>
          )}
        </div>

        <div className="qscene__rope" aria-hidden="true">
          <span className="qscene__post" />
          <span className="qscene__line" />
          <span className="qscene__post" />
        </div>

        <p className="qscene__queuelabel" aria-hidden="true">
          file d'attente · <b>{scene.queueLength}</b>
        </p>

        {/* --- guichets --- */}
        <div
          className="qscene__desks"
          style={{ ['--count' as string]: String(serverCount) }}
          role="group"
          aria-label={`${serverCount} guichet(s), ${busy} occupé(s)`}
        >
          {scene.servers.map((server) => (
            <div key={server.slot} className="desk" data-busy={server.client !== null}>
              <span className="desk__no">{server.slot + 1}</span>
              <span className="desk__state">
                {server.client === null ? 'libre' : server.client}
              </span>
              {server.client !== null ? (
                <>
                  <span className="desk__bar">
                    <span
                      className="desk__fill"
                      style={{ width: `${(servingProgress.get(server.slot) ?? 0) * 100}%` }}
                    />
                  </span>
                  <span className="desk__until">fin {fmt(server.endsAt ?? 0)}</span>
                </>
              ) : (
                <span className="desk__until">en attente de client</span>
              )}
            </div>
          ))}
        </div>

        <div className="qscene__exit" aria-hidden="true">
          <span className="qscene__label">sortie</span>
        </div>

        {/* --- les gens --- */}
        {scene.people.map((person) => {
          const place = placeOf(person, serverCount);
          return (
            <div
              key={person.id}
              className="qperson"
              data-state={person.state}
              style={{ left: `${place.left}%`, top: `${place.top}%` }}
              title={
                person.state === 'waiting'
                  ? `${person.id}, attend depuis ${fmt(person.waited)}`
                  : person.state === 'serving'
                    ? `${person.id}, en service`
                    : person.state === 'lost'
                      ? `${person.id}, refusé`
                      : `${person.id}, servi`
              }
            >
              <Figure person={person} />
              {person.state === 'waiting' && person.waited > 0 ? (
                <span className="qperson__wait">{fmt(person.waited, 1)}</span>
              ) : null}
              {person.state === 'lost' ? <span className="qperson__cross">refusé</span> : null}
            </div>
          );
        })}
      </div>

      <footer className="qstage__bottom">
        <div className="gauge">
          <b>{fmt(scene.L)}</b>
          <span>clients dans le système · L</span>
          <i style={{ width: `${Math.min(100, scene.L * 14)}%` }} data-tone="all" />
        </div>
        <div className="gauge">
          <b>{fmt(scene.Lq)}</b>
          <span>clients en file · Lq</span>
          <i style={{ width: `${Math.min(100, scene.Lq * 14)}%` }} data-tone="queue" />
        </div>
        <div className="gauge">
          <b>{fmt(scene.rho * 100, 0)} %</b>
          <span>occupation des guichets · ρ</span>
          <i style={{ width: `${Math.min(100, scene.rho * 100)}%` }} data-tone="busy" />
        </div>
      </footer>

      <ul className="qlegend" aria-label="Légende">
        <li data-state="waiting">attend</li>
        <li data-state="serving">en service</li>
        <li data-state="leaving">servi, part</li>
        <li data-state="lost">refusé</li>
      </ul>
    </div>
  );
}
