import AgentIdempotencyKey from '../models/AgentIdempotencyKey.js'
import { parse } from 'csv-parse/sync'
import { getCountries, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js'
import Lead, { LEAD_PROJECTS } from '../models/Lead.js'
import LeadActivity from '../models/LeadActivity.js'
import CrmSettings from '../models/CrmSettings.js'
import SuppressionEntry from '../models/SuppressionEntry.js'
import User from '../models/User.js'
import { EXTERNAL_SALES_ROLE, repLeadFilter } from './externalSales.js'
import { entityFromProject } from './groupEntities.js'
import { runInTransaction } from './transaction.js'

export function callError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

export const IMPORT_FIELDS = ['company', 'contactName', 'contactEmail', 'contactPhone', 'notes', 'source'] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

function csvRecords(csv: unknown): { record: string[]; info: { lines: number }; raw: string }[] {
  if (typeof csv !== 'string' || Buffer.byteLength(csv) > 1_000_000) throw callError(400, 'CSV invalide (1 Mo maximum)')
  try {
    const delimiter = [',', ';', '\t']
      .map((value) => {
        try {
          return { value, columns: (parse(csv, { bom: true, delimiter: value, to: 1 }) as string[][])[0]?.length ?? 0 }
        } catch {
          return { value, columns: 0 }
        }
      })
      .sort((a, b) => b.columns - a.columns)[0]!.value
    const rows = parse(csv, {
      bom: true,
      delimiter,
      skip_empty_lines: true,
      trim: true,
      to: 1002,
      info: true,
      raw: true,
    }) as unknown as { record: string[]; info: { lines: number }; raw: string }[]
    if (rows.length < 2 || rows.length > 1001 || new Set(rows[0]!.record).size !== rows[0]!.record.length)
      throw new Error()
    return rows
  } catch {
    throw callError(400, 'CSV invalide : en-têtes uniques et 1 à 1000 lignes attendus')
  }
}

export function parseLeadCsv(csv: unknown): string[][] {
  return csvRecords(csv).map((row) => row.record)
}

function extraInfo(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, text]) => key.length > 0 && key.length <= 80 && typeof text === 'string')
      .slice(0, 30)
      .map(([key, text]) => [key, (text as string).slice(0, 500)]),
  )
}

export function mappedCsv(csv: unknown, mapping: unknown): Record<string, unknown>[] {
  const [header, ...rows] = csvRecords(csv)
  const headers = header!.record
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw callError(400, 'Mapping requis')
  const fields = mapping as Record<string, unknown>
  if (!fields.company || !fields.contactPhone) throw callError(400, 'Mapper entreprise et téléphone')
  const columns = IMPORT_FIELDS.flatMap((field) => {
    const column = fields[field]
    if (column === undefined || column === '') return []
    if (typeof column !== 'string' || !headers!.includes(column)) throw callError(400, 'Colonne inconnue')
    return [{ field, index: headers!.indexOf(column) }]
  })
  const used = new Set(columns.map(({ index }) => index))
  return rows.map(({ record, info, raw }) => {
    const content = raw.replace(/^(?:[ \t]*(?:\r\n|\n|\r))+/, '')
    return {
      ...Object.fromEntries(columns.map(({ field, index }) => [field, record[index] ?? ''])),
      extraInfo: extraInfo(
        Object.fromEntries(headers.flatMap((key, index) => (used.has(index) ? [] : [[key, record[index] ?? '']]))),
      ),
      csvLine: info.lines - (content.match(/\r\n|\n|\r/g)?.length ?? 0) + (/([\r\n])$/.test(content) ? 1 : 0),
    }
  })
}

export function normalizePhone(value: string, region: string): string | null {
  const phone = parsePhoneNumberFromString(value.replace(/^00/, '+'), region as CountryCode)
  return phone?.isValid() ? phone.number : null
}

export async function importCallLeads(input: {
  externalRep: string
  leads: unknown
  callList?: unknown
  project?: unknown
  region?: unknown
  csv?: boolean
  actorId?: string
  agentRequest?: { tokenId: string; key: string; path: string; requestHash: string }
}) {
  if (!Array.isArray(input.leads) || !input.leads.length || input.leads.length > 1000)
    throw callError(400, '1 à 1000 leads attendus')
  const settings = await CrmSettings.getSettings()
  const region = input.region ?? settings.callDefaultRegion
  const project = input.project ?? ''
  const callList = input.callList ?? ''
  if (typeof region !== 'string' || !getCountries().includes(region as CountryCode))
    throw callError(400, 'Région invalide')
  if (typeof project !== 'string' || !(['', ...LEAD_PROJECTS] as string[]).includes(project))
    throw callError(400, 'Projet invalide')
  if (typeof callList !== 'string' || callList.length > 120) throw callError(400, 'Liste invalide')
  const rows = input.leads
  const execute = () =>
    runInTransaction(async (session) => {
      if (!(await User.exists({ _id: input.externalRep, role: EXTERNAL_SALES_ROLE, isActive: true }).session(session)))
        throw callError(400, 'Commercial externe actif requis')
      // Dédoublonnage dans le seul périmètre du destinataire, sans révéler les autres fichiers.
      const existing = await Lead.find(repLeadFilter(input.externalRep)).select('contactPhone').session(session).lean()
      const phones = new Set(existing.map((lead) => normalizePhone(lead.contactPhone, region)).filter(Boolean))
      // Liste d'opposition : globale, elle vaut quel que soit le commercial destinataire.
      const candidates = rows.flatMap((row) => {
        const value = row && typeof row === 'object' ? (row as Record<string, unknown>).contactPhone : null
        const phone = typeof value === 'string' ? normalizePhone(value.trim(), region) : null
        return phone ? [phone] : []
      })
      const suppressed = new Set(
        (
          await SuppressionEntry.find({ phoneNormalized: { $in: candidates } })
            .select('phoneNormalized')
            .session(session)
            .lean()
        ).map((entry) => entry.phoneNormalized),
      )
      const creates: Record<string, unknown>[] = []
      const report = { created: 0, duplicates: 0, rejected: 0, errors: [] as { row: number; reason: string }[] }
      for (const [index, row] of rows.entries()) {
        const item = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {}
        const data = Object.fromEntries(
          IMPORT_FIELDS.map((field) => [field, typeof item[field] === 'string' ? item[field].trim() : '']),
        )
        const phone = normalizePhone(data.contactPhone!, region)
        let reason = ''
        if (!data.company || data.company.length > 300) reason = 'INVALID_COMPANY'
        else if (!phone) reason = 'INVALID_PHONE'
        else if (data.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) reason = 'INVALID_EMAIL'
        else if (Object.values(data).some((value) => value.length > 20000)) reason = 'FIELD_TOO_LONG'
        else if (suppressed.has(phone)) reason = 'PHONE_SUPPRESSED'
        if (reason) {
          report.rejected++
          report.errors.push({ row: input.csv && typeof item.csvLine === 'number' ? item.csvLine : index + 1, reason })
          continue
        }
        if (phones.has(phone)) {
          report.duplicates++
          continue
        }
        creates.push({
          ...data,
          extraInfo: extraInfo(item.extraInfo),
          contactPhone: phone,
          callList: callList.trim(),
          project,
          entity: entityFromProject(project),
          externalRep: input.externalRep,
          assignedTo: input.externalRep,
          createdBy: input.actorId ?? null,
        })
        phones.add(phone)
        report.created++
      }
      if (creates.length) {
        const inserted = await Lead.insertMany(creates, { session })
        await LeadActivity.insertMany(
          inserted.map((lead) => ({
            leadId: lead._id,
            type: 'CREATED',
            label: 'Lead importé',
            actorId: input.actorId ?? null,
          })),
          { session },
        )
      }
      if (input.agentRequest) {
        await AgentIdempotencyKey.create(
          [{ ...input.agentRequest, method: 'POST', responseStatus: 201, responseBody: report }],
          { session },
        )
      }
      return report
    })
  try {
    return await execute()
  } catch (err) {
    if ((err as { code?: number }).code !== 11000 || !input.agentRequest) throw err
    const { tokenId, key, path, requestHash } = input.agentRequest
    const receipt = await AgentIdempotencyKey.findOne({ tokenId, key }).lean()
    if (!receipt || receipt.path !== path || receipt.method !== 'POST' || receipt.requestHash !== requestHash)
      throw callError(409, 'IDEMPOTENCY_CONFLICT')
    return receipt.responseBody as {
      created: number
      duplicates: number
      rejected: number
      errors: { row: number; reason: string }[]
    }
  }
}
