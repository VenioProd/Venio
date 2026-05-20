import express, { type Request, type Response, type NextFunction } from 'express'
import { EducationSession, EducationClass, EducationStudent } from '../../../models/education/index.js'
import { logActivity, ownerFilter, parseListQuery, validId } from './helpers.js'

const router = express.Router()

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
  } catch (err) { next(err) }
})

// POST /
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { classId, title, theme, objectives, agenda, date, durationMin, location, status, supports, tags } = req.body
    if (!validId(classId)) return res.status(400).json({ error: 'classId invalide' })
    if (!title?.trim()) return res.status(400).json({ error: 'Le titre est requis' })
    if (!date) return res.status(400).json({ error: 'La date est requise' })

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
  } catch (err) { next(err) }
})

// GET /:id
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationSession.findOne({ _id: req.params.id, ...ownerFilter(req) })
      .populate('classId', 'name color')
      .populate('attendance.studentId', 'firstName lastName')
    if (!item) return res.status(404).json({ error: 'Séance introuvable' })
    res.json({ session: item })
  } catch (err) { next(err) }
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
    if (status !== undefined) item.status = status
    if (recap !== undefined) item.recap = recap
    if (Array.isArray(supports)) item.supports = supports
    if (Array.isArray(tags)) item.tags = tags
    await item.save()
    await logActivity(req.user!.id, req.user!.id, 'session', item._id, 'UPDATE', {})
    res.json({ session: item })
  } catch (err) { next(err) }
})

// PATCH /:id/attendance — bulk update présence
router.patch('/:id/attendance', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationSession.findOne({ _id: req.params.id, ...ownerFilter(req) })
    if (!item) return res.status(404).json({ error: 'Séance introuvable' })

    const entries = Array.isArray(req.body?.attendance) ? req.body.attendance : []
    for (const entry of entries) {
      if (!entry?.studentId) continue
      const idx = item.attendance.findIndex((a) => a.studentId.toString() === String(entry.studentId))
      if (idx === -1) {
        item.attendance.push({
          studentId: entry.studentId,
          state: entry.state || 'NON_RENSEIGNE',
          comment: entry.comment || '',
        })
      } else {
        if (entry.state) item.attendance[idx].state = entry.state
        if (entry.comment !== undefined) item.attendance[idx].comment = entry.comment
      }
    }
    await item.save()

    // Recalculer les compteurs étudiants impactés
    const studentIds = entries.map((e: { studentId: string }) => e.studentId).filter(Boolean)
    if (studentIds.length > 0) {
      for (const sid of studentIds) {
        if (!validId(sid)) continue
        const sessions = await EducationSession.find({
          'attendance.studentId': sid,
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
          { _id: sid, owner: req.user!.id },
          { attendanceCount: present, absenceCount: absent, lateCount: late }
        )
      }
    }

    await logActivity(req.user!.id, req.user!.id, 'session', item._id, 'UPDATE', { kind: 'attendance' })
    res.json({ session: item })
  } catch (err) { next(err) }
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
  } catch (err) { next(err) }
})

// GET /:id/export.csv — export CSV présence + récap
router.get('/:id/export.csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Identifiant invalide' })
    const item = await EducationSession.findOne({ _id: req.params.id, ...ownerFilter(req) })
      .populate('classId', 'name school')
    if (!item) return res.status(404).json({ error: 'Séance introuvable' })

    const students = await EducationStudent.find({
      _id: { $in: item.attendance.map((a) => a.studentId) },
      ...ownerFilter(req),
    }).select('firstName lastName email externalId')
    const map = new Map(students.map((s) => [s._id.toString(), s]))

    const headers = ['Etudiant', 'Email', 'Identifiant', 'Présence', 'Commentaire']
    const rows = item.attendance.map((a) => {
      const stu = map.get(a.studentId.toString())
      const name = stu ? [stu.firstName || '', (stu.lastName || '').toUpperCase()].filter(Boolean).join(' ') : ''
      return [name, stu?.email || '', stu?.externalId || '', a.state, a.comment || '']
    })

    const csv = toCsv([headers, ...rows])
    const klassName = item.classId && typeof item.classId === 'object'
      ? (item.classId as unknown as { name?: string }).name || 'classe'
      : 'classe'
    const dateSlug = new Date(item.date).toISOString().slice(0, 10)
    const fname = `seance-${slugify(klassName)}-${dateSlug}-${slugify(item.title)}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`)
    res.send('﻿' + csv)
  } catch (err) { next(err) }
})

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
  return String(s).toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64) || 'export'
}

export default router
