/**
 * @vitest-environment jsdom
 *
 * Where the controls live.
 *
 * The toolbar once held thirteen controls and that was intimidating before it
 * was useful. These tests lock the arrangement in: the bandeau stays small,
 * rare actions hide in a menu, and every other control sits next to the thing
 * it acts on.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../src/app/App';

afterEach(cleanup);

const head = () => document.querySelector('.head') as HTMLElement;
const leftRail = () => document.querySelector('.rail--left') as HTMLElement;
const transport = () => document.querySelector('.transport') as HTMLElement;
const openMenu = () => fireEvent.click(within(head()).getByRole('button', { name: 'Fichier' }));

describe('le bandeau reste sobre', () => {
  it('ne montre que quatre commandes', () => {
    render(<App />);
    // Marque, atelier (2 onglets), exemples, menu Fichier.
    const controls = head().querySelectorAll('button, select');
    expect(controls.length).toBeLessThanOrEqual(5);
  });

  it('garde le choix de l\'atelier et les exemples à portée', () => {
    render(<App />);
    expect(within(head()).getByRole('button', { name: 'Graphes' })).toBeTruthy();
    expect(within(head()).getByRole('button', { name: "Files d'attente" })).toBeTruthy();
    expect(within(head()).getByLabelText('Charger un exemple')).toBeTruthy();
  });

  it('se réduit encore sur l\'atelier des files', () => {
    render(<App />);
    const before = head().querySelectorAll('button, select').length;
    fireEvent.click(screen.getByRole('button', { name: "Files d'attente" }));
    // Ni exemples de graphe, ni menu Fichier : ils ne veulent rien dire ici.
    expect(head().querySelectorAll('button, select').length).toBeLessThan(before);
    expect(within(head()).queryByRole('button', { name: 'Fichier' })).toBeNull();
  });
});

describe('le menu Fichier', () => {
  it('range les actions rares', () => {
    render(<App />);
    expect(screen.queryByRole('menuitem')).toBeNull();

    openMenu();
    const items = screen.getAllByRole('menuitem').map((b) => b.textContent ?? '');
    expect(items.some((t) => t.includes('Importer un graphe'))).toBe(true);
    expect(items.some((t) => t.includes('Exporter le graphe'))).toBe(true);
    expect(items.some((t) => t.includes('Vider le graphe'))).toBe(true);
  });

  it('explique chaque action en un mot', () => {
    render(<App />);
    openMenu();
    const vider = screen.getByRole('menuitem', { name: /Vider le graphe/ });
    expect(vider.textContent).toContain('Annulable');
  });

  it('se ferme avec Échap', () => {
    render(<App />);
    openMenu();
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('se ferme sur un clic à côté', () => {
    render(<App />);
    openMenu();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('se ferme après avoir agi', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App />);
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: /Vider le graphe/ }));
    expect(screen.queryByRole('menuitem')).toBeNull();
    expect(screen.getByText('Graphe vide')).toBeTruthy();
    confirm.mockRestore();
  });
});

describe('chaque commande près de ce qu\'elle touche', () => {
  it('met le zoom et l\'ajustement sur le plateau', () => {
    const { container } = render(<App />);
    const view = container.querySelector('.stage__view') as HTMLElement;
    expect(view).toBeTruthy();
    expect(within(view).getByRole('button', { name: 'Zoomer' })).toBeTruthy();
    expect(within(view).getByRole('button', { name: 'Dézoomer' })).toBeTruthy();
    expect(within(view).getByRole('button', { name: 'Ajuster' })).toBeTruthy();
    // Et plus dans le bandeau.
    expect(within(head()).queryByRole('button', { name: 'Ajuster' })).toBeNull();
  });

  it('met annuler et rétablir avec les outils d\'édition', () => {
    const { container } = render(<App />);
    expect(within(leftRail()).getByRole('button', { name: 'Annuler' })).toBeTruthy();
    expect(within(leftRail()).getByRole('button', { name: 'Rétablir' })).toBeTruthy();
    expect(within(head()).queryByRole('button', { name: 'Annuler' })).toBeNull();

    // Et ils fonctionnent depuis là.
    const before = container.querySelectorAll('g.node').length;
    fireEvent.click(
      within(screen.getByRole('group', { name: "Outils d'édition" })).getByRole('button', {
        name: 'Sommet',
      }),
    );
    fireEvent.pointerDown(container.querySelector('rect.canvas__page') as Element, {
      clientX: 300,
      clientY: 220,
      pointerId: 1,
    });
    expect(container.querySelectorAll('g.node').length).toBe(before + 1);
    fireEvent.click(within(leftRail()).getByRole('button', { name: 'Annuler' }));
    expect(container.querySelectorAll('g.node').length).toBe(before);
  });

  it('met le mode question dans la barre de lecture', () => {
    render(<App />);
    expect(within(transport()).getByRole('button', { name: 'Mode question' })).toBeTruthy();
    expect(within(head()).queryByRole('button', { name: 'Mode question' })).toBeNull();
  });

  it('met la comparaison en tête des réglages', () => {
    render(<App />);
    const rail = document.querySelector('.rail--right') as HTMLElement;
    expect(within(rail).getByRole('button', { name: 'Comparer deux algorithmes' })).toBeTruthy();
    expect(within(head()).queryByRole('button', { name: /Comparer/ })).toBeNull();
  });

  it('met l\'export de la trace dans l\'onglet Trace', () => {
    render(<App />);
    // Absent avant toute exécution.
    expect(screen.queryByRole('button', { name: 'Exporter la trace' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    expect(screen.getByRole('button', { name: 'Exporter la trace' })).toBeTruthy();

    // Et pas dans le bandeau.
    expect(within(head()).queryByRole('button', { name: /Exporter/ })).toBeNull();
  });
});

describe('le cahier', () => {
  it('règle la page en Seyès : une ligne principale et trois interlignes', () => {
    const { container } = render(<App />);
    const pattern = container.querySelector('pattern#seyes') as SVGElement;
    expect(pattern).toBeTruthy();

    const lines = [...pattern.querySelectorAll('line')];
    // 3 interlignes + 1 ligne principale + 1 verticale.
    expect(lines.length).toBe(5);
    const strokes = lines.map((l) => l.getAttribute('stroke'));
    expect(strokes.filter((s) => s === 'var(--seyes)').length).toBe(1);
    expect(strokes.filter((s) => s === 'var(--seyes-soft)').length).toBe(4);
  });

  it('dessine le graphe sur la réglure, pas à côté', () => {
    const { container } = render(<App />);
    const page = container.querySelector('rect.canvas__page') as SVGElement;
    expect(page.getAttribute('fill')).toBe('url(#seyes)');
  });

  it('porte le filet de marge rouge, sans gêner les clics', () => {
    const { container } = render(<App />);
    const margin = container.querySelector('.stage__margin') as HTMLElement;
    expect(margin).toBeTruthy();
    expect(margin.getAttribute('aria-hidden')).toBe('true');
    // Il est posé sur la feuille : créer un sommet dessous marche quand même.
    fireEvent.click(
      within(screen.getByRole('group', { name: "Outils d'édition" })).getByRole('button', {
        name: 'Sommet',
      }),
    );
    const before = container.querySelectorAll('g.node').length;
    fireEvent.pointerDown(container.querySelector('rect.canvas__page') as Element, {
      clientX: 40,
      clientY: 200,
      pointerId: 1,
    });
    expect(container.querySelectorAll('g.node').length).toBe(before + 1);
  });

  it('surligne le chemin résultat au feutre', () => {
    const { container } = render(<App />);
    // BFS avec une cible produit un chemin, donc un trait de surligneur dessous.
    const target = screen.getByLabelText('Cible (optionnelle)') as HTMLSelectElement;
    const last = [...target.options].filter((o) => o.value !== '').at(-1);
    fireEvent.change(target, { target: { value: last?.value ?? '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dernière étape' }));

    expect(container.querySelectorAll('path.edge-ghost').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('path.edge-line[data-mark="path"]').length).toBeGreaterThan(0);
  });
});

describe('deux surfaces distinctes', () => {
  it('pose le plateau clair au centre et la charpente autour', () => {
    const { container } = render(<App />);
    // Le plateau porte sa propre classe et contient le canevas.
    const stage = container.querySelector('.stage') as HTMLElement;
    expect(stage.querySelector('svg.canvas')).toBeTruthy();
    // Les rails et la barre de lecture sont en dehors.
    expect(stage.querySelector('.rail')).toBeNull();
    expect(stage.querySelector('.transport')).toBeNull();
  });

  it('garde la légende et les questions sur le plateau', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    const stage = container.querySelector('.stage') as HTMLElement;
    expect(stage.querySelector('.legend')).toBeTruthy();

    fireEvent.click(within(transport()).getByRole('button', { name: 'Mode question' }));
    for (let i = 0; i < 12 && !stage.querySelector('.quiz'); i += 1) {
      const btn = screen.getByRole('button', { name: 'Étape suivante' }) as HTMLButtonElement;
      if (btn.disabled) break;
      fireEvent.click(btn);
    }
    expect(stage.querySelector('.quiz')).toBeTruthy();
  });
});
