# Mesure, SEO et recette du site public

## Mesure respectueuse de la vie privée

Le site envoie uniquement des compteurs agrégés first-party vers `POST /api/public/analytics/event`. Il ne crée ni ne lit de cookie, stockage local, identifiant visiteur, IP, user-agent, référent ou paramètre d’URL.

Les seules dimensions conservées sont le jour UTC, le chemin public, le type d’événement, un identifiant de CTA contrôlé par le code, et un compteur. Les taux affichés sont donc des ratios d’événements, jamais des visiteurs uniques.

Événements :

- `page_view`
- `cta_click`
- `contact_form_started`
- `contact_form_submitted`
- `contact_form_succeeded`
- `contact_form_failed`

Le formulaire utilise EmailJS en production. En recette, `VITE_CONTACT_FORM_MODE=test` active un transport local sans appel réseau et une question mathématique fixe.

## Objectifs et lecture mensuelle

La page admin **Statistiques & Reporting** affiche les six derniers mois : vues, clics CTA, formulaires aboutis, taux CTA et taux formulaire. Les objectifs mensuels par défaut sont 500 vues, 30 clics CTA et 5 formulaires. Ils sont ajustables au déploiement sans toucher au code :

```dotenv
PUBLIC_ANALYTICS_GOAL_PAGE_VIEWS=500
PUBLIC_ANALYTICS_GOAL_CTA_CLICKS=30
PUBLIC_ANALYTICS_GOAL_CONTACT_FORMS=5
```

Lecture recommandée chaque début de mois : comparer le dernier mois à sa cible, puis lire les CTA par page avant de modifier une offre ou un parcours. Une baisse de formulaire sans baisse de CTA indique un problème du formulaire ou de qualification ; une baisse de CTA avec des vues stables indique un problème de proposition ou de placement.

## Préparer Google Search Console

La configuration doit être faite par un propriétaire du domaine ; elle n’est pas exécutée par le code ni par la CI.

1. Ouvrir une propriété de domaine `venio.paris` dans Search Console.
2. Vérifier la propriété par l’enregistrement DNS TXT fourni par Google (préféré), ou par le mécanisme validé par le responsable DNS.
3. Déclarer `https://venio.paris/sitemap.xml` après le prochain déploiement.
4. Vérifier que `robots.txt` pointe vers ce sitemap et que les URL canoniques utilisent `https://venio.paris`.
5. Chaque mois, consulter l’indexation, les erreurs d’exploration et les requêtes de recherche dans Search Console à côté du tableau de conversion.

Ne pas mettre de jeton Google, de fichier de vérification privé ou de secret dans le dépôt.

## Recette publique déterministe

`npm run test:public` construit le site en mode test, valide les métadonnées, canoniques, sitemap, liens internes, prérequis d’accessibilité statique et budgets gzip. Playwright lance ensuite un navigateur local sur le build, teste le formulaire sans EmailJS et produit les captures `home-mobile.png`, `home-desktop.png` et `contact-mobile.png` dans `test-results/public-captures`.

La recette ne charge aucune page distante. Seule l’installation initiale de Chromium par Playwright est mise en cache dans GitHub Actions.
