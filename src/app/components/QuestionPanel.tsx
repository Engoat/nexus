/**
 * Question mode.
 *
 * Before a step is revealed, the learner is asked what the algorithm is about to
 * do. The answer and the reason both come from the algorithm itself, recorded
 * while it ran, so the question can never disagree with the execution.
 *
 * For a node or an edge question, the candidates are also clickable on the
 * canvas. The buttons here are the keyboard and screen-reader path, not a
 * fallback nobody tested.
 */

import type { Ask } from '../../core/trace';

export interface QuizState {
  readonly enabled: boolean;
  /** What the learner picked for the current question, if anything. */
  readonly picked: string | null;
  readonly asked: number;
  readonly right: number;
}

interface Props {
  readonly ask: Ask;
  readonly state: QuizState;
  onPick(value: string): void;
  onContinue(): void;
  onSkip(): void;
}

export function QuestionPanel({ ask, state, onPick, onContinue, onSkip }: Props) {
  const answered = state.picked !== null;
  const correct = answered && state.picked === ask.answer;
  const labelOf = (value: string) => ask.among.find((o) => o.value === value)?.label ?? value;

  return (
    <section className="quiz" aria-live="polite">
      <header className="quiz__head">
        <span className="quiz__tag">Question</span>
        <span className="quiz__score">
          {state.right} / {state.asked} bonne{state.right > 1 ? 's' : ''} réponse
          {state.right > 1 ? 's' : ''}
        </span>
      </header>

      <p className="quiz__prompt">{ask.prompt}</p>

      <div className="quiz__options">
        {ask.among.map((option) => {
          const isAnswer = option.value === ask.answer;
          const isPicked = option.value === state.picked;
          return (
            <button
              key={option.value}
              type="button"
              className="quiz__option"
              data-state={
                !answered ? 'open' : isAnswer ? 'answer' : isPicked ? 'wrong' : 'dim'
              }
              disabled={answered}
              onClick={() => onPick(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {answered ? (
        <>
          <p className="quiz__verdict" data-correct={correct}>
            {correct
              ? 'Exact.'
              : `Non : c'était ${labelOf(ask.answer)}, pas ${labelOf(state.picked as string)}.`}
          </p>
          <p className="quiz__because">{ask.because}</p>
          <button type="button" className="btn btn--primary btn--wide" onClick={onContinue}>
            Continuer
          </button>
        </>
      ) : (
        <>
          <p className="quiz__hint">
            {ask.kind === 'choice'
              ? 'Choisis une réponse.'
              : `Clique directement ${ask.kind === 'node' ? 'un sommet' : 'une arête'} sur le graphe, ou utilise les boutons.`}
          </p>
          <button type="button" className="btn btn--wide" onClick={onSkip}>
            Passer sans répondre
          </button>
        </>
      )}
    </section>
  );
}
