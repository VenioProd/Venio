import express, { type Request, type Response } from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsDir = path.resolve(process.cwd(), 'uploads')
export const avatarsDir = path.join(uploadsDir, 'avatars')

fs.mkdirSync(avatarsDir, { recursive: true })

const router = express.Router()

router.get('/:filename', (req: Request, res: Response) => {
  const { filename } = req.params
  const filePath = path.resolve(avatarsDir, filename)

  if (!filePath.startsWith(avatarsDir)) {
    return res.status(403).json({ error: 'Access denied' })
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Avatar introuvable' })
  }

  res.setHeader('Cache-Control', 'public, max-age=86400')
  return res.sendFile(filePath)
})

export default router
