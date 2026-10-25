# Venio Apple

Apps iPhone, iPad, Mac et Apple Watch. Xcode 27.1, Swift 6.4 et XcodeGen ≥ 2.46. Le projet Xcode est généré depuis `project.yml`, jamais versionné.

## Lancement et vérification

- `-VenioBackend mock|live` : mock en Debug, live en Release par défaut.
- `-VenioAPIBaseURL <url>` : origine HTTP injectée ; HTTPS par défaut. HTTP est accepté uniquement en Debug sur `localhost` et `127.0.0.1`, avec un plist ATS Debug distinct. La base Release par défaut est `https://venio.paris`.
- Captures : `-VenioTheme glass|neon`, `-VenioBackground <clé>`, `-VenioAccent <clé>`, `-VenioLocale fr|en`, `-VenioTab today|pipeline|projects|quotes|figures`, `-VenioLead <id>`, `-VenioProject <id>`, `-VenioNow <ISO 8601>` (horloge mock uniquement, par exemple `2026-10-23T13:40:00+02:00` pour le RDV de 14 h), `-VenioMockRole admin`, `-VenioAdminSection business|projects|messaging|activity|tickets|dev`, `-VenioAdminItem <id>`.
- Les previews et tests utilisent le mock ou un faux transport, jamais le réseau.

```sh
cd Packages/VenioKit
swift test --disable-sandbox --cache-path .build/swiftpm-cache
```

Depuis `apps/apple/`, `xcodegen generate` prépare les schémas `Venio`, `VenioWatch` et `VenioE2E`. Pour le push simulé, builder le simulateur avec `CODE_SIGN_IDENTITY=-` (signature locale, qui embarque l'entitlement `aps-environment`).

### Parcours de bout en bout (`VenioE2E`)

Contre un backend local (jamais la prod) sur `http://127.0.0.1:5099`, avec un compte commercial de test, un Mongo local jetable et au moins un modèle de devis, un projet confié au compte et des leads qui lui sont assignés. Les tests se lancent séparément ; le serveur est coupé entre `test1` et `test2`, puis relancé avant `test3` :

```sh
xcodebuild -scheme VenioE2E -destination 'id=<UUID-iPhone>' CODE_SIGN_IDENTITY=- build-for-testing
TEST_RUNNER_VENIO_E2E_PASSWORD=… xcodebuild -scheme VenioE2E -destination 'id=<UUID-iPhone>' test-without-building -only-testing:VenioUITests/LiveJourneyTests/<test>
```

Ordre : `test1` (connexion, synchro, note en ligne), serveur coupé, `test2` (note hors ligne) et `test4` (lead hors ligne), serveur relancé, `test3` et `test5` (vidage de la file), puis en ligne `test6` (relance, étape, « Perdu » avec motif), `test7` (devis sur un lead, rattachement à un projet, envoi) `test8` (push `VENIO_QUOTE`), puis serveur coupé, `test9` (document ajouté depuis les Photos, en attente) et serveur relancé, `test10` (envoyé une seule fois). Le Mongo local doit porter les routes de documents. `LaunchTests` vérifie seulement que le lancement live ne plante pas. Pour `test8`, ajouter une image à la photothèque du simulateur avant `test9` (`xcrun simctl addmedia`) ; envoyer `Push/quote-viewed.apns`, dont le lien pointe vers l'id du projet rattaché, avec `xcrun simctl push` une vingtaine de secondes après le lancement du test, qui attend la bannière.

`TEST_RUNNER_VENIO_E2E_EMAIL` (défaut `lea@venio.test`), `TEST_RUNNER_VENIO_E2E_BASE_URL` et `TEST_RUNNER_VENIO_E2E_SHOTS` (dossier de captures) sont facultatifs.

## Session et données

Les widgets lisent un instantané JSON dans l’App Group `group.paris.venio.app` (relances, CA agrégé, objectif et apparence), sans jeton ni session, vidé à la déconnexion ou au changement de compte.

L’extension iOS « Envoyer vers Venio » dépose les fichiers et leur clé d’idempotence dans la boîte de partage de l’App Group. L’app les reprend dans sa file persistante au chargement, au premier plan ou à la notification de dépôt. Aucun jeton ni appel réseau dans l’extension : la rotation single-flight reste dans le seul processus de l’app, car rejouer un refresh révoque l’appareil. La déconnexion explicite vide la boîte, après l’avertissement des écritures perdues ; un dépôt d’un autre compte ou d’une autre origine attend son compte. Le contexte des projets est effacé dans les deux cas.

`VenioCore` contient le transport injectable, la session et le magasin SwiftData. Le couple access/refresh et les informations de session occupent une seule entrée Keychain, après premier déverrouillage, liée à cet appareil et sans iCloud. L’identifiant d’installation est séparé et survit à la déconnexion. Le Keychain et le magasin sont séparés par origine ; le magasin efface les données de l’ancien compte avant d’activer un autre utilisateur, et refuse ce changement tant que l’ancien compte a des écritures non envoyées.

Un 401 rejoint une rotation unique, puis un rejeu unique. Le couple est sauvegardé avant sa publication ; un refus de rotation ou un second 401 déconnecte. Le serveur consomme le refresh avant de répondre : la session est marquée « rotation en cours » dans le Keychain avant l'envoi, et une issue ambiguë (5xx, délai dépassé, connexion perdue, app tuée) impose une reconnexion au lieu de représenter ce refresh, ce qui révoquerait l'appareil. Seule une erreur où la requête n'est certainement pas partie (hors ligne, hôte injoignable) conserve la session. L’identité de session accompagne les opérations pour refuser les réponses tardives après déconnexion. Pas de refresh proactif.

La synchro pagine selon les permissions ; chaque page et son curseur sont sauvegardés ensemble. Les suppressions de projets emportent étapes et mises à jour. Un curseur périmé remet données et curseurs à zéro, en conservant les écritures non envoyées. Déclenchement à la connexion/reprise, au premier plan, au rafraîchissement et après vidage de la file.

Documents de projet, créations de leads, interactions et patchs entrent d’abord dans une file persistante avec leur clé d’idempotence. Le lead créé apparaît immédiatement « En attente » avec un identifiant `local-…` ; sa confirmation remplace cet identifiant dans les lectures et les écritures dépendantes. Les lectures superposent les brouillons aux données confirmées. Rejeu FIFO et copie durable des audios. Une erreur de transport conserve la clé et attend avant le rejeu ; hors documents, c’est aussi le cas d’un `409 IDEMPOTENCY_IN_PROGRESS` ou d’un `429`. Toute autre réponse HTTP est définitive : succès terminé, 4xx/5xx en échec visible. Après un échec, Réessayer utilise une nouvelle clé ; pour un 5xx ou un résultat incertain, l’interface demande de vérifier la fiche auparavant. Une écriture dont la première tentative reste sans issue connue après 23 h passe en « Résultat incertain » sans rejeu automatique. Les devis, leur rattachement/envoi et APNs restent en ligne, sans rejeu automatique sur erreur réseau. La déconnexion explicite avertit du nombre d’écritures perdues puis vide données, curseurs et file ; une expiration de session conserve la file pour une reconnexion au même compte.

`VenioCommercial` expose la session par observation, la connexion en deux étapes, les appareils, la déconnexion et les états de file. Rôle pour l’espace, permissions pour les actions ; l’objectif du mois courant vient du protocole API (40 000 € en mock), et la jauge reste masquée sans objectif. FR/EN dans les catalogues, couleurs issues de `VenioTheme`. Les préférences serveur sont appliquées au démarrage ; un changement local non envoyé est conservé par compte pour le prochain lancement, transmis avant la relecture serveur. `autoTranslate` reste local.

Push proposé après connexion chargée. À la déconnexion : badge nul et contexte Watch effacé. La Watch live reçoit les relances de l’iPhone (50 au maximum), et ses notes rejoignent la file de l’iPhone avec leur clé stable ; aucune session Bearer n’est transmise à la Watch. La démo Watch reste disponible en mock. La notification longue affiche son texte serveur ; son bouton d’appel est résolu en live depuis les correspondances devis-téléphone synchronisées par l’iPhone, et reste disponible en démo.

## Contrat mobile

Les documents de projet passent par la file hors ligne avec copie durable, clé d’idempotence et superposition des brouillons ; ils sont synchronisés sous `projectDocuments` avec le droit `view_content`. L’ajout exige `upload_project_documents` ou `edit_content`, et la visibilité client exige `edit_content`. Le mock génère les fichiers d’aperçu localement. La recherche locale couvre leads, projets et documents (⌘K, ou loupe dans Aujourd’hui).

La référence des devis vient du serveur. Un devis peut naître sur un lead ou un projet ; l’envoi reste désactivé tant qu’un devis sur lead n’est pas rattaché à un projet autorisé. Les actions de devis utilisent uniquement le `canQuote` fourni par la synchro, sans reconstruire le portefeuille. Les demandes de modification et les tickets d’un projet sont lus en ligne selon les permissions, avec cache par projet. Les rendez-vous affichent début et fin éventuelle, et ouvrent le lead lié ou le projet. Les quatre catégories APNs `VENIO_LEAD`, `VENIO_FOLLOW_UP`, `VENIO_QUOTE`, `VENIO_PROJECT` sont enregistrées sur iOS, macOS et watchOS ; la notification longue Watch utilise `VENIO_QUOTE`.

Limites restantes :

- Widgets et Live Activity non vérifiés sur appareil réel ; l’App Group exige une signature avec les droits correspondants. Les widgets reflètent le dernier chargement de l’app ; sans push, le démarrage et la fin effective d’une Live Activity dépendent de l’exécution de l’app (l’échéance rend son contenu périmé lorsque l’app est suspendue). Les RDV sans heure de fin ne déclenchent pas d’activité.
- Le code serveur `today.ts` ne sélectionne pas `leadId` dans `quotesViewedNotSigned` ; Aujourd’hui utilise le `leadId` des devis synchronisés pour ouvrir un lead connu.
- `canQuote` peut rester périmé après un changement de droits ou de propriétaire sans modification de l’objet ; le serveur revérifie chaque création et rattachement.
- L’avancement est calculé depuis les étapes synchronisées. Les événements système du CRM ne font pas partie de la synchro d’interactions. Pas de route d’envoi d’identifiants dans l’app.
- « Perdu » exige la liste de motifs du serveur (`GET /api/admin/crm/worklist`), lue en ligne puis conservée ; sans liste disponible, cette étape est indisponible.
- Le bouton d’appel de la notification longue Watch dépend du dernier contexte reçu de l’iPhone (devis envoyés non signés, 50 au maximum) et reste masqué sans téléphone unique correspondant. Non vérifié sur une Watch réelle.
