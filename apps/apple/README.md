# Venio Apple

Apps iPhone, iPad, Mac et Apple Watch. Xcode 27.1, Swift 6.4 et XcodeGen ≥ 2.46. Le projet Xcode est généré depuis `project.yml`, jamais versionné.

## Lancement et vérification

- `-VenioBackend mock|live` : mock en Debug, live en Release par défaut.
- `-VenioAPIBaseURL <url>` : origine HTTP injectée ; HTTPS par défaut. HTTP est accepté uniquement en Debug sur `localhost` et `127.0.0.1`, avec un plist ATS Debug distinct. La base Release par défaut est `https://venio.paris`.
- Captures : `-VenioTheme glass|neon`, `-VenioBackground <clé>`, `-VenioAccent <clé>`, `-VenioLocale fr|en`, `-VenioTab today|pipeline|projects|quotes|figures`, `-VenioLead <id>`.
- Les previews et tests utilisent le mock ou un faux transport, jamais le réseau.

```sh
cd Packages/VenioKit
swift test --disable-sandbox --cache-path .build/swiftpm-cache
```

Depuis `apps/apple/`, `xcodegen generate` prépare les schémas `Venio` et `VenioWatch`. La compilation/signature iOS, macOS et Watch ainsi que la recette contre un backend local restent à effectuer dans Xcode.

## Session et données

`VenioCore` contient le transport injectable, la session et le magasin SwiftData. Le couple access/refresh et les informations de session occupent une seule entrée Keychain, après premier déverrouillage, liée à cet appareil et sans iCloud. L’identifiant d’installation est séparé et survit à la déconnexion. Le Keychain et le magasin sont séparés par origine ; le magasin efface les données de l’ancien compte avant d’activer un autre utilisateur, et refuse ce changement tant que l’ancien compte a des écritures non envoyées.

Un 401 rejoint une rotation unique, puis un rejeu unique. Le couple est sauvegardé avant sa publication ; un refus de rotation ou un second 401 déconnecte. Une panne réseau de rotation conserve les jetons et remonte l’erreur. L’identité de session accompagne les opérations pour refuser les réponses tardives après déconnexion. Pas de refresh proactif.

La synchro pagine selon les permissions ; chaque page et son curseur sont sauvegardés ensemble. Les suppressions de projets emportent étapes et mises à jour. Un curseur périmé remet données et curseurs à zéro, en conservant les écritures non envoyées. Déclenchement à la connexion/reprise, au premier plan, au rafraîchissement et après vidage de la file.

Interactions et patchs de leads entrent d’abord dans une file persistante. Les lectures superposent les brouillons aux données confirmées. Rejeu FIFO, clé d’idempotence stable, copie durable des audios, arrêt et délai croissant sur réseau/5xx/429. Les refus définitifs restent visibles avec Réessayer/Supprimer. Création de lead, devis, envoi de devis et APNs restent en ligne, sans rejeu automatique sur erreur réseau. La déconnexion explicite avertit du nombre d’écritures perdues puis vide données, curseurs et file ; une expiration de session conserve la file pour une reconnexion au même compte.

`VenioCommercial` expose la session par observation, la connexion en deux étapes, les appareils, la déconnexion et les états de file. Rôle pour l’espace, permissions pour les actions ; aucun objectif commercial en live. FR/EN dans les catalogues, couleurs issues de `VenioTheme`. Les préférences serveur sont appliquées au démarrage ; un changement local non envoyé est conservé par compte pour le prochain lancement, transmis avant la relecture serveur. `autoTranslate` reste local.

Push proposé après connexion chargée. À la déconnexion : badge nul et contexte Watch effacé. La Watch live reçoit les relances de l’iPhone (50 au maximum), et ses notes rejoignent la file de l’iPhone avec leur clé stable ; aucune session Bearer n’est transmise à la Watch. La démo Watch reste disponible en mock. La notification longue affiche son texte serveur ; son bouton d’appel n’est résolu qu’en démo.

## Limites constatées du contrat

- Synchro projets : `assignedTo` est présent, `client` est un id ; `client.ownerAdminId` manque. Sans droit de facturation, seuls les projets dont on est responsable sont donc activables pour créer un devis ; un propriétaire de compte client peut être désactivé à tort. Pas de route d’envoi d’identifiants dans l’app.
- Demandes client : filtre projet disponible, lecture en ligne si autorisée. Tickets : pas de filtre ni de rattachement projet, liste vide dans la fiche projet.
- Aujourd’hui : `meetings` contient une date sans heure ni lead ; affichage du titre et du projet sans heure inventée. Cache utilisé seulement le jour de sa récupération.
- Référence de devis absente ; avancement calculé depuis les étapes synchronisées. Les événements système du CRM ne font pas partie de la synchro d’interactions. Relance et Étape restent désactivées dans la fiche lead.
- Le serveur ne fournit pas encore `aps.category` pour l’interface longue Watch. L’exemple `Push/watch-quote-viewed.apns` le fournit pour la simulation locale.
