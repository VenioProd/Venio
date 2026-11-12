import fs from 'fs'
import path from 'path'
import type { Options } from 'multer'
import type { Response } from 'express'
import type { IChangeRequest, IChangeRequestFile } from '../models/ChangeRequest.js'

/**
 * Retrouve la métadonnée d'un fichier, qu'il soit joint à la demande ou à une
 * réponse du fil. La projection positionnelle `attachments.$` ne convient pas :
 * elle échoue dès que le match vient de `replies.attachments`.
 */
export function findAttachmentMeta(
  changeRequest: Pick<IChangeRequest, 'attachments' | 'replies'>,
  filename: string,
): IChangeRequestFile | undefined {
  const inRoot = changeRequest.attachments?.find((file) => file.filename === filename)
  if (inRoot) return inRoot
  for (const reply of changeRequest.replies ?? []) {
    const found = reply.attachments?.find((file) => file.filename === filename)
    if (found) return found
  }
  return undefined
}

/**
 * Sert une pièce jointe déposée par un tiers.
 *
 * Le mimetype stocké provient du multipart, donc de l'uploadeur. Le réémettre
 * en `inline` laisserait un client faire exécuter du HTML/JS sur l'origine
 * Venio dans la session de l'admin qui ouvre la pièce jointe — la CSP
 * `script-src 'self'` n'y changerait rien, puisque c'est Venio qui sert le
 * fichier. On renvoie donc toujours un flux opaque, en pièce jointe.
 *
 * `res.sendFile` est par ailleurs inutilisable ici : `send` refuse tout chemin
 * absolu contenant un segment commençant par un point (même contournement que
 * le PDF de facturation dans client/quotes.ts).
 */
export function serveAttachment(res: Response, filePath: string, downloadName: string) {
  res.setHeader('Content-Type', 'application/octet-stream')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`)
  return fs.createReadStream(filePath).pipe(res)
}

// Types sans contenu actif : seuls ceux-là s'affichent dans le navigateur.
const INLINE_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
}

/**
 * Sert un fichier téléversé par un membre de l'équipe. L'aperçu en ligne est
 * réservé aux types ci-dessus, avec un type MIME déduit de l'extension par le
 * serveur (jamais celui de l'uploadeur) ; tout le reste part en téléchargement.
 */
export function serveUploadedFile(
  res: Response,
  filePath: string,
  downloadName: string,
  options: { download?: boolean } = {},
) {
  const extension = (path.extname(downloadName) || path.extname(filePath)).toLowerCase()
  const inlineType = options.download ? undefined : INLINE_TYPES[extension]
  if (!inlineType) return serveAttachment(res, filePath, downloadName)
  res.setHeader('Content-Type', inlineType)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(downloadName)}"`)
  return fs.createReadStream(filePath).pipe(res)
}

// Extension et MIME doivent correspondre : une extension autorisée seule ne suffit pas.
export const ATTACHMENT_TYPES: Record<string, readonly string[]> = {
  '.pdf': ['application/pdf'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.odt': ['application/vnd.oasis.opendocument.text'],
  '.ods': ['application/vnd.oasis.opendocument.spreadsheet'],
  '.odp': ['application/vnd.oasis.opendocument.presentation'],
  '.rtf': ['application/rtf', 'text/rtf'],
  '.txt': ['text/plain'],
  '.csv': ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.png': ['image/png'],
  '.gif': ['image/gif'],
  '.webp': ['image/webp'],
  '.avif': ['image/avif'],
  '.bmp': ['image/bmp', 'image/x-ms-bmp'],
  '.tif': ['image/tiff'],
  '.tiff': ['image/tiff'],
  '.zip': ['application/zip', 'application/x-zip-compressed'],
  '.rar': ['application/vnd.rar', 'application/x-rar-compressed', 'application/octet-stream'],
  '.7z': ['application/x-7z-compressed', 'application/octet-stream'],
  '.json': ['application/json', 'text/plain'],
  '.md': ['text/markdown', 'text/plain', 'application/octet-stream'],
  '.heic': ['image/heic', 'image/heif', 'application/octet-stream'],
  '.mp4': ['video/mp4'],
  '.mov': ['video/quicktime'],
  '.webm': ['video/webm', 'audio/webm'],
  '.mp3': ['audio/mpeg', 'audio/mp3'],
  '.m4a': ['audio/mp4', 'audio/x-m4a'],
  '.wav': ['audio/wav', 'audio/x-wav', 'audio/wave'],
}

export const attachmentFileFilter: NonNullable<Options['fileFilter']> = (_req, file, cb) => {
  if (!ATTACHMENT_TYPES[path.extname(file.originalname).toLowerCase()]?.includes(file.mimetype.toLowerCase())) {
    return cb(Object.assign(new Error('Type de fichier non autorisé'), { status: 400 }))
  }
  cb(null, true)
}
