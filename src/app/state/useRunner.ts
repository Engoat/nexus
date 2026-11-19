/**
 * Trace playback.
 *
 * Holds a trace and a cursor. The trace is thrown away as soon as the graph or
 * the parameters change: showing an execution that no longer matches the graph
 * on screen would be the worst kind of lie this tool could tell.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Step, Trace } from '../../core/trace';

export const SPEEDS = [0.5, 1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];

export interface RunnerStore {
  readonly trace: Trace<unknown> | null;
  readonly index: number;
  readonly step: Step | null;
  readonly playing: boolean;
  readonly speed: Speed;
  readonly error: string | null;
  /**
   * Takes a thunk rather than an algorithm: the same player drives graph
   * algorithms and simulations, which have different inputs.
   */
  run(produce: () => Trace<unknown>): void;
  clear(): void;
  play(): void;
  pause(): void;
  toggle(): void;
  next(): void;
  previous(): void;
  first(): void;
  last(): void;
  seek(index: number): void;
  setSpeed(speed: Speed): void;
}

/** Base delay between steps at speed 1. */
const BASE_DELAY_MS = 700;

export function useRunner(invalidationKey: string): RunnerStore {
  const [trace, setTrace] = useState<Trace<unknown> | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [error, setError] = useState<string | null>(null);

  // Any change to the graph or the parameters drops the trace.
  const key = useRef(invalidationKey);
  useEffect(() => {
    if (key.current === invalidationKey) return;
    key.current = invalidationKey;
    setTrace(null);
    setIndex(0);
    setPlaying(false);
    setError(null);
  }, [invalidationKey]);

  const lastIndex = trace ? trace.steps.length - 1 : 0;

  const run = useCallback<RunnerStore['run']>((produce) => {
    try {
      const result = produce();
      setTrace(result);
      setIndex(0);
      setError(null);
      // Pas de lecture automatique : l'exécution s'arrête sur la première
      // étape et c'est l'utilisateur qui lance l'animation. Le résultat reste
      // ainsi stable sous ses yeux, et respecte qui préfère moins de mouvement.
      setPlaying(false);
    } catch (e) {
      setTrace(null);
      setPlaying(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const clear = useCallback(() => {
    setTrace(null);
    setIndex(0);
    setPlaying(false);
    setError(null);
  }, []);

  const seek = useCallback(
    (to: number) => {
      setIndex((current) => {
        const max = trace ? trace.steps.length - 1 : 0;
        const clamped = Math.min(Math.max(0, to), Math.max(0, max));
        return clamped === current ? current : clamped;
      });
    },
    [trace],
  );

  const next = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.min(i + 1, lastIndex));
  }, [lastIndex]);

  const previous = useCallback(() => {
    setPlaying(false);
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const first = useCallback(() => {
    setPlaying(false);
    setIndex(0);
  }, []);

  const last = useCallback(() => {
    setPlaying(false);
    setIndex(lastIndex);
  }, [lastIndex]);

  const play = useCallback(() => {
    if (!trace) return;
    setIndex((i) => (i >= trace.steps.length - 1 ? 0 : i));
    setPlaying(true);
  }, [trace]);

  const pause = useCallback(() => setPlaying(false), []);
  const toggle = useCallback(() => {
    if (playing) setPlaying(false);
    else play();
  }, [playing, play]);

  // Playback loop. Stops on the last step instead of looping.
  useEffect(() => {
    if (!playing || !trace) return;
    if (index >= trace.steps.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => setIndex((i) => i + 1), BASE_DELAY_MS / speed);
    return () => window.clearTimeout(timer);
  }, [playing, index, speed, trace]);

  // A user who prefers reduced motion gets no automatic playback.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) setPlaying(false);
  }, [trace]);

  return useMemo(
    () => ({
      trace,
      index,
      step: trace ? (trace.steps[index] ?? null) : null,
      playing,
      speed,
      error,
      run,
      clear,
      play,
      pause,
      toggle,
      next,
      previous,
      first,
      last,
      seek,
      setSpeed,
    }),
    [
      trace,
      index,
      playing,
      speed,
      error,
      run,
      clear,
      play,
      pause,
      toggle,
      next,
      previous,
      first,
      last,
      seek,
    ],
  );
}
