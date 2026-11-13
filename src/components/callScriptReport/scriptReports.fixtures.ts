import type { ScriptReport } from '../../services/callScriptReports'

/** Deux semaines de rapports, pour les tests et la vérification visuelle. */
export const scriptReportFixtures: ScriptReport[] = [
  {
    _id: 'r46',
    weekKey: '2026-W46',
    weekStart: '2026-11-08T23:00:00.000Z',
    weekEnd: '2026-11-15T23:00:00.000Z',
    status: 'READY',
    skipReason: null,
    author: { _id: 'u1', name: 'Rita' },
    own: true,
    model: 'claude-opus-5-5',
    errorCode: null,
    retryable: false,
    nextRetryAt: null,
    stats: {
      calls: 42,
      reached: 18,
      conversions: 9,
      conversionRate: 50,
      targetConversionRate: 40,
      transcripts: 17,
      transcriptsAnalyzed: 15,
      byScript: [
        { tag: 'DEFAULT', calls: 30, reached: 12, conversions: 5 },
        { tag: 'RESULTAT', calls: 12, reached: 6, conversions: 4 },
      ],
    },
    output: {
      summary:
        'Semaine solide : le script « Résultat » convertit mieux, l’objection du prix revient dans un appel sur trois.',
      conversionReading: 'Au-dessus de l’objectif de 40 %, porté par les créneaux précis proposés en fin d’appel.',
      objections: [
        {
          label: 'Le prix',
          occurrences: 6,
          quotes: ['votre offre est trop chère pour nous'],
          response: 'Chiffrer ce que rapporte un site qui convertit avant d’annoncer le prix.',
        },
        {
          label: 'Déjà un prestataire',
          occurrences: 4,
          quotes: [],
          response: 'Proposer un audit gratuit de l’existant, sans remettre en cause le prestataire.',
        },
      ],
      advancing: [
        { label: 'Proposer un créneau précis', quote: 'jeudi à dix heures ça vous irait' },
        { label: 'Reformuler le besoin', quote: null },
      ],
      losing: [{ label: 'Prix annoncé avant le besoin', quote: 'ça commence à combien en gros' }],
      scriptChanges: [
        {
          current: 'Nos sites commencent à 3 000 euros.',
          proposed: 'Ouvrir sur le résultat attendu avant le prix.',
          why: 'L’objection du prix tombe quand la valeur est posée d’abord.',
        },
      ],
      droppedQuotes: 1,
    },
  },
  {
    _id: 'r45',
    weekKey: '2026-W45',
    weekStart: '2026-11-01T23:00:00.000Z',
    weekEnd: '2026-11-08T23:00:00.000Z',
    status: 'SKIPPED',
    skipReason: 'NO_TRANSCRIPT',
    author: { _id: 'u1', name: 'Rita' },
    own: true,
    model: '',
    errorCode: null,
    retryable: false,
    nextRetryAt: null,
    stats: {
      calls: 12,
      reached: 5,
      conversions: 1,
      conversionRate: 20,
      targetConversionRate: 40,
      transcripts: 0,
      transcriptsAnalyzed: 0,
      byScript: [{ tag: 'DEFAULT', calls: 12, reached: 5, conversions: 1 }],
    },
    output: null,
  },
]
