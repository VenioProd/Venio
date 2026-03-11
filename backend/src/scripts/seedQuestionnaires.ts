import mongoose from 'mongoose'
import dotenv from 'dotenv'
import QualiopiQuestionnaire from '../models/QualiopiQuestionnaire.js'

dotenv.config()

const FIRST_NAMES = ['Marie','Thomas','Camille','Lucas','Emma','Hugo','Lea','Nathan','Chloe','Maxime','Sarah','Antoine','Julie','Alexandre','Laura','Romain','Manon','Nicolas','Pauline','Julien','Clara','Kevin','Oceane','Florian','Anais','Dylan','Charlotte','Quentin','Lucie','Mathieu','Amandine','Clement','Morgane','Pierre','Justine','Theo','Ines','David','Melissa','Bastien','Elise','Yannick','Sophie','Adrien','Margaux','Baptiste','Agathe','Thibault','Elodie','Valentin','Noemie','Axel','Marine','Corentin','Eva','Guillaume','Audrey','Raphael','Helene','Arthur','Emilie','Xavier','Lisa','Damien','Maeva','Samuel','Jade','Lilian','Fatoumata','Abdoulaye','Aminata','Moussa','Aissatou','Ibrahim','Khadija','Omar','Mariama','Souleymane','Fatou']
const LAST_NAMES = ['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau','Simon','Laurent','Lefebvre','Michel','Garcia','David','Bertrand','Roux','Vincent','Fournier','Morel','Girard','Andre','Mercier','Blanc','Guerin','Boyer','Garnier','Chevalier','Francois','Legrand','Muller','Henry','Rousseau','Nguyen','Diallo','Traore','Camara','Toure','Kone','Diop','Sow','Balde','Ndiaye','Coulibaly','Sylla','Ba','Barry','Keita','Dembele']
const FORMATIONS = [
  'React & Next.js - Niveau avance',
  'UX/UI Design - Fondamentaux',
  'Gestion de projet Agile',
  'Marketing digital & SEO',
  'Communication interpersonnelle',
  'Management d\'equipe',
  'Excel & Power BI avance',
  'Securite informatique - Bases',
  'Redaction web & Content Marketing',
  'Leadership & prise de parole',
]

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min }
function randDate(from: Date, to: Date) {
  return new Date(from.getTime() + Math.random() * (to.getTime() - from.getTime()))
}

// Weighted random rating (skewed toward 3-5 for realism)
function randRating(): string {
  const weights = [2, 5, 15, 40, 38] // 1★=2%, 2★=5%, 3★=15%, 4★=40%, 5★=38%
  const r = Math.random() * 100
  let cum = 0
  for (let i = 0; i < weights.length; i++) {
    cum += weights[i]
    if (r < cum) return String(i + 1)
  }
  return '4'
}

const POSITIVE_COMMENTS = [
  'Tres bonne formation, j\'ai beaucoup appris.',
  'Le formateur etait tres pedagogue et a l\'ecoute.',
  'Contenu riche et bien structure.',
  'J\'ai pu appliquer les connaissances immediatement.',
  'Formation de qualite, je recommande vivement.',
  'Excellent equilibre entre theorie et pratique.',
  'Les exercices pratiques etaient tres pertinents.',
  'Ambiance agreable et propice a l\'apprentissage.',
  'Le rythme etait bien adapte au groupe.',
  'Support de cours complet et bien fait.',
  'Formation enrichissante sur le plan professionnel.',
  'Le formateur maitrise parfaitement son sujet.',
  'J\'ai apprecie les etudes de cas concretes.',
  'Bonne organisation generale de la formation.',
  'Les echanges entre participants etaient enrichissants.',
]

const NEUTRAL_COMMENTS = [
  'Formation correcte dans l\'ensemble.',
  'Quelques longueurs sur certains modules.',
  'Le contenu aurait pu etre plus approfondi.',
  'Correct mais manque d\'exercices pratiques.',
  'La duree etait un peu courte pour tout couvrir.',
  'Globalement satisfaisant, quelques points a ameliorer.',
  'Le support de cours pourrait etre mis a jour.',
  'Rythme parfois un peu rapide.',
]

const SUGGESTIONS = [
  'Plus d\'exercices pratiques seraient apprecies.',
  'Prevoir une session de suivi post-formation.',
  'Ajouter des cas concrets lies a notre secteur.',
  'Fournir les supports en version numerique.',
  'Allonger la duree de la formation d\'une journee.',
  'Proposer un accompagnement individuel apres la formation.',
  'Inclure plus de travaux en groupe.',
  'Mettre a disposition une plateforme e-learning en complement.',
  'Rien a signaler, tout etait parfait.',
  'Proposer des niveaux differents (debutant/avance).',
  '',
  '',
  '',
]

const BEFORE_EXPECTATIONS = [
  'Acquerir des competences pratiques applicables rapidement.',
  'Approfondir mes connaissances dans ce domaine.',
  'Me mettre a niveau pour evoluer professionnellement.',
  'Obtenir une certification reconnue.',
  'Decouvrir de nouvelles methodes de travail.',
  'Gagner en confiance dans mes pratiques.',
  'Repondre aux exigences de mon poste.',
  'Elargir mon champ de competences.',
  'Echanger avec d\'autres professionnels du secteur.',
  'Valider mes acquis et combler mes lacunes.',
]

const DIFFICULTIES = [
  'Aucune difficulte particuliere.',
  'Le rythme etait soutenu sur certains modules.',
  'Quelques notions techniques complexes au debut.',
  'La mise en pratique de certains concepts.',
  'Gerer mon emploi du temps en parallele.',
  'Le vocabulaire technique au debut.',
  'Aucune, le formateur expliquait tres bien.',
  'Les exercices avances etaient challengeants mais formateurs.',
]

const YES_NO_MAYBE = ['Oui', 'Oui', 'Oui', 'Oui', 'Oui', 'Oui', 'Oui', 'Non', 'Peut-etre', 'Peut-etre']

async function seed() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI required')

  await mongoose.connect(uri)
  console.log('Connected to MongoDB')

  // Clear existing
  await QualiopiQuestionnaire.deleteMany({})
  console.log('Cleared existing questionnaires')

  // ─── 1. AVANT LA FORMATION ───
  const before = await QualiopiQuestionnaire.create({
    title: 'Questionnaire pre-formation',
    description: 'Evaluation des attentes et du niveau initial des participants avant le debut de la formation.',
    active: true,
    questions: [
      { type: 'text', label: 'Quelles sont vos attentes principales pour cette formation ?', options: [], required: true, order: 0 },
      { type: 'rating', label: 'Comment evaluez-vous votre niveau actuel dans ce domaine ?', options: [], required: true, order: 1 },
      { type: 'multiple_choice', label: 'Comment avez-vous connu cette formation ?', options: ['Bouche a oreille', 'Site internet', 'Reseaux sociaux', 'Recommandation employeur', 'Autre'], required: true, order: 2 },
      { type: 'multiple_choice', label: 'Avez-vous deja suivi une formation dans ce domaine ?', options: ['Oui', 'Non'], required: true, order: 3 },
      { type: 'text', label: 'Y a-t-il des points specifiques que vous souhaitez aborder ?', options: [], required: false, order: 4 },
      { type: 'rating', label: 'A quel point etes-vous motive(e) pour cette formation ?', options: [], required: true, order: 5 },
    ],
  })
  console.log('Created: Questionnaire pre-formation')

  // ─── 2. PENDANT LA FORMATION ───
  const during = await QualiopiQuestionnaire.create({
    title: 'Evaluation a mi-parcours',
    description: 'Questionnaire d\'evaluation intermediaire pour ajuster le contenu et le rythme de la formation.',
    active: true,
    questions: [
      { type: 'rating', label: 'Comment evaluez-vous la qualite du contenu jusqu\'ici ?', options: [], required: true, order: 0 },
      { type: 'rating', label: 'Le rythme de la formation vous convient-il ?', options: [], required: true, order: 1 },
      { type: 'rating', label: 'Comment evaluez-vous la pedagogie du formateur ?', options: [], required: true, order: 2 },
      { type: 'multiple_choice', label: 'Les supports de cours sont-ils clairs et utiles ?', options: ['Oui, tres clairs', 'Plutot clairs', 'Moyennement clairs', 'Pas assez clairs'], required: true, order: 3 },
      { type: 'text', label: 'Rencontrez-vous des difficultes particulieres ?', options: [], required: false, order: 4 },
      { type: 'text', label: 'Avez-vous des suggestions pour la suite de la formation ?', options: [], required: false, order: 5 },
      { type: 'rating', label: 'Globalement, etes-vous satisfait(e) a ce stade ?', options: [], required: true, order: 6 },
    ],
  })
  console.log('Created: Evaluation a mi-parcours')

  // ─── 3. APRES LA FORMATION ───
  const after = await QualiopiQuestionnaire.create({
    title: 'Questionnaire de satisfaction post-formation',
    description: 'Evaluation finale de la formation : contenu, formateur, organisation et impact professionnel.',
    active: true,
    questions: [
      { type: 'rating', label: 'Comment evaluez-vous la qualite globale de la formation ?', options: [], required: true, order: 0 },
      { type: 'rating', label: 'Le contenu correspondait-il a vos attentes initiales ?', options: [], required: true, order: 1 },
      { type: 'rating', label: 'Comment evaluez-vous la competence du formateur ?', options: [], required: true, order: 2 },
      { type: 'rating', label: 'Comment evaluez-vous l\'organisation et la logistique ?', options: [], required: true, order: 3 },
      { type: 'rating', label: 'Les exercices pratiques etaient-ils pertinents ?', options: [], required: true, order: 4 },
      { type: 'multiple_choice', label: 'Recommanderiez-vous cette formation ?', options: ['Oui, absolument', 'Oui, probablement', 'Peut-etre', 'Non'], required: true, order: 5 },
      { type: 'text', label: 'Qu\'avez-vous le plus apprecie dans cette formation ?', options: [], required: true, order: 6 },
      { type: 'text', label: 'Quels points pourraient etre ameliores ?', options: [], required: false, order: 7 },
      { type: 'rating', label: 'Pensez-vous pouvoir appliquer les acquis dans votre travail ?', options: [], required: true, order: 8 },
      { type: 'text', label: 'Commentaire libre / suggestions', options: [], required: false, order: 9 },
    ],
  })
  console.log('Created: Questionnaire post-formation')

  // ─── GENERATE 2000 RESPONSES ───
  const questionnaires = [
    { doc: before, id: before._id },
    { doc: during, id: during._id },
    { doc: after, id: after._id },
  ]

  // Distribute: ~500 before, ~500 during, ~1000 after (post-formation gets more responses)
  const distribution = [500, 500, 1000]
  let totalGenerated = 0

  for (let qi = 0; qi < questionnaires.length; qi++) {
    const { doc } = questionnaires[qi]
    const count = distribution[qi]
    const responses: any[] = []

    for (let r = 0; r < count; r++) {
      const firstName = pick(FIRST_NAMES)
      const lastName = pick(LAST_NAMES)
      const name = `${firstName} ${lastName}`
      const email = `${firstName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}.${lastName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}${randInt(1, 99)}@${pick(['gmail.com', 'outlook.fr', 'yahoo.fr', 'hotmail.com', 'orange.fr', 'free.fr', 'company.fr'])}`
      const formation = pick(FORMATIONS)

      const answers: { questionIndex: number; value: string }[] = []

      for (let qIdx = 0; qIdx < doc.questions.length; qIdx++) {
        const q = doc.questions[qIdx]
        let value = ''

        if (q.type === 'rating') {
          value = randRating()
        } else if (q.type === 'multiple_choice') {
          value = pick(q.options)
        } else if (q.type === 'text') {
          // Generate contextual text based on the question
          const label = q.label.toLowerCase()
          if (label.includes('attentes') || label.includes('souhaitez')) {
            value = pick(BEFORE_EXPECTATIONS)
          } else if (label.includes('difficulte')) {
            value = pick(DIFFICULTIES)
          } else if (label.includes('apprecie')) {
            value = pick(POSITIVE_COMMENTS)
          } else if (label.includes('ameliore') || label.includes('suggestion')) {
            value = pick(SUGGESTIONS)
          } else if (label.includes('commentaire')) {
            value = Math.random() > 0.4 ? pick([...POSITIVE_COMMENTS, ...NEUTRAL_COMMENTS]) : ''
          } else {
            value = pick([...POSITIVE_COMMENTS, ...NEUTRAL_COMMENTS])
          }
        }

        answers.push({ questionIndex: qIdx, value })
      }

      responses.push({
        respondentName: name,
        respondentEmail: email,
        formation,
        answers,
        submittedAt: randDate(new Date('2025-06-01'), new Date('2026-03-10')),
      })
    }

    // Bulk push responses
    await QualiopiQuestionnaire.findByIdAndUpdate(doc._id, {
      $push: { responses: { $each: responses } },
    })

    totalGenerated += count
    console.log(`Generated ${count} responses for "${doc.title}" (${totalGenerated}/2000)`)
  }

  console.log(`\nDone! 3 questionnaires created with ${totalGenerated} total responses.`)
  console.log(`\nPublic links:`)
  console.log(`  Avant:   ${process.env.FRONTEND_URL || 'http://localhost:5173'}/questionnaire/${before.token}`)
  console.log(`  Pendant: ${process.env.FRONTEND_URL || 'http://localhost:5173'}/questionnaire/${during.token}`)
  console.log(`  Apres:   ${process.env.FRONTEND_URL || 'http://localhost:5173'}/questionnaire/${after.token}`)

  await mongoose.disconnect()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
