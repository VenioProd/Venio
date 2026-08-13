import express, { type Request, type Response, type NextFunction } from 'express'
import { Types } from 'mongoose'
import {
  ATTENDANCE_STATES,
  SESSION_STATUSES,
  EducationSession,
  EducationClass,
  EducationStudent,
  type AttendanceState,
} from '../../../models/education/index.js'
import { invalidStudentIdsForClass, logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'
import { sensitiveAction } from '../../../lib/security/sensitiveActions.js'

const router = express.Router()

interface AttendancePatchEntry {
  studentId?: unknown
  state?: unknown
  comment?: unknown
}

// GET / — list ; query: classId, from, to, status
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { limit, skip } = parseListQuery(req, { defaultLimit: 100, maxLimit: 500 })
    const filter: Record<string, unknown> = { ...ownerFilter(req) }
    if (req.query.classId && validId(req.query.classId)) filter.classId = req.query.classId
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status
    const dateRange: Record<string, Date> = {}
    if (req.query.from) dateRange.$gte = new Date(String(req.query.from))
    if (req.query.to) dateRange.$lte = new Date(String(req.query.to))
    if (Object.keys(dateRange).length) filter.date = dateRange

    const sort = String(req.query.sort || 'date')
    const [items, total] = await Promise.all([
      EducationSession.find(filter).sort(sort).skip(skip).limit(limit).populate('classId', 'name color'),
      EducationSession.countDocuments(filter),
    ])
    res.json({ sessions: items, total })
  } catch (err) {
    next(err)
  }
})

// POST /
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId, title, theme, objectives, agenda, date, durationMin, location, status, supports, tags } = req.body
    if (!validId(classId)) return res.status(400).json({ error: 'classId invalide' })
    if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' })
    if (!date) return res.status(400).json({ error: 'La date est requise' })
    if (status !== undefined && !(SESSION_STATUSES as readonly string[]).includes(status)) {
      return res.status(400).json({ error: 'Statut de séance invalide' })
    }

    const klass = await EducationClass.findOne({ _id: classId, ...ownerFilter(req) })
    if (!klass) return res.status(404).json({ error: 'Classe introuvable' })

    // Pré-remplir attendance avec les étudiants actifs de la classe
    const students = await EducationStudent.find({ classId, ...ownerFilter(req), status: 'ACTIVE' }).select('_id')
    const attendance = students.map((s) => ({ studentId: s._id, state: 'NON_RENSEIGNE' as const, comment: '' }))

    const created = await EducationSession.create({
      owner: req.user!.id,
      classId,
      title: title.trim(),
      theme: theme || '',
      objectives: Array.isArray(objectives) ? objectives : [],
      agenda: agenda || '',
      date: new Date(date),
      durationMin: durationMin ?? 120,
      location: location || '',
      status: status || 'PLANIFIEE',
      attendance,
      supports: Array.isArray(supports) ? supports : [],
      tags: Array.isArray(tags) ? tags : [],
    })
    await logActivity(req.user!.id, req.user!.id, 'session', created._id, 'CREATE', { classId })
    res.status(201).json({ session: created })
  } catch (err) {
    next(err)
  }
})

// GET /:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationSession.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Séance introuvable' })
    const classId = item.classId
    await item.populate('classId', 'name color')
    await item.populate({
      path: 'attendance.studentId',
      select: 'firstName lastName',
      match: { owner: req.user!.id, classId, deletedAt: null },
    })
    res.json({ session: item })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id
router.patch('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationSession.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Séance introuvable' })

    const { title, theme, objectives, agenda, date, durationMin, location, status, recap, supports, tags } = req.body
    if (title !== undefined) item.title = title.trim()
    if (theme !== undefined) item.theme = theme
    if (Array.isArray(objectives)) item.objectives = objectives
    if (agenda !== undefined) item.agenda = agenda
    if (date !== undefined) item.date = new Date(date)
    if (durationMin !== undefined) item.durationMin = durationMin
    if (location !== undefined) item.location = location
    if (status !== undefined) {
      if (!(SESSION_STATUSES as readonly string[]).includes(status)) {
        return res.status(400).json({ error: 'Statut de séance invalide' })
      }
      item.status = status
    }
    if (recap !== undefined) item.recap = recap
    if (Array.isArray(supports)) item.supports = supports
    if (Array.isArray(tags)) item.tags = tags
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'session', item._id, 'UPDATE', {})
    res.json({ session: item })
  } catch (err) {
    next(err)
  }
})

// PATCH /:id/attendance — bulk update présence
router.patch('/:id/attendance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationSession.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Séance introuvable' })

    const entries: AttendancePatchEntry[] = Array.isArray(req.body?.attendance) ? req.body.attendance : []
    if (entries.length > 500) return res.status(400).json({ error: 'Maximum 500 présences par lot' })
    if (entries.some((entry: AttendancePatchEntry) => !entry || typeof entry !== 'object')) {
      return res.status(400).json({ error: 'Format de présence invalide' })
    }
    if (
      entries.some(
        (entry: AttendancePatchEntry) =>
          entry.state !== undefined &&
          (typeof entry.state !== 'string' || !(ATTENDANCE_STATES as readonly string[]).includes(entry.state)),
      )
    ) {
      return res.status(400).json({ error: 'Statut de présence invalide' })
    }

    const studentIds = entries.map((entry: AttendancePatchEntry) => entry.studentId)
    const normalizedStudentIds = studentIds.map((id: unknown) => (typeof id === 'string' ? id : String(id ?? '')))
    if (new Set(normalizedStudentIds).size !== normalizedStudentIds.length) {
      return res.status(400).json({ error: 'Un étudiant ne peut apparaître qu’une fois par lot' })
    }
    const invalidStudentIds = await invalidStudentIdsForClass(req, item.classId, studentIds)
    if (invalidStudentIds.length > 0) {
      return res.status(400).json({ error: 'Étudiant absent de la classe', invalidStudentIds })
    }

    const normalizedEntries = entries.map((entry: AttendancePatchEntry) => ({
      studentId: String(entry.studentId),
      state:
        typeof entry.state === 'string' && (ATTENDANCE_STATES as readonly string[]).includes(entry.state)
          ? (entry.state as AttendanceState)
          : ('NON_RENSEIGNE' as AttendanceState),
      comment: typeof entry.comment === 'string' ? entry.comment.trim().slice(0, 2000) : '',
    }))

    for (const entry of normalizedEntries) {
      const idx = item.attendance.findIndex((a) => a.studentId.toString() === String(entry.studentId))
      if (idx === -1) {
        item.attendance.push({
          studentId: new Types.ObjectId(entry.studentId),
          state: entry.state,
          comment: entry.comment,
        })
      } else {
        item.attendance[idx].state = entry.state
        item.attendance[idx].comment = entry.comment
      }
    }
    await item.save()

    // Recalculer les compteurs étudiants impactés
    if (normalizedStudentIds.length > 0) {
      for (const sid of normalizedStudentIds) {
        const sessions = await EducationSession.find({
          'attendance.studentId': sid,
          classId: item.classId,
          owner: req.user!.id,
          deletedAt: null,
        }).select('attendance')
        let present = 0
        let absent = 0
        let late = 0
        for (const s of sessions) {
          const att = s.attendance.find((a) => a.studentId.toString() === sid)
          if (!att) continue
          if (att.state === 'PRESENT') present++
          else if (att.state === 'ABSENT') absent++
          else if (att.state === 'RETARD') late++
        }
        await EducationStudent.updateOne(
          { _id: sid, classId: item.classId, owner: req.user!.id, deletedAt: null },
          { attendanceCount: present, absenceCount: absent, lateCount: late },
        )
      }
    }

    await logActivity(req.user!.id, req.user!.id, 'session', item._id, 'UPDATE', { kind: 'attendance' })
    res.json({ session: item })
  } catch (err) {
    next(err)
  }
})

// DELETE /:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationSession.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Séance introuvable' })
    item.deletedAt = new Date()
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'session', item._id, 'DELETE', {})
    res.json({ success: true })
  } catch (err) {
    next(err)
  }
})

// GET /:id/export.csv — export CSV présence + récap
router.get(
  '/:id/export.csv',
  sensitiveAction('EDUCATION_SESSION_EXPORT'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
      const item = await EducationSession.findOne({ _id: req.params.id, ...ownerFilter(req) })
      if (!item) return res.status(404).json({ error: 'Séance introuvable' })
      const classId = item.classId
      await item.populate('classId', 'name school')

      const students = await EducationStudent.find({
        _id: { $in: item.attendance.map((a) => a.studentId) },
        classId,
        ...ownerFilter(req),
      }).select('firstName lastName email externalId')
      const map = new Map(students.map((s) => [s._id.toString(), s]))

      const headers = ['Etudiant', 'Email', 'Identifiant', 'Présence', 'Commentaire']
      const rows = item.attendance
        .filter((entry) => map.has(entry.studentId.toString()))
        .map((a) => {
          const stu = map.get(a.studentId.toString())
          const name = stu ? [stu.firstName || '', (stu.lastName || '').toUpperCase()].filter(Boolean).join(' ') : ''
          return [name, stu?.email || '', stu?.externalId || '', a.state, a.comment || '']
        })

      const csv = toCsv([headers, ...rows])
      const klassName =
        item.classId && typeof item.classId === 'object'
          ? (item.classId as unknown as { name?: string }).name || 'classe'
          : 'classe'
      const dateSlug = new Date(item.date).toISOString().slice(0, 10)
      const fname = `seance-${slugify(klassName)}-${dateSlug}-${slugify(item.title)}.csv`
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`)
      res.send('﻿' + csv)
    } catch (err) {
      next(err)
    }
  },
)

function escapeCsvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes(';')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(escapeCsvCell).join(',')).join('\n')
}

function slugify(s: string): string {
  return (
    String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'export'
  )
}

export default router
