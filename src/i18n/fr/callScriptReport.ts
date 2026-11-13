/** Rapports hebdomadaires des scripts d’appel (poste d’appel IA, lot K). */
const fr = {
  'callScriptReport.title': 'Rapports de scripts',
  'callScriptReport.tab': 'Rapports de scripts',
  'callScriptReport.intro':
    'Chaque lundi, l’IA relit vos appels transcrits de la semaine écoulée : ce qui fait avancer, ce qui fait perdre, les objections et les formulations à essayer.',
  'callScriptReport.introTeam':
    'Chaque lundi, l’IA relit les appels transcrits de la semaine écoulée de chaque membre de l’équipe. Les appels des commerciaux externes n’y figurent pas.',
  'callScriptReport.loading': 'Chargement des rapports…',
  'callScriptReport.loadError': 'Impossible de charger les rapports.',
  'callScriptReport.retry': 'Réessayer',
  'callScriptReport.empty':
    'Aucun rapport pour l’instant. Le premier arrive le jour prévu, après une semaine d’appels transcrits.',
  'callScriptReport.weeks': 'Semaines',
  'callScriptReport.author': 'Membre',
  'callScriptReport.allAuthors': 'Toute l’équipe',
  'callScriptReport.week': 'Semaine {week}',
  'callScriptReport.range': 'du {start} au {end}',
  'callScriptReport.status.PENDING': 'En préparation',
  'callScriptReport.status.READY': 'Prêt',
  'callScriptReport.status.SKIPPED': 'Compteurs seuls',
  'callScriptReport.status.FAILED': 'Échec',
  'callScriptReport.pending': 'Ce rapport est en préparation. Revenez dans quelques minutes.',
  'callScriptReport.skipped.NO_TRANSCRIPT':
    'Aucun appel transcrit cette semaine : seuls les compteurs sont disponibles.',
  'callScriptReport.skipped.AI_DISABLED':
    'L’analyse par IA n’est pas configurée sur ce serveur : seuls les compteurs sont disponibles.',
  'callScriptReport.failed': 'La préparation de ce rapport a échoué.',
  'callScriptReport.failedRetry': 'Une nouvelle tentative est prévue le {date}.',
  'callScriptReport.conversion': 'Conversion',
  'callScriptReport.conversionHelp': 'Rendez-vous obtenus sur prospects joints',
  'callScriptReport.target': 'Objectif {rate} %',
  'callScriptReport.noReach': 'Aucun prospect joint',
  'callScriptReport.calls': 'Appels',
  'callScriptReport.reached': 'Joints',
  'callScriptReport.meetings': 'Rendez-vous',
  'callScriptReport.transcripts': 'Transcripts lus',
  'callScriptReport.transcriptsCapped': '{analyzed} sur {total} (plafond de jetons)',
  'callScriptReport.byScript': 'Par script',
  'callScriptReport.script': 'Script',
  'callScriptReport.noScript': 'Sans script',
  'callScriptReport.rate': 'Taux',
  'callScriptReport.summary': 'La semaine',
  'callScriptReport.objections': 'Objections récurrentes',
  'callScriptReport.occurrences': '{count} appel(s)',
  'callScriptReport.tryResponse': 'Réponse à essayer',
  'callScriptReport.advancing': 'Ce qui fait avancer',
  'callScriptReport.losing': 'Ce qui fait perdre',
  'callScriptReport.none': 'Rien de marquant cette semaine.',
  'callScriptReport.changes': 'Formulations à essayer',
  'callScriptReport.instead': 'Au lieu de',
  'callScriptReport.try': 'Essayez',
  'callScriptReport.why': 'Pourquoi',
  'callScriptReport.dropped': '{count} citation(s) écartée(s) : introuvables dans les transcripts.',
  'callScriptReport.quotesNote': 'Citations vérifiées dans vos transcripts ; noms, entreprises et numéros masqués.',
  'callScriptReport.model': 'Modèle : {model}',
  // Réglages
  'callScriptReport.set.title': 'Rapport hebdomadaire des scripts',
  'callScriptReport.set.desc':
    'Analyse par IA des appels transcrits de la semaine écoulée, pour chaque auteur. Un externe ne reçoit que le sien ; l’équipe ne voit jamais celui d’un externe.',
  'callScriptReport.set.enabled': 'Produire le rapport',
  'callScriptReport.set.enabledHelp':
    'À partir de 6 h (heure de Paris) le jour choisi, sur la dernière semaine complète.',
  'callScriptReport.set.day': 'Jour de production',
  'callScriptReport.set.emailAuthors': 'Envoyer à chaque auteur son rapport par e-mail',
  'callScriptReport.set.emailAuthorsHelp':
    'L’e-mail ne contient ni citation ni nom de prospect, seulement les compteurs et les pistes.',
  'callScriptReport.set.recipients': 'Copie des rapports de l’équipe',
  'callScriptReport.set.recipientsHelp':
    'Adresses séparées par des virgules : membres actifs de l’équipe ou adresses de l’entreprise. Les rapports des externes ne sont jamais copiés.',
  'callScriptReport.set.model': 'Modèle',
  'callScriptReport.set.modelHelp': 'Vide : le modèle de l’analyse d’appel.',
  'callScriptReport.set.maxInputTokens': 'Plafond de jetons par rapport',
  'callScriptReport.set.maxInputTokensHelp':
    'Borne le coût : au-delà, les transcripts les plus récents sont laissés de côté. Entre 5 000 et 200 000.',
  'callScriptReport.set.target': 'Objectif de conversion (%)',
  'callScriptReport.set.issue.tokens': 'Le plafond doit être un entier entre 5 000 et 200 000.',
  'callScriptReport.set.issue.target': 'L’objectif doit être un entier entre 1 et 100.',
  'callScriptReport.set.issue.model': 'Identifiant attendu : claude-…',
}

export default fr
