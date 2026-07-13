import express, { type Request, type Response, type NextFunction } from 'express'
import {
  EducationClass,
  EducationStudent,
  EducationSession,
  EducationAssignment,
  EducationNote,
  EducationDocument,
  EducationSubmission,
} from '../../../models/education/index.js'
import { asObjectId, ownerFilter, validId } from './helpers.js'

const router = express.Router()

type DocumentSearchTargetKind = 'class' | 'session' | 'assignment' | 'student'

type DocumentParentContext =
  | {
      state: 'available'
      target: { kind: DocumentSearchTargetKind; id: string; label: string; school?: string }
    }
  | { state: 'unavailable'; reason: 'NO_PARENT' | 'TARGET_UNAVAILABLE' }

/**
 * Resolve the document's parent immediately before exposing it to Quickfind.
 *
 * A document can outlive a soft-deleted parent, and old data can contain a
 * parentId belonging to another owner. Every lookup therefore repeats the
 * current owner filter. We deliberately return the same opaque unavailable
 * state for a deleted and an unauthorized target.
 */
async function resolveDocumentParentContext(
  document: { parentType: string; parentId: { toString(): string } | null },
  req: Request,
): Promise<DocumentParentContext> {
  if (!document.parentId) return { state: 'unavailable', reason: 'NO_PARENT' }

  const parentId = document.parentId.toString()
  const target = (
    kind: DocumentSearchTargetKind,
    id: string,
    label: string,
    school?: string,
  ): DocumentParentContext => ({
    state: 'available',
    target: { kind, id, label, ...(school ? { school } : {}) },
  })

  switch (document.parentType) {
    case 'class': {
      const parent = await EducationClass.findOne({ _id: parentId, ...ownerFilter(req) }).select('name school')
      return parent
        ? target('class', parent._id.toString(), parent.name, parent.school)
        : { state: 'unavailable', reason: 'TARGET_UNAVAILABLE' }
    }
    case 'session': {
      const parent = await EducationSession.findOne({ _id: parentId, ...ownerFilter(req) }).select('title')
      return parent
        ? target('session', parent._id.toString(), parent.title)
        : { state: 'unavailable', reason: 'TARGET_UNAVAILABLE' }
    }
    case 'assignment': {
      const parent = await EducationAssignment.findOne({ _id: parentId, ...ownerFilter(req) }).select('title')
      return parent
        ? target('assignment', parent._id.toString(), parent.title)
        : { state: 'unavailable', reason: 'TARGET_UNAVAILABLE' }
    }
    case 'student': {
      const parent = await EducationStudent.findOne({ _id: parentId, ...ownerFilter(req) }).select('firstName lastName')
      if (!parent) return { state: 'unavailable', reason: 'TARGET_UNAVAILABLE' }
      return target(
        'student',
        parent._id.toString(),
        [parent.firstName, parent.lastName].filter(Boolean).join(' ') || 'Étudiant',
      )
    }
    case 'submission': {
      const submission = await EducationSubmission.findOne({ _id: parentId, ...ownerFilter(req) }).select(
        'assignmentId',
      )
      if (!submission) return { state: 'unavailable', reason: 'TARGET_UNAVAILABLE' }
      const assignment = await EducationAssignment.findOne({
        _id: submission.assignmentId,
        ...ownerFilter(req),
      }).select('title')
      return assignment
        ? target('assignment', assignment._id.toString(), assignment.title)
        : { state: 'unavailable', reason: 'TARGET_UNAVAILABLE' }
    }
    default:
      // Notes and standalone documents currently have no dedicated direct view.
      return { state: 'unavailable', reason: 'TARGET_UNAVAILABLE' }
  }
}

// GET / — recherche globale "Spotlight" (quickfind), q seul
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q || '').trim()
    if (!q) return res.json({ results: { classes: [], students: [], sessions: [], assignments: [], notes: [], documents: [] } })

    const filter = { ...ownerFilter(req), $text: { $search: q } }
    const limit = 8

    const [classes, students, sessions, assignments, notes, documents] = await Promise.all([
      EducationClass.find(filter).limit(limit),
      EducationStudent.find(filter).limit(limit).populate('classId', 'name color'),
      EducationSession.find(filter).limit(limit).populate('classId', 'name color'),
      EducationAssignment.find(filter).limit(limit).populate('classId', 'name color'),
      EducationNote.find(filter).limit(limit),
      EducationDocument.find(filter).limit(limit),
    ])

    const documentsWithContext = await Promise.all(
      documents.map(async (document) => ({
        ...document.toObject(),
        parentContext: await resolveDocumentParentContext(document, req),
      })),
    )

    res.json({ results: { classes, students, sessions, assignments, notes, documents: documentsWithContext } })
  } catch (err) { next(err) }
})

// GET /advanced — recherche pédagogique avancée avec filtres
// Query params (tous optionnels) :
//  q             : texte libre (titre/instructions/contenu)
//  entity        : "all" | "classes" | "students" | "sessions" | "assignments" | "notes"
//  school        : nom d'école (matché sur EducationClass.school)
//  classId       : id de classe
//  kind          : kind de devoir (DEVOIR, PROJET…) — filtre assignments
//  status        : statut (sessions ou assignments — appliqué selon entity)
//  from / to     : intervalle de dates (date pour sessions, deadline pour assignments, updatedAt sinon)
//  limit         : 1-100 (défaut 50)
//
// Réponse : { results: { classes, students, sessions, assignments, notes }, counts: { … }, schools: [] }
router.get('/advanced', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q || '').trim()
    const entity = String(req.query.entity || 'all')
    const school = String(req.query.school || '').trim()
    const classIdQ = String(req.query.classId || '').trim()
    const kind = String(req.query.kind || '').trim()
    const status = String(req.query.status || '').trim()
    const from = req.query.from ? new Date(String(req.query.from)) : null
    const to = req.query.to ? new Date(String(req.query.to)) : null
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)

    const want = (e: string) => entity === 'all' || entity === e

    // 1) Liste des classes possibles pour le filtre school
    let restrictedClassIds: string[] | null = null
    const classFilter: Record<string, unknown> = { ...ownerFilter(req) }
    if (school) classFilter.school = school
    if (validId(classIdQ)) classFilter._id = classIdQ
    if (q && want('classes')) classFilter.$text = { $search: q }

    if (school || validId(classIdQ)) {
      const restrictedClasses = await EducationClass.find({
        ...ownerFilter(req),
        ...(school ? { school } : {}),
        ...(validId(classIdQ) ? { _id: classIdQ } : {}),
      }).select('_id')
      restrictedClassIds = restrictedClasses.map((c) => c._id.toString())
    }

    const buildText = (text: string) => ({ $text: { $search: text } })

    // 2) Classes
    const classesP = want('classes')
      ? EducationClass.find(classFilter).limit(limit).sort('-updatedAt')
      : Promise.resolve([])

    // 3) Students
    const studentFilter: Record<string, unknown> = { ...ownerFilter(req) }
    if (restrictedClassIds) studentFilter.classId = { $in: restrictedClassIds }
    if (q) Object.assign(studentFilter, buildText(q))
    const studentsP = want('students')
      ? EducationStudent.find(studentFilter).limit(limit).sort('-updatedAt').populate('classId', 'name color school')
      : Promise.resolve([])

    // 4) Sessions
    const sessionFilter: Record<string, unknown> = { ...ownerFilter(req) }
    if (restrictedClassIds) sessionFilter.classId = { $in: restrictedClassIds }
    if (q) Object.assign(sessionFilter, buildText(q))
    if (status && entity !== 'assignments') sessionFilter.status = status
    if (from || to) {
      const range: Record<string, Date> = {}
      if (from) range.$gte = from
      if (to) range.$lte = to
      sessionFilter.date = range
    }
    const sessionsP = want('sessions')
      ? EducationSession.find(sessionFilter).limit(limit).sort('-date').populate('classId', 'name color school')
      : Promise.resolve([])

    // 5) Assignments
    const assignmentFilter: Record<string, unknown> = { ...ownerFilter(req) }
    if (restrictedClassIds) assignmentFilter.classId = { $in: restrictedClassIds }
    if (q) Object.assign(assignmentFilter, buildText(q))
    if (kind) assignmentFilter.kind = kind
    if (status && entity !== 'sessions') assignmentFilter.status = status
    if (from || to) {
      const range: Record<string, Date> = {}
      if (from) range.$gte = from
      if (to) range.$lte = to
      assignmentFilter.deadline = range
    }
    const assignmentsP = want('assignments')
      ? EducationAssignment.find(assignmentFilter).limit(limit).sort('-updatedAt').populate('classId', 'name color school')
      : Promise.resolve([])

    // 6) Notes (text search seulement — pas de classId direct, mais on filtre via links si restreint)
    const noteFilter: Record<string, unknown> = { ...ownerFilter(req) }
    if (q) Object.assign(noteFilter, buildText(q))
    if (restrictedClassIds && restrictedClassIds.length > 0) {
      noteFilter['links'] = {
        $elemMatch: { type: 'class', refId: { $in: restrictedClassIds } },
      }
    }
    const notesP = want('notes')
      ? EducationNote.find(noteFilter).limit(limit).sort('-updatedAt')
      : Promise.resolve([])

    // 7) Compteurs : on garde le compte total pour chaque catégorie (info de cadrage)
    const [classes, students, sessions, assignments, notes] = await Promise.all([
      classesP, studentsP, sessionsP, assignmentsP, notesP,
    ])

    // 8) Liste des écoles disponibles (toujours retournée pour alimenter le select)
    const schoolsAgg = await EducationClass.aggregate([
      { $match: { owner: asObjectId(req.user!.id), deletedAt: null } },
      { $group: { _id: '$school' } },
      { $match: { _id: { $ne: '' } } },
      { $sort: { _id: 1 } },
    ])
    const schools = schoolsAgg.map((s: { _id: string }) => s._id).filter(Boolean)

    res.json({
      results: { classes, students, sessions, assignments, notes },
      counts: {
        classes: classes.length,
        students: students.length,
        sessions: sessions.length,
        assignments: assignments.length,
        notes: notes.length,
      },
      schools,
    })
  } catch (err) { next(err) }
})

// GET /facets — facettes pour alimenter les filtres UI (écoles, classes, kinds, statuses)
router.get('/facets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [classes, schoolsAgg] = await Promise.all([
      EducationClass.find({ ...ownerFilter(req) }).select('_id name school color status').sort('school name'),
      EducationClass.aggregate([
        { $match: { owner: asObjectId(req.user!.id), deletedAt: null } },
        { $group: { _id: '$school', count: { $sum: 1 } } },
        { $match: { _id: { $ne: '' } } },
        { $sort: { _id: 1 } },
      ]),
    ])
    res.json({
      classes,
      schools: schoolsAgg.map((s: { _id: string; count: number }) => ({ name: s._id, count: s.count })).filter((s) => s.name),
    })
  } catch (err) { next(err) }
})

// GET /by-school — fiches école : aggregate par school avec compteurs
router.get('/by-school', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const classes = await EducationClass.find({ ...ownerFilter(req) }).sort('school name')
    const grouped = new Map<string, { school: string; classes: typeof classes; studentCount: number }>()
    for (const c of classes) {
      const key = c.school || '(Sans école)'
      if (!grouped.has(key)) grouped.set(key, { school: key, classes: [] as typeof classes, studentCount: 0 })
      grouped.get(key)!.classes.push(c)
    }
    // Compter les étudiants
    const studentCounts = await EducationStudent.aggregate([
      { $match: { owner: asObjectId(req.user!.id), deletedAt: null } },
      { $group: { _id: '$classId', count: { $sum: 1 } } },
    ])
    const studentByClass = new Map<string, number>()
    for (const s of studentCounts) studentByClass.set(String(s._id), s.count)
    for (const v of grouped.values()) {
      v.studentCount = v.classes.reduce((acc, c) => acc + (studentByClass.get(c._id.toString()) || 0), 0)
    }

    res.json({ schools: Array.from(grouped.values()) })
  } catch (err) { next(err) }
})

export default router
