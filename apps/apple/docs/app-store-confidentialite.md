# App Store Connect — confidentialité et revue

## App Privacy : saisie

« Collectez-vous des données ? » **Oui**. Pour chacun des types suivants : **collectée Oui**, **liée à l’utilisateur Oui**, **suivi Non**, finalité **Fonctionnement de l’app** uniquement :

- Coordonnées : nom, adresse e-mail, numéro de téléphone.
- Contacts : prospects et coordonnées extraites des cartes de visite.
- Contenu utilisateur : photos ou vidéos, données audio (notes vocales), autres contenus utilisateur (documents, notes, projets et échanges professionnels).
- Identifiants : identifiant utilisateur ; identifiant de l’appareil (installation, appareil mobile et jeton push).

Diagnostics : données de crash **Non**, performances **Non**, autres diagnostics **Non**. Aucun Sentry, Crashlytics ou autre SDK de télémétrie trouvé dans les sources Apple ni dans `VenioKit/Package.swift` ; Sentry côté backend n’est pas un collecteur de crash de l’app. Aucun suivi publicitaire, aucun domaine de suivi. Autres types de données : **Non** au regard du code actuel ; Face ID et transcription restent sur l’appareil.

## Manifestes : raisons déclarées

`NSPrivacyAccessedAPICategoryUserDefaults` : **CA92.1** (préférences privées à l’app) dans App, WatchApp, Widgets (qui lie VenioTheme) et ShareExtension (projets récents). App/VenioApp, Shared/WatchBridge, WatchApp/VenioWatchApp et VenioKit (ThemeManager, AppLock, MessageTemplates, SessionModel) utilisent `UserDefaults.standard`.

L’App Group est utilisé pour un **fichier JSON** (`VenioCore/WidgetSnapshot.swift`), sans `UserDefaults(suiteName:)` : **1C8F.1 non déclaré**. `NSPrivacyAccessedAPICategoryFileTimestamp` : **C617.1** dans App, qui lit la date de création des dépôts de la boîte de partage (`VenioCore/ShareInbox.swift`) dans son App Group. Aucun accès trouvé à l’uptime (`systemUptime`, `mach_absolute_time`), à l’espace disque ni au clavier actif. Aucune raison pour ces catégories. Les widgets ne transmettent aucune donnée hors appareil.

[Codes Apple des API à raison déclarée](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).

## Chiffrement : saisie

**ITSAppUsesNonExemptEncryption = NO**. L’app utilise le chiffrement fourni par le système : HTTPS via URLSession, Keychain (`SecItem*`, `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`) et stockage local système. Le relevé des sources Apple et des dépendances Swift ne trouve aucun algorithme propriétaire, CryptoKit/CommonCrypto, AES/RSA implémenté ou bibliothèque de chiffrement embarquée. Répondre « chiffrement limité à celui du système d’exploitation Apple » ; aucun document de chiffrement à joindre pour ce périmètre. Revoir cette réponse si une dépendance ajoute du chiffrement.

## Compte de démo : procédure

1. Utiliser une instance backend isolée, avec Mongo local dédié et `MFA_ENABLED=false`. Aucun `.env` n’est chargé par le script. Depuis `backend/` :
   ```sh
   npm run provision:app-review:dry -- --uri mongodb://127.0.0.1:27017/venio_app_review_demo
   npm run provision:app-review -- --uri mongodb://127.0.0.1:27017/venio_app_review_demo
   ```
   Alternative : `APP_REVIEW_MONGODB_URI`. Refus avant connexion de `NODE_ENV=production`, URI/base contenant `prod`, Atlas/SRV, ou base distante sans `demo`, `staging` ou `test`. Ne jamais diriger ce script vers la production.
2. Les comptes `lea@app-review.venio.test` (**COMMERCIAL**) et `admin@app-review.venio.test` (**ADMIN**) passent le contrôle mobile. Leurs mots de passe forts sont uniquement dans `backend/.app-review-credentials.local.json` (0600, ignoré). Les rejouer conserve les secrets ; `--rotate` les renouvelle et invalide les sessions existantes. Hugo et les clients fictifs sont aussi provisionnés pour les relations de données.
3. Avant soumission, rendre cette instance accessible en HTTPS et **configurer le build soumis pour cette origine de démo** : fournir `VENIO_API_BASE_URL=https://<hôte-démo>` au script TestFlight (ou au réglage Xcode homonyme). Cette valeur est embarquée dans Info.plist et validée par l’app ; les arguments de lancement Xcode ne sont pas nécessaires au reviewer. Le défaut Release reste `https://venio.paris`. Un provisionnement local seul ne rend pas les comptes utilisables dans le build distribué ; aucun déploiement n’est effectué ici.
4. Dans « Informations pour la revue » et « Informations de test bêta », saisir l’identifiant et le mot de passe de Léa depuis le fichier local ; ajouter le compte admin dans les notes pour l’espace Mac. Ne pas copier ces secrets dans le dépôt, un ticket ou les logs. Indiquer : connexion sans 2FA, pipeline, fiche Maison Calder, devis, RDV Atelier Nova, projet Agence Pilote et ajout de document autorisé à Léa.
5. Les données reprennent `docs/apps-natives/maquettes/donnees-demo.md` décalées d’un nombre entier de jours pour que le vendredi 23 octobre 2026 tombe le jour du provisionnement : relancer le script la veille de la soumission remet « Aujourd’hui » à jour. Les montants de pipeline sont conservés ; les phases suivent les états du modèle, sans pourcentages artificiels. La note vocale est représentée par un texte fictif, sans faux fichier audio. Les agrégats comptables et tickets de la maquette ne sont pas simulés par ce script.
6. Retrouver les objets par `app-review-demo-v1` (tags utilisateurs/projets, notes leads, intro devis/modèles, descriptions phases/mises à jour, corps interactions), ou par leurs IDs déterministes. Après la revue, supprimer la **base dédiée** et le fichier local d’identifiants ; ne pas utiliser le nettoyage générique des autres démos.
