import express, { type Request, type Response } from 'express'
import path from 'path'
import fs from 'fs'

const uploadsDir = path.resolve(process.cwd(), 'uploads')
export const avatarsDir = path.join(uploadsDir, 'avatars')

fs.mkdirSync(avatarsDir, { recursive: true })

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp'])

const router = express.Router()

router.get('/:filename', (req: Request, res: Response) => {
  const { filename } = req.params
  const filePath = path.resolve(avatarsDir, filename)

  if (!filePath.startsWith(avatarsDir + path.sep)) {
    return res.status(403).json({ error: 'Access denied' })
  }

  const ext = path.extname(filename).toLowerCase()
  if (!ALLOWED_EXT.has(ext)) {
    return res.status(403).json({ error: 'Access denied' })
  }

  res.setHeader('Cache-Control', 'public, max-age=86400')
  return res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.status(404).json({ error: 'Avatar introuvable' })
      }
      return res.status(500).json({ error: 'Erreur serveur' })
    }
  })
})

export default router
