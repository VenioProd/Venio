import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import mongoose from 'mongoose'
import { clearDb, setupMongo, teardownMongo } from './helpers/mongoTestEnv.js'
import ProjectSheet from '../models/ProjectSheet.js'
import Subsidiary from '../models/Subsidiary.js'
import {
  EMPTY_MARKER,
  SEED_MARKER,
  SHEET_SEEDS,
  ensureProjectSheetIndexes,
  seedProjectSheets,
} from '../lib/projectSheetSeed.js'
import { PROJECT_SHEET_SECTIONS } from '../models/ProjectSheet.js'

const creator = new mongoose.Types.ObjectId()
const seedSlugs = SHEET_SEEDS.map((s) => s.slug)

beforeAll(setupMongo)
afterAll(teardownMongo)
beforeEach(async () => {
  await clearDb()
  await ensureProjectSheetIndexes()
})

describe('Migration 012 — fiches projets', () => {
  it('crée les sept fiches du brouillon, marquées à relire, sans aucun accès démo', async () => {
    const report = await seedProjectSheets()
    expect(report.created.sort()).toEqual([...seedSlugs].sort())
    const sheets = await ProjectSheet.find({}).select('+demoAccesses.passwordEnc').lean()
    expect(sheets).toHaveLength(7)
    for (const sheet of sheets) {
      expect(sheet.reviewStatus).toBe('DRAFT')
      expect(sheet.demoAccesses).toEqual([])
      expect(sheet.history.at(-1)?.summary).toBe(SEED_MARKER)
      expect(sheet.oneLiner).not.toBe('')
    }
    const arrow = sheets.find((s) => s.slug === 'arrow')!
    expect(arrow).toMatchObject({ legalEntity: 'ARROW', leadProject: 'ARROW', status: 'ACTIVE' })
    expect(arrow.offers).toContain('à valider avant toute diffusion')
    const virendys = sheets.find((s) => s.slug === 'virendys')!
    expect(virendys.whatWeDo).toContain('pas HDS')
    expect(virendys.websites.map((w) => w.url)).toEqual(['https://virendys.fr', 'https://info.virendys.fr'])
    expect(sheets.find((s) => s.slug === 'artosera')).toMatchObject({ legalEntity: 'VENIO', leadProject: 'ARTOSERA' })
  })

  it('est idempotente : une seconde exécution ne change rien', async () => {
    await seedProjectSheets()
    const before = await ProjectSheet.find({}).sort({ slug: 1 }).lean()
    const report = await seedProjectSheets()
    expect(report.created).toEqual([])
    expect(report.completed).toEqual([])
    expect(report.emptyCreated).toEqual([])
    expect(report.unchanged.sort()).toEqual([...seedSlugs].sort())
    const after = await ProjectSheet.find({}).sort({ slug: 1 }).lean()
    expect(after).toEqual(before)
  })

  it('ne remplit que les sections vides d’une fiche existante', async () => {
    await ProjectSheet.create({
      slug: 'arrow',
      name: 'Arrow (nom choisi)',
      reviewStatus: 'VALIDATED',
      whatWeDo: 'Texte rédigé par l’équipe',
      offers: '',
      legalEntity: 'ARROW',
    })
    const report = await seedProjectSheets()
    expect(report.completed.find((c) => c.slug === 'arrow')?.fields).not.toContain('whatWeDo')
    const arrow = await ProjectSheet.findOne({ slug: 'arrow' }).lean()
    expect(arrow?.name).toBe('Arrow (nom choisi)')
    expect(arrow?.whatWeDo).toBe('Texte rédigé par l’équipe')
    expect(arrow?.offers).toContain('Starter')
    expect(arrow?.reviewStatus).toBe('VALIDATED')
    expect(arrow?.history.at(-1)).toMatchObject({ summary: SEED_MARKER, by: null })
  })

  it('rattache les filiales existantes et crée une fiche vide pour les autres', async () => {
    const arrow = await Subsidiary.create({ name: 'Arrow', slug: 'arrow', status: 'ACTIVE', createdBy: creator, accentColor: '#112233' })
    const sukuna = await Subsidiary.create({ name: 'Sukuna', slug: 'sukuna', createdBy: creator })
    const yumi = await Subsidiary.create({
      name: 'Yumi',
      slug: 'yumi',
      status: 'PAUSE',
      tagline: 'Donnée confidentielle du dossier',
      kpis: { treasury: 123456 },
      createdBy: creator,
    })
    await Subsidiary.create({ name: 'Ancienne', slug: 'ancienne', archived: true, createdBy: creator })
    const report = await seedProjectSheets()
    expect(report.emptyCreated).toEqual(['yumi'])
    expect(String((await ProjectSheet.findOne({ slug: 'arrow' }).lean())?.subsidiary)).toBe(String(arrow._id))
    expect(String((await ProjectSheet.findOne({ slug: 'virendys' }).lean())?.subsidiary)).toBe(String(sukuna._id))
    const sheet = await ProjectSheet.findOne({ slug: 'yumi' }).lean()
    expect(sheet).toMatchObject({ name: 'Yumi', status: 'PAUSED', reviewStatus: 'TO_COMPLETE', oneLiner: '' })
    expect(String(sheet?.subsidiary)).toBe(String(yumi._id))
    for (const key of PROJECT_SHEET_SECTIONS) expect(sheet?.[key]).toBe('')
    expect(JSON.stringify(sheet)).not.toContain('confidentielle')
    expect(JSON.stringify(sheet)).not.toContain('123456')
    expect(sheet?.history.at(-1)?.summary).toBe(EMPTY_MARKER)
    expect(await ProjectSheet.exists({ slug: 'ancienne' })).toBeNull()
    expect((await seedProjectSheets()).emptyCreated).toEqual([])
  })

  it('en --dry-run, rapporte sans écrire', async () => {
    await Subsidiary.create({ name: 'Jiraya', slug: 'jiraya', createdBy: creator })
    const report = await seedProjectSheets({ dryRun: true })
    expect(report.created).toHaveLength(7)
    expect(report.emptyCreated).toEqual(['jiraya'])
    expect(await ProjectSheet.countDocuments()).toBe(0)
  })
})
