import type { Request, Response, NextFunction } from 'express'
import mongoose from 'mongoose'

export default function projectFinanceErrors(
  err: Error & { code?: number; status?: number },
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (err.code === 11000) {
    res.status(409).json({ error: 'Cette configuration, ce nom ou cette version existe déjà' })
    return
  }
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map((error) => {
      if (error instanceof mongoose.Error.ValidatorError) {
        if (error.reason) return error.reason.message
        if (error.kind === 'user defined') return error.message
      }
      return `Champ invalide ou manquant : ${error.path}`
    })
    res.status(400).json({ error: `Données invalides : ${messages.join(' ; ')}` })
    return
  }
  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: `Valeur invalide : ${err.path}` })
    return
  }
  next(err)
}
