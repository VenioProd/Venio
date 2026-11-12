import express, { type NextFunction, type Request, type Response } from 'express'
import mongoose from 'mongoose'
import CallTranscript from '../../models/CallTranscript.js'

const router = express.Router()

/** Le transcript d'un appel, lisible par celui qui a appelé seulement ; tout autre cas répond 404. */
router.get('/calls/:id/transcript', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = String(req.params.id)
    const transcript = mongoose.isObjectIdOrHexString(id)
      ? await CallTranscript.findOne({ call: id, author: req.user!.id })
          .select('status language segments durationSec')
          .lean()
      : null
    if (!transcript) return res.status(404).json({ error: 'Transcript not found' })
    return res.json({
      status: transcript.status,
      language: transcript.language,
      segments: transcript.segments,
      durationSec: transcript.durationSec,
    })
  } catch (err) {
    return next(err)
  }
})

export default router
