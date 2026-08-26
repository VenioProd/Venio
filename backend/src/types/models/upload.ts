import type { Document, Types } from 'mongoose'
import type { ClientUploadCategory } from '../enums.js'

export interface IClientUpload extends Document {
  client: Types.ObjectId
  project: Types.ObjectId | null
  category: ClientUploadCategory
  note: string
  originalName: string
  storagePath: string
  mimeType: string
  size: number
  downloadedByAdminAt: Date | null
  createdAt: Date
  updatedAt: Date
}
