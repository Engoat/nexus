# Nexus

Laboratoire interactif d'algorithmique. On construit un graphe, on exécute un algorithme, et on suit son déroulé étape par étape : les structures de données, la ligne de pseudocode active, les décisions prises et les propriétés que l'algorithme doit maintenir.

L'outil est fait pour apprendre, pas pour impressionner : chaque algorithme a son cours, chaque
bouton grisé dit pourquoi il est grisé, et chaque propriété affichée est vérifiée pendant le calcul.

Deux ateliers partagent le même lecteur :

- **Graphes** : parcours, plus courts chemins, arbre couvrant, tri topologique, flot maximal.
- **Files d'attente** : simulation événementielle, pour n'importe quel couple de lois parmi
  exponentielle, déterministe et Erlang, comparée à sa solution analytique quand elle existe.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
```

| Commande | Effet |
|---|---|
| `npm run dev` | serveur de développement |
| `npm run build` | vérification de types puis build de production dans `dist/` |
| `npm run preview` | sert le build de production |
| `npm test` | 514 tests |
| `npm run test:watch` | tests en continu |
| `npm run typecheck` | `tsc --noEmit` |

Aucune dépendance au-delà de React. Pas de backend, pas de base de données, pas de clé d'API.

## Le principe

Un algorithme n'anime rien. Il **émet une trace** pendant qu'il tourne, et l'interface rejoue cette trace.

```ts
Step = {
  index, line, action, detail,   // ce qui se passe, et sur quelle ligne
  nodeMarks, edgeMarks,          // l'état visuel de chaque sommet et arête
  structures,                    // file, pile, tas, ensembles, tables
  metrics,                       // compteurs de travail réel
  invariants,                    // propriétés vérifiées à cet instant
  ask,                           // la question posée avant de révéler l'étape
  scene,                         // état propre à un atelier sans graphe
}
```

Une trace est de la donnée sérialisable. Elle s'exporte, se compare et s'assertionne dans un test. C'est ce qui rend la visualisation vérifiable au lieu de décorative : aucun panneau ne recalcule quoi que ce soit, donc l'image et les chiffres ne peuvent pas diverger.

Deux garanties sont posées au niveau du compilateur, pas dans la documentation :

- **Un algorithme ne peut pas lire une coordonnée.** `GraphDocument` porte `x` et `y`, `MathGraph` ne les porte pas, et les algorithmes ne reçoivent que `MathGraph`.
- **Le graphe confié est gelé.** `toMathGraph` renvoie un objet figé en profondeur ; une écriture lève une erreur au lieu de corrompre le document de l'éditeur.

## L'interface

### Le cahier

Tout l'outil est une page de cahier Seyès. Pas une métaphore posée sur une interface : la réglure
8 mm avec ses trois interlignes vit **dans le SVG**, donc elle se déplace et se met à l'échelle avec
le graphe, et change de pas quand on dézoome. Le filet de marge rouge, lui, appartient à la feuille
et reste fixe à 44 px du bord.

Les états d'algorithme sont des **encres de trousse** :

| État | Encre | Second indice, sans couleur |
|---|---|---|
| en cours | rouge `#C62B22` | halo pointillé, le sommet se repasse une fois |
| en attente | bleu bille `#2A51A3` | disque plein |
| fixé | vert `#19683D` | disque plein |
| arête retenue | violet `#653A9B` | trait épaissi |
| chemin résultat | encre + **surligneur** `#F7DF5A` | une bande jaune sous le trait |
| rejeté | crayon léger | pointillé, trait fin |
| hors d'atteinte | crayon léger | cercle en pointillé |

Le reste suit le même principe : la ligne de pseudocode courante est **surlignée au feutre**, la
raison d'un bouton grisé s'écrit **au stylo rouge** dans la marge, les champs de saisie ont la ligne
du bas appuyée comme une ligne à remplir, et les fiches posées sur la page (légende, questions)
portent une ombre dure vers le bleu de réglure, comme un bristol sur un cahier.

Les angles sont francs (3 px), parce que le papier ne s'arrondit pas.

Contrastes mesurés, pas estimés : 11:1 pour l'encre sur la page, 5,2 à 7,4:1 pour chaque encre de
couleur sur les panneaux, 5,5:1 minimum pour un libellé blanc dans un sommet rempli, 3:1 pour les
traits. Le crayon léger a été assombri à `#6A695D` pour rester lisible jusque dans les creux.

### Chaque commande près de ce qu'elle touche

Le bandeau tenait treize contrôles, ce qui fait peur avant de servir. Il en garde quatre : l'atelier,
les exemples, et un menu **Fichier** pour importer, exporter et vider. Le reste a déménagé là où il
agit :

| Commande | Où elle vit maintenant |
|---|---|
| zoom, ajuster à la fenêtre | sur le plateau, en bas à droite |
| annuler, rétablir | dans le rail de gauche, avec les outils d'édition |
| mode question | dans la barre de lecture, qui change la façon d'avancer |
| comparer deux algorithmes | en tête de l'onglet Réglages |
| exporter la trace | dans l'onglet Trace, et seulement s'il y a une trace |

Un test vérifie que le bandeau ne dépasse pas cinq contrôles, pour que la dérive ne revienne pas.

### Trois zones

**À gauche**, le sujet : les outils d'édition du graphe, ou le modèle de file et ses réglages.

**Au centre**, le graphe ou la salle d'attente.

**À droite**, trois onglets :

| Onglet | Contenu |
|---|---|
| **Réglages** | 1. choisis un algorithme · 2. règle ses paramètres · 3. exécute |
| **Cours** | l'idée, à quoi ça sert, comment ça marche, quoi regarder, les formules, les pièges, le vocabulaire |
| **Trace** | l'étape courante, le pseudocode synchronisé, les structures de données, les invariants, les conclusions |

**En bas**, la lecture : pas à pas, vitesse, et une frise où chaque barre est une étape.

### Un bouton grisé dit toujours pourquoi

Un contrôle désactivé qui reste muet est la façon la plus rapide de perdre un élève. Chaque raison
est affichée à côté du bouton qu'elle bloque, avec le geste qui la lève : « le graphe est vide »,
« le tri topologique n'a de sens que sur un graphe orienté », « deux arêtes de poids négatif, utilise
Bellman-Ford », « cette arête n'a pas de capacité ». La barre de lecture fait de même quand il n'y a
rien à rejouer.

## Les algorithmes

| Algorithme | Famille | Ce qu'il détecte en plus du résultat |
|---|---|---|
| Parcours en largeur | parcours | distances en arêtes, sommets inatteignables, plus court chemin |
| Parcours en profondeur | parcours | cycles, dates début/fin, classification arbre / arrière / avant / transverse |
| Dijkstra | plus courts chemins | refuse les poids négatifs plutôt que de répondre faux |
| Bellman-Ford | plus courts chemins | poids négatifs, cycle négatif nommé, arrêt au point fixe |
| Kruskal | arbre couvrant | forêt si le graphe n'est pas connexe, arêtes rejetées pour cycle |
| Prim | arbre couvrant | couverture limitée à la composante du départ |
| Tri topologique (Kahn) | ordre | cycle bloquant, profondeur des dépendances |
| Edmonds-Karp | flot | coupe minimale, chemins augmentants, conservation du flot |

Chacun déclare ses **paramètres** et ses **conditions d'application** en données. Le panneau de réglages est généré, et une condition non réunie désactive le bouton d'exécution en expliquant quoi corriger.

## Les invariants

Chaque algorithme déclare les propriétés qu'il prétend maintenir, et les évalue **sur son état interne réel** pendant qu'il tourne. Le panneau de droite montre, à chaque étape, si elles tiennent et ce qui a été comparé.

Exemples :

- BFS : « la file ne contient que des sommets de deux niveaux consécutifs ».
- Dijkstra : « aucune relaxation n'améliore la distance d'un sommet déjà fixé ».
- Kruskal : « les arêtes retenues ne forment jamais de cycle » (réaudité avec un union-find neuf).
- Prim : « l'arête retenue est la plus légère de celles qui sortent de l'arbre ».
- Edmonds-Karp : « il entre autant qu'il en sort sur chaque sommet intermédiaire ».
- File d'attente : « L = λ_eff × W », exact sur un système qui commence et finit vide.

Une violation n'est jamais masquée. Sur l'exemple **Cycle négatif**, Bellman-Ford viole volontairement « les prédécesseurs forment une forêt enracinée en la source » : c'est la signature du cycle, et un test exige cette violation.

## Le mode question

Avant de révéler une étape, l'application demande ce que l'algorithme va faire : quel sommet sort de la file, lequel va être fixé, si une arête sera retenue, quel est le goulot d'un chemin, quel sera le prochain événement de la simulation.

La bonne réponse et son explication viennent de l'algorithme lui-même, enregistrées pendant son exécution, donc la question ne peut pas contredire le déroulé. Pour une question portant sur un sommet ou une arête, les candidats sont cliquables directement sur le graphe ; les boutons restent le chemin clavier et lecteur d'écran.

## La comparaison

Deux algorithmes, le même graphe, deux vues côte à côte avancées par le même curseur. Le panneau de droite ne liste que ce qui a été **réellement comparé** entre les deux résultats : distances sommet par sommet, poids total, arêtes retenues, ordre de visite, compteurs communs. Aucune équivalence n'est affirmée sur la seule base de la famille des deux algorithmes.

## L'atelier des files d'attente

Une salle d'attente dessinée : les clients entrent par la porte, prennent la file, avancent d'un cran
quand quelqu'un est servi, passent au guichet, puis sortent. Chaque client garde son nœud du DOM
d'une étape à l'autre, donc les transitions CSS font la marche. Un client refusé se détourne et
porte la mention « refusé ».

L'horloge saute d'un événement au suivant, jamais à pas de temps fixe. Les durées sont tirées d'un
générateur à graine : même graine, même simulation.

### Les modèles

Le modèle se lit en **notation de Kendall**, A/B/c/K, et chaque lettre est expliquée dans le panneau.
Quatre lois sont disponibles pour les arrivées comme pour les services :

| Lettre | Loi | Dispersion (Cs²) | Ce que ça représente |
|---|---|---|---|
| **M** | exponentielle | 1 | durées très variables, sans mémoire |
| **E₂** | Erlang-2 | 0,5 | deux étapes obligatoires |
| **E₄** | Erlang-4 | 0,25 | proche du régulier, avec encore du hasard |
| **D** | déterministe | 0 | toujours la même durée |

### La théorie, et son statut

Le panneau de gauche affiche les valeurs analytiques **avant** toute simulation, et dit toujours
comment elles ont été obtenues :

| Modèle | Méthode | Statut |
|---|---|---|
| M/M/c/K | chaîne de naissance et de mort | exact, pour tout c et tout K |
| M/G/1 | formule de Pollaczek-Khinchine | exact, pour toute loi de service |
| D/D/c | raisonnement déterministe | exact, et personne n'attend jamais |
| G/G/c | approximation de Allen-Cunneen | approché, et annoncé comme tel |
| capacité finie, loi non exponentielle | — | aucune formule utilisable, et l'outil le dit |

Cette dernière ligne compte autant que les autres : une valeur de référence fausse serait pire que
pas de valeur de référence.

La leçon que l'atelier sert à voir : passe le service de M à D sans toucher aux taux. Les moyennes
sont identiques, et la file disparaît. L'attente ne venait pas du manque de moyens mais de
l'irrégularité. En M/D/1, l'attente vaut exactement la moitié de celle d'un M/M/1, et un test le
vérifie au dix-millième.

La simulation se vide complètement avant de mesurer. Sur un intervalle qui commence et finit vide, la
loi de Little est une identité comptable et non une approximation : elle est donc vérifiée à
l'arrondi près.

## Le cours

Chaque algorithme et le modèle de file ont une leçon écrite, dans `src/content/lessons.ts` :
l'idée en une phrase, à quoi ça sert, le fonctionnement en étapes numérotées, ce qu'il faut regarder
pendant l'animation, les formules, les conditions d'emploi, le coût expliqué et non récité, les
erreurs classiques, et le vocabulaire défini sur place.

Le contenu est séparé du code qui tourne : une leçon se réécrit sans toucher à un algorithme. Des
tests vérifient que chaque entrée du registre a sa leçon, que chaque terme cité existe dans le
glossaire, que chaque renvoi pointe sur quelque chose, et que la complexité annoncée par le cours est
bien celle que la trace rapporte.

## Ajouter un algorithme

Un fichier, une ligne dans le registre, rien à toucher dans l'interface.

```ts
export const monAlgo: AlgorithmSpec<MonResultat> = {
  id: 'mon-algo',
  name: 'Mon algorithme',
  family: 'parcours',
  summary: 'Une phrase pour le sélecteur.',
  rationale: "Pourquoi il est correct, en deux ou trois phrases.",
  params: [{ kind: 'node', id: 'source', label: 'Source', required: true }],
  invariants: INVARIANTS,
  check(graph, params) { /* conditions d'application */ },
  run(graph, params) {
    const t = new Tracer(INVARIANTS);
    // ... t.markNode, t.count, t.hold, t.ask, t.emit
    return t.build({ algorithmId: 'mon-algo', pseudocode, result, complexity, conclusions });
  },
};
```

Puis l'ajouter à `ALGORITHMS` dans `src/algorithms/registry.ts`. Treize contrats de trace s'appliquent alors automatiquement, sans écrire un test.

## Structure

```
src/
  core/        graph, adjacency, trace, rng, structures (tas, union-find)
  algorithms/  un dossier par famille, + types.ts et registry.ts
  sim/         files d'attente : theory.ts (exact), queueSim.ts (événementiel)
  app/         interface React : composants, état, dispositions, import/export
tests/         514 tests
```

## Tests

| Fichier | Portée |
|---|---|
| `graph.test.ts` | modèle, immuabilité, séparation coordonnées / structure |
| `traversal.test.ts` `shortest.test.ts` `spanning.test.ts` `order-flow.test.ts` | résultats mathématiques des huit algorithmes |
| `trace-contract.test.ts` | 13 contrats appliqués à chaque algorithme du registre |
| `queue.test.ts` | formules exactes, puis simulateur contre théorie |
| `app-layer.test.ts` | dispositions déterministes, format de fichier |
| `lessons.test.ts` | intégrité du cours : couverture, glossaire, renvois, complexités |
| `text-quality.test.ts` | garde-fou sur le français affiché et le nom des compteurs |
| `ui-smoke.test.tsx` | interface réelle pilotée sous jsdom |
| `ui-features.test.tsx` | invariants, mode question, comparaison, atelier des files |
| `ui-learning.test.tsx` | onglets, cours, boutons grisés expliqués, modèles, bonhommes qui bougent |
| `ui-layout.test.tsx` | rangement des commandes, menu, sobriété du bandeau, réglure et marge |

Les contrôles qui valent le plus sont des identités, pas des tests de fumée : Prim et Kruskal doivent trouver le même poids, Bellman-Ford doit coïncider avec Dijkstra sur poids positifs, le flot maximal du réseau CLRS doit valoir 23 et la coupe minimale exactement autant, la chaîne finie doit retrouver les formules fermées quand la capacité est grande, et deux exécutions doivent produire la trace identique.

## Accessibilité

La couleur ne porte jamais seule le sens : chaque état d'algorithme a aussi une épaisseur, un pointillé, un halo ou une forme. Navigation clavier complète (`V` `N` `E` `X` pour les outils, `Espace` lecture, `←` `→` pour les étapes, `Suppr`, `Ctrl+Z`), focus visible, `prefers-reduced-motion` respecté, cibles tactiles de 44 px minimum.

## Limites connues

- Pas de sauvegarde : recharger la page perd le graphe en cours. L'export JSON est la seule persistance.
- Pas de permalien partageable.
- Pas d'export en image.
- Interface en français seulement.
- Un seul poste de service par modèle de file : pas de réseau de files, pas de priorités, pas de
  discipline autre que premier arrivé premier servi.
- Le responsive est écrit et testé en CSS, mais n'a pas été éprouvé sur un appareil tactile réel.
- Manquent : composantes fortement connexes, A\*, Floyd-Warshall, couplage biparti, coloration. A\* demandera une décision d'architecture, puisque son heuristique a besoin des coordonnées que les algorithmes n'ont pas le droit de lire.
- Au-delà de quelques centaines de sommets, la trace devient lourde : elle conserve un instantané par étape.

## Licence

Code sous licence MIT (voir `LICENSE`). © 2026 Enzo Dylan.
