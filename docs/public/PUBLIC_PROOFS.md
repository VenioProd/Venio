# Preuves publiques : état et règle de publication

## État au 12 juillet 2026

Le dépôt ne contient aucune étude de cas publiable et aucune citation client publiable. Les anciens noms de clients,
descriptions, chiffres et illustrations présents avant le correctif `50e1e1e` ont été retirés parce qu'ils n'étaient pas
vérifiables. Ils ne doivent pas être réutilisés.

Il manque donc, pour atteindre l'objectif de trois études de cas publiques et de témoignages attribués :

1. trois autorisations écrites de publication, une par étude de cas ;
2. pour chaque cas, le nom que le client accepte de voir affiché, son périmètre, les offres Venio concernées et les
   éléments factuels autorisés ;
3. pour chaque métrique ou résultat, une source contrôlable et l'accord explicite de publication ;
4. pour chaque témoignage, le texte final, le nom, la fonction, l'organisation, les offres associées et une validation
   écrite de la personne citée ;
5. les éventuels médias avec une licence ou une autorisation de diffusion publique.

## Comment publier une preuve

1. Réunir les éléments ci-dessus et les archiver dans l'emplacement interne approuvé (ne pas les committer s'ils
   contiennent des informations confidentielles).
2. Ajouter l'étude de cas ou le témoignage dans `src/content/publicProofs.ts` avec sa date d'accord et la référence de
   l'emplacement de preuve interne.
3. Ne publier que le périmètre et les résultats explicitement autorisés. Omettre les éléments non vérifiables plutôt
   que de les reformuler.
4. Associer chaque preuve au ou aux paliers concernés avec `relatedOffers` : la page Réalisations et les liens des
   offres les relieront automatiquement.
5. Faire relire la page par la personne responsable de l'autorisation avant mise en ligne.

Les tableaux d'offres indiquent aussi des budgets et délais indicatifs. Ces fourchettes sont des repères commerciaux,
hors licences, contenus et prestataires tiers ; le devis accepté reste la seule valeur contractuelle. Elles doivent être
validées par la direction commerciale avant publication effective.
