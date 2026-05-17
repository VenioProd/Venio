# Spec #30 — UX admin Slack-like

> Issue : [VenioProd/Venio#30](https://github.com/VenioProd/Venio/issues/30)
> Owner : Claude (Opus 4.7)
> Phase : P3 Frontend
> S'appuie sur : [01 cadrage produit](./01-cadrage-produit.md),
> [02 sécurité](./02-securite-permissions-retention.md)

## 1. Principe directeur

**Dense, utilitaire, cohérent avec AdminShell. Pas de marketing, pas de
sur-décoration.** L'écran messagerie est un outil de travail interne :
on optimise pour la lisibilité, la vitesse de navigation au clavier et
la cohérence visuelle avec le reste de l'admin (`AdminNav` + `Breadcrumb`,
fond `#0a0c12`, accent cyan `#0ea5e9`, `border-radius: 8px`).

Inspirations directes : Slack desktop pour la structure, Linear pour la
densité d'info et les raccourcis clavier.

## 2. Point d'entrée

### Dans `AdminNav`
Ajouter un lien **"Messages"** dans `src/components/AdminNav.jsx`,
visible uniquement pour les users avec `VIEW_INTERNAL_MESSAGING`.
Positionné après "Tableau de bord", avant "Clients".

Le lien porte un **badge unread** :
- Aucun unread → pas de badge.
- 1–99 unread → badge avec le nombre, couleur cyan (`#0ea5e9`).
- ≥ 100 → `"99+"`.
- ≥ 1 mention non lue → badge **rouge** (`#ef4444`) qui prend le pas
  sur le cyan, même chiffre `m` au lieu du total unread (les mentions
  priment visuellement).

### Route
`/admin/messages` (cohérent avec les routes admin existantes en kebab-FR).
Sous-routes :
- `/admin/messages` → vue principale (sidebar + fil par défaut).
- `/admin/messages/c/:conversationId` → conversation ouverte.
- `/admin/messages/c/:conversationId/m/:messageId` → deep link vers un
  message précis (scroll + highlight 2s à l'arrivée).
- `/admin/messages/browse` → modal "browse channels" (overlay).
- `/admin/messages/new-dm` → modal "nouveau DM" (overlay).

Le slash route reste **dans** `AdminShell` (top nav + breadcrumb
conservés). La messagerie ne remplace pas le shell.

## 3. Structure de la page

### Layout desktop (≥ 1024 px)
```
┌──────────────────────────────────────────────────────────────────┐
│  AdminNav (60px, sticky)                                         │
├──────────────────────────────────────────────────────────────────┤
│  Breadcrumb (32px)         Admin > Messages > [#nom-conv]        │
├────────────────┬─────────────────────────────────┬───────────────┤
│                │   ConversationHeader (52px)     │               │
│   Conversation │─────────────────────────────────│   Panneau     │
│   Sidebar      │                                 │   détails     │
│   (280px)      │   MessageList (scroll)          │   (320px,     │
│                │                                 │    masqu-     │
│                │                                 │    able)      │
│                │                                 │               │
│                │─────────────────────────────────│               │
│                │   MessageComposer (auto-grow)   │               │
└────────────────┴─────────────────────────────────┴───────────────┘
```

- **Largeur max conteneur** : retire le `max-width: 1400px` de
  `.admin-shell-main` pour cette route (override CSS). La messagerie
  prend toute la largeur dispo pour densité maximale.
- **Hauteurs** : `MessageList` flex-1 entre header (52 px) et composer
  (min 56 px, max 200 px en auto-grow). Scroll interne, jamais de scroll
  page.
- **Panneau détails** : masqué par défaut, ouvert via bouton "ⓘ" dans le
  header. Affiche membres, description, paramètres, lien d'invitation,
  bouton archiver.

### Layout tablette (640 → 1024 px)
- Sidebar passe à 240 px.
- Panneau détails s'ouvre en **overlay** (drawer droit) au lieu de
  pousser le contenu.

### Layout mobile (< 640 px)
- Vue **single-pane**, navigation par swipe + back button.
  - Sans conv ouverte : sidebar plein écran.
  - Avec conv ouverte : header (avec back arrow) + fil + composer.
- Panneau détails : full-screen modal.
- Le badge unread reste visible dans `AdminNav` (qui est déjà mobile-aware).

## 4. Composants à créer

Chemins suggérés (alignés sur les conventions repo) :

```
src/pages/admin/Messages.jsx                  # route principale
src/components/messaging/
  ConversationSidebar.jsx + .css
  ConversationHeader.jsx + .css
  MessageList.jsx + .css
  MessageItem.jsx + .css
  MessageComposer.jsx + .css
  ConversationDetailsPanel.jsx + .css
  PeoplePicker.jsx + .css                     # réutilisé par new-DM, invite
  BrowseChannelsModal.jsx + .css
  NewDmModal.jsx + .css
  UnreadBadge.jsx + .css                      # réutilisé par AdminNav
  TypingIndicator.jsx + .css
  PresenceDot.jsx + .css
src/context/MessagingContext.jsx              # state global messagerie
src/services/messaging.js                     # appels REST + socket
src/lib/messaging.types.js                    # JSDoc des shapes
```

Conventions :
- **Un composant = un dossier** seulement si > 3 fichiers liés (sinon
  `.jsx` + `.css` côte à côte comme le reste du repo).
- Pas de CSS-in-JS, pas de Tailwind : CSS classique avec préfixe
  `.msg-*` ou nom du composant pour éviter les collisions
  (`.admin-nav`, `.portal-container` existent déjà).

## 5. ConversationSidebar

### Contenu
Sections collapsibles, dans cet ordre :

1. **Recherche** (input sticky en haut, raccourci `Ctrl/⌘+K`).
   Filtre instantané sur les conversations affichées.
2. **Mentions non lues** (visible seulement si > 0). Chip rouge.
3. **DMs** (triés par dernier message desc).
4. **Channels** (triés alpha asc).
5. **Archives** (collapsé par défaut).

Chaque item de la liste :
```
[●] [#] nom-conv              [12]
        dernier message       2 min
        snippet sur 1 ligne
```
- `●` : présence (DM 1:1 uniquement). Vert online / gris offline.
- `#` : icône type (`#` public, `🔒` privé, avatars empilés pour DM groupé,
  avatar simple pour DM 1:1).
- Compteur unread `[12]` à droite, en cyan ; rouge si la conv a une
  mention non lue.
- Item courant : fond `rgba(14, 165, 233, 0.10)`, border-left 2 px cyan.
- Item avec unread mais non sélectionné : nom en **gras blanc** (vs
  gris clair par défaut).

### Bouton "Nouveau"
En bas de sidebar, deux boutons côte à côte :
- **+ Channel** (visible si `MANAGE_INTERNAL_CHANNELS`)
- **+ DM** (visible si `SEND_INTERNAL_MESSAGES`)

## 6. ConversationHeader

```
┌──────────────────────────────────────────────────────────────────┐
│ # nom-conv  ▾    "Description courte du channel"     [👥 8] [ⓘ]   │
└──────────────────────────────────────────────────────────────────┘
```
- Cliquer `nom-conv ▾` ouvre un mini menu (renommer si owner, copier
  lien, archiver, quitter).
- `[👥 8]` : nombre de membres, ouvre le panneau détails sur l'onglet
  membres.
- `[ⓘ]` : toggle panneau détails.
- Pour un DM 1:1 : nom + email du correspondant + `PresenceDot`.

## 7. MessageList

### Affichage
- Scroll virtuel pas nécessaire au MVP (< 500 messages chargés à la fois).
  Pagination cursor "older" au scroll vers le haut, déclenchée à 200 px
  du sommet (préfetch).
- **Date séparateurs** : "Aujourd'hui", "Hier", "lundi 14 mai", "12 mars
  2025" selon distance temporelle.
- **Regroupement** : messages du même auteur dans une fenêtre de 5 min
  sont groupés visuellement (avatar et nom affichés sur le 1er, suivants
  alignés en retrait, juste heure au survol).

### MessageItem
```
[avatar]  Nom de l'auteur  09:42      (au survol: actions à droite)
          Contenu du message éventuellement
          sur plusieurs lignes
          (modifié)        ← si editedAt
```
Actions au survol (kebab menu compact, max 4 visibles) :
- 😀 Réaction (P5, désactivé MVP)
- ↪️ Thread (P5, désactivé MVP)
- ✏️ Éditer (auteur, ≤ 15 min)
- 🗑️ Supprimer (auteur, owner conv, ou SUPER_ADMIN)
- 🔗 Copier le lien permanent

### Indicateur "unread"
Trait horizontal `border-top: 1px solid #0ea5e9` + label "Nouveau"
inséré entre le dernier message lu et le premier non lu, à l'ouverture
de la conv. Reste affiché pendant 30 s ou jusqu'au prochain scroll.

### Typing
Sous le dernier message, ligne discrète `Alice et Bob écrivent…` avec
3 points animés. Disparaît 4 s sans event `typing:start` ou dès
réception d'un message du même auteur.

## 8. MessageComposer

```
┌───────────────────────────────────────────────────────────────┐
│ [B] [I] [‹›] [link]            [📎 P5]     ↵ Envoyer (Entrée) │
│┌─────────────────────────────────────────────────────────────┐│
││  Tapez votre message…                                       ││
│└─────────────────────────────────────────────────────────────┘│
└───────────────────────────────────────────────────────────────┘
```
- Textarea **auto-grow** : 1 ligne → 8 lignes max, ensuite scroll
  interne.
- **`Entrée`** = envoyer. **`Shift+Entrée`** = retour à la ligne.
  **`Échap`** = vider le brouillon courant (avec confirmation si > 50
  caractères).
- **Brouillon par conv** : sauvegardé en `localStorage`
  (`venio:msg:draft:<convId>`), restauré au remount. Vidé à l'envoi.
- **Mentions** : à `@` afficher un autocomplete des membres de la conv.
  Navigation flèches + Entrée pour insérer. Le pattern stocké est
  `@<userId>` côté API ; le rendu affiche `@Nom Prénom`.
- **Désactivé** si :
  - User n'a pas `SEND_INTERNAL_MESSAGES` (cas `VIEWER`).
  - Conversation archivée (placeholder "Conversation archivée — lecture
    seule").
  - Socket déconnecté **et** REST aussi indispo (placeholder "Connexion
    perdue — réessai…"). Sinon, on accepte l'envoi via REST + retry.
- **Compteur caractères** affiché à partir de 3 500 / 4 000.

## 9. Conventions visuelles

### Couleurs (réutilise tokens AdminShell existants)
| Usage | Valeur |
|---|---|
| Fond principal | `#0a0c12` (`AdminShell`) |
| Fond conv sidebar | `rgba(255,255,255,0.02)` |
| Bordures discrètes | `rgba(14, 165, 233, 0.12)` |
| Accent (sélection, actions primaires, mentions) | `#0ea5e9` → `#22d3ee` |
| Unread (badge texte) | `#0ea5e9` |
| Mention non lue (badge texte) | `#ef4444` |
| Online | `#22c55e` |
| Offline | `rgba(255,255,255,0.35)` |
| Texte principal | `rgba(255,255,255,0.92)` |
| Texte secondaire | `rgba(255,255,255,0.65)` |
| Texte muted | `rgba(255,255,255,0.4)` |

### Typographie
- Hérite des polices du shell (déjà cohérentes dans `fonts.css`).
- Tailles : nom auteur `0.92rem` weight 600 ; corps message `0.95rem`
  weight 400 ; heure `0.8rem` weight 400.
- Line-height corps : 1.5.

### Densité
- Padding item sidebar : `10px 12px`.
- Espacement vertical messages groupés : `2px`. Groupes différents :
  `16px`.
- Pas d'ombres portées sur les messages (Slack-like, plat).

## 10. États

### États globaux
| État | Comportement |
|---|---|
| **Chargement initial** | Squelettes (skeleton) sidebar 6 items + MessageList vide avec spinner cyan discret centré. |
| **Vide — aucune conv** | Illustration sobre (icône messages) + texte "Aucune conversation. Démarrez un DM ou créez un channel." + 2 boutons. |
| **Vide — conv ouverte sans message** | "C'est le début de #nom-conv. Dites bonjour 👋" |
| **Erreur réseau** | Toast en bas de l'écran : "Connexion perdue. Réessai dans 3s…" non-bloquant, retry exponentiel auto. |
| **Reconnexion socket** | Banner discrète en haut de la liste : "Reconnecté." (vert) ou "Reconnexion…" (orange). Disparaît après 2 s. |
| **Offline** | Banner persistant en haut : "Vous êtes hors-ligne." L'envoi via composer met le message en file d'attente locale (badge "envoi…"), flush au retour online. |
| **403 (n'est plus membre)** | Redirige vers `/admin/messages` + toast "Vous n'êtes plus membre de cette conversation." |
| **Recherche sans résultat** | Inline dans sidebar : "Aucune conv ne correspond à \"xxx\"" + lien "Chercher dans les messages →" qui ouvre la recherche globale (P4). |

### États de message
- **En cours d'envoi** : message affiché grisé avec spinner inline.
- **Échec d'envoi** : icône ⚠️ + lien "réessayer" + lien "supprimer".
- **Supprimé** : remplacé par `[message supprimé]` en italique
  `rgba(255,255,255,0.4)`. Pas d'avatar, garde le timestamp.
- **Édité** : suffixe `(modifié)` discret après le contenu. Au survol
  du suffixe : tooltip avec date de la modif. **Pas d'historique des
  versions au MVP.**

## 11. Accessibilité

- **Raccourcis clavier** (à documenter dans une modale `?` accessible
  depuis le header) :
  - `Ctrl/⌘+K` : focus la recherche conversations.
  - `Alt+↑` / `Alt+↓` : conversation précédente / suivante dans sidebar.
  - `Ctrl/⌘+Shift+M` : ouvrir "nouveau DM".
  - `Esc` : fermer modal / panneau détails / clear composer (avec
    confirmation).
  - Navigation `Tab` cohérente, focus visible (outline cyan).
- ARIA :
  - `role="log" aria-live="polite"` sur MessageList pour annoncer les
    nouveaux messages aux lecteurs d'écran (sauf si conv courante a le
    focus).
  - `aria-label` sur badges unread ("3 messages non lus", "1 mention").
- Contrastes : couleurs ci-dessus testées AA sur fond `#0a0c12`. Texte
  muted (`rgba(255,255,255,0.4)`) **uniquement** pour info non
  critique (suffixe "modifié", heure dans groupe replié).
- Cible tactile mobile : 44×44 min sur tous les boutons d'action.

## 12. Inventaire complet des composants

Récapitulatif pour Codex (#31) :

| Composant | Responsabilité |
|---|---|
| `MessagingContext` | État global : socket, conv courante, liste conv, unread map |
| `messaging` service | Appels REST + wrappers événements socket |
| `Messages` (page) | Layout 2/3 colonnes + outlet routing |
| `ConversationSidebar` | Liste conv + recherche + actions création |
| `ConversationHeader` | Nom, description, actions, presence (DM) |
| `MessageList` | Affichage + pagination + groupage + séparateurs date |
| `MessageItem` | Rendu d'un message + actions hover + états |
| `MessageComposer` | Textarea auto-grow + mentions autocomplete + brouillons |
| `ConversationDetailsPanel` | Membres, paramètres, archiver, quitter |
| `PeoplePicker` | Sélecteur d'admins, réutilisé partout |
| `BrowseChannelsModal` | Liste channels publics + rejoindre |
| `NewDmModal` | Sélection 1–7 admins → ouvrir/créer DM |
| `UnreadBadge` | Pill avec nombre, variante mention rouge |
| `TypingIndicator` | "X et Y écrivent…" |
| `PresenceDot` | Indicateur online/offline |

## 13. Hors-scope cette spec (à recadrer plus tard)

- Recherche globale dans les messages (couvert par #33 backend, l'UX
  recherche reste à concevoir).
- Thread drawer (couvert par #34).
- Pièces jointes (couvert par #35).
- Préférences notifications par conv (mute, mute mentions, custom). À
  prévoir dans le panneau détails post-MVP.
- Statut perso ("OOO", "lunch") et "do not disturb". Post-MVP.

## 14. Critères d'acceptation

- [x] Structure UI listée (sidebar / fil / composer / détails / modales).
- [x] États listés (vide, chargement, erreur, offline/reconnect, 403,
      recherche).
- [x] Conventions visuelles unread / mention / DM / privé / online
      explicitées.
- [x] Layout desktop / tablette / mobile décrit.
- [x] Cohérence avec `AdminShell`, réutilise tokens du design néon
      existant.
- [x] Aucun comportement critique laissé implicite (mentions
      autocomplete, brouillons, archivage UX, raccourcis clavier).
- [x] Inventaire complet des composants prêts pour Codex.

## 15. Décisions à valider explicitement

1. **Lien "Messages" dans `AdminNav`** vs entrée discrète style icône
   seule en haut à droite ? J'ai choisi l'item de nav classique pour
   cohérence avec les autres entrées.
2. **Single-pane mobile** vs garder sidebar collapsible : single-pane
   plus net mais coût UX. OK ?
3. **Largeur 1400 px override** : on rend toute la page edge-to-edge
   pour la messagerie ? Ou on garde la max-width admin pour cohérence ?
   J'ai recommandé edge-to-edge.
4. **Présence online** au MVP ou hors-scope ? J'ai mis "Online/Offline"
   dans la spec mais c'est implémentable seulement si #29 expose
   `presence:update`. Confirmer.
