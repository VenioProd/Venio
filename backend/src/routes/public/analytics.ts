import express, { type Request, type Response, type NextFunction } from 'express'
import DailyPublicMetric, { PUBLIC_ANALYTICS_EVENTS, type PublicAnalyticsEvent } from '../../models/DailyPublicMetric.js'

const router = express.Router()
const allowedEvents = new Set<string>(PUBLIC_ANALYTICS_EVENTS)
const PUBLIC_PATH = /^\/(?:$|services\/(?:sites|communication|developpement|conseil)$|poles$|realisations$|methode$|a-propos$|contact$|legal$|cgu$|cgv$|confidentialite$)/
const CTA = /^[a-z0-9_]{1,80}$/

function dayBucket(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

// This endpoint intentionally accepts only a small, fixed vocabulary. It does
// not retain IP address, user agent, referrer, query string, cookie or a user
// identifier: one request increments one aggregate daily counter.
router.post('/event', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { event, path, cta } = req.body ?? {}
    if (typeof event !== 'string' || !allowedEvents.has(event) || typeof path !== 'string' || !PUBLIC_PATH.test(path)) {
      return res.status(400).json({ error: 'Invalid public analytics event' })
    }
    if (cta !== undefined && (typeof cta !== 'string' || !CTA.test(cta))) {
      return res.status(400).json({ error: 'Invalid CTA identifier' })
    }

    await DailyPublicMetric.updateOne(
      { day: dayBucket(), path, event: event as PublicAnalyticsEvent, cta: cta ?? '' },
      { $inc: { count: 1 } },
      { upsert: true },
    )
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

export default router
