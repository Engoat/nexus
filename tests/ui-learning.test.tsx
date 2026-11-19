/**
 * @vitest-environment jsdom
 *
 * What makes the tool usable by a student: the course tab, a greyed button that
 * says why, the queue models and their notation, and the people actually moving.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/app/App';

afterEach(cleanup);

const tabButton = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });
const openTab = (name: string) => fireEvent.click(tabButton(name));
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Étape suivante' }));
const openQueues = () => fireEvent.click(screen.getByRole('button', { name: "Files d'attente" }));

/** Les actions rares sont rangées dans le menu Fichier. */
function fileAction(name: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Fichier' }));
  fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(name) }));
}

function setNumber(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(`${label}, valeur exacte`), { target: { value } });
}

/* ====================================================== onglets */

describe('rail de droite à onglets', () => {
  it('ouvre les réglages par défaut', () => {
    render(<App />);
    expect(tabButton('Réglages').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('button', { name: 'Exécuter' })).toBeTruthy();
  });

  it('bascule sur la trace après une exécution', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    expect(tabButton('Trace').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Initialisation')).toBeTruthy();
  });

  it('marque l\'onglet Trace quand une trace existe', () => {
    render(<App />);
    expect(tabButton('Trace').querySelector('.dot')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    expect(tabButton('Trace').querySelector('.dot')).toBeTruthy();
  });

  it('garde la trace en changeant d\'onglet', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    openTab('Cours');
    expect(screen.queryByText('Initialisation')).toBeNull();
    openTab('Trace');
    expect(screen.getByText('Initialisation')).toBeTruthy();
  });
});

/* ====================================================== cours */

describe('le cours', () => {
  it('explique l\'algorithme choisi', () => {
    render(<App />);
    openTab('Cours');

    const lesson = document.querySelector('.lesson') as HTMLElement;
    expect(within(lesson).getByText(/cercles concentriques/)).toBeTruthy();
    expect(within(lesson).getByText('À quoi ça sert')).toBeTruthy();
    expect(within(lesson).getByText('Comment ça marche')).toBeTruthy();
    expect(within(lesson).getByText("Ce qu'il faut regarder")).toBeTruthy();
    expect(within(lesson).getByText('Les erreurs classiques')).toBeTruthy();
    expect(within(lesson).getByText('Vocabulaire')).toBeTruthy();
  });

  it('numérote les étapes du fonctionnement', () => {
    render(<App />);
    openTab('Cours');
    expect(document.querySelectorAll('.lesson__steps li').length).toBeGreaterThan(2);
  });

  it('définit le vocabulaire sur place', () => {
    render(<App />);
    openTab('Cours');
    const terms = document.querySelector('.lesson__terms') as HTMLElement;
    expect(within(terms).getByText('file (FIFO)')).toBeTruthy();
    expect(within(terms).getByText(/Premier entré, premier sorti/)).toBeTruthy();
  });

  it('suit le changement d\'algorithme', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Dijkstra'));
    openTab('Cours');
    expect(screen.getByText(/du plus proche au plus lointain/)).toBeTruthy();
    expect(document.querySelector('.lesson__formula')?.textContent).toMatch(/dist\[u\]/);
  });

  it('permet de sauter à un algorithme à comparer', () => {
    render(<App />);
    openTab('Cours');
    const links = document.querySelector('.lesson__links') as HTMLElement;
    fireEvent.click(within(links).getByRole('button', { name: /profondeur/ }));

    // On a changé d'algorithme et on est resté dans le cours.
    expect(tabButton('Cours').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/aussi loin que possible/)).toBeTruthy();
  });

  it('est accessible depuis le bouton des réglages', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Lire le cours complet' }));
    expect(tabButton('Cours').getAttribute('aria-selected')).toBe('true');
  });
});

/* ====================================================== pourquoi c'est grisé */

describe('un bouton grisé dit pourquoi', () => {
  it('explique un graphe non orienté pour le tri topologique', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Tri topologique (Kahn)'));

    const why = document.querySelector('.why') as HTMLElement;
    expect(why).toBeTruthy();
    expect(within(why).getByText(/que sur un graphe orienté/)).toBeTruthy();
    expect(within(why).getByText(/Passe le graphe en orienté/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exécuter' })).toHaveProperty('disabled', true);
  });

  it('explique un poids négatif pour Dijkstra', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Charger un exemple'), {
      target: { value: 'negative-arc' },
    });
    fireEvent.click(screen.getByText('Dijkstra'));

    const why = document.querySelector('.why') as HTMLElement;
    // Le motif et le correctif parlent tous deux du poids négatif.
    expect(within(why).getAllByText(/poids négatif/).length).toBe(2);
    expect(within(why).getByText(/Bellman-Ford/)).toBeTruthy();
  });

  it('explique un graphe vide', () => {
    // Vider demande confirmation : on la donne.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    fileAction('Vider le graphe');
    confirm.mockRestore();

    const why = document.querySelector('.why') as HTMLElement;
    expect(within(why).getByText(/Le graphe est vide/)).toBeTruthy();
    expect(within(why).getByText(/clique dans la zone de travail/i)).toBeTruthy();
  });

  it('explique une capacité manquante pour le flot', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Flot maximal (Edmonds-Karp)'));

    const why = document.querySelector('.why') as HTMLElement;
    expect(within(why).getByText(/sans capacité/)).toBeTruthy();
  });

  it('disparaît dès que la condition est remplie', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Tri topologique (Kahn)'));
    expect(document.querySelector('.why')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Orienté'));
    expect(document.querySelector('.why')).toBeNull();
    expect(screen.getByRole('button', { name: 'Exécuter' })).toHaveProperty('disabled', false);
  });

  it('explique aussi pourquoi la lecture est impossible', () => {
    render(<App />);
    const why = document.querySelector('.transport__why') as HTMLElement;
    expect(within(why).getByText(/Aucune exécution en cours/)).toBeTruthy();
    expect(within(why).getByText(/Clique sur/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Lecture/ })).toHaveProperty('disabled', true);
  });

  it('renvoie vers les réglages quand l\'algorithme est bloqué', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Tri topologique (Kahn)'));
    const why = document.querySelector('.transport__why') as HTMLElement;
    expect(within(why).getByText(/onglet Réglages/)).toBeTruthy();
  });
});

/* ====================================================== modèles de files */

describe("modèles de files d'attente", () => {
  it('affiche le modèle en notation de Kendall et explique chaque lettre', () => {
    render(<App />);
    openQueues();
    expect((document.querySelector('.kendall__code') as HTMLElement).textContent).toBe('M/M/1');

    const legend = document.querySelector('.kendall__legend') as HTMLElement;
    expect(within(legend).getAllByText(/exponentielle/).length).toBe(2);
    expect(within(legend).getAllByText(/sans mémoire/).length).toBe(2);
  });

  it('suit le changement de loi', () => {
    render(<App />);
    openQueues();
    fireEvent.change(screen.getByLabelText('Loi des services'), { target: { value: 'D' } });

    expect((document.querySelector('.kendall__code') as HTMLElement).textContent).toBe('M/D/1');
    const legend = document.querySelector('.kendall__legend') as HTMLElement;
    expect(within(legend).getByText(/déterministe/)).toBeTruthy();
    expect(within(legend).getByText(/Toujours la même durée/)).toBeTruthy();
  });

  it('nomme un D/D/1 et prévient qu\'aucune file ne se formera', () => {
    render(<App />);
    openQueues();
    fireEvent.change(screen.getByLabelText('Loi des arrivées'), { target: { value: 'D' } });
    fireEvent.change(screen.getByLabelText('Loi des services'), { target: { value: 'D' } });

    expect((document.querySelector('.kendall__code') as HTMLElement).textContent).toBe('D/D/1');
    expect(screen.getByText(/aucune file ne se formera/)).toBeTruthy();
  });

  it('montre une attente deux fois moindre en M/D/1 qu\'en M/M/1', () => {
    render(<App />);
    openQueues();
    const wq = () => {
      const panel = screen.getByText('Ce que dit la théorie').closest('section') as HTMLElement;
      const row = within(panel).getByText('Wq').closest('tr') as HTMLElement;
      return Number(row.querySelector('td')?.textContent);
    };
    const exponential = wq();
    fireEvent.change(screen.getByLabelText('Loi des services'), { target: { value: 'D' } });
    expect(wq()).toBeCloseTo(exponential / 2, 3);
  });

  it('dit quand la théorie est approchée', () => {
    render(<App />);
    openQueues();
    fireEvent.change(screen.getByLabelText('Loi des arrivées'), { target: { value: 'E2' } });

    const panel = screen.getByText('Ce que dit la théorie').closest('section') as HTMLElement;
    expect(panel.textContent).toContain('approché');
    expect(within(panel).getByText(/Allen-Cunneen/)).toBeTruthy();
  });

  it('dit quand aucune formule ne vaut, sans inventer de chiffre', () => {
    render(<App />);
    openQueues();
    fireEvent.change(screen.getByLabelText('Loi des services'), { target: { value: 'D' } });
    setNumber('Capacité K', '5');

    const panel = screen.getByText('Ce que dit la théorie').closest('section') as HTMLElement;
    expect(panel.textContent).toContain('indisponible');
    expect(within(panel).getByText(/Aucune formule/)).toBeTruthy();
    expect(panel.querySelector('table')).toBeNull();
  });
});

/* ====================================================== la scène animée */

describe('la scène des files', () => {
  it('fait apparaître un bonhomme par client présent', () => {
    render(<App />);
    openQueues();
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));

    // Système vide au départ.
    expect(document.querySelectorAll('.qperson').length).toBe(0);
    next();
    expect(document.querySelectorAll('.qperson').length).toBe(1);
  });

  it('déplace les gens entre les étapes', () => {
    render(<App />);
    openQueues();
    setNumber("Taux d'arrivée λ", '2.5');
    setNumber('Capacité K', '6');
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));

    const positions = () =>
      [...document.querySelectorAll('.qperson')].map(
        (el) => `${el.getAttribute('data-state')}@${(el as HTMLElement).style.left}`,
      );

    const seen = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      seen.add(positions().join('|'));
      next();
    }
    // Les positions changent d'une étape à l'autre : les gens avancent vraiment.
    expect(seen.size).toBeGreaterThan(6);
  });

  it('distingue les états par un attribut, pas seulement par une couleur', () => {
    render(<App />);
    openQueues();
    setNumber("Taux d'arrivée λ", '3');
    setNumber('Capacité K', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dernière étape' }));

    const states = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      for (const el of document.querySelectorAll('.qperson')) {
        states.add(el.getAttribute('data-state') ?? '');
      }
      fireEvent.click(screen.getByRole('button', { name: 'Étape précédente' }));
    }
    expect(states.has('waiting')).toBe(true);
    expect(states.has('serving')).toBe(true);
    expect(states.has('lost')).toBe(true);
  });

  it('affiche un guichet par serveur, avec son état', () => {
    render(<App />);
    openQueues();
    setNumber('Serveurs c', '3');
    setNumber("Taux d'arrivée λ", '2.5');
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));

    const desks = document.querySelectorAll('.desk');
    expect(desks.length).toBe(3);
    next();
    expect(document.querySelectorAll('.desk[data-busy="true"]').length).toBe(1);
  });

  it('signale un système complet', () => {
    render(<App />);
    openQueues();
    setNumber("Taux d'arrivée λ", '4');
    setNumber('Capacité K', '2');
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));

    let seenFull = false;
    for (let i = 0; i < 20 && !seenFull; i += 1) {
      if (document.querySelector('.qstage__full')) seenFull = true;
      next();
    }
    expect(seenFull).toBe(true);
  });

  it('montre les trois mesures en bas de scène', () => {
    render(<App />);
    openQueues();
    fireEvent.click(screen.getByRole('button', { name: 'Simuler' }));
    const footer = document.querySelector('.qstage__bottom') as HTMLElement;
    expect(within(footer).getByText(/clients dans le système/)).toBeTruthy();
    expect(within(footer).getByText(/clients en file/)).toBeTruthy();
    expect(within(footer).getByText(/occupation des guichets/)).toBeTruthy();
  });
});
