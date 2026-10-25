import type { AnyKeys, ClientSession, Types } from 'mongoose'
import BillingDocument from '../models/BillingDocument.js'
import type { IBillingDocument } from '../types/models/index.js'
import { lockProject } from './projectWriteLock.js'

export async function createBillingDocument(
  input: AnyKeys<IBillingDocument> & { project: string | Types.ObjectId },
  session: ClientSession,
) {
  await lockProject(input.project, session)
  return new BillingDocument(input).save({ session })
}
