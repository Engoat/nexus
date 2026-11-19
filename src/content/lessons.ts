/**
 * Course material.
 *
 * Kept apart from the algorithms on purpose: an algorithm module should contain
 * an algorithm, and a lesson should be rewritable without touching code that
 * runs. A test checks that every registry entry has a lesson, so one cannot be
 * forgotten.
 *
 * Written for a student meeting the subject for the first time: short
 * paragraphs, no formula without its meaning, and the vocabulary defined once
 * in the shared glossary rather than redefined in every lesson.
 */

export interface Lesson {
  /** What the learner should remember if they remember one thing. */
  readonly idea: string;
  /** What problem it solves, and where it is met in real life. */
  readonly what: readonly string[];
  /** How it proceeds, in the order the trace shows it. */
  readonly how: readonly string[];
  /** What to look at while the animation plays. */
  readonly watch: readonly string[];
  /** When it applies, and when it does not. */
  readonly conditions: readonly string[];
  readonly complexity: { readonly line: string; readonly why: string };
  /** Mistakes a student actually makes. */
  readonly pitfalls: readonly string[];
  /** Keys into GLOSSARY. */
  readonly terms: readonly string[];
  readonly formulas?: readonly { readonly label: string; readonly body: string }[];
  /** Other entries worth comparing with, and why. */
  readonly seeAlso?: readonly { readonly id: string; readonly why: string }[];
}

export const GLOSSARY: Record<string, string> = {
  sommet:
    "Un point du graphe. Selon ce qu'on modélise, c'est une ville, une page web, une tâche " +
    'ou un carrefour.',
  arête:
    'Un lien entre deux sommets. Dans un graphe non orienté elle se parcourt dans les deux ' +
    'sens ; orientée, on parle plutôt d\'arc.',
  arc: "Une arête à sens unique : elle va de son origine vers sa destination, pas l'inverse.",
  degré:
    "Le nombre d'arêtes qui touchent un sommet. Sur un graphe orienté on distingue le degré " +
    "entrant (ce qui arrive) du degré sortant (ce qui part).",
  chemin:
    'Une suite de sommets reliés de proche en proche. Sa longueur est le nombre d\'arêtes ' +
    'parcourues, ou la somme des poids si le graphe est pondéré.',
  cycle:
    'Un chemin qui revient à son point de départ. Un graphe sans cycle orienté est dit ' +
    'acyclique, et seul ce cas permet un tri topologique.',
  connexe:
    "Un graphe est connexe quand on peut aller de n'importe quel sommet à n'importe quel " +
    'autre. Sinon il se découpe en plusieurs composantes.',
  composante:
    'Un morceau du graphe dont tous les sommets communiquent entre eux, mais pas avec le ' +
    'reste.',
  poids:
    "Un nombre porté par une arête : une distance, un coût, une durée. Sans poids, chaque " +
    'arête compte pour 1.',
  capacité:
    "Le débit maximal d'une arête dans un problème de flot : combien d'unités peuvent y " +
    'passer au plus.',
  arbre:
    "Un graphe connexe sans cycle. Un arbre à n sommets a toujours exactement n − 1 arêtes, " +
    'ni plus ni moins.',
  'arbre couvrant':
    'Un arbre qui touche tous les sommets du graphe en n\'utilisant que ses arêtes. Minimal ' +
    'quand la somme de ses poids est la plus petite possible.',
  'file (FIFO)':
    'Premier entré, premier sorti. On ajoute à la fin, on retire au début, comme une file ' +
    "de clients à un guichet.",
  'pile (LIFO)':
    'Dernier entré, premier sorti. On ajoute et on retire du même côté, comme une pile ' +
    'd\'assiettes.',
  'file à priorité':
    'Une file où le prochain sorti est le plus petit selon une clé, et non le plus ancien. ' +
    'Un tas binaire la réalise avec un coût logarithmique.',
  'union-find':
    "Une structure qui répond à « ces deux sommets sont-ils déjà dans le même groupe ? » " +
    'presque instantanément, et qui sait fusionner deux groupes.',
  relaxation:
    'Tenter une amélioration : si passer par u rend v plus proche, on met à jour la distance ' +
    'de v. Les algorithmes de plus courts chemins ne font que cela, dans des ordres différents.',
  invariant:
    "Une propriété vraie à chaque étape, et pas seulement à la fin. C'est elle qui fait la " +
    'preuve de correction, et ici elle est vérifiée pendant le calcul.',
  'coupe minimale':
    'Une façon de séparer la source du puits en coupant des arêtes, dont la somme des ' +
    'capacités est la plus petite possible.',
  'flot résiduel':
    'Ce qu\'il reste de disponible sur chaque arc, plus la possibilité d\'annuler du flot ' +
    'déjà envoyé en revenant en arrière.',
};

export const LESSONS: Record<string, Lesson> = {
  /* ---------------------------------------------------------------- BFS */
  bfs: {
    idea:
      'On explore le graphe par cercles concentriques : tous les voisins directs, puis tous ' +
      'leurs voisins, et ainsi de suite.',
    what: [
      "Le parcours en largeur répond à la question « quel est le chemin le plus court en " +
        'nombre d\'étapes ? ». C\'est lui qui calcule la distance de Kevin Bacon entre deux ' +
        'acteurs, le plus petit nombre de coups pour résoudre un casse-tête, ou le nombre de ' +
        'correspondances entre deux stations.',
      'Il sert aussi, plus modestement, à savoir ce qui est atteignable depuis un point : tout ' +
        'ce que le parcours ne touche pas est dans une autre composante.',
    ],
    how: [
      'On met la source dans une file et on lui donne la distance 0.',
      'On sort le premier de la file. Pour chacun de ses voisins encore inconnus, on note sa ' +
        'distance (celle du sommet courant plus un), on retient par qui on est arrivé, et on ' +
        "l'ajoute en fin de file.",
      'On recommence jusqu\'à ce que la file soit vide. Un voisin déjà connu est ignoré : on ' +
        'ne peut pas lui trouver mieux plus tard.',
    ],
    watch: [
      'La file ne contient jamais que deux niveaux à la fois : des sommets à distance k et ' +
        'des sommets à distance k+1. Regarde le tableau des distances pendant la lecture.',
      'Les sommets changent de couleur dans un ordre strict : découvert (bleu), puis traité ' +
        '(vert). Jamais l\'inverse.',
      "À la fin, les sommets restés en pointillés ne sont pas atteignables depuis la source.",
    ],
    conditions: [
      'Fonctionne sur tout graphe, orienté ou non.',
      'Donne le plus court chemin seulement si toutes les arêtes comptent pareil. Dès qu\'il ' +
        'y a des poids différents, il faut Dijkstra.',
    ],
    complexity: {
      line: 'O(V + E)',
      why:
        'Chaque sommet entre une fois dans la file et chaque arête est lue une fois depuis ' +
        'chacune de ses extrémités. Rien ne se répète, donc le coût est proportionnel à la ' +
        'taille du graphe.',
    },
    pitfalls: [
      'Utiliser BFS sur un graphe pondéré en croyant obtenir le chemin le moins coûteux. Il ' +
        'donne le chemin avec le moins d\'arêtes, ce qui est souvent plus cher.',
      'Marquer un sommet au moment où on le sort de la file plutôt qu\'au moment où on le ' +
        'découvre : il entre alors plusieurs fois et le parcours se dérègle.',
    ],
    terms: ['sommet', 'arête', 'chemin', 'file (FIFO)', 'composante'],
    seeAlso: [
      { id: 'dfs', why: 'Même structure, une pile au lieu d\'une file, et une forme totalement différente.' },
      { id: 'dijkstra', why: 'Le même principe, mais avec des poids : la file devient une file à priorité.' },
    ],
  },

  /* ---------------------------------------------------------------- DFS */
  dfs: {
    idea:
      'On s\'enfonce aussi loin que possible dans une direction, et on ne revient en arrière ' +
      "que lorsqu'il n'y a plus rien à explorer devant.",
    what: [
      'Le parcours en profondeur est la façon naturelle de visiter un labyrinthe : on suit un ' +
        'couloir jusqu\'au bout, puis on rebrousse chemin au dernier embranchement.',
      'Il sert surtout de brique de base : détecter un cycle, trier des tâches par dépendances, ' +
        'trouver les composantes fortement connexes, tout cela se lit dans les dates de visite ' +
        'que DFS calcule au passage.',
    ],
    how: [
      'On empile la source et on la colore en gris : gris veut dire « exploration en cours ».',
      'On regarde le sommet au sommet de la pile. S\'il a un voisin encore blanc, on y descend ' +
        'et on empile ce voisin.',
      'Sinon, le sommet est terminé : on le dépile, il passe en noir, et on note sa date de fin.',
    ],
    watch: [
      'Les sommets gris forment toujours exactement le chemin en cours, de la racine jusqu\'au ' +
        'sommet exploré. C\'est l\'invariant affiché à droite.',
      'Un arc qui pointe vers un sommet gris est un arc arrière : il referme un cycle. C\'est ' +
        'la seule chose à retenir pour détecter un cycle.',
      'Les intervalles [début, fin] s\'emboîtent comme des parenthèses bien formées. Deux ' +
        'intervalles ne se chevauchent jamais à moitié.',
    ],
    conditions: [
      'Fonctionne sur tout graphe, orienté ou non, pondéré ou non : il ne regarde que les liens.',
      'Ne donne aucune garantie de plus court chemin : le premier chemin trouvé vers un sommet ' +
        'peut être le plus long.',
      'En version récursive, un graphe profond fait déborder la pile d\'appels. L\'implémentation ' +
        'utilisée ici est itérative pour cette raison.',
    ],
    complexity: {
      line: 'O(V + E)',
      why: 'Comme BFS : chaque sommet est ouvert puis fermé une fois, chaque arc examiné une fois.',
    },
    pitfalls: [
      'Prendre le premier chemin trouvé pour le plus court. DFS ne cherche pas le plus court.',
      'Sur un graphe non orienté, compter l\'arête par laquelle on est arrivé comme un arc ' +
        'arrière, et conclure à tort qu\'il y a un cycle.',
    ],
    terms: ['sommet', 'arc', 'cycle', 'pile (LIFO)', 'composante'],
    seeAlso: [
      { id: 'bfs', why: 'La comparaison des deux parcours sur le même graphe est l\'exercice le plus parlant.' },
      { id: 'topological-sort', why: 'Les dates de fin de DFS donnent directement un ordre topologique.' },
    ],
  },

  /* ---------------------------------------------------------------- Dijkstra */
  dijkstra: {
    idea:
      'On fixe les sommets du plus proche au plus lointain. À chaque tour, le plus proche ' +
      'encore ouvert ne peut plus être amélioré : on le grave dans le marbre.',
    what: [
      "C'est l'algorithme du calcul d'itinéraire. Chaque arête porte une durée ou une " +
        'distance, et on cherche le trajet de coût total minimal depuis un point de départ.',
      'Il donne en une seule exécution les distances vers tous les sommets, pas seulement vers ' +
        'une destination. Un GPS fait exactement cela, en s\'arrêtant dès que la destination ' +
        'est fixée.',
    ],
    how: [
      'La source est à 0, tous les autres sommets à l\'infini.',
      'On sort du tas le sommet de plus petite distance provisoire et on le déclare définitif.',
      'Pour chacun de ses voisins, on tente une relaxation : si passer par lui fait mieux, on ' +
        'met la nouvelle distance à jour et on réinsère le voisin dans le tas.',
      'On recommence. Un sommet déjà fixé qui ressort du tas est une entrée périmée, on la jette.',
    ],
    watch: [
      'Les sommets sont fixés par distance croissante. Si cet ordre était violé, l\'algorithme ' +
        'serait faux : c\'est exactement ce que vérifie l\'invariant affiché.',
      'Le tas peut contenir plusieurs fois le même sommet, avec des clés différentes. Seule la ' +
        'plus petite compte, les autres sont jetées plus tard.',
      'Une relaxation qui échoue est aussi instructive qu\'une réussie : regarde la ligne de ' +
        'pseudocode surlignée et le calcul affiché.',
    ],
    conditions: [
      'Exige des poids positifs ou nuls, sans exception.',
      "Avec un poids négatif, un sommet déjà fixé pourrait encore être amélioré, et tout " +
        "l'argument s'écroule. L'outil refuse alors d'exécuter et renvoie vers Bellman-Ford.",
    ],
    complexity: {
      line: 'O((V + E) log V)',
      why:
        'Chaque arête peut provoquer une insertion dans le tas, et chaque opération de tas ' +
        'coûte log du nombre d\'éléments. D\'où le facteur logarithmique, absent de BFS.',
    },
    pitfalls: [
      'L\'appliquer malgré un poids négatif « juste pour voir ». Le résultat est faux sans que ' +
        'rien ne le signale, sauf ici où la condition est vérifiée avant.',
      'Confondre distance provisoire et distance définitive. Tant qu\'un sommet n\'est pas sorti ' +
        'du tas, sa distance peut encore baisser.',
    ],
    terms: ['poids', 'chemin', 'file à priorité', 'relaxation'],
    formulas: [
      { label: 'Relaxation', body: 'si dist[u] + poids(u, v) < dist[v]\n   alors dist[v] ← dist[u] + poids(u, v)' },
    ],
    seeAlso: [
      { id: 'bellman-ford', why: 'Plus lent, mais accepte les poids négatifs et détecte les cycles négatifs.' },
      { id: 'bfs', why: 'Le cas particulier où tous les poids valent 1.' },
    ],
  },

  /* ---------------------------------------------------------------- Bellman-Ford */
  'bellman-ford': {
    idea:
      'On relâche toutes les arêtes, encore et encore. Après k tours, tous les chemins de k ' +
      'arêtes au plus sont corrects.',
    what: [
      'Bellman-Ford résout le même problème que Dijkstra, mais il accepte les poids négatifs : ' +
        'un gain, une remise, un dénivelé descendant.',
      'Il sait aussi répondre « ce problème n\'a pas de solution » quand un cycle de poids ' +
        'négatif est atteignable, ce que Dijkstra ne peut pas faire.',
    ],
    how: [
      'La source est à 0, tous les autres à l\'infini.',
      'On parcourt la liste complète des arcs et on tente une relaxation sur chacun. C\'est une ' +
        'passe.',
      'On refait V − 1 passes au maximum. Si une passe ne change rien, le point fixe est atteint ' +
        'et on peut s\'arrêter plus tôt.',
      'Une dernière passe sert de contrôle : si une arête améliore encore, c\'est qu\'un cycle ' +
        'négatif existe.',
    ],
    watch: [
      'Les distances se propagent par vagues, une arête de plus par passe. Avec un chemin de ' +
        'quatre arcs, la bonne valeur n\'apparaît qu\'à la quatrième passe.',
      'Sur l\'exemple « Cycle négatif », l\'invariant des prédécesseurs finit par être violé : ' +
        'c\'est le signal, pas un bug.',
      'La question posée en mode question est la bonne question à se poser : la passe suivante ' +
        'va-t-elle encore changer quelque chose ?',
    ],
    conditions: [
      'Accepte les poids négatifs sur un graphe orienté.',
      'Sur un graphe non orienté, une arête négative est déjà un cycle négatif : on la ' +
        'parcourt dans un sens puis dans l\'autre. Le problème n\'a alors pas de solution.',
    ],
    complexity: {
      line: 'O(V · E)',
      why:
        'V − 1 passes, chacune parcourant les E arcs. Nettement plus lent que Dijkstra, et ' +
        "c'est le prix de l'acceptation des poids négatifs.",
    },
    pitfalls: [
      'Oublier la passe de contrôle, et rendre des distances fausses sur un graphe à cycle ' +
        'négatif au lieu de signaler le problème.',
      'Faire V passes au lieu de V − 1 et croire que la dernière corrige quelque chose : elle ' +
        'ne sert qu\'à détecter.',
    ],
    terms: ['arc', 'poids', 'cycle', 'relaxation'],
    seeAlso: [
      { id: 'dijkstra', why: 'Plus rapide dès que tous les poids sont positifs.' },
    ],
  },

  /* ---------------------------------------------------------------- Kruskal */
  kruskal: {
    idea:
      'On trie toutes les arêtes par poids et on prend les moins chères, en sautant celles qui ' +
      'fermeraient un cycle.',
    what: [
      'Relier n points au moindre coût total : un réseau électrique, une fibre entre bâtiments, ' +
        'un câblage. On veut que tout communique, sans payer une arête de trop.',
      "Le résultat est un arbre couvrant minimal. Son poids est unique, mais sa forme peut " +
        'varier quand plusieurs arêtes ont le même poids.',
    ],
    how: [
      "On trie toutes les arêtes du graphe par poids croissant, une fois pour toutes.",
      'Au départ, chaque sommet est seul dans sa propre composante.',
      'Pour chaque arête dans l\'ordre : si ses deux extrémités sont dans des composantes ' +
        'différentes, on la retient et on fusionne les deux composantes. Sinon on la rejette.',
      'On s\'arrête dès qu\'on a n − 1 arêtes : l\'arbre est complet.',
    ],
    watch: [
      'La liste des composantes, à droite, fusionne à chaque arête retenue. Leur nombre ' +
        'décroît de 1 exactement à chaque fois.',
      'Une arête rejetée l\'est toujours parce que ses deux bouts sont déjà reliés. Regarde les ' +
        'composantes au moment du rejet.',
      'Le compte d\'arêtes retenues vaut toujours « sommets moins composantes ». Cet invariant ' +
        'est vérifié à chaque étape.',
    ],
    conditions: [
      'Graphe non orienté. La notion d\'arbre couvrant n\'a pas de sens avec des sens uniques.',
      'Si le graphe n\'est pas connexe, le résultat est une forêt : un arbre par composante.',
    ],
    complexity: {
      line: 'O(E log E)',
      why:
        'Le tri des arêtes domine tout le reste. Les tests et fusions d\'union-find sont ' +
        'presque constants grâce à la compression de chemin.',
    },
    pitfalls: [
      'Oublier de vérifier le cycle et obtenir un graphe avec boucle au lieu d\'un arbre.',
      'Croire que l\'arbre couvrant minimal contient forcément l\'arête la plus légère de ' +
        'chaque sommet. C\'est souvent vrai, pas toujours.',
    ],
    terms: ['arête', 'poids', 'arbre', 'arbre couvrant', 'union-find', 'composante'],
    seeAlso: [
      { id: 'prim', why: 'Même résultat, raisonnement opposé : par croissance au lieu du tri global.' },
    ],
  },

  /* ---------------------------------------------------------------- Prim */
  prim: {
    idea:
      'On part d\'un sommet et on fait grossir un seul arbre, en ajoutant chaque fois la ' +
      'moins chère des arêtes qui en sortent.',
    what: [
      'Même problème que Kruskal, autre stratégie : au lieu de considérer toutes les arêtes du ' +
        'graphe, on ne regarde que la frontière de ce qui est déjà relié.',
      'C\'est la méthode naturelle quand on construit réellement le réseau au fur et à mesure, ' +
        'depuis un point d\'ancrage.',
    ],
    how: [
      'On met le sommet de départ dans l\'arbre et toutes ses arêtes dans un tas.',
      'On extrait du tas l\'arête la plus légère. Si elle mène à un sommet déjà dans l\'arbre, ' +
        'on la jette : elle est devenue interne.',
      'Sinon on la retient, le nouveau sommet rejoint l\'arbre, et ses arêtes sortantes ' +
        'entrent dans le tas.',
    ],
    watch: [
      'La propriété de coupe, affichée en invariant : l\'arête retenue est bien la plus légère ' +
        'de toutes celles qui franchissent la frontière. C\'est là toute la preuve.',
      'Le tas grossit puis se vide : il contient des arêtes devenues inutiles, écartées au ' +
        'moment où elles sortent.',
      'Sur un graphe non connexe, Prim s\'arrête en laissant des sommets dehors, alors que ' +
        'Kruskal construit une forêt complète. La comparaison côte à côte le montre bien.',
    ],
    conditions: [
      "Graphe non orienté : la notion d'arbre couvrant suppose des liens à double sens.",
      'Ne couvre que la composante du sommet de départ : les autres restent dehors.',
    ],
    complexity: {
      line: 'O(E log V)',
      why:
        'Chaque arête peut entrer dans le tas depuis chacune de ses deux extrémités, et chaque ' +
        'opération de tas coûte un logarithme.',
    },
    pitfalls: [
      'Prendre la plus légère arête du graphe au lieu de la plus légère arête sortant de ' +
        "l'arbre. Ce n'est pas la même chose, et la deuxième est la bonne.",
      'Conclure que le graphe n\'est pas connexe parce que Prim a laissé des sommets dehors, ' +
        'sans vérifier le point de départ choisi.',
    ],
    terms: ['arête', 'poids', 'arbre couvrant', 'file à priorité'],
    seeAlso: [{ id: 'kruskal', why: 'Pour vérifier que les deux trouvent le même poids total.' }],
  },

  /* ---------------------------------------------------------------- Tri topologique */
  'topological-sort': {
    idea:
      'On sort d\'abord ce qui ne dépend de rien, puis ce qui ne dépend plus que de choses ' +
      'déjà sorties.',
    what: [
      'Ordonner des tâches liées par des dépendances : compiler des modules, suivre des ' +
        'prérequis de cours, installer des paquets, exécuter des cellules de calcul.',
      'Un ordre topologique existe si et seulement si le graphe est sans cycle orienté. Si ' +
        'A attend B et B attend A, aucun ordre ne peut convenir, et c\'est un résultat utile ' +
        'en soi.',
    ],
    how: [
      'On compte, pour chaque sommet, son nombre de prédécesseurs (le degré entrant).',
      'Les sommets de degré entrant nul ne dépendent de rien : ils sont prêts.',
      'On en sort un, on l\'ajoute à l\'ordre, et on décrémente le degré entrant de tous ses ' +
        'successeurs. Ceux qui tombent à zéro deviennent prêts à leur tour.',
      'Si on finit sans avoir sorti tous les sommets, les restants forment un cycle.',
    ],
    watch: [
      'La colonne « prêts » se remplit et se vide : c\'est le vivier des tâches lançables tout ' +
        'de suite. Sa taille indique combien on pourrait en traiter en parallèle.',
      'Le niveau affiché par sommet donne la profondeur des dépendances, donc le nombre ' +
        "minimal d'étapes si tout ce qui est indépendant avançait en même temps.",
      'Sur l\'exemple « Dépendance circulaire », S sort, puis le blocage : les trois sommets ' +
        'restants se tiennent mutuellement.',
    ],
    conditions: [
      'Graphe orienté obligatoirement.',
      'Sans cycle. Une boucle sur un sommet suffit à bloquer le tri.',
      'L\'ordre n\'est pas unique : plusieurs sommets peuvent être prêts en même temps, et tous ' +
        'les choix sont valides.',
    ],
    complexity: {
      line: 'O(V + E)',
      why: 'Chaque arc est retiré exactement une fois, chaque sommet sort une fois.',
    },
    pitfalls: [
      'Croire que l\'ordre obtenu est le seul possible, et déclarer une autre réponse fausse ' +
        'alors qu\'elle est également correcte.',
      'Oublier de vérifier le compte final et rendre un ordre partiel sur un graphe cyclique.',
    ],
    terms: ['arc', 'degré', 'cycle'],
    seeAlso: [
      { id: 'dfs', why: 'L\'ordre inverse des dates de fin de DFS est aussi un ordre topologique.' },
    ],
  },

  /* ---------------------------------------------------------------- Flot */
  'edmonds-karp': {
    idea:
      'Tant qu\'il reste un chemin de la source au puits avec de la place, on y pousse le ' +
      'maximum possible. Quand il n\'y a plus de chemin, le flot est maximal.',
    what: [
      "Combien d'eau, de données ou de camions peut-on faire passer d'un point à un autre " +
        'dans un réseau où chaque conduite a un débit maximal ?',
      'Le même algorithme répond à des problèmes qui n\'en ont pas l\'air : affecter des ' +
        'personnes à des postes, découper une image, planifier des équipes.',
    ],
    how: [
      'On part d\'un flot nul. Chaque arc reçoit un arc inverse de capacité nulle : il servira ' +
        'à annuler du flot envoyé à tort.',
      'On cherche un chemin de la source au puits dans le réseau résiduel, par parcours en ' +
        'largeur, donc le plus court en nombre d\'arcs.',
      'On calcule le goulot du chemin, c\'est-à-dire le minimum de ses capacités résiduelles, ' +
        'et on pousse cette quantité.',
      'Quand plus aucun chemin n\'existe, les sommets encore atteignables depuis la source ' +
        'forment la coupe minimale, et sa capacité égale le flot.',
    ],
    watch: [
      'Les arcs saturés disparaissent du réseau résiduel : c\'est pour cela que le chemin ' +
        'change à chaque augmentation.',
      'Le flot total et la capacité de la coupe finissent égaux. Ce n\'est pas une coïncidence ' +
        'mais un théorème, et l\'invariant de conservation le garantit à chaque étape.',
      'Le choix du plus court chemin augmentant, qui distingue Edmonds-Karp de Ford-Fulkerson, ' +
        'borne le nombre d\'augmentations sans dépendre des valeurs de capacité.',
    ],
    conditions: [
      'Capacités positives ou nulles sur chaque arête.',
      'Une source et un puits distincts.',
      'Sur un graphe non orienté, chaque arête est modélisée par deux arcs opposés de même ' +
        'capacité.',
    ],
    complexity: {
      line: 'O(V · E²)',
      why:
        'Le nombre d\'augmentations est borné par O(V·E) grâce au choix du plus court chemin, ' +
        'et chaque recherche de chemin coûte O(E).',
    },
    pitfalls: [
      'Oublier les arcs inverses. Sans eux, un mauvais choix initial ne peut plus être corrigé ' +
        'et le flot trouvé n\'est pas maximal.',
      'Choisir n\'importe quel chemin augmentant plutôt que le plus court : c\'est ' +
        'Ford-Fulkerson, et le nombre d\'itérations peut alors dépendre des capacités.',
    ],
    terms: ['capacité', 'flot résiduel', 'coupe minimale', 'arc'],
    formulas: [
      { label: 'Théorème flot-max / coupe-min', body: 'flot maximal = capacité de la coupe minimale' },
    ],
    seeAlso: [{ id: 'bfs', why: 'C\'est lui qui cherche chaque chemin augmentant.' }],
  },

  /* ---------------------------------------------------------------- Files d'attente */
  queue: {
    idea:
      'Une file se forme à cause de l\'irrégularité, pas du manque de moyens. Même en dessous ' +
      'de la saturation, un service irrégulier fabrique de l\'attente.',
    what: [
      'La théorie des files d\'attente décrit tout système où des clients arrivent, attendent ' +
        'leur tour et repartent : une caisse, un serveur web, un standard téléphonique, un ' +
        'atelier.',
      'On ne cherche pas à prédire un client en particulier mais des moyennes : combien de ' +
        'monde en attente, combien de temps, quelle part du temps les guichets travaillent.',
      'La notation de Kendall résume un modèle en quelques lettres. A/B/c/K se lit : loi des ' +
        'arrivées, loi des services, nombre de serveurs, capacité du système.',
    ],
    how: [
      'La simulation avance d\'événement en événement, jamais à pas de temps fixe. Chaque ' +
        'événement est une arrivée ou une fin de service.',
      'À une arrivée : s\'il y a un guichet libre, le service commence tout de suite ; sinon le ' +
        'client prend la file ; et si le système est plein, il est refusé.',
      'À une fin de service : le guichet se libère, et le premier de la file prend la place.',
      'À la fin, on compare les moyennes mesurées aux valeurs calculées analytiquement, quand ' +
        'une formule existe pour ce modèle.',
    ],
    watch: [
      'Change la loi des services de M à D sans rien toucher d\'autre : les moyennes sont les ' +
        'mêmes, mais la file se vide. Toute l\'attente venait de la variabilité.',
      'Pousse λ vers μ : l\'attente n\'augmente pas doucement, elle explose. Le facteur ' +
        '1/(1−ρ) est la raison pour laquelle un service à 95 % de charge est ingérable.',
      'Avec une capacité finie, regarde les clients refusés : le système reste stable même ' +
        'au-delà de la charge 1, au prix des pertes.',
      'Deux guichets à μ ne valent pas un guichet à 2μ : compare les deux, l\'attente diffère.',
    ],
    conditions: [
      'Les formules exactes existent pour M/M/c/K, pour M/G/1 (Pollaczek-Khinchine) et pour ' +
        'D/D/c par simple raisonnement.',
      'Pour les autres cas, l\'outil affiche une approximation et le dit, ou annonce qu\'aucune ' +
        'formule utilisable n\'existe. Une valeur de référence fausse serait pire que pas de ' +
        'référence.',
      'Toutes les formules supposent un régime stationnaire, donc une charge strictement ' +
        'inférieure à 1, sauf si la capacité est finie.',
    ],
    complexity: {
      line: 'O(n · c)',
      why:
        'n événements traités, chacun demandant de relire l\'échéancier des c guichets plus ' +
        'la prochaine arrivée.',
    },
    pitfalls: [
      'Confondre taux et durée : λ est un nombre de clients par unité de temps, 1/λ est le ' +
        'temps moyen entre deux arrivées.',
      'Comparer une simulation de trente clients à une valeur théorique et crier à l\'erreur. ' +
        'Un petit échantillon fluctue, c\'est normal : augmente le nombre de clients.',
      'Oublier que ρ ≥ 1 sans capacité finie ne veut pas dire « très chargé » mais « sans ' +
        'solution » : la file croît indéfiniment.',
      'Appliquer les formules du M/M/1 à un service régulier. Pour un M/D/1, l\'attente est ' +
        'exactement deux fois moindre.',
    ],
    terms: ['file (FIFO)'],
    formulas: [
      {
        label: 'Les grandeurs',
        body:
          'λ   clients qui arrivent par unité de temps\n' +
          'μ   clients qu\'un guichet traite par unité de temps\n' +
          'c   nombre de guichets\n' +
          'ρ   charge par guichet = λ / (c·μ)\n' +
          'L   clients dans le système (file + service)\n' +
          'Lq  clients en file seulement\n' +
          'W   temps passé dans le système\n' +
          'Wq  temps d\'attente avant service',
      },
      {
        label: 'Loi de Little',
        body: 'L = λ × W        et        Lq = λ × Wq',
      },
      {
        label: 'M/M/1',
        body: 'L = ρ / (1 − ρ)\nW = 1 / (μ − λ)\nLq = ρ² / (1 − ρ)',
      },
      {
        label: 'M/G/1, formule de Pollaczek-Khinchine',
        body:
          'Lq = ρ² (1 + Cs²) / (2 (1 − ρ))\n' +
          '\n' +
          'Cs² mesure la dispersion du service :\n' +
          '  exponentiel  Cs² = 1     → Lq = ρ²/(1−ρ)\n' +
          '  Erlang-2     Cs² = 0,5\n' +
          '  déterministe Cs² = 0     → Lq = ρ²/(2(1−ρ))',
      },
    ],
    seeAlso: [
      { id: 'bfs', why: 'La file FIFO des guichets est la même structure que celle de BFS.' },
    ],
  },
};

export function lessonFor(id: string): Lesson | undefined {
  return LESSONS[id];
}
