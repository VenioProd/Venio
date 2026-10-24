# Langues des apps natives Venio

Décision du 23 octobre 2026 : l'app fonctionne en **français** et en **anglais**, et l'utilisateur change de langue dans Réglages. Le contenu saisi par les gens est traduit automatiquement entre les deux langues.

## Interface
- Toutes les chaînes passent par un String Catalog (`.xcstrings`), en français (langue source) et en anglais.
- La langue se choisit dans Réglages › Langue : Système, Français ou English. Le choix est enregistré avec les préférences de l'utilisateur (`locale: 'system' | 'fr' | 'en'`), à côté du thème.
- Les dates, montants et nombres suivent la langue choisie (`23 oct.` ou `Oct 23`, `14 800 €` ou `€14,800`). La devise reste l'euro.
- Les notifications push sont rédigées côté serveur dans la langue de l'utilisateur.

## Traduction automatique du contenu
- **Ce qui est traduit** : le contenu libre, écrit par quelqu'un, qui peut être dans l'autre langue. Cela comprend :
  - les notes et transcriptions vocales des leads ;
  - les entrées de timeline et les interactions ;
  - les messages ;
  - les mises à jour projet ;
  - les demandes de modification et les tickets ;
  - les lignes de devis.
- **Comment** : sur l'appareil, avec le framework Apple Translation, sans envoyer de texte à un tiers. La langue du texte est détectée automatiquement. Si elle diffère de celle de l'interface, le texte s'affiche traduit, avec un petit indicateur « Traduit » qui permet de revenir à l'original d'un geste.
- **Réglage** : Réglages › Langue › Traduire automatiquement (activé par défaut). Quand il est désactivé, un bouton « Traduire » reste disponible sur chaque bloc.
- **Côté serveur** : on stocke toujours l'original, jamais la traduction. Un champ `lang` (détecté au moment de la saisie) peut accompagner les textes pour éviter de détecter la langue à nouveau.
- **Ce qui n'est pas traduit** : les noms propres, les raisons sociales, les références (`DV-2026-041`), les e-mails et les numéros.
