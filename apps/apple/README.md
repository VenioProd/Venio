# Venio Apple

Apps natives iPhone, iPad, Mac et Apple Watch. **XcodeGen** : le projet se décrit dans un `project.yml` lisible et sans conflits de fusion ; le `.xcodeproj` est généré, jamais versionné. Prérequis : Xcode 27.1, Swift 6.4, XcodeGen ≥ 2.46.

## Build

Depuis `apps/apple/` :

```sh
xcodegen generate
xcodebuild -scheme Venio -destination 'generic/platform=iOS Simulator' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -scheme Venio -destination 'platform=macOS' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -scheme VenioWatch -destination 'generic/platform=watchOS Simulator' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
(cd Packages/VenioKit && swift test)
```

Arguments de lancement utiles aux captures : `-VenioTheme glass|neon`, `-VenioBackground <clé>`, `-VenioAccent <clé>`, `-VenioLocale fr|en`, `-VenioTab today|pipeline|projects|settings`, `-VenioLead lead-calder`.

## Structure

- `App/` : app iOS/iPadOS/macOS. `TabView` adaptatif (onglets en bas sur iPhone, barre en haut sur iPad, barre latérale sur Mac). Le rôle choisit l'espace ; l'espace admin est un placeholder.
- `WatchApp/` : les relances du jour, fiche et appel.
- `Packages/VenioKit` :
  - `VenioCore` : modèles alignés sur `backend/src/models`, calculs purs (`PipelineSummary`, `TodayAgenda`), contrat `VenioAPI`, `MockVenioAPI`, cache SwiftData (`CachedVenioAPI`).
  - `VenioTheme` : Liquid glass et Néon, 5 fonds × 5 accents, contraste WCAG testé sur les 50 combinaisons, préférences locales (`theme/background/accent/locale/autoTranslate`) derrière un protocole de store.
  - `VenioCommercial` : Aujourd'hui, Pipeline (liste ou kanban), fiche lead, projets en lecture seule, Réglages (Apparence, Langue), `TranslatableText`. Chaînes FR/EN dans `Resources/Localizable.xcstrings`.

## Ce qui reste mocké

- Toutes les données : `MockVenioAPI` reprend `docs/apps-natives/maquettes/donnees-demo.md` (Léa Martin connectée, horloge figée au vendredi 23 octobre 2026, 9:41, Paris). Aucun appel réseau : la vraie API se branchera par une implémentation de `VenioAPI` quand le contrat `docs/apps-natives/api-mobile.md` sera publié.
- Les préférences restent locales (pas encore de synchro serveur).
- Relance, Étape et Devis sont visibles mais désactivés sur la fiche lead.
- La traduction automatique (Apple Translation) ne fonctionne pas dans le simulateur iOS, qui répond `unsupported` : l'original s'affiche. À vérifier sur appareil ou sur Mac.
