/**
 * @vitest-environment jsdom
 *
 * End-to-end smoke test of the real interface. Not a snapshot: it drives the app
 * the way a user does, so a runtime crash or a broken wiring fails the build
 * instead of being discovered by opening a browser.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../src/app/App';

afterEach(cleanup);

/** The canvas draws one <g class="node"> per node. */
function nodeCount(container: HTMLElement): number {
  return container.querySelectorAll('g.node').length;
}

function edgeCount(container: HTMLElement): number {
  return container.querySelectorAll('path.edge-line').length;
}

/** Les outils d'édition forment un groupe nommé : on y cible sans ambiguïté. */
function tool(name: RegExp | string) {
  return within(screen.getByRole('group', { name: "Outils d'édition" })).getByRole('button', {
    name,
  });
}

/** Position et longueur de la trace, lues dans la barre de lecture. */
function position(): { index: number; total: number } {
  const text = (document.querySelector('.transport__count') as HTMLElement).textContent ?? '';
  const [index, total] = text.split('/').map((p) => Number(p.trim()));
  return { index, total };
}

describe('interface', () => {
  it('démarre sur un graphe et sans erreur', () => {
    const { container } = render(<App />);
    expect(screen.getByText('Nexus')).toBeTruthy();
    // L'exemple de départ : 6 sommets, 6 arêtes.
    expect(nodeCount(container)).toBe(6);
    expect(edgeCount(container)).toBe(6);
  });

  it('propose les huit algorithmes', () => {
    render(<App />);
    for (const name of [
      'Parcours en largeur (BFS)',
      'Parcours en profondeur (DFS)',
      'Dijkstra',
      'Bellman-Ford',
      'Kruskal',
      'Prim',
      'Tri topologique (Kahn)',
      'Flot maximal (Edmonds-Karp)',
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it('exécute un algorithme et affiche la première étape', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));

    // Le panneau d'analyse montre l'étape courante et le compteur.
    expect(screen.getByText('Initialisation')).toBeTruthy();
    const { index, total } = position();
    expect(index).toBe(1);
    expect(total).toBeGreaterThan(5);
    // Le pseudocode est présent et une ligne est active.
    expect(document.querySelector('.pseudo li[data-active="true"]')).toBeTruthy();
  });

  it('avance et recule dans la trace', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    const first = (document.querySelector('.step-head b') as HTMLElement).textContent;

    fireEvent.click(screen.getByRole('button', { name: 'Étape suivante' }));
    const second = (document.querySelector('.step-head b') as HTMLElement).textContent;
    expect(second).not.toBe(first);

    fireEvent.click(screen.getByRole('button', { name: 'Étape précédente' }));
    expect((document.querySelector('.step-head b') as HTMLElement).textContent).toBe(first);
  });

  it('colore les sommets selon l\'état de l\'algorithme', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dernière étape' }));

    const marks = [...container.querySelectorAll('g.node')].map((n) => n.getAttribute('data-mark'));
    // En fin de BFS, plus aucun sommet atteint ne doit rester « idle ».
    expect(marks.filter((m) => m === 'idle')).toHaveLength(0);
    expect(marks).toContain('settled');
  });

  it('abandonne la trace dès que le graphe change', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    expect(screen.getByText('Initialisation')).toBeTruthy();

    // Changer une propriété du graphe est une modification de structure.
    fireEvent.click(screen.getByLabelText('Orienté'));

    expect(screen.queryByText('Initialisation')).toBeNull();
    expect(screen.getByText('Aucune exécution en cours.')).toBeTruthy();
  });

  it('bloque un algorithme dont les conditions ne sont pas réunies', () => {
    render(<App />);
    // Le tri topologique exige un graphe orienté ; l'exemple ne l'est pas.
    fireEvent.click(screen.getByText('Tri topologique (Kahn)'));
    expect(screen.getByText(/n'a de sens que sur un graphe orienté/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exécuter' })).toHaveProperty('disabled', true);
  });

  it('débloque le tri topologique quand le graphe devient orienté', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Tri topologique (Kahn)'));
    fireEvent.click(screen.getByLabelText('Orienté'));
    expect(screen.getByRole('button', { name: 'Exécuter' })).toHaveProperty('disabled', false);
  });

  it('avertit sans bloquer quand les poids seront ignorés', () => {
    render(<App />);
    fireEvent.click(screen.getByLabelText('Pondéré'));
    expect(screen.getByText(/BFS ignore les poids/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exécuter' })).toHaveProperty('disabled', false);
  });

  it('crée un sommet au clic dans la zone de travail', () => {
    const { container } = render(<App />);
    const before = nodeCount(container);

    fireEvent.click(tool('Sommet'));
    const background = container.querySelector('rect.canvas__page') as Element;
    fireEvent.pointerDown(background, { clientX: 300, clientY: 200, pointerId: 1 });

    expect(nodeCount(container)).toBe(before + 1);
  });

  it('annule et rétablit une création de sommet', () => {
    const { container } = render(<App />);
    const before = nodeCount(container);

    fireEvent.click(tool('Sommet'));
    const background = container.querySelector('rect.canvas__page') as Element;
    fireEvent.pointerDown(background, { clientX: 320, clientY: 240, pointerId: 1 });
    expect(nodeCount(container)).toBe(before + 1);

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(nodeCount(container)).toBe(before);

    fireEvent.click(screen.getByRole('button', { name: 'Rétablir' }));
    expect(nodeCount(container)).toBe(before + 1);
  });

  it('relie deux sommets avec l\'outil Arête', () => {
    const { container } = render(<App />);
    const before = edgeCount(container);

    fireEvent.click(tool('Arête'));
    const nodes = container.querySelectorAll('g.node');
    // A et F ne sont pas voisins dans l'exemple de départ.
    fireEvent.pointerDown(nodes[0], { pointerId: 1 });
    fireEvent.pointerDown(nodes[5], { pointerId: 1 });

    expect(edgeCount(container)).toBe(before + 1);
  });

  it('supprime un sommet et ses arêtes avec l\'outil Effacer', () => {
    const { container } = render(<App />);
    const beforeNodes = nodeCount(container);
    const beforeEdges = edgeCount(container);

    fireEvent.click(tool('Effacer'));
    fireEvent.pointerDown(container.querySelectorAll('g.node')[0], { pointerId: 1 });

    expect(nodeCount(container)).toBe(beforeNodes - 1);
    expect(edgeCount(container)).toBeLessThan(beforeEdges);
  });

  it('charge un exemple et sélectionne son algorithme', () => {
    const { container } = render(<App />);
    fireEvent.change(screen.getByLabelText('Charger un exemple'), { target: { value: 'flow' } });

    // Le réseau de référence : 6 sommets, 10 arcs.
    expect(nodeCount(container)).toBe(6);
    expect(edgeCount(container)).toBe(10);

    const picker = screen.getByText('Flot maximal (Edmonds-Karp)').closest('button');
    expect(picker?.getAttribute('aria-pressed')).toBe('true');
  });

  it('trouve le flot maximal 23 sur le réseau de référence', () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText('Charger un exemple'), { target: { value: 'flow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dernière étape' }));

    const conclusions = document.querySelector('.conclusions') as HTMLElement;
    expect(within(conclusions).getByText(/Flot maximal : 23/)).toBeTruthy();
    expect(within(conclusions).getByText(/Coupe minimale de capacité 23/)).toBeTruthy();
  });

  it('affiche une légende limitée aux états réellement rencontrés', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));
    const legend = document.querySelector('.legend') as HTMLElement;
    expect(legend).toBeTruthy();
    // BFS ne sature aucune capacité : cet état ne doit pas figurer.
    expect(legend.textContent).not.toContain('saturée');
    expect(legend.textContent).toContain('fixé');
  });

  it('modifie le poids d\'une arête depuis l\'inspecteur', () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByLabelText('Pondéré'));
    fireEvent.pointerDown(container.querySelector('path.edge-hit') as Element, { pointerId: 1 });

    const weight = screen.getByLabelText('Poids') as HTMLInputElement;
    fireEvent.change(weight, { target: { value: '7' } });
    expect((screen.getByLabelText('Poids') as HTMLInputElement).value).toBe('7');
  });

  it('garde la frise cliquable et synchronisée', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Exécuter' }));

    const bars = screen.getAllByRole('button', { name: /^Étape \d+ :/ });
    // Une barre par étape : la frise ne résume pas, elle montre tout.
    expect(bars.length).toBe(position().total);

    fireEvent.click(bars[10]);
    expect(position().index).toBe(11);
  });
});
