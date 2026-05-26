# Politique de sécurité

## Versions supportées

| Version | Supportée |
|---|---|
| `main` | ✅ Branche active |
| Autres | ❌ Pas de support |

Venio est une application interne : il n'y a pas de versions taggées publiquement. Tout fix de sécurité est appliqué sur `main` et déployé immédiatement en prod (`venio.paris`).

## Signalement d'une vulnérabilité

**Ne créez pas d'issue GitHub publique** pour une vulnérabilité de sécurité.

Contactez par e-mail : **contact@venio.paris**

Indiquez dans votre message :
- Description claire de la vulnérabilité
- Étapes de reproduction (le plus précis possible)
- Impact estimé (donnée affectée, vecteur d'attaque, gravité)
- Vos coordonnées si vous souhaitez un retour

Vous recevrez un accusé de réception sous **72 h ouvrées** et un point d'avancement sous **7 jours**.

## Périmètre

**Dans le scope** :
- Application Web `https://venio.paris` (frontend + backend Express + API agent `/api/v1/agent/*`)
- Authentification, autorisations, sessions
- Manipulation de données utilisateur
- Endpoints publics (`/api/health`, formulaire de contact)

**Hors scope** :
- Attaques de type DoS volumineux (pas de bug bounty)
- Vulnérabilités sur des dépendances tierces déjà publiquement connues (vérifier `npm audit` d'abord)
- Social engineering ou phishing
- Tests sur la production sans coordination préalable

## Bonnes pratiques internes

- Secrets (`.env`, tokens, mots de passe) : **jamais commit**. Voir `backend/.env.example` et `.env.example` racine pour la liste des variables.
- Tokens d'API agent : générer via `/admin/agents`, stocker en gestionnaire de secrets (1Password, Bitwarden), ne jamais committer.
- Mots de passe utilisateur : hashés avec `bcrypt` (cost 10). Aucun `plainPassword` n'est stocké (migration `001-unset-plain-password.ts` appliquée).
- Sessions : JWT signé avec `JWT_SECRET` (rotation à prévoir en cas de compromission). Expiration par défaut 7 jours (`JWT_EXPIRES_IN`).
- Headers sécurité : Helmet en prod (CSP stricte sans `'unsafe-inline'` sur `scriptSrc`).
- Rate limits : global 200 req/min/IP, auth `/api/auth/*` plus strict.
- Monitoring : Sentry (configuré si `SENTRY_DSN` / `VITE_SENTRY_DSN` définis).

## Audits

- 2026-05-26 : audit complet de stabilisation (10 chantiers, ~28 sous-tâches). Voir tracker VENIO-52 et PRs `#75` à `#108`.
- `npm audit` : exécuté régulièrement, vulnérabilités hautes/critiques corrigées sous 7 jours.
