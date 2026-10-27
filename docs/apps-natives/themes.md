# Thèmes des apps natives Venio

Décision du 23 octobre 2026 : deux thèmes au choix de chaque utilisateur, **Liquid glass** et **Néon**. Dans chaque thème, l'utilisateur choisit une **couleur de fond** et une **couleur d'accent** parmi 5. Le choix est enregistré par utilisateur et synchronisé entre ses appareils.

Maquettes de référence : `maquettes/liquid-glass/` et `maquettes/neon/`. La piste minimaliste est abandonnée.

## Liquid glass

Le fond est un dégradé doux, avec des halos, pour que le verre se lise.

| Fond | Clé | Base | Halos |
|---|---|---|---|
| Brume (défaut) | `mist` | `#EEF3F8` | `#BAE6FD`, `#DDD6FE` |
| Aurore | `dawn` | `#FBF1EC` | `#FECDD3`, `#FDE68A` |
| Lagune | `lagoon` | `#ECF7F5` | `#99F6E4`, `#BAE6FD` |
| Lavande | `lavender` | `#F3F0FA` | `#DDD6FE`, `#FBCFE8` |
| Nuit (sombre) | `night` | `#0B1220` | `#1E3A8A`, `#4C1D95` |

| Accent | Clé | Valeur |
|---|---|---|
| Sky Venio (défaut) | `sky` | `#0EA5E9` |
| Violet | `violet` | `#7C3AED` |
| Menthe | `mint` | `#10B981` |
| Corail | `coral` | `#F97362` |
| Ambre | `amber` | `#F59E0B` |

## Néon

| Fond | Clé | Base | Surfaces |
|---|---|---|---|
| Noir (défaut) | `black` | `#050505` | `#0D0F12`, `#14171C` |
| Graphite | `graphite` | `#0D1117` | `#161B22`, `#1F2630` |
| Abysse | `abyss` | `#04121F` | `#0A1D30`, `#112840` |
| Aubergine | `plum` | `#12071C` | `#1C0F2A`, `#26163A` |
| Forêt | `forest` | `#03130E` | `#0A1F18`, `#112B22` |

| Accent | Clé | Valeur |
|---|---|---|
| Cyan Venio (défaut) | `cyan` | `#0EA5E9` |
| Magenta | `magenta` | `#FF0080` |
| Violet | `violet` | `#A855F7` |
| Vert acide | `acid` | `#39FF88` |
| Orange | `orange` | `#FF7A1A` |

## Règles

- **Couleurs sémantiques indépendantes de l'accent.** Urgent ou en retard, succès, avertissement : ces trois couleurs ne changent pas. Exception : si l'accent choisi est le même que la couleur « urgent » (magenta en Néon, corail en Liquid glass), « urgent » bascule sur une teinte de repli fixe pour que les deux restent distincts.
- **Contraste.** Le texte posé sur l'accent prend la couleur (blanc ou encre) qui donne le meilleur contraste, avec au moins 4,5:1 (WCAG AA). Les 50 combinaisons fond × accent doivent passer ce contrôle sur le texte courant.
- **Graphes.** L'area *financial timeline* suit l'accent. La série secondaire en pointillés prend une couleur fixe par thème.
- **Défaut.** Liquid glass, fond Brume, accent Sky. Le système clair ou sombre de l'appareil propose Nuit ou Néon au premier lancement, sans l'imposer.
- **Stockage.** Le choix suit le schéma `{ theme: 'glass' | 'neon', background: <clé>, accent: <clé> }`. Il est stocké côté serveur par utilisateur, avec un cache local pour un affichage immédiat.
