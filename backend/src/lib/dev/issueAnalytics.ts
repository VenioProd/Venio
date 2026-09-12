import DevIssue from '../../models/DevIssue.js'

/** Aggregate over the full filtered collection, independently of list pages. */
export async function computeIssueAnalytics(match: Record<string, unknown>, rawTimezone: unknown) {
  let timezone = typeof rawTimezone === 'string' ? rawTimezone : 'UTC'
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone })
  } catch {
    timezone = 'UTC'
  }
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const part = (type: string) => parts.find((p) => p.type === type)!.value
  const today = new Date(`${part('year')}-${part('month')}-${part('day')}T12:00:00Z`)
  const [counts, models, days] = await Promise.all([
    DevIssue.countDocuments(match),
    DevIssue.aggregate<{ _id: string; count: number }>([
      { $match: match },
      { $group: { _id: { $ifNull: ['$createdByModel', 'Non renseigné'] }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]),
    DevIssue.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          $and: [match, { status: 'DONE', completedAt: { $gte: new Date(now.getTime() - 15 * 86400000), $lte: now } }],
        },
      },
      {
        $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt', timezone } }, count: { $sum: 1 } },
      },
    ]),
  ])
  const byDay = new Map(days.map((d) => [d._id, d.count]))
  const velocity = Array.from({ length: 14 }, (_, index) => {
    const day = new Date(today)
    day.setUTCDate(day.getUTCDate() - 13 + index)
    const date = day.toISOString().slice(0, 10)
    return { date, label: `${date.slice(8)}/${date.slice(5, 7)}`, count: byDay.get(date) ?? 0 }
  })
  const creatorModels = models.slice(0, 6).map((m) => ({ key: m._id, label: m._id || 'Non renseigné', value: m.count }))
  if (models.length > 6)
    creatorModels.push({
      key: '__others__',
      label: `Autres (${models.length - 6})`,
      value: models.slice(6).reduce((sum, m) => sum + m.count, 0),
    })
  return { total: counts, velocity, creatorModels }
}
