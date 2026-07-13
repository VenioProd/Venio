# Exports de classe pédagogique

## Usage

Depuis une classe de l’espace pédagogique admin, les actions `CSV` et `JSON`
exportent uniquement la classe ouverte. Elles ne lancent aucun export global du
workspace. L’utilisateur doit être `SUPER_ADMIN`, confirmer l’action sensible
et disposer d’un step-up MFA récent ; chaque export réussi est audité sans
copier son contenu dans le journal.

L’API correspondante est :

```text
GET /api/admin/education/exports/classes/:classId?format=csv|json
X-Venio-Confirm: EDUCATION_CLASS_EXPORT
```

Les noms sont déterministes pour une même classe :

- `classe-<nom-normalise>-cours.csv`
- `classe-<nom-normalise>-workspace.json`

## Formats et schéma

Le CSV est encodé en UTF-8 avec BOM, séparé par `;` et utilise CRLF. Il contient
une ligne par séance/cours avec le contexte de classe, les objectifs, l’agenda,
le récapitulatif et les tags. Les dates sont des ISO 8601 UTC.

Le JSON est un instantané versionné :

```json
{
  "schema": "venio.education.class-export",
  "schemaVersion": 1,
  "exportedAt": "2026-07-13T09:00:00.000Z",
  "class": {},
  "students": [],
  "sessions": [],
  "assignments": []
}
```

Les relations de présence visent `students[].reference`, une référence locale
à l’instantané (`student-1`, `student-2`, etc.) : aucun identifiant MongoDB
n’est exporté. Les séances et devoirs sont ordonnés de façon stable pour
faciliter les comparaisons entre exports.

## Données incluses et limites

Le JSON contient les données pédagogiques nécessaires à l’exploitation :

- les métadonnées structurées de la classe ;
- les étudiants (identité, email, identifiant externe, statut, tags et
  compteurs) ;
- les séances, leurs contenus et leurs états de présence ;
- les métadonnées et barèmes de devoirs.

Il exclut volontairement les propriétaires et IDs internes, notes privées,
téléphones, commentaires de présence, URLs de supports, pièces jointes,
chemins de stockage, soumissions, feedbacks et notes. Ces éléments restent
dans les routes métier déjà protégées et ne doivent pas être ajoutés à cet
export sans revue de gouvernance.

Le lot ne fournit pas d’import automatique. Pour restaurer ou comparer, garder
le JSON avec sa version de schéma, recréer d’abord la classe puis les étudiants,
séances et devoirs dans un environnement contrôlé. Les documents et
soumissions doivent être restaurés depuis une sauvegarde cohérente MongoDB +
volume d’uploads ; voir le [runbook](./RUNBOOK.md#sauvegardes-et-restauration).
Le CSV est destiné à l’analyse tabulaire, pas à une restauration complète.
