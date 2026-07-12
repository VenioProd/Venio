// Single source of truth for public, indexable pages. It feeds both sitemap.xml
// and the static HTML emitted for crawlers that do not execute JavaScript.
export const SITE_URL = 'https://venio.paris'

export const publicRoutes = [
  {
    path: '',
    priority: '1.0',
    changefreq: 'weekly',
    title: 'Création de sites web sur mesure à Paris | Venio',
    description:
      'Studio digital à Paris. Sites web sur mesure, conseil et identité de marque — du concret, fait pour vous, pas de modèle tout fait.',
    h1: 'Construire ce qui doit exister.',
    content:
      'Venio conçoit des sites web, des identités de marque et des stratégies digitales pour les entreprises qui veulent avancer avec une direction claire.',
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
    path: '/services/communication',
    priority: '0.9',
    changefreq: 'monthly',
    title: 'Communication et identité de marque à Paris | Venio',
    description:
      'Identité de marque et communication à Paris. Une vraie marque, pas juste un logo : cohérente, qui vous ressemble et qui dure dans le temps.',
    h1: 'Communication et identité de marque',
    content:
      'Venio construit des marques lisibles et distinctives : positionnement, identité, messages et supports qui donnent une direction à votre communication.',
  },
  {
    path: '/services/developpement',
    priority: '0.9',
    changefreq: 'monthly',
    title: 'Développement web et applications sur mesure à Paris | Venio',
    description:
      'Création de sites web et d’outils sur mesure à Paris. Un site qui vous appartient, fait pour durer dix ans, pas six mois.',
    h1: 'Développement web et applications sur mesure',
    content:
      'Sites, applications et outils métier : nous développons des produits fiables, maintenables et adaptés à votre manière de travailler.',
  },
  {
    path: '/services/conseil',
    priority: '0.9',
    changefreq: 'monthly',
    title: 'Conseil stratégique et audit digital à Paris | Venio',
    description:
      'Conseil et audit pour votre digital à Paris. Un bilan sans détour, des décisions claires et des priorités utiles.',
    h1: 'Conseil stratégique et audit digital',
    content:
      'Nous auditons votre présence et votre organisation digitale pour transformer les constats en décisions, priorités et plan d’action concret.',
  },
  {
    path: '/poles',
    priority: '0.8',
    changefreq: 'monthly',
    title: 'Les pôles d’expertise Venio | Venio',
    description:
      'Découvrez les trois pôles Venio : stratégie, marque et digital, pensés pour faire avancer votre activité.',
    h1: 'Trois pôles',
    content:
      'Stratégie, communication et développement : trois expertises qui travaillent ensemble pour construire des projets cohérents.',
  },
  {
    path: '/realisations',
    priority: '0.8',
    changefreq: 'weekly',
    title: 'Réalisations : sites, marques et projets digitaux | Venio',
    description:
      'Découvrez une sélection de réalisations Venio : sites web, identités de marque et projets digitaux sur mesure.',
    h1: 'Réalisations',
    content:
      'Une sélection de projets conçus avec nos clients : des identités, des sites et des outils qui répondent à des enjeux réels.',
  },
  {
    path: '/a-propos',
    priority: '0.7',
    changefreq: 'monthly',
    title: 'À propos de Venio, studio digital à Paris | Venio',
    description:
      'Découvrez Venio, studio digital à Paris : une approche directe de la stratégie, de la marque et du développement web.',
    h1: 'Pourquoi Venio existe',
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
