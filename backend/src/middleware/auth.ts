import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import type { JwtPayload } from '../types/express.js'

export default function auth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!)
    req.user = payload as JwtPayload
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}
