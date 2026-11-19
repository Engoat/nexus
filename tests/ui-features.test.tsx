/**
 * @vitest-environment jsdom
 *
 * The three features added on top of the player: live invariants, question mode,
 * side-by-side comparison, plus the queue bench. Driven through the real
 * interface, so a broken wiring fails here rather than in a browser.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/app/App';

afterEach(cleanup);

const run = () => fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
const last = () => fireEvent.click(screen.getByRole('button', { name: 'Dernière étape' }));
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Étape suivante' }));

const enableQuiz = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Mode question' }));

/**
 * Toutes les étapes ne portent pas une question : au premier défilement la file
 * ne contient qu'un sommet, il n'y a donc rien à deviner. On avance jusqu'à la
 * première vraie question.
 */
function reachQuestion(max = 14): boolean {
  for (let i = 0; i < max; i += 1) {
    if (document.querySelector('.quiz__prompt')) return true;
    const button = screen.getByRole('button', { name: 'Étape suivante' }) as HTMLButtonElement;
    if (button.disabled) break;
    fireEvent.click(button);
  }
  return document.querySelector('.quiz__prompt') !== null;
}

function quizBox(): HTMLElement {
  return document.querySelector('.quiz') as HTMLElement;
}

function quizOptions(): HTMLElement[] {
  return [...quizBox().querySelectorAll('.quiz__option')] as HTMLElement[];
}

function tool(name: string) {
  return within(screen.getByRole('group', { name: "Outils d'édition" })).getByRole('button', {
    name,
  });
}

function loadSample(id: string) {
  fireEvent.change(screen.getByLabelText('Charger un exemple'), { target: { value: id } });
}

/* ====================================================== invariants */

describe('invariants en direct', () => {
  it("n'affiche rien avant une exécution", () => {
    render(<App />);
    expect(screen.queryByText('Invariants')).toBeNull();
  });

  it('énonce les invariants de BFS et les montre vérifiés', () => {
    render(<App />);
    run();
    next();

    const panel = screen.getByText('Invariants').closest('section') as HTMLElement;
    expect(within(panel).getByText(/deux niveaux consécutifs/)).toBeTruthy();
    expect(within(panel).getByText(/distance non décroissante/)).toBeTruthy();
    expect(within(panel).getAllByText('Vérifié à cette étape').length).toBeGreaterThan(0);
    expect(panel.textContent).toContain('tenu');
  });

  it('affiche le détail de ce qui a été comparé', () => {
    render(<App />);
    run();
    next();
    const panel = screen.getByText('Invariants').closest('section') as HTMLElement;
    expect(within(panel).getByText(/niveaux présents/)).toBeTruthy();
  });

  it('signale une violation là où la théorie veut qu\'elle arrive', () => {
    render(<App />);
    loadSample('negative-cycle');
    run();
    last();

    const panel = screen.getByText('Invariants').closest('section') as HTMLElement;
    expect(panel.textContent).toContain('violé');
    expect(within(panel).getByText(/forêt enracinée en la source/)).toBeTruthy();
  });

  it('ne signale aucune violation sur le même graphe sans cycle négatif', () => {
    render(<App />);
    loadSample('negative-arc');
    run();
    last();

    const panel = screen.getByText('Invariants').closest('section') as HTMLElement;
    expect(panel.textContent).not.toContain('VIOLÉ');
  });
});

/* ====================================================== question mode */

describe('mode question', () => {
  it('ne pose rien tant qu\'il est désactivé', () => {
    render(<App />);
    run();
    expect(screen.queryByText('Question')).toBeNull();
  });

  it('annonce le mode quand aucune décision n\'est à deviner', () => {
    render(<App />);
    run();
    enableQuiz();
    // À la première étape la file ne contient que la source : rien à deviner.
    expect(screen.getByText(/Aucune décision à deviner/)).toBeTruthy();
  });

  it('pose une question avant de révéler l\'étape suivante', () => {
    render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    expect(screen.getByText('Question')).toBeTruthy();
    expect(screen.getByText(/sort de la file maintenant/)).toBeTruthy();
    expect(screen.getByText(/0 \/ 0 bonne réponse/)).toBeTruthy();
  });

  it('empêche d\'avancer tant que la question est ouverte', () => {
    render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    expect(screen.getByRole('button', { name: 'Étape suivante' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.getByRole('button', { name: /Lecture/ })).toHaveProperty('disabled', true);
  });

  it('compte une bonne réponse et explique pourquoi', () => {
    render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    const options = quizOptions();
    expect(options.length).toBeGreaterThan(1);
    // La tête de file est la bonne réponse : la file est premier entré, premier sorti.
    fireEvent.click(options[0]);

    expect(within(quizBox()).getByText('Exact.')).toBeTruthy();
    expect(within(quizBox()).getByText(/premier entré, premier sorti/)).toBeTruthy();
    expect(within(quizBox()).getByText(/1 \/ 1 bonne/)).toBeTruthy();
  });

  it('corrige une mauvaise réponse sans la masquer', () => {
    render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    const options = quizOptions();
    fireEvent.click(options[options.length - 1]);

    expect(within(quizBox()).getByText(/^Non :/)).toBeTruthy();
    expect(within(quizBox()).getByText(/0 \/ 1 bonne/)).toBeTruthy();
    // La bonne réponse est marquée, la mauvaise aussi.
    expect(quizBox().querySelector('[data-state="answer"]')).toBeTruthy();
    expect(quizBox().querySelector('[data-state="wrong"]')).toBeTruthy();
  });

  it('avance après avoir répondu, et repose une question', () => {
    render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    const before = (document.querySelector('.transport__count') as HTMLElement).textContent;
    fireEvent.click(quizOptions()[0]);
    fireEvent.click(within(quizBox()).getByRole('button', { name: 'Continuer' }));
    const after = (document.querySelector('.transport__count') as HTMLElement).textContent;
    expect(after).not.toBe(before);
  });

  it('permet de répondre en cliquant un sommet du graphe', () => {
    const { container } = render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    // Seuls les candidats réagissent : les autres sont marqués comme tels.
    const candidates = container.querySelectorAll('g.node[data-candidate="true"]');
    expect(candidates.length).toBeGreaterThan(1);

    fireEvent.pointerDown(candidates[0], { pointerId: 1 });
    expect(within(quizBox()).getByRole('button', { name: 'Continuer' })).toBeTruthy();
  });

  it('ignore un clic sur un sommet qui n\'est pas candidat', () => {
    const { container } = render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    const outsiders = container.querySelectorAll('g.node[data-candidate="false"]');
    expect(outsiders.length).toBeGreaterThan(0);
    fireEvent.pointerDown(outsiders[0], { pointerId: 1 });

    expect(within(quizBox()).queryByRole('button', { name: 'Continuer' })).toBeNull();
  });

  it('propose de passer sans répondre', () => {
    render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    const before = (document.querySelector('.transport__count') as HTMLElement).textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Passer sans répondre' }));
    expect((document.querySelector('.transport__count') as HTMLElement).textContent).not.toBe(
      before,
    );
    // Passer ne compte pas dans le score.
    expect(document.querySelector('.quiz__score')?.textContent ?? '0 / 0').toContain('0 / 0');
  });

  it('suspend l\'édition pendant qu\'une question attend', () => {
    const { container } = render(<App />);
    run();
    enableQuiz();
    expect(reachQuestion()).toBe(true);

    const before = container.querySelectorAll('g.node').length;
    fireEvent.click(tool('Sommet'));
    fireEvent.pointerDown(container.querySelector('rect.canvas__page') as Element, {
      clientX: 400,
      clientY: 300,
      pointerId: 1,
    });
    expect(container.querySelectorAll('g.node').length).toBe(before);
  });
});

/* ====================================================== comparison */

describe('comparaison côte à côte', () => {
  it('affiche deux panneaux et deux canvas', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparer deux algorithmes' }));

    expect(container.querySelectorAll('svg.canvas').length).toBe(2);
    expect(screen.getByLabelText('Deuxième algorithme')).toBeTruthy();
  });

  it('exécute les deux et compare leurs résultats', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparer deux algorithmes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter les deux' }));

    const verdicts = document.querySelector('.verdicts') as HTMLElement;
    expect(verdicts).toBeTruthy();
    expect(within(verdicts).getByText(/Ordre de visite/)).toBeTruthy();
    // BFS et DFS visitent les mêmes sommets dans un ordre différent.
    expect(verdicts.textContent).toMatch(/ordre différent|Les ensembles visités/);
  });

  it('constate que Prim et Kruskal trouvent le même poids', () => {
    render(<App />);
    loadSample('mst');
    fireEvent.click(screen.getByRole('button', { name: 'Comparer deux algorithmes' }));
    fireEvent.change(screen.getByLabelText('Deuxième algorithme'), { target: { value: 'prim' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter les deux' }));

    const verdicts = document.querySelector('.verdicts') as HTMLElement;
    expect(within(verdicts).getByText(/Poids total/)).toBeTruthy();
    expect(verdicts.textContent).toContain('14 des deux côtés');
  });

  it('avance les deux panneaux avec le même curseur', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparer deux algorithmes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter les deux' }));

    const heads = () =>
      [...document.querySelectorAll('.pane__head span')].map((s) => s.textContent ?? '');
    const before = heads();
    next();
    const after = heads();
    expect(after[0]).not.toBe(before[0]);
    expect(after[1]).not.toBe(before[1]);
  });

  it('explique qu\'un algorithme ne s\'applique pas plutôt que de le masquer', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Comparer deux algorithmes' }));
    fireEvent.change(screen.getByLabelText('Deuxième algorithme'), {
      target: { value: 'topological-sort' },
    });

    // L'exemple de départ n'est pas orienté. Le refus est dit deux fois,
    // dans la vignette et dans le panneau : c'est voulu.
    expect(screen.getAllByText(/ne s'applique pas/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/que sur un graphe orienté/).length).toBeGreaterThan(0);
  });
});

/* ====================================================== queue bench */

describe("atelier des files d'attente", () => {
  const openBench = () => fireEvent.click(screen.getByRole('button', { name: "Files d'attente" }));

  it('bascule vers un autre atelier', () => {
    render(<App />);
    openBench();
    // Le modèle est affiché en notation de Kendall, avec chaque lettre expliquée.
    expect((document.querySelector('.kendall__code') as HTMLElement).textContent).toBe('M/M/1');
    const legend = document.querySelector('.kendall__legend') as HTMLElement;
    // Les deux lettres M sont expliquées, une pour les arrivées, une pour les services.
    expect(within(legend).getAllByText(/exponentielle/).length).toBe(2);
    expect(within(legend).getByText(/un seul guichet/)).toBeTruthy();
    expect(within(legend).getByText(/capacité illimitée/)).toBeTruthy();
    expect(screen.getByText('Aucune simulation')).toBeTruthy();
    // Les outils de graphe disparaissent.
    expect(screen.queryByRole('group', { name: "Outils d'édition" })).toBeNull();
  });

  it('affiche le régime stationnaire avant toute simulation', () => {
    render(<App />);
    openBench();
    const panel = screen.getByText('Ce que dit la théorie').closest('section') as HTMLElement;
    const cell = (header: string) =>
      (within(panel).getByText(header).closest('tr') as HTMLElement).querySelector(
        'td',
      )?.textContent;
    // λ=0.8, μ=1, c=1 : ρ=0.8, L=4, Lq=3.2, W=5, Wq=4.
    expect(cell('ρ par guichet')).toBe('0.800');
    expect(cell('L')).toBe('4.000');
    expect(cell('Lq')).toBe('3.200');
    expect(cell('W')).toBe('5.000');
    expect(cell('Wq')).toBe('4.000');
  });

  it('simule et montre la file, les serveurs et les mesures', () => {
    render(<App />);
    openBench();
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));

    // L'horloge et le guichet sont là dès la première étape, système vide.
    expect(document.querySelector('.qstage__clock')).toBeTruthy();
    expect(document.querySelectorAll('.desk').length).toBe(1);
    expect(document.querySelectorAll('.qperson').length).toBe(0);
    expect(screen.getByText('Système vide')).toBeTruthy();
    const footer = document.querySelector('.qstage__bottom') as HTMLElement;
    expect(within(footer).getByText(/clients dans le système/)).toBeTruthy();

    // Les bonhommes apparaissent avec le premier client.
    next();
    expect(document.querySelectorAll('.qperson').length).toBeGreaterThan(0);
  });

  it('conclut en comparant les mesures à la théorie', () => {
    render(<App />);
    openBench();
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));
    last();

    const conclusions = document.querySelector('.conclusions') as HTMLElement;
    expect(within(conclusions).getAllByText(/mesuré contre/).length).toBeGreaterThan(1);
    expect(within(conclusions).getByText(/loi de Little tient/)).toBeTruthy();
  });

  it('vérifie ses invariants, loi de Little comprise', () => {
    render(<App />);
    openBench();
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));
    last();

    const panel = screen.getByText('Invariants').closest('section') as HTMLElement;
    expect(within(panel).getByText(/loi de Little est exacte/)).toBeTruthy();
    expect(panel.textContent).toContain('tenu');
    expect(panel.textContent).not.toContain('VIOLÉ');
  });

  it('refuse un système instable et le dit', () => {
    render(<App />);
    openBench();

    const lambda = screen.getByLabelText("Taux d'arrivée λ, valeur exacte");
    fireEvent.change(lambda, { target: { value: '2' } });

    // La raison est dite deux fois : au bouton et dans le bloc théorie.
    expect(screen.getAllByText(/aucun régime stationnaire/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Simuler' })).toHaveProperty('disabled', true);
    // Et le bouton grisé porte son explication.
    expect(document.querySelector('.why')).toBeTruthy();
  });

  it('accepte la même charge dès qu\'une capacité borne le système', () => {
    render(<App />);
    openBench();
    fireEvent.change(screen.getByLabelText("Taux d'arrivée λ, valeur exacte"), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('Capacité K, valeur exacte'), {
      target: { value: '5' },
    });

    expect(screen.getByRole('button', { name: 'Simuler' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));
    last();
    const header = document.querySelector('.qstage__top') as HTMLElement;
    expect(within(header).getByText(/perdu/)).toBeTruthy();
    expect(header.querySelector('[data-warn="true"]')).toBeTruthy();
  });

  it('pose aussi des questions sur le prochain événement', () => {
    render(<App />);
    openBench();
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));
    enableQuiz();
    // Au départ, un seul événement est programmé : rien à deviner avant la suite.
    expect(reachQuestion()).toBe(true);

    expect(screen.getByText(/prochain événement/)).toBeTruthy();
    expect(quizOptions().length).toBeGreaterThan(1);
  });

  it('abandonne la simulation quand un paramètre change', () => {
    render(<App />);
    openBench();
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));
    expect(screen.getByText('Système vide')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Graine aléatoire, valeur exacte'), {
      target: { value: '42' },
    });
    expect(screen.getByText('Aucune simulation')).toBeTruthy();
  });

  it('garde les deux ateliers indépendants', () => {
    render(<App />);
    run();
    expect(screen.getByText('Initialisation')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: "Files d'attente" }));
    expect(screen.getByText('Aucune simulation')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Graphes' }));
    // La trace du graphe a survécu au passage sur l'autre atelier.
    expect(screen.getByText('Initialisation')).toBeTruthy();
  });
});
