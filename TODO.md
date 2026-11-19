# Nexus — reste à faire

État au 2026-10-31. Renommage GraphLab → Nexus fait (package.json, index.html, titre dans
l'interface, README, format de fichier .nexus.json, clé de sauvegarde locale). Reste : le nom
du dossier `graphlab` lui-même, à renommer `nexus` quand le dépôt n'est plus ouvert ailleurs.

## Fait

- [x] **Sauvegarde locale + lien de partage** — `src/app/persist.ts`. Autosave différée à 500 ms,
  encodage compact du graphe dans `#g=...`, un lien gagne toujours sur l'autosave au chargement.
- [x] **Générateur de graphes** — `src/app/generators.ts`. Huit formes : aléatoire, grille, arbre,
  dépendances (DAG), biparti, complet, composantes séparées, cycle négatif.
- [x] **Accessibilité de la trace** — `aria-live` sur le panneau d'étape (`AnalysisPanel.tsx`),
  navigation au clavier de voisin en voisin sur le graphe (flèches, `GraphCanvas.tsx`).

517 tests verts à ce stade.

- [x] **Logo choisi (2026-11-05) : le nœud de trèfle**, qui remplace les sept ponts écartés le même
  jour. Une seule boucle qui se croise trois fois, dessus, dessous, dessus : *nexus* vient du latin
  *nectere*, nouer. Couleur signature : violet de l'arbre `#6B2BD9` (oklch(0.50 0.23 293)), encre
  `#160F24`, fond `#F6F4F9`, dominante claire. Fichiers définitifs dans `design/logo/`.
  Reste à l'intégrer : favicon et en-tête de l'application.

## Reste à faire

### 3. Réseau de files et disciplines de service
Aujourd'hui : un guichet, une file, FIFO. Il manque plusieurs stations en série/parallèle et
d'autres disciplines (priorité, LIFO). La topologie du réseau devrait se dessiner avec l'éditeur
de graphes existant, pour que les deux ateliers se rejoignent.

### 5. Mesure empirique de complexité
Lancer un algorithme sur des graphes générés (axe 4, déjà là) de taille croissante, tracer les
compteurs déjà émis par la trace en fonction de n. O(V+E) vs O(V·E) deviennent deux courbes
visibles. Dépend du générateur, qui existe déjà — prêt à démarrer.

### 6. Algorithmes manquants
Ordre d'intérêt :
- **Tarjan** (composantes fortement connexes) — réutilise les dates de fin de DFS, déjà calculées.
- **Floyd-Warshall** — nouvelle structure d'affichage (matrice), autre paradigme (DP vs glouton).
- **A\*** — décision d'architecture à trancher avant de coder : son heuristique a besoin des
  coordonnées, que les algorithmes n'ont pas le droit de lire aujourd'hui (séparation stricte
  `GraphDocument`/`MathGraph`). Il faudra déclarer les positions comme paramètre explicite plutôt
  que percer la garantie.

### 8. Export pour rendre un devoir
Image PNG/SVG de l'étape courante, rapport Markdown ou PDF du run complet (étapes, tableaux,
conclusions). Nécessaire pour un usage réel en classe.

## Non retenu pour l'instant

- Version anglaise (après stabilisation du contenu français).
- Tenue sur les très gros graphes (pas urgent aux tailles pédagogiques actuelles).
