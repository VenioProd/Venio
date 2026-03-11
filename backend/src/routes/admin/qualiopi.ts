import express, { type Request, type Response, type NextFunction } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import auth from '../../middleware/auth.js'
import { requireAdmin, requirePermission } from '../../middleware/role.js'
import { PERMISSIONS } from '../../lib/permissions.js'
import QualiopiCriterion from '../../models/QualiopiCriterion.js'

const router = express.Router()
router.use(auth)
router.use(requireAdmin)

const uploadsDir = path.resolve('uploads/qualiopi')
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
})
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } })

// GET all criteria with indicators and sub-elements
router.get('/', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let criteria = await QualiopiCriterion.find()
      .sort({ number: 1 })
      .populate('indicators.assignee', 'name email')
      .populate('indicators.subElements.assignee', 'name email')

    // Auto-seed if empty or incomplete (less than 7 criteria)
    if (criteria.length < 7) {
      await QualiopiCriterion.deleteMany({})
      await seedQualiopi()
      criteria = await QualiopiCriterion.find().sort({ number: 1 })
    }

    res.json(criteria)
  } catch (err) { next(err) }
})

// POST force reseed
router.post('/reseed', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await QualiopiCriterion.deleteMany({})
    await seedQualiopi()
    const criteria = await QualiopiCriterion.find().sort({ number: 1 })
    res.json(criteria)
  } catch (err) { next(err) }
})

// PATCH update a criterion (title, objective)
router.patch('/criteria/:criterionId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { criterionId } = req.params
    const updates: Record<string, unknown> = {}
    for (const key of ['title', 'objective']) {
      if (req.body[key] !== undefined) updates[key] = req.body[key]
    }
    const criterion = await QualiopiCriterion.findByIdAndUpdate(criterionId, { $set: updates }, { new: true })
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    res.json(criterion)
  } catch (err) { next(err) }
})

// DELETE a criterion
router.delete('/criteria/:criterionId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const criterion = await QualiopiCriterion.findByIdAndDelete(req.params.criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// PATCH reorder criteria (swap two criteria numbers)
router.patch('/criteria-reorder', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { criterionId, direction } = req.body // direction: 'up' | 'down'
    const criterion = await QualiopiCriterion.findById(criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })

    const targetNumber = direction === 'up' ? criterion.number - 1 : criterion.number + 1
    const other = await QualiopiCriterion.findOne({ number: targetNumber })
    if (!other) return res.status(400).json({ error: 'Deplacement impossible' })

    // Swap numbers
    const tempNumber = criterion.number
    criterion.number = other.number
    other.number = tempNumber
    await criterion.save()
    await other.save()

    const all = await QualiopiCriterion.find().sort({ number: 1 })
      .populate('indicators.assignee', 'name email')
      .populate('indicators.subElements.assignee', 'name email')
    res.json(all)
  } catch (err) { next(err) }
})

// PATCH update an indicator status/assignee/dates
router.patch('/criteria/:criterionId/indicators/:indicatorId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { criterionId, indicatorId } = req.params
    const updates: Record<string, unknown> = {}
    const allowed = ['status', 'assignee', 'startDate', 'endDate', 'title']
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[`indicators.$.${key}`] = req.body[key]
    }
    const criterion = await QualiopiCriterion.findOneAndUpdate(
      { _id: criterionId, 'indicators._id': indicatorId },
      { $set: updates },
      { new: true }
    )
    if (!criterion) return res.status(404).json({ error: 'Indicateur non trouve' })
    res.json(criterion)
  } catch (err) { next(err) }
})

// PATCH update a sub-element
router.patch('/criteria/:criterionId/indicators/:indicatorId/sub/:subId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { criterionId, indicatorId, subId } = req.params
    const criterion = await QualiopiCriterion.findById(criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    const indicator = criterion.indicators.find((i: any) => i._id.toString() === indicatorId)
    if (!indicator) return res.status(404).json({ error: 'Indicateur non trouve' })
    const sub = indicator.subElements.find((s: any) => s._id.toString() === subId)
    if (!sub) return res.status(404).json({ error: 'Sous-element non trouve' })
    const allowed = ['status', 'assignee', 'dueDate', 'title', 'notes']
    for (const key of allowed) {
      if (req.body[key] !== undefined) (sub as any)[key] = req.body[key]
    }
    await criterion.save()
    res.json(criterion)
  } catch (err) { next(err) }
})

// POST add a sub-element to an indicator
router.post('/criteria/:criterionId/indicators/:indicatorId/sub', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { criterionId, indicatorId } = req.params
    const criterion = await QualiopiCriterion.findById(criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    const indicator = criterion.indicators.find((i: any) => i._id.toString() === indicatorId)
    if (!indicator) return res.status(404).json({ error: 'Indicateur non trouve' })
    indicator.subElements.push({
      title: req.body.title || 'Nouveau sous-element',
      status: 'A_FAIRE',
      assignee: null,
      dueDate: null,
      files: [],
      notes: '',
      order: indicator.subElements.length,
    })
    await criterion.save()
    res.json(criterion)
  } catch (err) { next(err) }
})

// DELETE a sub-element
router.delete('/criteria/:criterionId/indicators/:indicatorId/sub/:subId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { criterionId, indicatorId, subId } = req.params
    const criterion = await QualiopiCriterion.findById(criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    const indicator = criterion.indicators.find((i: any) => i._id.toString() === indicatorId)
    if (!indicator) return res.status(404).json({ error: 'Indicateur non trouve' })
    indicator.subElements = indicator.subElements.filter((s: any) => s._id.toString() !== subId)
    await criterion.save()
    res.json(criterion)
  } catch (err) { next(err) }
})

// POST upload file to an indicator (global)
router.post('/criteria/:criterionId/indicators/:indicatorId/files', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' })
    const { criterionId, indicatorId } = req.params
    const criterion = await QualiopiCriterion.findById(criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    const indicator = criterion.indicators.find((i: any) => i._id.toString() === indicatorId)
    if (!indicator) return res.status(404).json({ error: 'Indicateur non trouve' })
    indicator.files.push({
      originalName: req.file.originalname,
      storagePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
    })
    await criterion.save()
    res.json(criterion)
  } catch (err) { next(err) }
})

// DELETE file from an indicator (global)
router.delete('/criteria/:criterionId/indicators/:indicatorId/files/:fileId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { criterionId, indicatorId, fileId } = req.params
    const criterion = await QualiopiCriterion.findById(criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    const indicator = criterion.indicators.find((i: any) => i._id.toString() === indicatorId)
    if (!indicator) return res.status(404).json({ error: 'Indicateur non trouve' })
    const file = indicator.files.find((f: any) => f._id.toString() === fileId)
    if (file && fs.existsSync(file.storagePath)) fs.unlinkSync(file.storagePath)
    indicator.files = indicator.files.filter((f: any) => f._id.toString() !== fileId)
    await criterion.save()
    res.json(criterion)
  } catch (err) { next(err) }
})

// POST upload file to a sub-element
router.post('/criteria/:criterionId/indicators/:indicatorId/sub/:subId/files', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Fichier requis' })
    const { criterionId, indicatorId, subId } = req.params
    const criterion = await QualiopiCriterion.findById(criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    const indicator = criterion.indicators.find((i: any) => i._id.toString() === indicatorId)
    if (!indicator) return res.status(404).json({ error: 'Indicateur non trouve' })
    const sub = indicator.subElements.find((s: any) => s._id.toString() === subId)
    if (!sub) return res.status(404).json({ error: 'Sous-element non trouve' })
    sub.files.push({
      originalName: req.file.originalname,
      storagePath: req.file.path,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date(),
    })
    await criterion.save()
    res.json(criterion)
  } catch (err) { next(err) }
})

// GET download file (searches in indicator files AND sub-element files)
router.get('/files/:fileId/download', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fileId } = req.params
    // Search in indicator-level files first
    let criterion = await QualiopiCriterion.findOne({ 'indicators.files._id': fileId })
    let foundFile: any = null
    if (criterion) {
      for (const ind of criterion.indicators) {
        const f = ind.files.find((file: any) => file._id.toString() === fileId)
        if (f) { foundFile = f; break }
      }
    }
    // Then search in sub-element files
    if (!foundFile) {
      criterion = await QualiopiCriterion.findOne({ 'indicators.subElements.files._id': fileId })
      if (criterion) {
        for (const ind of criterion.indicators) {
          for (const sub of ind.subElements) {
            const f = sub.files.find((file: any) => file._id.toString() === fileId)
            if (f) { foundFile = f; break }
          }
          if (foundFile) break
        }
      }
    }
    if (!foundFile || !fs.existsSync(foundFile.storagePath)) return res.status(404).json({ error: 'Fichier non trouve' })
    res.setHeader('Content-Disposition', `attachment; filename="${foundFile.originalName}"`)
    res.setHeader('Content-Type', foundFile.mimeType)
    fs.createReadStream(foundFile.storagePath).pipe(res)
  } catch (err) { next(err) }
})

// DELETE file from sub-element
router.delete('/criteria/:criterionId/indicators/:indicatorId/sub/:subId/files/:fileId', requirePermission(PERMISSIONS.MANAGE_QUALIOPI), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { criterionId, indicatorId, subId, fileId } = req.params
    const criterion = await QualiopiCriterion.findById(criterionId)
    if (!criterion) return res.status(404).json({ error: 'Critere non trouve' })
    const indicator = criterion.indicators.find((i: any) => i._id.toString() === indicatorId)
    if (!indicator) return res.status(404).json({ error: 'Indicateur non trouve' })
    const sub = indicator.subElements.find((s: any) => s._id.toString() === subId)
    if (!sub) return res.status(404).json({ error: 'Sous-element non trouve' })
    const file = sub.files.find((f: any) => f._id.toString() === fileId)
    if (file && fs.existsSync(file.storagePath)) fs.unlinkSync(file.storagePath)
    sub.files = sub.files.filter((f: any) => f._id.toString() !== fileId)
    await criterion.save()
    res.json(criterion)
  } catch (err) { next(err) }
})

// ─── Seed: Referentiel National Qualite — 7 criteres, 32 indicateurs ───

function sub(title: string, order: number) {
  return { title, status: 'A_FAIRE' as const, assignee: null, dueDate: null, files: [], notes: '', order }
}

async function seedQualiopi() {
  const data = [
    // ════════════════════════════════════════════════
    // CRITERE 1 — Information du public (Indicateurs 1-4)
    // ════════════════════════════════════════════════
    {
      number: 1,
      title: 'Conditions d\'information du public',
      objective: 'Diffuser une information accessible au public, detaillee et verifiable sur les prestations, les resultats obtenus et les delais d\'acces.',
      indicators: [
        {
          number: 1, title: 'Diffusion d\'une information accessible et detaillee', status: 'A_FAIRE', order: 0,
          subElements: [
            sub('Catalogue de formations (papier ou numerique) a jour', 0),
            sub('Site internet avec fiches detaillees par formation (objectifs, duree, tarifs, prerequis, modalites)', 1),
            sub('CGV et reglement interieur accessibles', 2),
            sub('Contrats ou conventions de formation conformes', 3),
            sub('Mentions des delais d\'acces a la prestation', 4),
          ],
        },
        {
          number: 2, title: 'Indicateurs de resultats adaptes', status: 'A_FAIRE', order: 1,
          subElements: [
            sub('Taux de satisfaction des stagiaires', 0),
            sub('Taux de reussite / d\'obtention des certifications', 1),
            sub('Nombre de stagiaires formes', 2),
            sub('Taux d\'abandon / d\'interruption', 3),
            sub('Taux d\'insertion professionnelle (si applicable)', 4),
          ],
        },
        {
          number: 3, title: 'Taux d\'obtention des certifications', status: 'A_FAIRE', order: 2,
          subElements: [
            sub('Publication des taux de reussite par certification', 0),
            sub('Suivi des resultats aux examens / certifications', 1),
            sub('Communication des taux sur le site internet et les supports', 2),
          ],
        },
        {
          number: 4, title: 'Analyse des indicateurs de performance', status: 'A_FAIRE', order: 3,
          subElements: [
            sub('Tableau de bord de suivi des indicateurs', 0),
            sub('Analyse annuelle des resultats', 1),
            sub('Plan d\'actions correctives base sur les indicateurs', 2),
          ],
        },
      ],
    },

    // ════════════════════════════════════════════════
    // CRITERE 2 — Identification des objectifs (Indicateurs 5-8)
    // ════════════════════════════════════════════════
    {
      number: 2,
      title: 'Identification precise des objectifs et adaptation des prestations',
      objective: 'Definir et mettre en oeuvre les prestations proposees en adequation avec les besoins du beneficiaire.',
      indicators: [
        {
          number: 5, title: 'Objectifs de la prestation et competences visees', status: 'A_FAIRE', order: 0,
          subElements: [
            sub('Fiches pedagogiques avec objectifs et competences cibles', 0),
            sub('Analyse des besoins prealable (questionnaires, entretiens)', 1),
            sub('Contrats/conventions reprenant les objectifs', 2),
          ],
        },
        {
          number: 6, title: 'Contenu et duree adaptes', status: 'A_FAIRE', order: 1,
          subElements: [
            sub('Programmes detailles par formation', 0),
            sub('Adaptation du contenu selon le niveau des apprenants', 1),
            sub('Preuves de personnalisation (cas pratiques adaptes, supports specifiques)', 2),
          ],
        },
        {
          number: 7, title: 'Modalites d\'accueil et accessibilite', status: 'A_FAIRE', order: 2,
          subElements: [
            sub('Procedure d\'accueil des personnes en situation de handicap', 0),
            sub('Designation d\'un referent handicap', 1),
            sub('Partenariats avec acteurs specialises (AGEFIPH, Cap Emploi, MDPH)', 2),
            sub('Adaptation des locaux et modalites pedagogiques', 3),
            sub('Communication claire sur l\'accessibilite (site, catalogue)', 4),
          ],
        },
        {
          number: 8, title: 'Conformite a la certification visee', status: 'A_FAIRE', order: 3,
          subElements: [
            sub('Referentiels de certification utilises', 0),
            sub('Alignement du programme avec le referentiel', 1),
            sub('Modalites d\'evaluation conformes au referentiel', 2),
          ],
        },
      ],
    },

    // ════════════════════════════════════════════════
    // CRITERE 3 — Adaptation des prestations (Indicateurs 9-13)
    // ════════════════════════════════════════════════
    {
      number: 3,
      title: 'Adaptation aux publics beneficiaires des prestations',
      objective: 'Adapter les conditions d\'accueil, d\'accompagnement et d\'evaluation aux differents publics.',
      indicators: [
        {
          number: 9, title: 'Information sur les conditions de deroulement', status: 'A_FAIRE', order: 0,
          subElements: [
            sub('Livret d\'accueil / guide du stagiaire', 0),
            sub('Reglement interieur remis et signe', 1),
            sub('Programme de formation remis avant le demarrage', 2),
            sub('Information sur les modalites d\'evaluation', 3),
          ],
        },
        {
          number: 10, title: 'Adaptation de la prestation et accompagnement', status: 'A_FAIRE', order: 1,
          subElements: [
            sub('Positionnement prealable des apprenants (tests, entretiens)', 0),
            sub('Adaptation des parcours individuels', 1),
            sub('Suivi pedagogique individualise (feuilles de suivi, bilans intermediaires)', 2),
          ],
        },
        {
          number: 11, title: 'Evaluation de l\'atteinte des objectifs', status: 'A_FAIRE', order: 2,
          subElements: [
            sub('Evaluations formatives pendant la formation (quiz, exercices, mises en situation)', 0),
            sub('Evaluations sommatives en fin de formation', 1),
            sub('Grilles d\'evaluation des competences acquises', 2),
            sub('Attestations de fin de formation delivrees', 3),
          ],
        },
        {
          number: 12, title: 'Engagement des beneficiaires', status: 'A_FAIRE', order: 3,
          subElements: [
            sub('Feuilles d\'emargement signees', 0),
            sub('Releves de connexion pour les formations a distance', 1),
            sub('Suivi des travaux et exercices rendus', 2),
            sub('Procedure de gestion de l\'assiduite', 3),
          ],
        },
        {
          number: 13, title: 'Coordination des intervenants', status: 'A_FAIRE', order: 4,
          subElements: [
            sub('Planning des intervenants', 0),
            sub('Reunions de coordination pedagogique (comptes rendus)', 1),
            sub('Outils de partage d\'informations entre intervenants', 2),
          ],
        },
      ],
    },

    // ════════════════════════════════════════════════
    // CRITERE 4 — Moyens pedagogiques et techniques (Indicateurs 14-18)
    // ════════════════════════════════════════════════
    {
      number: 4,
      title: 'Adequation des moyens pedagogiques, techniques et d\'encadrement',
      objective: 'Mobiliser les moyens humains, techniques et pedagogiques necessaires aux prestations.',
      indicators: [
        {
          number: 14, title: 'Moyens pedagogiques et techniques adaptes', status: 'A_FAIRE', order: 0,
          subElements: [
            sub('Inventaire des ressources pedagogiques (salles, materiels, logiciels, LMS)', 0),
            sub('Supports pedagogiques utilises (diaporamas, fiches techniques, guides)', 1),
            sub('Preuves d\'achat ou de maintenance des equipements', 2),
            sub('Photos ou attestations d\'utilisation des locaux/materiels', 3),
          ],
        },
        {
          number: 15, title: 'Conditions de prevention des ruptures de parcours', status: 'A_FAIRE', order: 1,
          subElements: [
            sub('Procedure de gestion des abandons et ruptures', 0),
            sub('Dispositif de relance / accompagnement des apprenants en difficulte', 1),
            sub('Suivi des motifs d\'abandon', 2),
          ],
        },
        {
          number: 16, title: 'Coordination des acteurs de la formation', status: 'A_FAIRE', order: 2,
          subElements: [
            sub('Conventions avec les entreprises (pour alternance)', 0),
            sub('Suivi des relations avec les tuteurs / maitres d\'apprentissage', 1),
            sub('Bilans tripartites (apprenant, formateur, entreprise)', 2),
          ],
        },
        {
          number: 17, title: 'Conformite de la sous-traitance', status: 'A_FAIRE', order: 3,
          subElements: [
            sub('Contrats de sous-traitance conformes', 0),
            sub('Selection et evaluation des sous-traitants', 1),
            sub('Suivi de la qualite des prestations sous-traitees', 2),
          ],
        },
        {
          number: 18, title: 'Conditions de presentation aux certifications', status: 'A_FAIRE', order: 4,
          subElements: [
            sub('Information des candidats sur les conditions d\'examen', 0),
            sub('Preparation specifique aux epreuves de certification', 1),
            sub('Suivi des inscriptions aux certifications', 2),
          ],
        },
      ],
    },

    // ════════════════════════════════════════════════
    // CRITERE 5 — Qualification des personnels (Indicateurs 19-22)
    // ════════════════════════════════════════════════
    {
      number: 5,
      title: 'Qualification et developpement des connaissances et competences des personnels',
      objective: 'S\'assurer de la qualification et des competences des intervenants et assurer leur developpement.',
      indicators: [
        {
          number: 19, title: 'Moyens humains dedies et competences', status: 'A_FAIRE', order: 0,
          subElements: [
            sub('CV et diplomes des formateurs', 0),
            sub('Contrats de travail ou de prestation', 1),
            sub('Matrice de competences des formateurs', 2),
            sub('Organigramme fonctionnel', 3),
          ],
        },
        {
          number: 20, title: 'Competences des formateurs', status: 'A_FAIRE', order: 1,
          subElements: [
            sub('Evaluations des formateurs par les apprenants', 0),
            sub('Entretiens annuels d\'evaluation', 1),
            sub('Suivi des competences techniques et pedagogiques', 2),
          ],
        },
        {
          number: 21, title: 'Competences des responsables pedagogiques', status: 'A_FAIRE', order: 2,
          subElements: [
            sub('CV et qualifications des responsables pedagogiques', 0),
            sub('Fiches de poste detaillees', 1),
            sub('Preuves de formation continue des responsables', 2),
          ],
        },
        {
          number: 22, title: 'Developpement des competences des personnels', status: 'A_FAIRE', order: 3,
          subElements: [
            sub('Plan de formation continue des formateurs', 0),
            sub('Attestations de participation a des formations / conferences', 1),
            sub('Veille pedagogique et sectorielle (articles, webinaires, certifications)', 2),
            sub('Budget formation des personnels', 3),
          ],
        },
      ],
    },

    // ════════════════════════════════════════════════
    // CRITERE 6 — Environnement professionnel (Indicateurs 23-26)
    // ════════════════════════════════════════════════
    {
      number: 6,
      title: 'Inscription et investissement dans son environnement professionnel',
      objective: 'S\'integrer dans l\'ecosysteme economique et professionnel et realiser une veille permanente.',
      indicators: [
        {
          number: 23, title: 'Veille sur les competences, metiers et emplois', status: 'A_FAIRE', order: 0,
          subElements: [
            sub('Etudes de marche ou analyses sectorielles', 0),
            sub('Veille economique, reglementaire ou technologique', 1),
            sub('Syntheses d\'echanges avec entreprises ou OPCO', 2),
          ],
        },
        {
          number: 24, title: 'Veille sur les evolutions pedagogiques et technologiques', status: 'A_FAIRE', order: 1,
          subElements: [
            sub('Participation a des salons, conferences, webinaires', 0),
            sub('Abonnements a des revues specialisees ou plateformes', 1),
            sub('Compte-rendus de veille pedagogique', 2),
          ],
        },
        {
          number: 25, title: 'Conditions d\'insertion professionnelle', status: 'A_FAIRE', order: 2,
          subElements: [
            sub('Partenariats avec des entreprises pour l\'insertion', 0),
            sub('Suivi de l\'insertion professionnelle des anciens stagiaires', 1),
            sub('Actions de mise en relation (job dating, forums)', 2),
          ],
        },
        {
          number: 26, title: 'Mobilisation des expertises et reseaux', status: 'A_FAIRE', order: 3,
          subElements: [
            sub('Preuves de partenariats (contrats, conventions)', 0),
            sub('Participation a des reseaux professionnels', 1),
            sub('Liste des entreprises et organismes partenaires', 2),
            sub('Interventions d\'experts exterieurs', 3),
          ],
        },
      ],
    },

    // ════════════════════════════════════════════════
    // CRITERE 7 — Amelioration continue (Indicateurs 27-32)
    // ════════════════════════════════════════════════
    {
      number: 7,
      title: 'Recueil et prise en compte des appreciations et des reclamations',
      objective: 'Mettre en oeuvre des actions d\'amelioration continue basees sur les retours des parties prenantes.',
      indicators: [
        {
          number: 27, title: 'Recueil des appreciations des parties prenantes', status: 'A_FAIRE', order: 0,
          subElements: [
            sub('Enquetes de satisfaction a chaud (fin de formation)', 0),
            sub('Enquetes de satisfaction a froid (3-6 mois apres)', 1),
            sub('Questionnaires aupres des financeurs et entreprises', 2),
            sub('Procedure de collecte et d\'analyse des retours', 3),
          ],
        },
        {
          number: 28, title: 'Traitement des difficultes rencontrees', status: 'A_FAIRE', order: 1,
          subElements: [
            sub('Procedure de gestion des imprevus (absence formateur, panne technique)', 0),
            sub('Exemples de mise en oeuvre (adaptation planning, remplacement)', 1),
            sub('Suivi des incidents et solutions apportees', 2),
          ],
        },
        {
          number: 29, title: 'Mesures d\'amelioration a partir des appreciations', status: 'A_FAIRE', order: 2,
          subElements: [
            sub('Syntheses des retours d\'experience', 0),
            sub('Plan d\'actions correctives issues des evaluations', 1),
            sub('Preuves de modifications apportees suite aux retours', 2),
          ],
        },
        {
          number: 30, title: 'Traitement des reclamations et alea', status: 'A_FAIRE', order: 3,
          subElements: [
            sub('Registre des reclamations', 0),
            sub('Procedure ecrite de traitement des reclamations', 1),
            sub('Preuves de prise en charge (courriels, rapports)', 2),
            sub('Delais de traitement respectes', 3),
          ],
        },
        {
          number: 31, title: 'Actions d\'amelioration continue', status: 'A_FAIRE', order: 4,
          subElements: [
            sub('Plan d\'amelioration continue avec suivi des actions', 0),
            sub('Preuves des actions mises en oeuvre (exemples concrets)', 1),
            sub('Tableau de bord qualite / indicateurs de performance', 2),
            sub('Revue de direction ou comite qualite (comptes rendus)', 3),
          ],
        },
        {
          number: 32, title: 'Demarche qualite et certification', status: 'A_FAIRE', order: 5,
          subElements: [
            sub('Engagement dans une demarche qualite formalisee', 0),
            sub('Audits internes realises', 1),
            sub('Actions de benchmarking avec d\'autres organismes', 2),
            sub('Documentation du systeme qualite', 3),
          ],
        },
      ],
    },
  ]
  await QualiopiCriterion.insertMany(data)
}

export default router
