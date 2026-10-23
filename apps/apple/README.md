# Venio Apple — fondations

XcodeGen garde une définition de projet lisible et reproductible, sans versionner le `.xcodeproj`.
Prérequis : Xcode 27.1, Swift 6.4, XcodeGen 2.46 ; plateformes Apple 27, langage Swift 6.

Depuis la racine du dépôt :

```sh
cd apps/apple
xcodegen generate
xcodebuild -scheme Venio -destination 'generic/platform=iOS Simulator' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -scheme Venio -destination 'platform=macOS' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
xcodebuild -scheme VenioWatch -destination 'generic/platform=watchOS Simulator' -derivedDataPath .build/DerivedData CODE_SIGNING_ALLOWED=NO build
cd Packages/VenioKit
swift test
```

- `App/` : app SwiftUI commune iPhone, iPad et Mac ; choix de l’espace selon le rôle.
- `WatchApp/` : compagnon iOS, relances en retard et du jour.
- `VenioCore` : DTO, calculs purs, contrat `VenioAPI`, mock, cache SwiftData des listes leads/projets.
- `VenioTheme` : palettes, contraste WCAG, préférences locales, vues Liquid Glass et Néon.
- `VenioCommercial` : Apparence, totaux Pipeline, accueil par rôle et relances Watch.

Les données et identités sont fictives, écrites en Swift ; Léa Martin est connectée.
`DemoClock` fixe le 23 octobre 2026 à 9:41 à Paris et peut recevoir une autre date.
Aucun réseau : `VenioAPI` est la seule couture vers une future implémentation.
Le cache conserve le DTO JSON de chaque lead/projet ; les autres lectures restent déléguées.
Les préférences restent locales ; aucune synchronisation entre appareils dans ce lot.
Les projections `viewedAt`, référence de devis et avancement attendent le futur contrat API.

Contraste connu : Glass/violet atteint 4,421698:1 avec l’encre sur l’accent, pour les cinq fonds.
Le test conserve son seuil de 4,5 et expose cette incompatibilité des couleurs prescrites.
Pour signer sur appareil, sélectionner son équipe dans Xcode ; la signature n’est pas désactivée dans le projet.
