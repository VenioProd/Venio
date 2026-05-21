import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express, type Request, type Response, type NextFunction } from 'express'
import mongoose from 'mongoose'
import fs from 'fs'
import path from 'path'
import { setupMongo, teardownMongo, clearDb } from './helpers/mongoTestEnv.js'

/**
 * VENIO-46 — Tests de la BDD documentaire pédagogique.
 *
 * Couvre :
 * - POST /documents (upload + url-only) avec metadata et inférence du parent
 * - GET /documents avec filtres (search, category, status, school, classId, tag)
 * - GET /documents → compteurs par catégorie (categoryCounts)
 * - PATCH /documents/:id (metadata + tags + ré-inférence du parent)
 * - DELETE /documents/:id (soft delete : disparaît du listing)
 * - GET /documents/:id/download (redirige sur l'URL si stocké côté tiers)
 */

const OWNER_ID = new mongoose.Types.ObjectId().toString()

vi.mock('../middleware/auth.js', () => ({
  default: (req: Request, _res: Response, next: NextFunction) => {
    req.user = { id: OWNER_ID, role: 'SUPER_ADMIN' } as Request['user']
    next()
  },
}))
vi.mock('../middleware/role.js', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requireSuperAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  requirePermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  requireAnyPermission: () => (_req: Request, _res: Response, next: NextFunction) => next(),
  default: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}))

let app: Express

beforeAll(async () => {
  await setupMongo()
  const { default: educationRoutes } = await import('../routes/admin/education/index.js')
  app = express()
  app.use(express.json())
  app.use('/api/admin/education', educationRoutes)
})

afterAll(async () => {
  await teardownMongo()
  // Nettoyage des fichiers uploadés pendant les tests : on garde le dossier
  // (multer le crée à l'init du module) mais on vide les fichiers de test.
  const uploadsDir = path.resolve('uploads/education')
  if (fs.existsSync(uploadsDir)) {
    for (const f of fs.readdirSync(uploadsDir)) {
      try { fs.unlinkSync(path.join(uploadsDir, f)) } catch { /* noop */ }
    }
  }
})

beforeEach(async () => {
  await clearDb()
})

describe('education documents — VENIO-46', () => {
  it('crée un document via URL (sans fichier) avec metadata, catégorie et tags', async () => {
    const res = await request(app)
      .post('/api/admin/education/documents')
      .field('url', 'https://drive.google.com/file/abc')
      .field('title', 'Sujet examen BTS')
      .field('category', 'exam_subject')
      .field('school', 'EMA')
      .field('tags', 'examen, BTS, 2025')
      .expect(201)

    expect(res.body.document.url).toContain('drive.google.com')
    expect(res.body.document.category).toBe('exam_subject')
    expect(res.body.document.title).toBe('Sujet examen BTS')
    expect(res.body.document.tags).toEqual(['examen', 'BTS', '2025'])
    expect(res.body.document.parentType).toBe('standalone')
    expect(res.body.document.school).toBe('EMA')
  })

  it('upload un fichier multipart et infère parentType depuis classId', async () => {
    const classId = new mongoose.Types.ObjectId().toString()
    const res = await request(app)
      .post('/api/admin/education/documents')
      .field('title', 'Plan de cours')
      .field('category', 'teaching_resource')
      .field('classId', classId)
      .attach('file', Buffer.from('contenu pdf factice'), { filename: 'plan.pdf', contentType: 'application/pdf' })
      .expect(201)

    expect(res.body.document.originalName).toBe('plan.pdf')
    expect(res.body.document.size).toBeGreaterThan(0)
    expect(res.body.document.parentType).toBe('class')
    expect(res.body.document.parentId).toBe(classId)
  })

  it('refuse une catégorie inconnue', async () => {
    await request(app)
      .post('/api/admin/education/documents')
      .field('url', 'https://x')
      .field('category', 'nimporte-quoi')
      .expect(400)
  })

  it('refuse si ni fichier ni url', async () => {
    await request(app)
      .post('/api/admin/education/documents')
      .field('title', 'rien')
      .expect(400)
  })

  it('liste avec recherche + filtres et renvoie les compteurs par catégorie', async () => {
    const sessionId = new mongoose.Types.ObjectId().toString()
    await request(app)
      .post('/api/admin/education/documents')
      .field('url', 'https://a/exam')
      .field('title', 'Sujet 1')
      .field('category', 'exam_subject')
      .field('school', 'EMA')
      .field('tags', 'examen, bts')
      .expect(201)

    await request(app)
      .post('/api/admin/education/documents')
      .field('url', 'https://a/corr')
      .field('title', 'Correction 1')
      .field('category', 'assignment_correction')
      .field('school', 'EMA')
      .field('sessionId', sessionId)
      .expect(201)

    await request(app)
      .post('/api/admin/education/documents')
      .field('url', 'https://a/res')
      .field('title', 'Ressource pédago')
      .field('category', 'teaching_resource')
      .field('school', 'ESIC')
      .expect(201)

    // Recherche par mot-clé
    const search = await request(app)
      .get('/api/admin/education/documents?search=Sujet')
      .expect(200)
    expect(search.body.documents).toHaveLength(1)
    expect(search.body.documents[0].title).toBe('Sujet 1')

    // Filtre catégorie
    const cat = await request(app)
      .get('/api/admin/education/documents?category=assignment_correction')
      .expect(200)
    expect(cat.body.documents).toHaveLength(1)
    expect(cat.body.documents[0].parentType).toBe('session')

    // Filtre école
    const school = await request(app)
      .get('/api/admin/education/documents?school=EMA')
      .expect(200)
    expect(school.body.documents).toHaveLength(2)

    // Filtre tag exact
    const tag = await request(app)
      .get('/api/admin/education/documents?tag=examen')
      .expect(200)
    expect(tag.body.documents).toHaveLength(1)

    // Compteurs par catégorie (sur l'ensemble du owner, pas le filtre actuel)
    expect(search.body.total).toBe(1)
    expect(search.body.categoryCounts.exam_subject).toBe(1)
    expect(search.body.categoryCounts.assignment_correction).toBe(1)
    expect(search.body.categoryCounts.teaching_resource).toBe(1)
  })

  it('PATCH met à jour metadata + tags et ré-infère le parent', async () => {
    const created = await request(app)
      .post('/api/admin/education/documents')
      .field('url', 'https://x')
      .field('category', 'other')
      .expect(201)
    const id = created.body.document._id
    const newClassId = new mongoose.Types.ObjectId().toString()

    const updated = await request(app)
      .patch(`/api/admin/education/documents/${id}`)
      .send({
        title: 'Titre mis à jour',
        category: 'school_document',
        status: 'DRAFT',
        tags: ['rentrée', '2026'],
        classId: newClassId,
      })
      .expect(200)

    expect(updated.body.document.title).toBe('Titre mis à jour')
    expect(updated.body.document.category).toBe('school_document')
    expect(updated.body.document.status).toBe('DRAFT')
    expect(updated.body.document.tags).toEqual(['rentrée', '2026'])
    expect(updated.body.document.parentType).toBe('class')
    expect(updated.body.document.parentId).toBe(newClassId)
  })

  it('soft delete : le document disparaît du listing et le download renvoie 404', async () => {
    const created = await request(app)
      .post('/api/admin/education/documents')
      .field('url', 'https://x')
      .field('title', 'À supprimer')
      .expect(201)
    const id = created.body.document._id

    await request(app).delete(`/api/admin/education/documents/${id}`).expect(200)

    const list = await request(app).get('/api/admin/education/documents').expect(200)
    expect(list.body.total).toBe(0)

    await request(app).get(`/api/admin/education/documents/${id}/download`).expect(404)
  })

  it('download sur un document url-only redirige vers l\'URL externe', async () => {
    const created = await request(app)
      .post('/api/admin/education/documents')
      .field('url', 'https://drive.google.com/file/xyz')
      .expect(201)
    const id = created.body.document._id

    const res = await request(app)
      .get(`/api/admin/education/documents/${id}/download`)
      .expect(302)
    expect(res.headers.location).toBe('https://drive.google.com/file/xyz')
  })
})
