import type { AnalysisResponse, CallTranscript } from '../../services/callInsights'

/** Appel de démonstration : données d'exemple en français pour les tests et la vérification visuelle. */
export const transcriptFixture: CallTranscript = {
  status: 'DONE',
  language: 'fr',
  durationSec: 412,
  segments: [
    {
      speaker: 'REP',
      startMs: 2000,
      endMs: 9000,
      text: 'Bonjour Madame Lefèvre, Clara de Venio. Je vous appelle suite à votre demande sur notre site.',
    },
    {
      speaker: 'PROSPECT',
      startMs: 9500,
      endMs: 20000,
      text: 'Oui bonjour, c’est exact. On cherche à refaire notre site, il date de 2016 et il n’est plus du tout adapté aux mobiles.',
    },
    {
      speaker: 'REP',
      startMs: 20500,
      endMs: 27000,
      text: 'D’accord. Avez-vous déjà une idée du budget que vous souhaitez y consacrer ?',
    },
    {
      speaker: 'PROSPECT',
      startMs: 27500,
      endMs: 41000,
      text: 'On a prévu autour de 12 000 euros. Mon associé Thomas Brun valide les dépenses de ce type, il faudra qu’il participe au rendez-vous.',
    },
    {
      speaker: 'REP',
      startMs: 41500,
      endMs: 48000,
      text: 'Très bien. Et côté calendrier, vous visez quelle mise en ligne ?',
    },
    {
      speaker: 'PROSPECT',
      startMs: 48500,
      endMs: 63000,
      text: 'Idéalement avant la rentrée de septembre, parce que nous lançons une nouvelle gamme. Nous avons aussi regardé Wix, mais ce n’est pas assez sur mesure.',
    },
    {
      speaker: 'REP',
      startMs: 63500,
      endMs: 70000,
      text: 'Je vous propose un rendez-vous de cadrage la semaine prochaine avec M. Brun.',
    },
    {
      speaker: 'PROSPECT',
      startMs: 70500,
      endMs: 82000,
      text: 'Mardi après-midi conviendrait. Par contre, ne me rappelez plus sur ce numéro, écrivez-moi plutôt par e-mail à claire.lefevre@maison-lefevre.fr.',
    },
  ],
}

export const analysisFixture: AnalysisResponse = {
  analysis: {
    _id: 'analysis1',
    status: 'READY',
    review: null,
    output: {
      summary:
        'La Maison Lefèvre veut refaire son site vitrine (daté de 2016, non adapté aux mobiles) avant septembre, avec un budget d’environ 12 000 €. Le décideur est l’associé, Thomas Brun, qui doit participer à un rendez-vous de cadrage mardi. Wix a été regardé et écarté. La prospecte préfère être contactée par e-mail.',
      suggestedOutcome: 'MEETING',
      optOut: { detected: false, quote: null },
      fields: [
        {
          key: 'budget',
          value: 12000,
          confidence: 'HIGH',
          quote: 'On a prévu autour de 12 000 euros.',
          quoteVerified: true,
        },
        {
          key: 'expectedCloseAt',
          value: '2026-09-01',
          confidence: 'LOW',
          quote: 'Idéalement avant la rentrée de septembre',
          quoteVerified: true,
        },
        {
          key: 'serviceType',
          value: 'Refonte de site vitrine',
          confidence: 'MEDIUM',
          quote: 'On cherche à refaire notre site',
          quoteVerified: true,
        },
        {
          key: 'contactEmail',
          value: 'claire.lefevre@maison-lefevre.fr',
          confidence: 'HIGH',
          quote: 'écrivez-moi plutôt par e-mail à claire.lefevre@maison-lefevre.fr',
          quoteVerified: true,
        },
        {
          key: 'qualification.decisionMaker',
          value: 'Thomas Brun, associé',
          confidence: 'HIGH',
          quote: 'Mon associé Thomas Brun valide les dépenses de ce type',
          quoteVerified: true,
        },
        {
          key: 'qualification.competitors',
          value: ['Wix'],
          confidence: 'MEDIUM',
          quote: 'Nous avons aussi regardé Wix, mais ce n’est pas assez sur mesure.',
          quoteVerified: true,
        },
        {
          key: 'companySize',
          value: '11 à 50 salariés',
          confidence: 'LOW',
          quote: 'Nous sommes une équipe d’une vingtaine de personnes.',
          quoteVerified: false,
        },
      ],
      heat: {
        score: 74,
        level: 'CHAUD',
        criteria: [
          { key: 'budget', label: 'Budget annoncé', points: 20, max: 25, quote: 'On a prévu autour de 12 000 euros.' },
          {
            key: 'timeline',
            label: 'Échéance proche',
            points: 18,
            max: 25,
            quote: 'Idéalement avant la rentrée de septembre',
          },
          {
            key: 'authority',
            label: 'Décideur identifié',
            points: 16,
            max: 20,
            quote: 'Mon associé Thomas Brun valide les dépenses de ce type',
          },
          {
            key: 'engagement',
            label: 'Rendez-vous accepté',
            points: 20,
            max: 30,
            quote: 'Mardi après-midi conviendrait.',
          },
        ],
      },
      actions: [
        {
          id: 'a1',
          type: 'MEETING',
          label: 'Rendez-vous de cadrage avec Thomas Brun',
          dueAt: '2026-11-17T14:00:00.000Z',
          reason: 'Elle a accepté mardi après-midi et son associé valide le budget.',
        },
        {
          id: 'a2',
          type: 'EMAIL',
          label: 'Envoyer le récapitulatif et une proposition de créneau',
          dueAt: '2026-11-13T09:00:00.000Z',
          reason: 'Elle préfère l’e-mail au téléphone.',
        },
        {
          id: 'a3',
          type: 'TASK',
          label: 'Préparer deux références de sites vitrines pour le cadrage',
          dueAt: null,
          reason: 'Wix a été comparé : montrer ce que le sur-mesure apporte.',
        },
      ],
    },
  },
  current: {
    budget: 8000,
    expectedCloseAt: null,
    serviceType: '',
    contactName: 'Claire Lefèvre',
    contactEmail: 'c.lefevre@maison-lefevre.fr',
    'qualification.competitors': [],
    leadTemperature: 'TIEDE',
  },
}
