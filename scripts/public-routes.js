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
    path: '/au-dela-du-site',
    priority: '0.8',
    changefreq: 'monthly',
    title: 'Conseil, développeur et agence communication à Paris | Venio',
    description:
      'Autour du site : conseil stratégique, développeur sur mesure et agence communication à Paris. Trois métiers activés seulement si vous en avez besoin.',
    h1: 'Au-delà du site',
    content:
      'Conseil stratégique, développement sur mesure et communication : trois métiers Venio, activés seulement quand ils servent votre projet.',
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
