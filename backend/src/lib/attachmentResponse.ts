import fs from 'fs'
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
