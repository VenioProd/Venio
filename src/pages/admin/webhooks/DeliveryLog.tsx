import type { WebhookEndpoint } from './types'

interface Props {
  endpoints: WebhookEndpoint[]
  selected: WebhookEndpoint | null
  onSelect: (endpoint: WebhookEndpoint | null) => void
}

export default function DeliveryLog(_props: Props) {
  return null
}
