# Venio Apple

Apps natives iPhone, iPad, Mac et Apple Watch. **XcodeGen** : le projet se décrit dans un `project.yml` lisible et sans conflits de fusion ; le `.xcodeproj` est généré, jamais versionné. Prérequis : Xcode 27.1, Swift 6.4, XcodeGen ≥ 2.46.

## Build

Depuis `apps/apple/` :

```sh
xcodegen generate
xcodebuild -scheme Venio -destination 'generic/platform=iOS Simulator' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -scheme Venio -destination 'platform=macOS' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -scheme VenioWatch -destination 'generic/platform=watchOS Simulator' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
(cd Packages/VenioKit && swift test --disable-sandbox --cache-path .build/swiftpm-cache)
```

Arguments de lancement utiles aux captures : `-VenioTheme glass|neon`, `-VenioBackground <clé>`, `-VenioAccent <clé>`, `-VenioLocale fr|en`, `-VenioTab today|pipeline|projects|quotes|figures`, `-VenioLead lead-calder`.

## Structure

- `App/` : app iOS/iPadOS/macOS. `TabView` adaptatif (onglets en bas sur iPhone, barre en haut sur iPad, barre latérale sur Mac). Le rôle choisit l'espace ; l'espace admin est un placeholder.
- `WatchApp/` : les relances du jour, fiche et appel.
- `Packages/VenioKit` :
  - `VenioCore` : modèles alignés sur `backend/src/models`, calculs purs (`PipelineSummary`, `TodayAgenda`, `SalesFigures`), contrat `VenioAPI`, `MockVenioAPI`, cache SwiftData (`CachedVenioAPI`).
  - `VenioTheme` : Liquid glass et Néon, 5 fonds × 5 accents, contraste WCAG testé sur les 50 combinaisons, préférences locales (`theme/background/accent/locale/autoTranslate`) derrière un protocole de store.
  - `VenioCommercial` : Aujourd'hui, Pipeline (liste ou kanban), fiche lead, projets en lecture seule, Devis (création/envoi), Chiffres (Swift Charts), Réglages via l’avatar (Apparence, Langue), `TranslatableText`. Chaînes FR/EN dans `Resources/Localizable.xcstrings`.

## Ce qui reste mocké

- Toutes les données : `MockVenioAPI` reprend `docs/apps-natives/maquettes/donnees-demo.md` (Léa Martin connectée, horloge figée au vendredi 23 octobre 2026, 9:41, Paris). Aucun appel réseau : la vraie API se branchera par une implémentation de `VenioAPI` dans un lot ultérieur. Les écritures sont conservées par un actor pendant la session de démo.
- Les préférences restent locales (pas encore de synchro serveur).
- Relance et Étape restent désactivées. Devis dépend des permissions et d’un projet lié dans le portefeuille : les leads de démo sans compte client lié affichent l’explication prévue.
- Lot D : kanban à cinq colonnes dès 1 000 pt, entonnoir pondéré, timeline et objectif. Historique fermé séparé du pipeline ; objectif de 40 000 € injecté par l’app, hors protocole.
- Écarts au contrat : référence de devis, objectif mensuel et lien direct lead → projet absents ; aucun endpoint ajouté. Nouveau devis choisit un projet du portefeuille, sans édition de prix.
- La traduction automatique (Apple Translation) ne fonctionne pas dans le simulateur iOS, qui répond `unsupported` : l'original s'affiche. À vérifier sur appareil ou sur Mac.

## Lot E — terrain, push et Watch

- Note vocale : AAC `.m4a` avec `AVAudioRecorder`, réécoute, `SFSpeechRecognizer` strictement sur l’appareil (FR/EN), texte modifiable et langue détectée par `NLLanguageRecognizer`. Si le modèle local manque, saisie manuelle ; autorisations au geste, textes FR/EN dans `InfoPlist.xcstrings`.
- Nouveau lead : Carte / Saisie / Voix sur iPhone et iPad ; Saisie / Voix sur Mac. `DataScannerViewController` si disponible, sinon `PhotosPicker` + Vision ; fonction et site sont conservés dans les notes faute de champs dédiés au lead.
- iOS : proposition de journal après un appel lancé dans l’app et un retour sous deux heures ; durée estimée hors de l’app, sens OUT, résumé facultatif. Aucun accès au journal système iOS.
- Push : session toujours mockée ; « Activer les notifications » demande l’autorisation après chargement de l’utilisateur, au geste. Enregistrement APNs à chaque lancement autorisé, jeton hexadécimal et environnement Debug/Release mémorisés par le mock. `venio://lead/lead-calder`, `venio://quote/quote-041` et `venio://project/project-pilote` utilisent le même routeur.
- Watch : palette toujours sombre, dictée système sur le dernier lead publié par l’iPhone, texte mis en file par `transferUserInfo` avec sa clé d’idempotence ; l’iPhone conserve le brouillon jusqu’à confirmation de la NOTE et propose une reprise explicite en cas d’échec. Interface longue « Devis vu », appel uniquement si un lead unique avec téléphone est retrouvé.
- Limites serveur constatées : lead créé → `/admin/crm` sans id ; devis → projet sans id du devis (ouverture directe si un seul devis, sinon choix) ; demandes/tickets sans id projet. Ces liens non résolubles sont signalés. Le payload serveur n’a pas encore `aps.category` pour l’interface Watch ; l’exemple le fournit.
- Devis : `assignedTo` du projet ou `ownerAdminId` de son client, projeté dans `Project`, définit le portefeuille (exception `manage_billing`). Les projets hors portefeuille sont désactivés ; aucun accès à l’envoi d’identifiants client.

Push simulé : builder pour le simulateur avec `CODE_SIGN_IDENTITY=-` (signature locale, sinon l'entitlement `aps-environment` manque et l'enregistrement APNs échoue), accepter l'autorisation, puis `xcrun simctl push <UUID-iPhone> paris.venio.app Push/follow-up-due.apns` (aussi `lead-assigned`, `quote-viewed`, `project`). Watch : `xcrun simctl push <UUID-Watch> paris.venio.app.watchkitapp Push/watch-quote-viewed.apns`.
