// Pages publiques servies avec <meta name="robots" content="noindex"> : prérendues, mais hors sitemap.
export const NOINDEX_PATHS = ['/legal', '/cgu', '/cgv', '/confidentialite']

// Single source of truth for public, indexable pages. It feeds both sitemap.xml
// and the static HTML emitted for crawlers that do not execute JavaScript.
export const SITE_URL = 'https://venio.paris'

export const publicRoutes = [
  {
    path: '',
    priority: '1.0',
    changefreq: 'weekly',
    title: 'Conseil, communication et plateformes métier à Paris · Venio',
    description:
      'Conseil stratégique, conseil en communication, sites web et plateformes métier sur mesure à Paris. Un livrable que vous gardez, un code qui vous appartient.',
    h1: 'Stratégie, communication et plateformes métier sur mesure',
    content:
      'Venio donne un cap clair, une communication qui porte et des outils conçus pour votre métier : un état des lieux écrit, un plan de communication qui tient, des sites et plateformes codés de zéro qui vous appartiennent.',
  },
  {
    path: '/services/sites',
    priority: '0.9',
    changefreq: 'monthly',
    title: 'Création de sites web sur mesure à Paris | Venio',
    description:
      'Création de sites web sur mesure à Paris. Un site qui vous appartient, rapide, clair et pensé pour durer.',
    h1: 'Sites web sur mesure',
    content:
      'Pas de modèle tout fait. Venio crée des sites utiles, performants et cohérents avec votre activité, de la stratégie au déploiement.',
  },
  {
    path: '/conseil-communication',
    priority: '0.8',
    changefreq: 'monthly',
    title: 'Conseil marketing et communication à Paris | Venio',
    description:
      'Diagnostic, positionnement, plan de communication, contenus et mesure : cinq prestations indépendantes, chacune avec un livrable écrit que vous gardez.',
    h1: 'Conseil marketing et communication',
    content:
      'On clarifie ce que vous dites, on choisit où le dire, et on coupe ce qui ne rapporte pas. Chaque étape produit un document que vous gardez.',
  },
  {
    path: '/realisations',
    priority: '0.8',
    changefreq: 'weekly',
    title: 'Réalisations : sites, marques et projets digitaux | Venio',
    description:
      'Les études de cas et témoignages Venio sont publiés uniquement avec accord client et éléments vérifiables.',
    h1: 'Réalisations',
    content:
      'Les preuves publiques Venio sont attribuées, autorisées et reliées aux offres concernées. Les références non vérifiables ne sont pas publiées.',
  },
  {
    path: '/methode',
    priority: '0.7',
    changefreq: 'monthly',
    title: 'Méthode de travail : étapes et livrables | Venio',
    description:
      'Découvrez la méthode Venio : cadrage, conception, construction, recette et transmission, avec des livrables et une cadence clairs.',
    h1: 'Méthode de travail',
    content:
      'Venio fait avancer les projets avec des étapes visibles, des livrables nommés et un rythme de décision clair.',
  },
  {
    path: '/a-propos',
    priority: '0.7',
    changefreq: 'monthly',
    title: 'À propos de Venio, studio digital à Paris | Venio',
    description:
      'Découvrez Venio, studio digital à Paris : une approche directe de la stratégie, de la marque et du développement web.',
    h1: 'Le marché est saturé de promesses creuses.',
    content:
      'Venio aide les organisations à construire ce qui doit exister : une marque solide, un digital utile et des décisions assumées.',
  },
  {
    path: '/contact',
    priority: '0.8',
    changefreq: 'monthly',
    title: 'Contactez Venio | Studio digital à Paris',
    description:
      'Parlons de votre projet de site web, de marque ou de stratégie digitale avec Venio, studio digital à Paris.',
    h1: 'Contact',
    content:
      'Un projet de site, de marque ou de stratégie ? Présentez-nous votre besoin et construisons une réponse concrète.',
  },
  {
    path: '/legal',
    priority: '0.3',
    changefreq: 'yearly',
    title: 'Mentions légales | Venio',
    description: 'Mentions légales du site venio.paris.',
    h1: 'Mentions légales',
    content: 'Informations légales, conditions générales de vente et informations relatives au site venio.paris.',
  },
  {
    path: '/cgu',
    priority: '0.3',
    changefreq: 'yearly',
    title: 'Conditions générales d’utilisation | Venio',
    description: 'Conditions générales d’utilisation du site venio.paris.',
    h1: 'Conditions générales d’utilisation',
    content: 'Conditions d’accès et d’utilisation des services proposés sur venio.paris.',
  },
  {
    path: '/cgv',
    priority: '0.3',
    changefreq: 'yearly',
    title: 'Conditions générales de vente | Venio',
    description: 'Conditions générales de vente de Venio.',
    h1: 'Conditions générales de vente',
    content: 'Conditions applicables aux prestations et services proposés par Venio.',
  },
  {
    path: '/confidentialite',
    priority: '0.3',
    changefreq: 'yearly',
    title: 'Politique de confidentialité | Venio',
    description: 'Politique de confidentialité et informations sur les données personnelles de Venio.',
    h1: 'Politique de confidentialité',
    content: 'Informations sur la collecte, l’utilisation et la protection des données personnelles par Venio.',
  },
]
