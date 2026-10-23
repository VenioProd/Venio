# Venio Apple

XcodeGen génère le projet non versionné. Prérequis : Xcode 27.1, Swift 6.4, XcodeGen 2.46 ; plateformes Apple 27, langage Swift 6.

Depuis `apps/apple/` :

```sh
xcodegen generate
xcodebuild -scheme Venio -destination 'generic/platform=iOS Simulator' -derivedDataPath .build/DerivedData -packageCachePath .build/pkgcache -IDEPackageSupportDisableManifestSandbox=1 CODE_SIGNING_ALLOWED=NO build
xcodebuild -scheme Venio -destination 'platform=macOS' -derivedDataPath .build/DerivedData -packageCachePath .build/pkgcache -IDEPackageSupportDisableManifestSandbox=1 CODE_SIGNING_ALLOWED=NO build
xcodebuild -scheme VenioWatch -destination 'generic/platform=watchOS Simulator' -derivedDataPath .build/DerivedData -packageCachePath .build/pkgcache -IDEPackageSupportDisableManifestSandbox=1 CODE_SIGNING_ALLOWED=NO build
cd Packages/VenioKit
swift test --disable-sandbox --cache-path .build/swiftpm-cache
```

- `App/` : app iPhone, iPad et Mac ; choix de l’espace selon le rôle, lancement avec `CachedVenioAPI(MockVenioAPI)`.
- `WatchApp/` : relances en retard et du jour, fiche et appel.
- `VenioCore` : DTO, calculs purs, contrat API, mock et cache SwiftData des listes leads/projets.
- `VenioTheme` : palettes, contraste WCAG, préférences locales, fond et cartes Glass/Néon.
- `VenioCommercial` : store Observation partagé, agenda, pipeline (liste/kanban), fiches leads, projets en lecture seule, apparence et langue. `CommercialFormats.swift` centralise nombres, euros et dates à Paris.
- `Resources/Localizable.xcstrings` : interface française et anglaise ; catalogue par cible contenant des chaînes. Les previews couvrent chaque écran en Glass et Néon.

Les identités sont fictives ; Léa Martin est connectée. L’horloge de démo fixe le 23 octobre 2026 à 9:41 à Paris. Aucun réseau applicatif : le cache conserve les listes leads/projets, les autres lectures restent déléguées au mock. Les coordonnées de démonstration sont fictives ; les liens téléphone/e-mail passent par le système. Relance, Étape et Devis restent désactivés.

Les préférences locales conservent `theme/background/accent/locale/autoTranslate` derrière `ThemePreferenceStore`. Une ancienne sélection sans langue prend `system`, avec traduction auto activée. La langue change dans l’environnement SwiftUI et les catalogues du package sont résolus explicitement dans la langue choisie.

`TranslatableText` détecte la langue avec NaturalLanguage et traduit sur iOS/macOS avec Apple Translation, uniquement si le modèle est installé. Noms identifiés, coordonnées, références et nombres portent l’attribut d’exclusion de traduction. Sans modèle ou en cas d’échec : original silencieux. Watch conserve l’original. Les traductions ne sont pas stockées.

Arguments de lancement (cible app, lus via UserDefaults) : `-VenioTheme glass|neon`, `-VenioBackground mist|…`, `-VenioAccent sky|…`, `-VenioLocale fr|en`, `-VenioTab today|pipeline|projects|settings`, `-VenioLead lead-calder`. Avec une fiche lead et un onglet Projets/Réglages, Pipeline est choisi. Watch prend en charge les arguments d’apparence et de langue.

Pour signer sur appareil, sélectionner son équipe dans Xcode ; la signature reste activée dans le projet.
