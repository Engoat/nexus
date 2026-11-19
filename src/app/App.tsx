/**
 * Application shell.
 *
 * Holds the two benches (graphs, queues), the document, the algorithm choice,
 * the trace players and the question mode. Deliberately the only place that
 * knows about all of them at once.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ALGORITHMS, byId } from '../algorithms/registry';
import { lessonFor } from '../content/lessons';
import {
  defaultParams,
  type ParamSpec,
  type ParamValue,
  type ParamValues,
} from '../algorithms/types';
import { type GraphDocument, type NodeId, toMathGraph } from '../core/graph';
import type { Trace } from '../core/trace';
import { queueSim } from '../sim/registry';
import { AlgorithmPanel } from './components/AlgorithmPanel';
import { AnalysisPanel } from './components/AnalysisPanel';
import { ComparePanel } from './components/ComparePanel';
import {
  type CanvasApi,
  type CanvasQuiz,
  GraphCanvas,
  type Mode,
  type Selection,
} from './components/GraphCanvas';
import { EditorPanel } from './components/EditorPanel';
import { GeneratorPanel } from './components/GeneratorPanel';
import { InvariantPanel } from './components/InvariantPanel';
import { Legend } from './components/Legend';
import { Menu } from './components/Menu';
import { LessonPanel } from './components/LessonPanel';
import { QuestionPanel, type QuizState } from './components/QuestionPanel';
import { QueueStage } from './components/QueueStage';
import { SimulationPanel } from './components/SimulationPanel';
import { Transport } from './components/Transport';
import { download, parseDocument, serializeDocument, serializeTrace } from './io';
import { generatorById } from './generators';
import { applyLayout, type LayoutKind } from './layouts';
import { documentFromLocation, linkFor, loadLocal, saveLocal } from './persist';
import { SAMPLES, sampleById } from './samples';
import { useDocument } from './state/useDocument';
import { type Speed, useRunner } from './state/useRunner';

/** Short badges drawn under a node when a parameter points at it. */
const ROLE_BADGES: Record<string, string> = {
  source: 'source',
  target: 'cible',
  start: 'départ',
  sink: 'puits',
};

const STAGE = { width: 980, height: 620 };

type Bench = 'graphs' | 'queues';
type Tab = 'left' | 'right';
/** Onglets du rail de droite. */
type Pane = 'setup' | 'lesson' | 'trace';

/**
 * Where the opening graph comes from, in order: a shared link, then the local
 * autosave, then the first example. A link always wins, so opening someone
 * else's exercise never silently shows your own work instead.
 */
function initialDocument(): GraphDocument {
  try {
    const shared = documentFromLocation();
    if (shared && shared.nodes.length > 0) return shared;
  } catch {
    // Un lien abîmé ne doit pas empêcher l'application de démarrer.
  }
  const saved = loadLocal();
  if (saved && saved.nodes.length > 0) return saved;
  return applyLayout(SAMPLES[0].build(), 'force', STAGE);
}

export function App() {
  const store = useDocument(initialDocument());
  const doc = store.doc;

  const [bench, setBench] = useState<Bench>('graphs');
  const [mode, setMode] = useState<Mode>('select');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [layout, setLayout] = useState<LayoutKind>('force');
  const [algoId, setAlgoId] = useState<string>(SAMPLES[0].suggests);
  const [compareOn, setCompareOn] = useState(false);
  const [compareId, setCompareId] = useState<string>('dfs');
  const [paramsById, setParamsById] = useState<Record<string, Record<string, ParamValue>>>({});
  const [quizOn, setQuizOn] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ asked: 0, right: 0 });
  const [tab, setTab] = useState<Tab>('left');
  const [pane, setPane] = useState<Pane>('setup');
  const canvas = useRef<CanvasApi | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const algo = byId(algoId) ?? ALGORITHMS[0];
  const algoB = byId(compareId) ?? ALGORITHMS[1];

  /** Stored values for a spec, or its declared defaults the first time. */
  const paramsOf = useCallback(
    (spec: { id: string; params: readonly ParamSpec[] }): ParamValues =>
      paramsById[spec.id] ?? defaultParams(spec),
    [paramsById],
  );

  const params = paramsOf(algo);
  const paramsB = paramsOf(algoB);
  const simParams = paramsOf(queueSim);

  const mathGraph = useMemo(() => toMathGraph(doc), [doc]);

  /**
   * A trace must never outlive what it describes. The key folds in everything a
   * run depends on, so any edit drops it.
   */
  const graphKey = useMemo(
    () => `${algo.id}|${JSON.stringify(params)}|${JSON.stringify(doc)}`,
    [algo.id, params, doc],
  );
  const simKey = useMemo(() => `${queueSim.id}|${JSON.stringify(simParams)}`, [simParams]);

  const graphRunner = useRunner(graphKey);
  const simRunner = useRunner(simKey);
  const runner = bench === 'graphs' ? graphRunner : simRunner;

  const setParam = useCallback(
    (specId: string, defaults: Record<string, ParamValue>, id: string, value: ParamValue) => {
      setParamsById((prev) => ({
        ...prev,
        [specId]: { ...(prev[specId] ?? defaults), [id]: value },
      }));
    },
    [],
  );

  /* Keep node parameters pointing at nodes that exist, and pre-fill the
     required ones so neither bench needs a setup ritual. */
  useEffect(() => {
    const ids = doc.nodes.map((n) => n.id);
    const specs = compareOn ? [algo, algoB] : [algo];
    const updates: Record<string, Record<string, ParamValue>> = {};

    for (const spec of specs) {
      const current = paramsById[spec.id] ?? defaultParams(spec);
      let next = current;
      for (const p of spec.params) {
        if (p.kind !== 'node') continue;
        const value = current[p.id];
        if (typeof value === 'string' && ids.includes(value)) continue;
        if (!p.required) {
          if (value !== null) next = { ...next, [p.id]: null };
          continue;
        }
        const pick = p.id === 'sink' ? ids[ids.length - 1] : ids[0];
        const fallback = pick ?? null;
        if (fallback !== value) next = { ...next, [p.id]: fallback };
      }
      if (next !== current) updates[spec.id] = next;
    }

    if (Object.keys(updates).length > 0) setParamsById((prev) => ({ ...prev, ...updates }));
  }, [algo, algoB, compareOn, doc.nodes, paramsById]);

  /* Sauvegarde locale, différée : on n'écrit pas à chaque pixel d'un glissement. */
  useEffect(() => {
    const timer = window.setTimeout(() => saveLocal(doc), 500);
    return () => window.clearTimeout(timer);
  }, [doc]);

  const issues = useMemo(() => algo.check(mathGraph, params), [algo, mathGraph, params]);
  const issuesB = useMemo(() => algoB.check(mathGraph, paramsB), [algoB, mathGraph, paramsB]);
  const simIssues = useMemo(() => queueSim.check(simParams), [simParams]);

  /** Second run for the comparison view. Recomputed, never played separately. */
  const compareRun = useMemo((): { trace: Trace<unknown> | null; error: string | null } => {
    if (!compareOn || bench !== 'graphs') return { trace: null, error: null };
    if (issuesB.some((i) => i.level === 'error')) {
      return { trace: null, error: issuesB.find((i) => i.level === 'error')?.message ?? null };
    }
    try {
      return { trace: algoB.run(mathGraph, paramsB), error: null };
    } catch (e) {
      return { trace: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [compareOn, bench, algoB, mathGraph, paramsB, issuesB]);

  const roles = useMemo(() => {
    const out: Record<NodeId, string> = {};
    const specs = compareOn ? [algo, algoB] : [algo];
    for (const spec of specs) {
      const values = paramsOf(spec);
      for (const p of spec.params) {
        if (p.kind !== 'node') continue;
        const value = values[p.id];
        if (typeof value !== 'string' || value === '') continue;
        const badge = ROLE_BADGES[p.id] ?? p.label.toLowerCase();
        if (!out[value]?.includes(badge)) {
          out[value] = out[value] ? `${out[value]} · ${badge}` : badge;
        }
      }
    }
    return out;
  }, [algo, algoB, compareOn, paramsOf]);

  /* ------------------------------------------------ question mode */

  const step = runner.step;
  const nextStep = runner.trace?.steps[runner.index + 1] ?? null;
  const pendingAsk = quizOn ? (nextStep?.ask ?? null) : null;
  const waitingForAnswer = pendingAsk !== null && picked === null;

  // A new position means a new question: forget the previous answer.
  const lastIndex = useRef(runner.index);
  useEffect(() => {
    if (lastIndex.current !== runner.index) {
      lastIndex.current = runner.index;
      setPicked(null);
    }
  }, [runner.index]);

  useEffect(() => {
    if (waitingForAnswer && runner.playing) runner.pause();
  }, [waitingForAnswer, runner]);

  const submitAnswer = useCallback(
    (value: string) => {
      if (!pendingAsk || picked !== null) return;
      setPicked(value);
      setScore((s) => ({
        asked: s.asked + 1,
        right: s.right + (value === pendingAsk.answer ? 1 : 0),
      }));
    },
    [pendingAsk, picked],
  );

  const quizState: QuizState = { enabled: quizOn, picked, asked: score.asked, right: score.right };

  const canvasQuiz: CanvasQuiz | null =
    waitingForAnswer && pendingAsk && pendingAsk.kind !== 'choice'
      ? {
          kind: pendingAsk.kind,
          candidates: pendingAsk.among.map((o) => o.value),
          onAnswer: submitAnswer,
        }
      : null;

  /* ------------------------------------------------ actions */

  const relayout = useCallback(
    (kind: LayoutKind) => {
      setLayout(kind);
      store.commit((prev) => applyLayout(prev, kind, STAGE), 'Disposition appliquée');
      requestAnimationFrame(() => canvas.current?.fit());
    },
    [store],
  );

  const resetQuiz = useCallback(() => {
    setPicked(null);
    setScore({ asked: 0, right: 0 });
  }, []);

  const loadSample = useCallback(
    (id: string) => {
      const sample = sampleById(id);
      if (!sample) return;
      store.reset(applyLayout(sample.build(), 'force', STAGE));
      setSelection(null);
      setAlgoId(sample.suggests);
      setParamsById({});
      graphRunner.clear();
      resetQuiz();
      requestAnimationFrame(() => canvas.current?.fit());
    },
    [store, graphRunner, resetQuiz],
  );

  const generate = useCallback(
    (id: string, genParams: ParamValues) => {
      const spec = generatorById(id);
      if (!spec) return;
      const built = spec.build(genParams);
      const laid = id === 'grid' || id === 'bipartite' || id === 'disconnected'
        ? built
        : applyLayout(built, 'force', STAGE);
      store.commit(() => laid, `Graphe généré (${spec.name})`);
      setSelection(null);
      setParamsById({});
      graphRunner.clear();
      resetQuiz();
      requestAnimationFrame(() => canvas.current?.fit());
    },
    [store, graphRunner, resetQuiz],
  );

  const copyLink = useCallback(async () => {
    const link = linkFor(doc);
    window.history.replaceState(null, '', `#g=${link.split('#g=')[1] ?? ''}`);
    try {
      await navigator.clipboard.writeText(link);
      window.alert('Lien copié. Toute personne qui l\'ouvre verra exactement ce graphe.');
    } catch {
      window.prompt('Copie ce lien :', link);
    }
  }, [doc]);

  const clearAll = useCallback(() => {
    if (doc.nodes.length > 0 && !window.confirm('Vider le graphe ? Cette action est annulable.')) {
      return;
    }
    store.commit(() => ({ flags: doc.flags, nodes: [], edges: [] }), 'Graphe vidé');
    setSelection(null);
    graphRunner.clear();
  }, [doc.flags, doc.nodes.length, store, graphRunner]);

  const importFile = useCallback(
    async (file: File) => {
      try {
        store.reset(parseDocument(await file.text()));
        setSelection(null);
        graphRunner.clear();
        requestAnimationFrame(() => canvas.current?.fit());
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e));
      }
    },
    [store, graphRunner],
  );

  const onRunGraph = useCallback(() => {
    graphRunner.run(() => algo.run(mathGraph, params));
    resetQuiz();
    // En comparaison, les verdicts sont dans l'onglet des réglages : y rester.
    setPane(compareOn ? 'setup' : 'trace');
    setTab('right');
  }, [graphRunner, algo, mathGraph, params, resetQuiz, compareOn]);

  const onRunSim = useCallback(() => {
    simRunner.run(() => queueSim.run(simParams));
    resetQuiz();
    setPane('trace');
    setTab('right');
  }, [simRunner, simParams, resetQuiz]);

  /** Jump to another algorithm from the course, and show its course. */
  const goToAlgorithm = useCallback(
    (id: string) => {
      if (!byId(id)) return;
      setBench('graphs');
      setAlgoId(id);
      setPane('lesson');
      resetQuiz();
    },
    [resetQuiz],
  );

  /* ------------------------------------------------ keyboard */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing =
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;

      if (bench === 'graphs' && !waitingForAnswer) {
        switch (e.key.toLowerCase()) {
          case 'v':
            setMode('select');
            return;
          case 'n':
            setMode('node');
            return;
          case 'e':
            setMode('edge');
            return;
          case 'x':
            setMode('erase');
            return;
          default:
            break;
        }
      }

      switch (e.key.toLowerCase()) {
        case ' ':
          e.preventDefault();
          if (!waitingForAnswer) runner.toggle();
          break;
        case 'arrowright':
          e.preventDefault();
          if (!waitingForAnswer) runner.next();
          break;
        case 'arrowleft':
          e.preventDefault();
          runner.previous();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, runner, bench, waitingForAnswer]);

  /* ------------------------------------------------ render helpers */

  const nodeMarks = step?.nodeMarks ?? {};
  const edgeMarks = step?.edgeMarks ?? {};
  const labelOf = useCallback(
    (id: string) => doc.nodes.find((n) => n.id === id)?.label ?? id,
    [doc.nodes],
  );

  const compareIndex = compareRun.trace
    ? Math.min(runner.index, compareRun.trace.steps.length - 1)
    : 0;
  const compareStep = compareRun.trace?.steps[compareIndex] ?? null;

  const activeTrace = runner.trace;

  return (
    <div className="shell" data-bench={bench}>
      <header className="head">
        <div className="brand">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <g fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M5 18 L12 6 L19 15" />
              <circle cx="5" cy="18" r="2.4" fill="var(--chrome-2)" />
              <circle cx="12" cy="6" r="2.4" fill="var(--chrome-2)" />
              <circle cx="19" cy="15" r="2.4" fill="var(--chrome-2)" />
            </g>
          </svg>
          <b>Nexus</b>
        </div>

        <div className="seg" role="group" aria-label="Atelier">
          <button type="button" aria-pressed={bench === 'graphs'} onClick={() => setBench('graphs')}>
            Graphes
          </button>
          <button type="button" aria-pressed={bench === 'queues'} onClick={() => setBench('queues')}>
            Files d'attente
          </button>
        </div>

        <div className="head__spacer" />

        {bench === 'graphs' ? (
          <select
            className="control"
            style={{ width: 'auto', maxWidth: 240 }}
            value=""
            onChange={(e) => {
              if (e.target.value) loadSample(e.target.value);
            }}
            aria-label="Charger un exemple"
          >
            <option value="">Charger un exemple…</option>
            {SAMPLES.map((s) => (
              <option key={s.id} value={s.id} title={s.purpose}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}

        {bench === 'graphs' ? (
          <Menu
            label="Fichier"
            items={[
              {
                label: 'Importer un graphe',
                help: 'Un fichier .nexus.json',
                onSelect: () => fileInput.current?.click(),
              },
              {
                label: 'Exporter le graphe',
                help: 'Sommets, arêtes et propriétés',
                onSelect: () => download('graphe.nexus.json', serializeDocument(doc)),
              },
              {
                label: 'Copier le lien de partage',
                help: 'Le graphe entier tient dans l\'adresse',
                onSelect: () => void copyLink(),
              },
              {
                label: 'Vider le graphe',
                help: 'Annulable avec Ctrl+Z',
                danger: true,
                onSelect: clearAll,
              },
            ]}
          />
        ) : null}

        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          className="sr"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = '';
          }}
        />
      </header>

      <aside className="rail rail--left" data-tab={tab === 'left'}>
        <div className="rail__body">
        {bench === 'graphs' ? (
          <>
            <EditorPanel
              store={store}
              mode={mode}
              onMode={setMode}
              selection={selection}
              onSelect={setSelection}
              layout={layout}
              onLayout={relayout}
              onEdit={graphRunner.clear}
            />
            <GeneratorPanel onGenerate={generate} />
          </>
        ) : (
          <SimulationPanel
            sim={queueSim}
            params={simParams}
            onParam={(id, value) =>
              setParam(queueSim.id, defaultParams(queueSim), id, value)
            }
            issues={simIssues}
            hasTrace={simRunner.trace !== null}
            runError={simRunner.error}
            onRun={onRunSim}
            onClear={simRunner.clear}
            onOpenLesson={() => {
              setPane('lesson');
              setTab('right');
            }}
          />
        )}
        </div>
      </aside>

      <main className={`stage${compareOn && bench === 'graphs' ? ' stage--split' : ''}`}>
        {/* le filet rouge de marge : c'est une feuille de cahier, pas un plan infini */}
        <div className="stage__margin" aria-hidden="true" />
        {bench === 'queues' ? (
          <QueueStage step={step} />
        ) : (
          <>
            <div className="pane">
              {compareOn ? (
                <p className="pane__head">
                  <b>{algo.name}</b>
                  {activeTrace ? (
                    <span>
                      {runner.index + 1} / {activeTrace.steps.length}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <div className="pane__canvas">
                <GraphCanvas
                  ref={canvas}
                  store={store}
                  mode={mode}
                  nodeMarks={nodeMarks}
                  edgeMarks={edgeMarks}
                  selection={selection}
                  onSelect={setSelection}
                  onEdit={graphRunner.clear}
                  roles={roles}
                  quiz={canvasQuiz}
                />
              </div>
              {compareOn && step ? (
                <p className="pane__foot">
                  <b>{step.action}</b> {step.detail}
                </p>
              ) : null}
            </div>

            {compareOn ? (
              <div className="pane pane--b">
                <p className="pane__head">
                  <b>{algoB.name}</b>
                  {compareRun.trace ? (
                    <span>
                      {compareIndex + 1} / {compareRun.trace.steps.length}
                      {compareIndex === compareRun.trace.steps.length - 1 &&
                      activeTrace &&
                      runner.index < activeTrace.steps.length - 1
                        ? ' · terminé'
                        : ''}
                    </span>
                  ) : null}
                </p>
                <div className="pane__canvas">
                  {compareRun.error ? (
                    <div className="empty">
                      <h2>{algoB.name} ne s'applique pas</h2>
                      <p>{compareRun.error}</p>
                    </div>
                  ) : (
                    <GraphCanvas
                      store={store}
                      mode="select"
                      nodeMarks={compareStep?.nodeMarks ?? {}}
                      edgeMarks={compareStep?.edgeMarks ?? {}}
                      selection={null}
                      onSelect={() => {}}
                      onEdit={() => {}}
                      roles={roles}
                      readOnly
                    />
                  )}
                </div>
                {compareStep ? (
                  <p className="pane__foot">
                    <b>{compareStep.action}</b> {compareStep.detail}
                  </p>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        <div className="stage__hud">
          {activeTrace && !compareOn ? <Legend steps={activeTrace.steps} /> : null}
          {quizOn && !pendingAsk && activeTrace ? (
            <p className="quiz-idle">
              Mode question actif. Aucune décision à deviner avant la prochaine étape.
            </p>
          ) : null}
          {pendingAsk ? (
            <QuestionPanel
              ask={pendingAsk}
              state={quizState}
              onPick={submitAnswer}
              onContinue={() => {
                setPicked(null);
                runner.next();
              }}
              onSkip={() => {
                setPicked(null);
                runner.next();
              }}
            />
          ) : null}
        </div>

        {bench === 'graphs' && !compareOn ? (
          <div className="stage__view" role="group" aria-label="Vue du graphe">
            <button type="button" onClick={() => canvas.current?.zoomIn()} aria-label="Zoomer">
              +
            </button>
            <button type="button" onClick={() => canvas.current?.zoomOut()} aria-label="Dézoomer">
              −
            </button>
            <button type="button" onClick={() => canvas.current?.fit()}>
              Ajuster
            </button>
          </div>
        ) : null}

        {bench === 'graphs' && doc.nodes.length === 0 ? (
          <div className="empty">
            <h2>Graphe vide</h2>
            <p>
              Passe à l'outil <b>Sommet</b> et clique dans la zone pour créer un sommet, ou charge
              un exemple pour voir un algorithme se dérouler tout de suite.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn--primary" onClick={() => setMode('node')}>
                Créer des sommets
              </button>
              <button type="button" className="btn" onClick={() => loadSample(SAMPLES[0].id)}>
                Charger « {SAMPLES[0].name} »
              </button>
            </div>
          </div>
        ) : null}
      </main>

      <aside className="rail rail--right" data-tab={tab === 'right'}>
        <div className="tabs" role="tablist" aria-label="Panneau de droite">
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'setup'}
            onClick={() => setPane('setup')}
          >
            Réglages
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'lesson'}
            onClick={() => setPane('lesson')}
          >
            Cours
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pane === 'trace'}
            onClick={() => setPane('trace')}
          >
            Trace
            {activeTrace ? <span className="dot" aria-hidden="true" /> : null}
          </button>
        </div>

        <div className="rail__body">
          {pane === 'setup' ? (
            bench === 'graphs' ? (
              <>
                <section className="block block--tint">
                  <button
                    type="button"
                    className="btn btn--wide"
                    aria-pressed={compareOn}
                    onClick={() => setCompareOn((v) => !v)}
                  >
                    Comparer deux algorithmes
                  </button>
                  <p className="field__help" style={{ marginTop: 'var(--sp2)' }}>
                    Deux algorithmes sur le même graphe, avancés par le même curseur, et la liste
                    de ce qui diffère réellement entre leurs résultats.
                  </p>
                </section>
                {compareOn ? (
                <ComparePanel
                  a={{ name: algo.name, trace: activeTrace }}
                  b={{ name: algoB.name, trace: compareRun.trace, error: compareRun.error }}
                  selectedB={algoB.id}
                  onSelectB={setCompareId}
                  excludeId={algo.id}
                  labelOf={labelOf}
                  onRun={onRunGraph}
                  canRun={issues.every((i) => i.level !== 'error')}
                  issues={issues}
                />
                ) : (
                <AlgorithmPanel
                  doc={doc}
                  algo={algo}
                  onAlgo={(id) => {
                    setAlgoId(id);
                    resetQuiz();
                  }}
                  params={params}
                  onParam={(id, value) => setParam(algo.id, defaultParams(algo), id, value)}
                  issues={issues}
                  hasTrace={graphRunner.trace !== null}
                  runError={graphRunner.error}
                  onRun={onRunGraph}
                  onClear={graphRunner.clear}
                  onOpenLesson={() => setPane('lesson')}
                />
                )}
              </>
            ) : (
              <p className="block hint">
                Le modèle et ses réglages sont dans le panneau de gauche.
              </p>
            )
          ) : null}

          {pane === 'lesson' ? (
            <LessonPanel
              title={bench === 'graphs' ? algo.name : queueSim.name}
              lesson={lessonFor(bench === 'graphs' ? algo.id : queueSim.id)}
              onGoTo={goToAlgorithm}
              nameOf={(id) => byId(id)?.name ?? id}
            />
          ) : null}

          {pane === 'trace' ? (
            <>
              {activeTrace ? <InvariantPanel trace={activeTrace} step={step} /> : null}
              <AnalysisPanel trace={activeTrace} step={step} index={runner.index} />
              {activeTrace ? (
                <section className="block">
                  <h2 className="block__title">Emporter</h2>
                  <button
                    type="button"
                    className="btn btn--wide"
                    onClick={() =>
                      download(
                        `trace-${activeTrace.algorithmId}.json`,
                        serializeTrace(activeTrace, doc),
                      )
                    }
                  >
                    Exporter la trace
                  </button>
                  <p className="field__help" style={{ marginTop: 'var(--sp2)' }}>
                    Toutes les étapes, le pseudocode, les invariants et le résultat, en JSON.
                  </p>
                </section>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>

      <footer className="foot">
        <Transport
          steps={activeTrace?.steps ?? null}
          index={runner.index}
          playing={runner.playing}
          speed={runner.speed}
          blocked={waitingForAnswer}
          emptyReason={
            bench === 'graphs'
              ? issues.some((i) => i.level === 'error')
                ? "L'algorithme ne peut pas s'exécuter sur ce graphe : voir l'onglet Réglages."
                : 'Clique sur « Exécuter » dans le panneau de droite.'
              : simIssues.some((i) => i.level === 'error')
                ? 'Le modèle choisi ne peut pas être simulé : voir le panneau de gauche.'
                : 'Clique sur « Simuler » dans le panneau de gauche.'
          }
          onToggle={runner.toggle}
          onFirst={runner.first}
          onPrevious={runner.previous}
          onNext={runner.next}
          onLast={runner.last}
          onSeek={runner.seek}
          onSpeed={(s: Speed) => runner.setSpeed(s)}
          quizOn={quizOn}
          onToggleQuiz={() => {
            setQuizOn((v) => !v);
            resetQuiz();
          }}
        />
      </footer>

      <nav className="mobile-tabs" aria-label="Panneaux">
        <button type="button" aria-pressed={tab === 'left'} onClick={() => setTab('left')}>
          {bench === 'graphs' ? 'Le graphe' : 'Le modèle'}
        </button>
        <button type="button" aria-pressed={tab === 'right'} onClick={() => setTab('right')}>
          {bench === 'graphs' ? "L'algorithme" : 'La simulation'}
        </button>
      </nav>
    </div>
  );
}
