/**
 * Playback bar.
 *
 * The timeline is one bar per step, tinted by the nature of the decision. Over a
 * whole run it reads as a shape: discovery phases, settling phases, rejections.
 * Clicking a bar jumps straight to that step.
 *
 * Every disabled control says why it is disabled, both in its tooltip and in
 * plain text next to it.
 */

import type { Step } from '../../core/trace';
import { SPEEDS, type Speed } from '../state/useRunner';

type Kind = 'neutral' | 'discover' | 'settle' | 'reject' | 'keep' | 'result';

/**
 * Classifies a step from its action label. The algorithms stay free of display
 * concerns, so the mapping lives here.
 */
function kindOf(step: Step): Kind {
  const a = step.action.toLowerCase();
  if (/découvre|libère|améliore|chemin \d|passe \d|en file|servi/.test(a)) return 'discover';
  if (/fixe|termine|sort |part/.test(a)) return 'settle';
  if (/rejette|ignore|périmé|déjà|attend|arc arrière|arc avant|arc transverse|perdu/.test(a)) {
    return 'reject';
  }
  if (/retient/.test(a)) return 'keep';
  if (/reconstruit|coupe|cycle négatif|flot =|arbre complet|blocage|fin de/.test(a)) return 'result';
  return 'neutral';
}

interface Props {
  readonly steps: readonly Step[] | null;
  readonly index: number;
  readonly playing: boolean;
  readonly speed: Speed;
  /** True while a question waits for an answer: moving forward is suspended. */
  readonly blocked?: boolean;
  /** Why there is nothing to play, when there is no trace. */
  readonly emptyReason?: string;
  /** Question mode lives here: it changes how one steps through a trace. */
  readonly quizOn: boolean;
  onToggleQuiz(): void;
  onToggle(): void;
  onFirst(): void;
  onPrevious(): void;
  onNext(): void;
  onLast(): void;
  onSeek(index: number): void;
  onSpeed(speed: Speed): void;
}

export function Transport(props: Props) {
  const { steps, index, playing, speed, blocked = false, emptyReason, quizOn } = props;
  const total = steps?.length ?? 0;
  const empty = total === 0;

  const forwardWhy = blocked
    ? 'Réponds à la question affichée pour avancer.'
    : empty
      ? (emptyReason ?? "Lance une exécution pour pouvoir la rejouer.")
      : undefined;

  const disabledForward = empty || blocked;

  return (
    <div className="transport">
      <div className="transport__buttons">
        <button
          type="button"
          className="btn btn--icon"
          disabled={empty}
          onClick={props.onFirst}
          title={empty ? forwardWhy : 'Première étape'}
          aria-label="Première étape"
        >
          ⏮
        </button>
        <button
          type="button"
          className="btn btn--icon"
          disabled={empty || index === 0}
          onClick={props.onPrevious}
          title={empty ? forwardWhy : 'Étape précédente (←)'}
          aria-label="Étape précédente"
        >
          ◀
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabledForward}
          onClick={props.onToggle}
          title={forwardWhy ?? 'Lecture / pause (Espace)'}
          style={{ minWidth: 104 }}
        >
          {playing ? '❙❙ Pause' : '▶ Lecture'}
        </button>
        <button
          type="button"
          className="btn btn--icon"
          disabled={disabledForward || index >= total - 1}
          onClick={props.onNext}
          title={forwardWhy ?? 'Étape suivante (→)'}
          aria-label="Étape suivante"
        >
          ▶
        </button>
        <button
          type="button"
          className="btn btn--icon"
          disabled={disabledForward}
          onClick={props.onLast}
          title={forwardWhy ?? 'Dernière étape'}
          aria-label="Dernière étape"
        >
          ⏭
        </button>
      </div>

      <div className="transport__scrub">
        {empty || blocked ? (
          <p className="transport__why">
            <b>{blocked ? 'En attente de ta réponse.' : 'Aucune exécution en cours.'}</b>
            <span>{forwardWhy}</span>
          </p>
        ) : (
          <>
            <div className="timeline" role="group" aria-label="Frise des étapes">
              {(steps ?? []).map((s, i) => (
                <button
                  key={i}
                  type="button"
                  data-kind={kindOf(s)}
                  data-current={i === index}
                  onClick={() => props.onSeek(i)}
                  title={`${i + 1}. ${s.action}`}
                  aria-label={`Étape ${i + 1} : ${s.action}`}
                />
              ))}
            </div>
            <input
              className="scrub"
              type="range"
              min={0}
              max={Math.max(0, total - 1)}
              value={index}
              onChange={(e) => props.onSeek(Number(e.target.value))}
              aria-label="Position dans la trace"
              style={{ maxWidth: 150 }}
            />
          </>
        )}
        <span className="transport__count">
          {empty ? '— / —' : `${index + 1} / ${total}`}
        </span>
      </div>

      <button
        type="button"
        className="btn"
        aria-pressed={quizOn}
        onClick={props.onToggleQuiz}
        title="Avant chaque étape, devine la décision que l'algorithme va prendre"
      >
        Mode question
      </button>

      <div className="seg" role="group" aria-label="Vitesse de lecture">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={speed === s}
            onClick={() => props.onSpeed(s)}
            title={`Vitesse ×${s}`}
          >
            ×{s}
          </button>
        ))}
      </div>
    </div>
  );
}
