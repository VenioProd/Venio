import fs from 'fs'
import path from 'path'
import multer from 'multer'

/**
 * Les captures arrivent d'un porteur de lien, pas d'un compte authentifié. On
 * ne fait donc confiance ni à l'extension ni au type MIME annoncé par le
 * multipart : seuls les octets de tête décident.
 *
 * SVG est volontairement absent. C'est du XML capable de porter du script, et
 * l'aperçu inline le servirait depuis l'origine Venio.
 */
export const BETA_MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
export const BETA_MAX_ATTACHMENTS_PER_RUN = 6
export const BETA_MAX_BYTES_PER_TESTER = 40 * 1024 * 1024

export type BetaImageMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) return false
  return bytes.every((byte, index) => buffer[index] === byte)
}

/** Renvoie le type réel du fichier, ou null si ce n'est pas une image matricielle acceptée. */
export function detectImageMimeType(buffer: Buffer): BetaImageMimeType | null {
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (buffer.length >= 6) {
    const head = buffer.subarray(0, 6).toString('latin1')
    if (head === 'GIF87a' || head === 'GIF89a') return 'image/gif'
  }
  // Un conteneur RIFF n'est pas une image en soi : WAVE et AVI le partagent.
  if (buffer.length >= 12) {
    const riff = buffer.subarray(0, 4).toString('latin1')
    const form = buffer.subarray(8, 12).toString('latin1')
    if (riff === 'RIFF' && form === 'WEBP') return 'image/webp'
  }
  return null
}

export interface QuotaInput {
  runAttachmentCount: number
  testerTotalBytes: number
  incomingBytes: number
}

export type QuotaResult = { ok: true } | { ok: false; reason: string }

/** Empêche un porteur de lien de remplir le disque, fichier par fichier. */
export function checkAttachmentQuota({ runAttachmentCount, testerTotalBytes, incomingBytes }: QuotaInput): QuotaResult {
  if (incomingBytes > BETA_MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: 'Fichier trop volumineux (8 Mo maximum)' }
  }
  if (runAttachmentCount >= BETA_MAX_ATTACHMENTS_PER_RUN) {
    return { ok: false, reason: `Maximum ${BETA_MAX_ATTACHMENTS_PER_RUN} pièces jointes par retour` }
  }
  if (testerTotalBytes + incomingBytes > BETA_MAX_BYTES_PER_TESTER) {
    return { ok: false, reason: 'Quota de pièces jointes atteint pour cette campagne' }
  }
  return { ok: true }
}

export const BETA_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'beta')

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(BETA_UPLOAD_DIR)) fs.mkdirSync(BETA_UPLOAD_DIR, { recursive: true })
    cb(null, BETA_UPLOAD_DIR)
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`)
  },
})

export const betaUpload = multer({
  storage,
  limits: { fileSize: BETA_MAX_ATTACHMENT_BYTES, files: 1 },
})

/**
 * Relit les premiers octets du fichier déposé sur disque. Multer a déjà écrit,
 * donc un refus doit aussi supprimer le fichier.
 */
export function inspectUploadedImage(filePath: string): BetaImageMimeType | null {
  const handle = fs.openSync(filePath, 'r')
  try {
    const head = Buffer.alloc(16)
    const read = fs.readSync(handle, head, 0, 16, 0)
    return detectImageMimeType(head.subarray(0, read))
  } finally {
    fs.closeSync(handle)
  }
}

export function discardUpload(filePath: string): void {
  fs.rm(filePath, { force: true }, () => {})
}
