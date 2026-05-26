export interface GeneratedCredentials {
  apiKey: string
  webhookSecret: string
  sourceSlug: string
  sourceName: string
  warning?: string
  context: 'created' | 'rotated'
}

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]+$/
