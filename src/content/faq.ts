/**
 * Source unique des questions fréquentes de la home.
 *
 * Elle alimente à la fois l'accordéon `<Faq>` et le JSON-LD `FAQPage` injecté
 * au runtime par `StructuredData`. Ne recopiez jamais ces textes ailleurs :
 * une question qui diverge de sa réponse balisée est une pénalité de
 * référencement, pas une coquille.
 *
 * Contraintes de contenu : aucun chiffre qui ne soit pas déjà tenu ailleurs
 * sur le site (seul « 48 h ouvrées » l'est), aucun numéro de téléphone, et
 * aucune promesse que le devis ne reprendrait pas.
 */
export interface FaqItem {
  question: string
  answer: string
}

export const HOME_FAQ: FaqItem[] = [
  {
    question: 'Un site « sur mesure », ça veut dire quoi exactement ?',
    answer:
      'Qu’on part de ce que vous avez à dire, pas d’un modèle acheté dans lequel on glisserait vos textes. La structure des pages, le design et le code sont faits pour votre activité. Deux clients du même métier ne repartent pas avec le même site.',
  },
  {
    question: 'À qui appartient le code du site ?',
    answer:
      'À vous. Le code vous est remis à la livraison et il est lisible : si un jour vous travaillez avec quelqu’un d’autre, tout part avec vous et n’importe quel développeur peut reprendre le travail. On ne vous enferme pas dans un outil que nous seuls savons manipuler.',
  },
  {
    question: 'Comment se passe un devis ?',
    answer:
      'On commence par un échange pour comprendre ce que le site doit faire. Vous recevez ensuite un devis écrit qui pose le périmètre, les livrables, le calendrier et le prix. Tant qu’il n’est pas accepté, rien n’est engagé — ni de votre côté, ni du nôtre.',
  },
  {
    question: 'Combien de temps prend un projet ?',
    answer:
      'Ça dépend du périmètre : une vitrine et une plateforme métier ne se mesurent pas de la même façon. Le calendrier est donné dans le devis, avec les étapes et les moments où on attend une réponse de votre part. On ne s’engage pas sur une durée avant d’avoir compris le besoin.',
  },
  {
    question: 'Que se passe-t-il après la mise en ligne ?',
    answer:
      'Soit vous repartez avec votre site et vous le gérez comme vous l’entendez, soit vous nous confiez le webmastering : hébergement, entretien, mises à jour et modifications courantes. Dans les deux cas le code reste le vôtre, et vous pouvez arrêter sans perdre votre site.',
  },
  {
    question: 'Que faut-il préparer avant un premier échange ?',
    answer:
      'Rien. Venez avec votre activité, ce qui vous bloque aujourd’hui et ce que le site devrait changer. Si vous avez déjà un site, son adresse suffit. Écrivez à contact@venio.paris : on répond sous 48 h ouvrées, et on vous dit aussi quand ce n’est pas pour nous.',
  },
]

/** /services/sites — ce que les visiteurs demandent avant de choisir un palier. */
export const SITES_FAQ: FaqItem[] = [
  {
    question: 'Pourquoi pas un template ou WordPress ?',
    answer:
      'Parce qu’un modèle acheté est conçu pour tout le monde, donc pour personne. Les extensions s’empilent, une mise à jour casse quelque chose, et le jour où vous voulez évoluer, il faut tout refaire. On écrit chaque site de zéro : l’architecture correspond à votre besoin réel, et le code est documenté.',
  },
  {
    question: 'Qu’est-ce qui change entre les cinq paliers ?',
    answer:
      'L’ambition du projet, pas la qualité du travail. Une vitrine présente une activité ; une boutique vend en ligne ; une plateforme fait tourner un métier. Le palier fixe le périmètre — nombre de parcours, fonctionnalités, intégrations — et c’est lui qu’on cale ensemble avant de chiffrer.',
  },
  {
    question: 'Le webmastering, c’est quoi exactement ?',
    answer:
      'Hébergement, entretien, mises à jour techniques, sauvegardes et modifications courantes : votre site reste vivant sans que vous ayez à y toucher. C’est une option, pas une obligation. Vous pouvez la prendre plus tard, ou l’arrêter — le site reste le vôtre dans tous les cas.',
  },
  {
    question: 'Peut-on commencer petit et évoluer ensuite ?',
    answer:
      'Oui, et c’est même le cas le plus fréquent. Un site écrit sur mesure s’agrandit ; un modèle tout fait se refait. On construit la première version en sachant ce qui viendra après, pour que l’étape suivante s’ajoute au lieu de tout remplacer.',
  },
  {
    question: 'Et le référencement ?',
    answer:
      'Les bases sont dans le travail, pas en supplément : structure des pages, contenus lisibles, temps de chargement, données structurées, plan du site. On ne promet pas de position sur Google — personne ne peut la garantir — et on vous dit franchement quand le sujet relève du contenu plutôt que de la technique.',
  },
  {
    question: 'Qui écrit les textes et fournit les images ?',
    answer:
      'Vous les fournissez, ou on s’en charge — c’est une ligne du devis, décidée avant de commencer. Ce qu’on ne fait pas, c’est livrer un site rempli de faux textes en attendant les vôtres : un site qui ne dit rien ne sert à rien.',
  },
]

/** /au-dela-du-site — trois métiers qu’on n’active que s’ils servent. */
export const AU_DELA_FAQ: FaqItem[] = [
  {
    question: 'Peut-on prendre un seul de ces trois métiers ?',
    answer:
      'Oui. Conseil, développement et marque sont indépendants. On les active quand ils servent votre projet, pas pour allonger une facture. Si un seul suffit, on ne vous en vend pas trois.',
  },
  {
    question: 'Quand le conseil sert-il vraiment ?',
    answer:
      'Quand la décision n’est pas prise : ce qu’il faut faire, dans quel ordre, et ce qui coûte cher pour rien. Si vous savez déjà quoi faire et cherchez quelqu’un pour valider, on vous le dira — et on ne prendra pas la mission.',
  },
  {
    question: 'Développement sur mesure ou logiciel du marché ?',
    answer:
      'Le logiciel du marché gagne dès qu’il couvre l’essentiel du besoin, et on vous dira lequel regarder. Le sur-mesure se justifie quand votre façon de travailler est le cœur du métier et qu’aucun outil ne la suit — typiquement le tableur qui a atteint ses limites.',
  },
  {
    question: 'Qu’est-ce que vous appelez « marque » ?',
    answer:
      'Un nom, une voix et un système : de quoi écrire, décliner et tenir dans le temps sans nous rappeler à chaque production. Ce n’est pas un logo livré seul. Et si le problème est commercial, une belle marque ne remplira pas un carnet vide — on le dit avant, pas après.',
  },
  {
    question: 'Faut-il un site fait par Venio pour y accéder ?',
    answer:
      'Non. Ces trois métiers se prennent séparément, avec ou sans site de notre part. Le site est le cœur de ce qu’on fait, pas un péage.',
  },
  {
    question: 'Comment savoir de quoi relève mon besoin ?',
    answer:
      'Dites-nous où vous en êtes, sans le traduire d’avance en prestation. C’est notre travail de nommer ce dont il s’agit — et de vous le dire quand la réponse n’est aucun des trois.',
  },
]

/** /methode — ce qu’on attend du client, et ce qu’il reçoit. */
export const METHODE_FAQ: FaqItem[] = [
  {
    question: 'Qu’attend-on de moi pendant le projet ?',
    answer:
      'Des décisions aux moments prévus, et vos contenus quand ils vous incombent. Le calendrier nomme chaque point où on a besoin d’une réponse. Un projet qui glisse, c’est presque toujours une validation qui attend.',
  },
  {
    question: 'Que se passe-t-il si je change d’avis en cours de route ?',
    answer:
      'On en parle et on mesure : certaines demandes tiennent dans le périmètre, d’autres le déplacent. Dans le second cas, vous recevez un avenant écrit avant qu’on touche à quoi que ce soit. Aucune ligne n’apparaît sur une facture sans avoir été acceptée.',
  },
  {
    question: 'Comment les retours sont-ils gérés ?',
    answer:
      'Regroupés par jalon plutôt que reçus au fil de l’eau, avec une réponse à chacun. C’est ce qui garde le rythme : dix retours traités ensemble coûtent moins cher que dix allers-retours isolés.',
  },
  {
    question: 'Qu’est-ce que la recette ?',
    answer:
      'La phase où vous vérifiez, sur un environnement de test, que le travail correspond à ce qui était prévu. On vous donne la liste des points à contrôler ; les corrections de recette font partie du projet, elles ne se facturent pas en plus.',
  },
  {
    question: 'Que reçoit-on à la livraison ?',
    answer:
      'Le site ou l’outil en ligne, les accès, le code, et la documentation utile pour le reprendre. On fait une prise en main pour que vous ne dépendiez pas de nous au premier changement.',
  },
  {
    question: 'Et si on veut continuer à travailler ensemble ?',
    answer:
      'C’est le webmastering, ou une nouvelle phase avec son propre cadrage. Rien n’est reconduit automatiquement : le suivi se souscrit, il ne s’impose pas.',
  },
]

/** /a-propos — les questions qui viennent quand on veut savoir à qui on parle. */
export const APROPOS_FAQ: FaqItem[] = [
  {
    question: 'Venio, c’est qui ?',
    answer:
      'Un studio web à Paris qui dessine et code des sites et des plateformes sur mesure, et qui intervient autour : conseil, développement, marque. Pas un réseau de sous-traitants : les gens qui parlent avec vous sont ceux qui font le travail.',
  },
  {
    question: 'Decisio, Creatio, Formatio : quel rapport avec Venio ?',
    answer:
      'Ce sont nos pôles — communication juridique, supports de cours, formations professionnelles. Ils existent parce qu’on a construit ces outils pour de vrais besoins. Vous n’avez pas à les connaître pour travailler avec nous.',
  },
  {
    question: 'Vous refusez des projets ?',
    answer:
      'Oui, quand on n’est pas le bon interlocuteur ou qu’un projet ne tient pas debout. Un refus dit tout de suite coûte moins cher qu’un devis accepté par politesse — et on vous oriente ailleurs quand on peut.',
  },
  {
    question: 'Travaillez-vous en dehors de Paris ?',
    answer:
      'Oui. On est à Paris et on s’y déplace volontiers, mais un projet se mène très bien à distance : les échanges sont cadrés par les jalons, pas par la géographie.',
  },
  {
    question: 'Avec quelles technologies travaillez-vous ?',
    answer:
      'Des technologies web standard, choisies pour la durée plutôt que pour la nouveauté, et un code que n’importe quel développeur peut reprendre. On ne choisit pas un outil parce qu’il est à la mode, et on ne vous enferme pas dans ce que nous seuls savons manipuler.',
  },
  {
    question: 'Par où commence-t-on ?',
    answer:
      'Par un échange. Vous dites où vous en êtes, on dit franchement si c’est pour nous. Si oui, un devis écrit suit ; si non, vous l’aurez su en une conversation.',
  },
]
