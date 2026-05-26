/**
 * Configuration partagée pour les uploads de fichiers.
 *
 * SECURITY:
 *  - SVG est EXCLU (XSS via balises <script> embarquées et événements onload).
 *  - HTML/JS/exécutables sont EXCLUS (drive-by + RCE).
 *  - On valide ici uniquement le MIME annoncé ; tout endpoint qui sert ces
 *    fichiers DOIT systématiquement forcer Content-Disposition: attachment.
 *
 * Pour servir les fichiers : utiliser `setDownloadHeaders(res, filename)` ci-bas.
 */
import type { Request, Response } from 'express'

export const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  // Images (SVG explicitement exclu)
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // PDF
  'application/pdf',
  // Microsoft Office
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // OpenDocument
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/vnd.oasis.opendocument.presentation',
  // Texte / data
  'text/plain',
  'text/csv',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
])

/** MIME explicitement bannis pour message d'erreur lisible / défense en profondeur. */
const FORBIDDEN_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/svg+xml',
  'text/html',
  'application/xhtml+xml',
  'text/javascript',
  'application/javascript',
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
])

/** fileFilter Multer prêt à l'emploi. */
export function multerFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (err: Error | null, accept?: boolean) => void
): void {
  if (FORBIDDEN_MIME_TYPES.has(file.mimetype)) {
    cb(new Error(`Type de fichier interdit pour raison de sécurité: ${file.mimetype}`))
    return
  }
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true)
    return
  }
  cb(new Error(`Type de fichier non autorisé: ${file.mimetype}`))
}

/**
 * Force le téléchargement (jamais d'inline) avec un nom de fichier RFC 5987
 * pour préserver les caractères non-ASCII / accentués.
 */
export function setDownloadHeaders(res: Response, filename: string): void {
  const safe = filename.replace(/[\r\n"]/g, '_')
  const encoded = encodeURIComponent(safe)
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${safe.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encoded}`
  )
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

/** Limite par défaut de taille d'upload (20 MiB). */
export const DEFAULT_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024
