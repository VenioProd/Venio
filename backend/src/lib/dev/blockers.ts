// Canonical blocker definition shared by Mongo queries, aggregates and priorities.
export const BLOCKER_LABEL_PATTERN = '^(blocked|blocker)$'
const labelRegex = new RegExp(BLOCKER_LABEL_PATTERN, 'i')

export const BLOCKER_MATCH = {
  $or: [{ status: 'BLOCKED' }, { labels: { $in: [labelRegex] } }],
}

export const BLOCKER_EXPRESSION = {
  $or: [
    { $eq: ['$status', 'BLOCKED'] },
    {
      $anyElementTrue: [
        {
          $map: {
            input: { $ifNull: ['$labels', []] },
            as: 'label',
            in: { $regexMatch: { input: '$$label', regex: BLOCKER_LABEL_PATTERN, options: 'i' } },
          },
        },
      ],
    },
  ],
}

export function isBlocked(issue: { status: string; labels: string[] }): boolean {
  return issue.status === 'BLOCKED' || issue.labels.some((label) => labelRegex.test(label))
}
